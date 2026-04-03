// ═══════════════════════════════════════════════════════════
// RISK ENGINE — Per-account risk management
// ═══════════════════════════════════════════════════════════
// Replicates the EXACT "Today's Trading Plan" logic from
// the frontend's calcLiveMetrics(). The ORB signal provides
// only direction + entry. Stop, target, and contracts are
// ALL derived from the account's plan.
// ═══════════════════════════════════════════════════════════

import { config } from "../config.js";
import { log } from "./logger.js";

const TAG = "RISK";

// ─────────────────────────────────────────────────────────
// Session Tracker — tracks London results so NY can adjust
// ─────────────────────────────────────────────────────────
// Key: accountId, Value: { date, londonPnl, londonContracts }
const sessionTracker = new Map();

/**
 * Record the result of a London session trade for an account.
 * Called after London execution completes (or from a fill webhook).
 *
 * @param {string} accountId
 * @param {number} pnlDollars - Actual P&L from London (positive = profit, negative = loss)
 * @param {number} contracts - Contracts used in London
 */
export function recordSessionResult(accountId, pnlDollars, contracts) {
  const today = new Date().toISOString().slice(0, 10);
  sessionTracker.set(accountId, {
    date: today,
    londonPnl: pnlDollars,
    londonContracts: contracts,
  });
  log.info(TAG, `Session tracker: ${accountId} London P&L = $${pnlDollars} (${contracts} contracts)`);
}

/**
 * Get London session result for today (if any).
 * Returns null if no London trade today.
 */
function getLondonResult(accountId) {
  const today = new Date().toISOString().slice(0, 10);
  const record = sessionTracker.get(accountId);
  if (record && record.date === today) return record;
  return null;
}

/**
 * Clear stale session records (call at start of day).
 */
export function clearSessionTracker() {
  sessionTracker.clear();
  log.info(TAG, "Session tracker cleared for new day");
}

// ─────────────────────────────────────────────────────────
// Helper functions (ported from App.jsx)
// ─────────────────────────────────────────────────────────

/**
 * Calculate required minimum profitable days.
 * Same as frontend calcDays().
 */
function calcDays(consistency, minDays) {
  const hasC = consistency != null && consistency > 0;
  const hasM = minDays != null && minDays > 0;
  if (!hasC && !hasM) return 1;
  if (!hasC) return minDays;
  if (!hasM) return Math.ceil(1 / consistency);
  return Math.max(minDays, Math.ceil(1 / consistency));
}

/**
 * Migrate legacy scaling tier fields to tiers array.
 * prefix "sc" = challenge, "sf" = funded
 */
function migrateScalingTiers(firm, prefix) {
  const tiers = firm[prefix === "sc" ? "scalingChal" : "scalingFund"];
  if (tiers && tiers.length > 0) return tiers;
  const result = [];
  for (let i = 1; i <= 3; i++) {
    const t = firm[`${prefix}T${i}`];
    const c = firm[`${prefix}C${i}`];
    if (t != null && c != null) result.push({ upTo: t, contracts: c });
  }
  return result.length > 0 ? result : [];
}

/**
 * Get contracts allowed at a given cumulative profit level.
 * Same as frontend getContractsAtProfit().
 */
function getContractsAtProfit(tiers, cmax, profit) {
  if (!tiers || tiers.length === 0 || !cmax) return cmax || null;
  for (const tier of tiers) {
    if (tier.upTo != null && profit <= tier.upTo) return tier.contracts;
  }
  return cmax;
}

/**
 * Migrate payout tiers from legacy fields
 */
function migratePayoutTiers(firm) {
  if (firm.payoutTiers && firm.payoutTiers.length > 0) return firm.payoutTiers;
  if (firm.minPayout != null || firm.maxPayout != null) {
    return [{ min: firm.minPayout || 0, max: firm.maxPayout || null }];
  }
  return [];
}

/**
 * computeAll — derives computed firm properties.
 * Ported from frontend computeAll(). Only the fields we need.
 */
function computeAll(f) {
  const isInstant = !!f.instant;
  const payoutTiers = migratePayoutTiers(f);
  const tier1 = payoutTiers.length > 0 ? payoutTiers[0] : { min: f.minPayout || 0, max: f.maxPayout || null };
  const effectiveMaxPayout = tier1.max || f.maxPayout || 0;
  const wpct = (f.withdrawalPct != null && f.withdrawalPct > 0) ? f.withdrawalPct : 1;
  const reqBalMax = Math.max((f.buffer || 0) + effectiveMaxPayout, effectiveMaxPayout / wpct);

  return {
    ...f,
    isInstant,
    payoutTiers,
    reqBalMax,
    minPayout: tier1.min || 0,
    maxPayout: effectiveMaxPayout,
  };
}

// ─────────────────────────────────────────────────────────
// calcTodayPlan — Server-side replica of calcLiveMetrics()
// ─────────────────────────────────────────────────────────

/**
 * Calculates Today's Trading Plan for a single account.
 * This is the EXACT same logic as the frontend's calcLiveMetrics().
 *
 * @param {object} account - Account data (camelCase)
 * @param {object} firm - Firm data (camelCase)
 * @returns {object} todayPlan + supporting metrics
 */
function calcTodayPlan(account, firm) {
  const f = computeAll(firm);
  const phase = account.phase || "challenge";
  const allEntries = (account.journal || []).slice().sort((a, b) => a.date > b.date ? 1 : -1);
  const payouts = (account.payouts || []).slice().sort((a, b) => a.date > b.date ? 1 : -1);
  const lastPayout = payouts.length > 0 ? payouts[payouts.length - 1] : null;
  const totalPayouts = payouts.reduce((sum, p) => sum + (p.amount || 0), 0);

  // After a payout, metrics reset: use entries after last payout date
  const effectiveStartBal = lastPayout ? lastPayout.newBalance : (account.startBalance || 50000);
  const entries = lastPayout
    ? allEntries.filter(e => e.date > lastPayout.date)
    : allEntries;
  const startBal = effectiveStartBal;
  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const currentBal = lastEntry ? lastEntry.balance : startBal;
  const totalPnl = currentBal - startBal;

  // Phase-dependent firm rules
  const baseTarget = phase === "challenge" ? (f.pt || 0) : f.reqBalMax;
  const mll = phase === "challenge" ? (f.mll || 0) : (f.fMll || 0);
  const mllType = phase === "challenge" ? (f.mllType || "static") : (f.fMllType || "static");
  const dll = phase === "challenge" ? f.dll : f.fDll;
  const consistency = phase === "challenge" ? f.consistency : f.fConsistency;
  const minDays = phase === "challenge" ? f.minDays : f.fMinDays;
  const minProfit = phase === "challenge" ? (f.minProfit || 0) : (f.fMinProfit || 0);

  // ── Per-entry analysis with running state ──
  let peakBal = startBal;
  let biggestDay = 0;

  entries.forEach((e, idx) => {
    const bal = e.balance;
    const prevBal = idx > 0 ? entries[idx - 1].balance : startBal;
    const balDelta = bal != null && prevBal != null ? Math.round((bal - prevBal) * 100) / 100 : null;
    const dayPnl = balDelta != null ? balDelta : (e.pnl || 0);
    if (bal > peakBal) peakBal = bal;
    if (dayPnl > biggestDay) biggestDay = dayPnl;
  });

  // ── Consistency tracking ──
  const consistencyPct = totalPnl > 0 && consistency ? biggestDay / totalPnl : 0;
  const consistencyOk = !consistency || totalPnl <= 0 || consistencyPct <= consistency;
  const consistencyAdjTarget = (consistency && biggestDay > 0)
    ? Math.max(baseTarget, biggestDay / consistency)
    : baseTarget;

  const effectiveTarget = consistencyAdjTarget;
  const remainingProfit = Math.max(0, effectiveTarget - totalPnl);
  const pctComplete = effectiveTarget > 0 ? Math.min(1, totalPnl / effectiveTarget) : 0;

  // ── Drawdown safety (current state) ──
  let ddFloor;
  if (mllType === "static" || !mllType) {
    ddFloor = startBal - mll;
  } else {
    ddFloor = peakBal - mll;
    if (ddFloor > startBal) ddFloor = Math.max(ddFloor, startBal);
  }
  const roomToDD = currentBal - ddFloor;
  const ddPct = mll > 0 ? roomToDD / mll : 1;

  // ── Min profitable days ──
  const dailyDetails = [];
  entries.forEach((e, idx) => {
    const prevBal = idx > 0 ? entries[idx - 1].balance : startBal;
    const balDelta = e.balance != null && prevBal != null ? Math.round((e.balance - prevBal) * 100) / 100 : null;
    const dayPnl = balDelta != null ? balDelta : (e.pnl || 0);
    dailyDetails.push({ date: e.date, pnl: dayPnl });
  });

  const profitDays = dailyDetails.filter(d => d.pnl > (minProfit || 0)).length;
  const requiredDays = calcDays(consistency, minDays);
  const daysRemaining = Math.max(0, requiredDays - profitDays);

  // ── MLL breach detection ──
  const mllBreached = currentBal < ddFloor || ddPct <= 0;

  // ── Max safe day profit (consistency cap) ──
  const maxSafeDayProfit = (consistency && totalPnl > 0)
    ? Math.floor(consistency * totalPnl / (1 - consistency))
    : null;

  // ── Profit caps ──
  const profitCaps = [];
  if (maxSafeDayProfit != null && maxSafeDayProfit > 0) profitCaps.push({ cap: maxSafeDayProfit, reason: "consistency" });
  if (remainingProfit > 0) profitCaps.push({ cap: Math.ceil(remainingProfit), reason: "target" });
  const strictestProfitCap = profitCaps.length > 0
    ? profitCaps.reduce((best, c) => c.cap < best.cap ? c : best)
    : null;

  // ── Max daily loss: lesser of DLL and remaining DD room ──
  const maxDailyLoss = dll
    ? Math.min(dll, Math.max(0, Math.floor(roomToDD)))
    : Math.max(0, Math.floor(roomToDD));

  // ── Ideal daily target ──
  const effectiveDaysLeft = Math.max(daysRemaining, 1);
  const minDaysFromCap = (maxSafeDayProfit != null && maxSafeDayProfit > 0)
    ? Math.ceil(remainingProfit / maxSafeDayProfit)
    : 1;
  const minDaysToComplete = Math.max(effectiveDaysLeft, minDaysFromCap, 1);
  const idealDailyTarget = remainingProfit > 0
    ? Math.max(minProfit || 0, Math.ceil(remainingProfit / minDaysToComplete))
    : 0;

  // ── Contracts from scaling tiers ──
  const scalingTiers = phase === "challenge" ? migrateScalingTiers(firm, "sc") : migrateScalingTiers(firm, "sf");
  const maxNQ = firm.maxNQ || null;
  const originalStartBal = account.startBalance || 50000;
  const cumulativeProfit = currentBal - originalStartBal + totalPayouts;
  const contractsAllowed = getContractsAtProfit(scalingTiers, maxNQ, Math.max(0, cumulativeProfit));

  // ── GO / NO-GO flags ──
  const isBreached = mllBreached || ddPct <= 0;
  const isTargetHit = pctComplete >= 1 && profitDays >= requiredDays && consistencyOk && !mllBreached && ddPct > 0;

  const todayPlan = {
    contractsAllowed,
    maxContracts: maxNQ,
    maxDailyProfit: strictestProfitCap ? strictestProfitCap.cap : null,
    maxDailyProfitReason: strictestProfitCap ? strictestProfitCap.reason : null,
    maxDailyLoss,
    idealDailyTarget,
    daysLeft: effectiveDaysLeft,
    minDaysToComplete,
    daysNeeded: daysRemaining,
    minProfitPerDay: minProfit || 0,
    isBreached,
    isTargetHit,
    profitTargetMet: pctComplete >= 1,
  };

  return {
    todayPlan,
    currentBal,
    totalPnl,
    roomToDD,
    ddFloor,
    ddPct,
    peakBal,
    profitDays,
    requiredDays,
    consistencyOk,
    consistencyPct,
    biggestDay,
    maxSafeDayProfit,
    phase,
    mll,
    mllType,
    dll,
    mllBreached,
    effectiveStartBal,
    totalPayouts,
  };
}

// ─────────────────────────────────────────────────────────
// evaluateAccount — Uses Today's Plan to build trade params
// ─────────────────────────────────────────────────────────

/**
 * Evaluate a single account against an ORB signal.
 *
 * The ORB signal only provides: direction (buy/sell), entry price, session name,
 * and the OR high/low for reference.
 *
 * Stop, target, and contracts are ALL derived from Today's Trading Plan.
 *
 * @param {object} account - Account data from Supabase
 * @param {object} firm - Firm data from Supabase
 * @param {object} signal - ORB signal { direction, entry, session, orHigh, orLow, timestamp }
 * @returns {object} { approved, reason, plan }
 */
export function evaluateAccount(account, firm, signal) {
  const metrics = calcTodayPlan(account, firm);
  const { todayPlan } = metrics;
  const plan = {};

  // Copy metrics into plan for logging / execution
  plan.balance = metrics.currentBal;
  plan.totalPnl = metrics.totalPnl;
  plan.ddRoom = metrics.roomToDD;
  plan.ddRoomPct = metrics.mll > 0 ? (metrics.roomToDD / metrics.mll) * 100 : 100;
  plan.mllFloor = metrics.ddFloor;
  plan.session = signal.session;
  plan.direction = signal.direction;
  plan.entry = signal.entry;
  plan.orHigh = signal.orHigh;
  plan.orLow = signal.orLow;

  // ── SESSION SPLITTING for "both" sessions ──
  // When account trades both London and NY:
  //   London gets 50% of daily aim, 50% of max loss budget
  //   NY gets the remaining aim + must recover any London loss
  //   Max loss for NY = full daily max loss minus any London loss already taken
  const sessions = account.autoSessions || "both";
  const isBothSessions = sessions === "both";
  const isLondon = signal.session.toLowerCase() === "london";
  const isNY = signal.session.toLowerCase() === "ny";

  let sessionAim = todayPlan.idealDailyTarget;
  let sessionMaxLoss = todayPlan.maxDailyLoss;
  let sessionMaxProfit = todayPlan.maxDailyProfit;
  let sessionNote = "";

  if (isBothSessions) {
    const londonResult = getLondonResult(account.id);

    if (isLondon) {
      // London gets 50% of the daily aim and 50% of the loss budget
      sessionAim = Math.ceil(todayPlan.idealDailyTarget / 2);
      sessionMaxLoss = Math.floor(todayPlan.maxDailyLoss / 2);
      if (sessionMaxProfit != null) sessionMaxProfit = Math.floor(sessionMaxProfit / 2);
      sessionNote = "London (50% of daily budget)";

    } else if (isNY) {
      if (londonResult) {
        if (londonResult.londonPnl < 0) {
          // London lost money → NY must recover the loss + make remaining aim
          const londonLoss = Math.abs(londonResult.londonPnl);
          const remainingAim = Math.ceil(todayPlan.idealDailyTarget / 2); // NY's 50% share
          sessionAim = remainingAim + londonLoss; // recover + earn
          sessionMaxLoss = todayPlan.maxDailyLoss - londonLoss; // reduced budget
          sessionNote = `NY (recovering London loss $${londonLoss} + aim $${remainingAim})`;

          if (sessionMaxLoss <= 0) {
            return {
              approved: false,
              reason: `London loss ($${londonLoss}) consumed entire daily loss budget ($${todayPlan.maxDailyLoss}) — NO-GO for NY`,
              plan,
            };
          }
        } else if (londonResult.londonPnl > 0) {
          // London was profitable → NY aims for the remaining half
          const londonProfit = londonResult.londonPnl;
          const remainingAim = Math.max(0, todayPlan.idealDailyTarget - londonProfit);
          sessionAim = Math.ceil(remainingAim);
          // Full loss budget still available (London didn't use any)
          sessionMaxLoss = todayPlan.maxDailyLoss;
          // Reduce max profit cap by what London already earned
          if (sessionMaxProfit != null) {
            sessionMaxProfit = Math.max(0, sessionMaxProfit - londonProfit);
          }
          sessionNote = `NY (London made $${londonProfit}, remaining aim: $${remainingAim})`;

          if (sessionAim <= 0) {
            return {
              approved: false,
              reason: `London already met or exceeded daily aim ($${londonProfit} ≥ $${todayPlan.idealDailyTarget}) — no NY trade needed`,
              plan,
            };
          }
        } else {
          // London broke even → NY gets 50% aim, full loss budget
          sessionAim = Math.ceil(todayPlan.idealDailyTarget / 2);
          sessionNote = "NY (London broke even, 50% of daily aim)";
        }
      } else {
        // No London result yet (maybe London didn't trigger) → NY gets full budget
        sessionAim = todayPlan.idealDailyTarget;
        sessionMaxLoss = todayPlan.maxDailyLoss;
        sessionNote = "NY (no London trade today, full budget)";
      }
    }
  }

  // Log Today's Plan with session adjustments
  log.info(TAG, `Account "${account.label}" — Today's Plan:`);
  log.info(TAG, `  Contracts: ${todayPlan.contractsAllowed} | Max Daily Loss: $${todayPlan.maxDailyLoss} | Daily Aim: $${todayPlan.idealDailyTarget}`);
  if (sessionNote) {
    log.info(TAG, `  Session: ${sessionNote}`);
    log.info(TAG, `  Session Aim: $${sessionAim} | Session Max Loss: $${sessionMaxLoss}${sessionMaxProfit != null ? " | Session Profit Cap: $" + sessionMaxProfit : ""}`);
  }
  log.info(TAG, `  Max Daily Profit: ${todayPlan.maxDailyProfit != null ? "$" + todayPlan.maxDailyProfit : "none"} (${todayPlan.maxDailyProfitReason || "-"}) | Days Left: ${todayPlan.daysLeft}`);
  log.info(TAG, `  Balance: $${metrics.currentBal} | DD Room: $${Math.round(metrics.roomToDD)} | P&L: $${Math.round(metrics.totalPnl)}`);

  // ── CHECK 1: Account breached? ──
  if (todayPlan.isBreached) {
    return {
      approved: false,
      reason: "Account BREACHED — MLL floor hit or no DD room left",
      plan,
    };
  }

  // ── CHECK 2: Target already hit? (challenge passed or payout ready) ──
  if (todayPlan.isTargetHit) {
    return {
      approved: false,
      reason: "Target already hit — no more trading needed",
      plan,
    };
  }

  // ── CHECK 3: Contracts allowed ──
  const contracts = todayPlan.contractsAllowed;
  if (!contracts || contracts <= 0) {
    return {
      approved: false,
      reason: "No contracts allowed (scaling tier = 0)",
      plan,
    };
  }
  plan.contracts = contracts;

  // ── CHECK 4: Session max loss must be meaningful ──
  if (sessionMaxLoss <= 0) {
    return {
      approved: false,
      reason: `Session max loss is $${sessionMaxLoss} — no room to trade`,
      plan,
    };
  }

  // ── CHECK 5: Session aim must be meaningful ──
  if (sessionAim <= 0) {
    return {
      approved: false,
      reason: "Session aim is $0 — no trade needed this session",
      plan,
    };
  }

  // ── CALCULATE STOP & TARGET from session-adjusted plan ──
  // Stop: how many points can we lose before hitting sessionMaxLoss?
  //   sessionMaxLoss = contracts × stopPoints × pointValue
  //   stopPoints = sessionMaxLoss / (contracts × pointValue)
  const pointValue = config.pointValue; // NQ: $20 per point

  const stopPoints = Math.floor(sessionMaxLoss / (contracts * pointValue));
  if (stopPoints <= 0) {
    return {
      approved: false,
      reason: `Stop distance would be 0 pts: sessionMaxLoss=$${sessionMaxLoss} / (${contracts} contracts × $${pointValue}/pt)`,
      plan,
    };
  }

  // Target: how many points to hit sessionAim?
  //   sessionAim = contracts × targetPoints × pointValue
  //   targetPoints = sessionAim / (contracts × pointValue)
  let targetPoints = Math.ceil(sessionAim / (contracts * pointValue));
  if (targetPoints <= 0) targetPoints = 1; // At minimum aim for 1 point

  // Cap target if session max profit is set (consistency cap)
  if (sessionMaxProfit != null && sessionMaxProfit > 0) {
    const maxTargetPoints = Math.floor(sessionMaxProfit / (contracts * pointValue));
    if (maxTargetPoints > 0 && targetPoints > maxTargetPoints) {
      log.info(TAG, `  Capping target from ${targetPoints}pts to ${maxTargetPoints}pts (session profit cap: $${sessionMaxProfit})`);
      targetPoints = maxTargetPoints;
    }
  }

  // Apply direction
  let stop, target;
  if (signal.direction === "buy") {
    stop = signal.entry - stopPoints;
    target = signal.entry + targetPoints;
  } else {
    stop = signal.entry + stopPoints;
    target = signal.entry - targetPoints;
  }

  plan.stop = parseFloat(stop.toFixed(2));
  plan.target = parseFloat(target.toFixed(2));
  plan.stopPoints = stopPoints;
  plan.targetPoints = targetPoints;

  // Dollar amounts for logging
  plan.riskDollars = contracts * stopPoints * pointValue;
  plan.rewardDollars = contracts * targetPoints * pointValue;
  plan.maxDailyLoss = todayPlan.maxDailyLoss;
  plan.sessionMaxLoss = sessionMaxLoss;
  plan.idealDailyTarget = todayPlan.idealDailyTarget;
  plan.sessionAim = sessionAim;
  plan.maxDailyProfit = todayPlan.maxDailyProfit;
  plan.sessionMaxProfit = sessionMaxProfit;
  plan.sessionNote = sessionNote;

  // ── APPROVED ──
  log.trade(TAG, `Account "${account.label}" APPROVED:`);
  log.trade(TAG, `  ${signal.direction.toUpperCase()} ${contracts}x @ ${signal.entry}`);
  log.trade(TAG, `  Stop: ${plan.stop} (${stopPoints}pts = $${plan.riskDollars}) ← from session max loss $${sessionMaxLoss}`);
  log.trade(TAG, `  Target: ${plan.target} (${targetPoints}pts = $${plan.rewardDollars}) ← from session aim $${sessionAim}`);
  if (sessionNote) {
    log.trade(TAG, `  Session: ${sessionNote}`);
  }
  if (sessionMaxProfit != null) {
    log.trade(TAG, `  Session profit cap: $${sessionMaxProfit} (daily: $${todayPlan.maxDailyProfit || "none"}, ${todayPlan.maxDailyProfitReason || "-"})`);
  }

  return {
    approved: true,
    reason: "All checks passed — trade follows Today's Trading Plan",
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
    if (account.status !== "active") continue;

    // Check if session matches the account's configured sessions
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
