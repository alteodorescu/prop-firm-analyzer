// ═══════════════════════════════════════════════════════════
// RISK ENGINE — Per-account risk management
// ═══════════════════════════════════════════════════════════
// Replicates the "Today's Trading Plan" logic from the app:
// contracts, aim for, max loss, consistency, GO/NO-GO.
// ═══════════════════════════════════════════════════════════

import { config } from "../config.js";
import { log } from "./logger.js";

const TAG = "RISK";

/**
 * Calculate the trading plan for a single account given an ORB signal.
 *
 * @param {object} account - Account data from Supabase (camelCase)
 * @param {object} firm - Firm data from Supabase (camelCase)
 * @param {object} signal - ORB signal from orb-engine
 * @returns {object} { approved, reason, plan }
 */
export function evaluateAccount(account, firm, signal) {
  const plan = {};

  // ── Basic account state ──
  const startBalance = account.startBalance;
  const journal = account.journal || [];
  const payouts = account.payouts || [];
  const resets = account.resets || [];
  const phase = account.phase; // "challenge" or "funded"

  // Current balance from journal
  const lastEntry = journal.length > 0 ? journal[journal.length - 1] : null;
  const currentBalance = lastEntry ? parseFloat(lastEntry.balance) : startBalance;
  const totalPnl = currentBalance - startBalance;

  // ── Firm rules based on phase ──
  const isFunded = phase === "funded";
  const mll = isFunded ? (firm.fMll ?? firm.mll) : firm.mll;
  const mllType = isFunded ? (firm.fMllType ?? firm.mllType) : firm.mllType;
  const dll = isFunded ? (firm.fDll ?? firm.dll) : firm.dll;
  const consistency = isFunded ? (firm.fConsistency ?? firm.consistency) : firm.consistency;
  const minDays = isFunded ? (firm.fMinDays ?? firm.minDays) : firm.minDays;
  const minProfit = isFunded ? (firm.fMinProfit ?? firm.minProfit) : firm.minProfit;
  const pt = isFunded ? null : firm.pt; // Funded doesn't have a pass target

  // Funded target = buffer + max payout (from payout tiers)
  let target;
  if (isFunded) {
    const maxPayout = firm.payoutTiers && firm.payoutTiers.length > 0
      ? Math.max(...firm.payoutTiers.map(t => t.max || Infinity))
      : 1000;
    const buffer = firm.buffer || 0;
    const withdrawalPct = firm.withdrawalPct || 100;
    target = Math.max(buffer + maxPayout, maxPayout / (withdrawalPct / 100));
  } else {
    target = pt;
  }

  const remainingToTarget = target ? target - totalPnl : null;

  // ── MLL / Drawdown Room ──
  // Calculate peak balance (for trailing MLL types)
  let peakBalance = startBalance;
  for (const entry of journal) {
    const bal = parseFloat(entry.balance);
    if (bal > peakBalance) peakBalance = bal;
  }

  let mllFloor;
  if (mllType === "static") {
    mllFloor = startBalance - mll;
  } else if (mllType === "eod") {
    // Trailing EOD: floor trails up with peak end-of-day balance
    mllFloor = peakBalance - mll;
  } else if (mllType === "intraday") {
    // Trailing intraday: floor trails with every new high
    mllFloor = peakBalance - mll;
  } else {
    mllFloor = startBalance - mll;
  }

  const ddRoom = currentBalance - mllFloor;
  const ddRoomPct = mll > 0 ? (ddRoom / mll) * 100 : 100;

  plan.balance = currentBalance;
  plan.totalPnl = totalPnl;
  plan.ddRoom = ddRoom;
  plan.ddRoomPct = ddRoomPct;
  plan.mllFloor = mllFloor;
  plan.remainingToTarget = remainingToTarget;

  // ── CHECK 1: MLL Room ──
  // Don't trade if DD room is less than the signal's risk
  const riskPerContract = signal.riskPoints * config.pointValue;
  if (ddRoom < riskPerContract) {
    return {
      approved: false,
      reason: `MLL too close: DD room $${ddRoom.toFixed(0)} < risk/contract $${riskPerContract.toFixed(0)}`,
      plan,
    };
  }

  // ── CHECK 2: DLL Room ──
  // Calculate today's P&L from journal
  const today = new Date().toISOString().slice(0, 10);
  const todayEntries = journal.filter((e) => e.date === today);
  const todayPnl = todayEntries.reduce((sum, e) => sum + (parseFloat(e.pnl) || 0), 0);

  plan.todayPnl = todayPnl;

  if (dll && dll > 0) {
    const dllRemaining = dll - Math.abs(Math.min(0, todayPnl)); // DLL consumed by losses today
    plan.dllRemaining = dllRemaining;

    if (dllRemaining < riskPerContract) {
      return {
        approved: false,
        reason: `DLL too close: remaining $${dllRemaining.toFixed(0)} < risk/contract $${riskPerContract.toFixed(0)}`,
        plan,
      };
    }
  }

  // ── CHECK 3: Contracts allowed (scaling) ──
  const scalingTiers = isFunded ? (firm.scalingFund || []) : (firm.scalingChal || []);
  const maxNq = firm.maxNQ || 99;
  let contractsAllowed = maxNq;

  if (scalingTiers.length > 0) {
    // Calculate cumulative profit for scaling
    const cumulativeProfit = isFunded
      ? currentBalance - startBalance + payouts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      : totalPnl;

    // Find the tier for current cumulative profit
    for (const tier of scalingTiers) {
      if (cumulativeProfit < (tier.threshold || 0)) {
        contractsAllowed = tier.contracts || 1;
        break;
      }
      contractsAllowed = tier.contracts || maxNq;
    }
  }

  // Also limit by how many contracts we can afford given DD room and DLL
  const maxByDdRoom = Math.floor(ddRoom / riskPerContract);
  const maxByDll = dll && dll > 0
    ? Math.floor((dll - Math.abs(Math.min(0, todayPnl))) / riskPerContract)
    : Infinity;

  const contracts = Math.min(contractsAllowed, maxByDdRoom, maxByDll);
  plan.contractsAllowed = contractsAllowed;
  plan.contracts = contracts;

  if (contracts <= 0) {
    return {
      approved: false,
      reason: `No contracts available: scaling=${contractsAllowed}, byDD=${maxByDdRoom}, byDLL=${maxByDll}`,
      plan,
    };
  }

  // ── CHECK 4: Consistency ──
  if (consistency && consistency > 0 && consistency < 100) {
    // Calculate each day's profit contribution
    const dayProfits = {};
    for (const entry of journal) {
      const d = entry.date;
      if (!dayProfits[d]) dayProfits[d] = 0;
      dayProfits[d] += parseFloat(entry.pnl) || 0;
    }

    // Project: if we win this trade, what would today's total be?
    const projectedTodayProfit = todayPnl + signal.rewardPoints * contracts * config.pointValue;
    const projectedTotal = totalPnl + signal.rewardPoints * contracts * config.pointValue;

    if (projectedTotal > 0 && projectedTodayProfit > 0) {
      const projectedDayPct = (projectedTodayProfit / projectedTotal) * 100;
      plan.projectedConsistencyPct = projectedDayPct;

      // Warn but don't block — consistency is checked at payout, not per-trade
      if (projectedDayPct > consistency) {
        log.warn(TAG, `Consistency warning: projected day ${projectedDayPct.toFixed(1)}% > ${consistency}% limit`);
        plan.consistencyWarning = true;
      }
    }
  }

  // ── CHECK 5: Profitable Days ──
  const profitableDays = new Set();
  const dayPnls = {};
  for (const entry of journal) {
    const d = entry.date;
    if (!dayPnls[d]) dayPnls[d] = 0;
    dayPnls[d] += parseFloat(entry.pnl) || 0;
  }
  for (const [d, pnl] of Object.entries(dayPnls)) {
    if (pnl >= (minProfit || 0)) profitableDays.add(d);
  }
  plan.profitableDays = profitableDays.size;
  plan.minDaysRequired = minDays || 0;
  plan.daysRemaining = Math.max(0, (minDays || 0) - profitableDays.size);

  // ── Calculate daily aim ──
  if (remainingToTarget && plan.daysRemaining > 0) {
    plan.dailyAim = remainingToTarget / plan.daysRemaining;
  } else if (remainingToTarget) {
    plan.dailyAim = remainingToTarget;
  }

  // ── Calculate max loss today ──
  plan.maxLossToday = dll && dll > 0
    ? Math.min(dll + Math.min(0, todayPnl), ddRoom) // DLL remaining or DD room, whichever is less
    : ddRoom;

  // ── APPROVED ──
  const totalRisk = riskPerContract * contracts;
  plan.totalRisk = totalRisk;
  plan.direction = signal.direction;
  plan.entry = signal.entry;
  plan.stop = signal.stop;
  plan.target = signal.target;
  plan.session = signal.session;

  log.trade(TAG, `Account "${account.label}" APPROVED:`);
  log.trade(TAG, `  ${signal.direction.toUpperCase()} ${contracts}x @ ${signal.entry} | Stop: ${signal.stop} | Target: ${signal.target}`);
  log.trade(TAG, `  Risk: $${totalRisk.toFixed(0)} | DD Room: $${ddRoom.toFixed(0)} | Today P&L: $${todayPnl.toFixed(0)}`);
  if (plan.consistencyWarning) {
    log.warn(TAG, `  Consistency warning: trade may push single-day profit beyond ${consistency}%`);
  }

  return {
    approved: true,
    reason: "All checks passed",
    plan,
  };
}

/**
 * Evaluate multiple accounts against a signal.
 * @param {Array} accounts - Array of { account, firm } objects
 * @param {object} signal - ORB signal
 * @returns {Array} Array of { account, evaluation } objects
 */
export function evaluateAllAccounts(accounts, signal) {
  const results = [];

  for (const { account, firm } of accounts) {
    // Check if account is automated and active
    if (account.status !== "active") {
      continue;
    }

    // Check if session matches the account's configured sessions
    // (stored in account metadata or defaults to "both")
    const sessions = account.autoSessions || "both";
    if (sessions !== "both" && sessions !== signal.session.toLowerCase()) {
      log.info(TAG, `Account "${account.label}" skipped — session ${signal.session} not in ${sessions}`);
      continue;
    }

    const evaluation = evaluateAccount(account, firm, signal);
    results.push({ account, evaluation });

    if (!evaluation.approved) {
      log.warn(TAG, `Account "${account.label}" REJECTED: ${evaluation.reason}`);
    }
  }

  return results;
}
