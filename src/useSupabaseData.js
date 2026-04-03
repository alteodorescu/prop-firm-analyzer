import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";

/**
 * Mapping functions: Convert between camelCase (app) and snake_case (database)
 */

function mapFirmToDb(firm) {
  const row = {
    user_id: null, // Firms are global, no user ownership
    name: firm.name,
    model: firm.model,
    cost: firm.cost,
    reset_cost: firm.resetCost != null ? String(firm.resetCost) : null,
    max_nq: firm.maxNQ,
    instant: firm.instant,
    pt: firm.pt,
    mll: firm.mll,
    mll_type: firm.mllType,
    dll: firm.dll,
    consistency: firm.consistency,
    min_days: firm.minDays,
    min_profit: firm.minProfit,
    f_mll: firm.fMll,
    f_mll_type: firm.fMllType,
    f_dll: firm.fDll,
    f_consistency: firm.fConsistency,
    f_min_days: firm.fMinDays,
    f_min_profit: firm.fMinProfit,
    activation: firm.activation,
    buffer: firm.buffer,
    split: firm.split,
    withdrawal_pct: firm.withdrawalPct,
    scaling_chal: firm.scalingChal || [],
    scaling_fund: firm.scalingFund || [],
    payout_tiers: firm.payoutTiers || [],
    special_rules: firm.specialRules,
  };
  // Only include id if it exists (for updates), let Supabase auto-assign for new rows
  if (firm.id) row.id = firm.id;
  return row;
}

function mapDbToFirm(row) {
  return {
    id: row.id,
    name: row.name,
    model: row.model,
    cost: row.cost,
    resetCost: row.reset_cost === "na" ? "na" : (row.reset_cost != null ? Number(row.reset_cost) : null),
    maxNQ: row.max_nq,
    instant: row.instant,
    pt: row.pt,
    mll: row.mll,
    mllType: row.mll_type,
    dll: row.dll,
    consistency: row.consistency,
    minDays: row.min_days,
    minProfit: row.min_profit,
    fMll: row.f_mll,
    fMllType: row.f_mll_type,
    fDll: row.f_dll,
    fConsistency: row.f_consistency,
    fMinDays: row.f_min_days,
    fMinProfit: row.f_min_profit,
    activation: row.activation,
    buffer: row.buffer,
    split: row.split,
    withdrawalPct: row.withdrawal_pct,
    scalingChal: row.scaling_chal || [],
    scalingFund: row.scaling_fund || [],
    payoutTiers: row.payout_tiers || [],
    specialRules: row.special_rules,
  };
}

function mapAccountToDb(account, userId) {
  const row = {
    user_id: userId,
    firm_id: account.firmId,
    label: account.label,
    phase: account.phase,
    start_balance: account.startBalance,
    start_date: account.startDate,
    status: account.status || "active",
    journal: account.journal || [],
    payouts: account.payouts || [],
    resets: account.resets || [],
    // Automation fields
    auto_enabled: account.autoEnabled || false,
    auto_sessions: account.autoSessions || "both",
    pmt_webhook_url: account.pmtWebhookUrl || null,
  };
  if (account.id) row.id = account.id;
  return row;
}

function mapDbToAccount(row) {
  return {
    id: row.id,
    firmId: row.firm_id,
    label: row.label,
    phase: row.phase,
    startBalance: row.start_balance,
    startDate: row.start_date,
    status: row.status,
    journal: row.journal || [],
    payouts: row.payouts || [],
    resets: row.resets || [],
    // Automation fields
    autoEnabled: row.auto_enabled || false,
    autoSessions: row.auto_sessions || "both",
    pmtWebhookUrl: row.pmt_webhook_url || "",
  };
}

/**
 * Custom React hook for Supabase data management.
 *
 * Architecture:
 * - Firms are PUBLIC (loaded without auth, writable only by admins)
 * - Accounts are PER-USER (require authentication)
 * - Preferences are PER-USER (require authentication)
 *
 * @param {Object|null} session - The Supabase auth session (null if not logged in)
 * @returns {Object} Data and mutation functions
 */
export function useSupabaseData(session) {
  const userId = session?.user?.id || null;

  const [firms, setFirmsState] = useState([]);
  const [accounts, setAccountsState] = useState([]);
  const [preferences, setPreferencesState] = useState({
    darkMode: false,
    lang: "en",
  });
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Debounce timers for batch operations
  const debounceTimers = useRef({});

  /**
   * Check if current user is an admin
   */
  async function checkAdminStatus() {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", userId)
        .single();

      setIsAdmin(!error && !!data);
    } catch {
      setIsAdmin(false);
    }
  }

  /**
   * Load all data from Supabase on mount
   * Firms are loaded publicly (no user_id filter)
   * Accounts & preferences are loaded per-user (only if authenticated)
   */
  async function loadAllData() {
    setLoading(true);
    try {
      // Always load firms (public)
      const firmsRes = await supabase
        .from("firms")
        .select("*")
        .order("id");

      if (firmsRes.data) {
        setFirmsState(firmsRes.data.map(mapDbToFirm));
      }

      // Only load user-specific data if authenticated
      if (userId) {
        const [accountsRes, prefsRes] = await Promise.all([
          supabase
            .from("accounts")
            .select("*")
            .eq("user_id", userId)
            .order("id"),
          supabase
            .from("user_preferences")
            .select("*")
            .eq("user_id", userId)
            .single(),
        ]);

        if (accountsRes.data) {
          setAccountsState(accountsRes.data.map(mapDbToAccount));
        }

        if (prefsRes.data) {
          setPreferencesState({
            darkMode: prefsRes.data.dark_mode || false,
            lang: prefsRes.data.language || "en",
          });
        } else if (!prefsRes.error || prefsRes.error.code === "PGRST116") {
          // No preferences record yet, create default
          await supabase.from("user_preferences").insert({
            user_id: userId,
            dark_mode: false,
            language: "en",
          });
        }

        // Check admin status
        await checkAdminStatus();
      }
    } catch (e) {
      console.error("Failed to load data from Supabase:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllData();
  }, [userId]);

  /**
   * Save a single firm to Supabase (admin only — RLS enforced)
   */
  const saveFirm = useCallback(
    async (firm) => {
      if (!isAdmin) return { data: null, error: "Not authorized" };

      try {
        const dbFirm = mapFirmToDb(firm);
        const { data, error } = await supabase
          .from("firms")
          .upsert(dbFirm, { onConflict: "id" })
          .select()
          .single();

        if (error) throw error;

        if (data) {
          const mapped = mapDbToFirm(data);
          setFirmsState((prev) => {
            const idx = prev.findIndex((f) => f.id === data.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = mapped;
              return next;
            }
            return [...prev, mapped];
          });
          return { data: mapped, error: null };
        }

        return { data: null, error: null };
      } catch (e) {
        console.error("Error saving firm:", e);
        return { data: null, error: e.message };
      }
    },
    [isAdmin]
  );

  /**
   * Delete a firm from Supabase (admin only — RLS enforced)
   */
  const deleteFirm = useCallback(
    async (firmId) => {
      if (!isAdmin) return { error: "Not authorized" };

      try {
        const { error } = await supabase
          .from("firms")
          .delete()
          .eq("id", firmId);

        if (error) throw error;

        setFirmsState((prev) => prev.filter((f) => f.id !== firmId));
        return { error: null };
      } catch (e) {
        console.error("Error deleting firm:", e);
        return { error: e.message };
      }
    },
    [isAdmin]
  );

  /**
   * Save a single account to Supabase (per-user)
   */
  const saveAccount = useCallback(
    async (account) => {
      if (!userId) return { data: null, error: "No user ID" };

      try {
        const dbAccount = mapAccountToDb(account, userId);
        const { data, error } = await supabase
          .from("accounts")
          .upsert(dbAccount, { onConflict: "id" })
          .select()
          .single();

        if (error) throw error;

        if (data) {
          const mapped = mapDbToAccount(data);
          setAccountsState((prev) => {
            const idx = prev.findIndex((a) => a.id === data.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = mapped;
              return next;
            }
            return [...prev, mapped];
          });
          return { data: mapped, error: null };
        }

        return { data: null, error: null };
      } catch (e) {
        console.error("Error saving account:", e);
        return { data: null, error: e.message };
      }
    },
    [userId]
  );

  /**
   * Delete an account from Supabase (per-user)
   */
  const deleteAccount = useCallback(
    async (accountId) => {
      if (!userId) return { error: "No user ID" };

      try {
        const { error } = await supabase
          .from("accounts")
          .delete()
          .eq("id", accountId)
          .eq("user_id", userId);

        if (error) throw error;

        setAccountsState((prev) => prev.filter((a) => a.id !== accountId));
        return { error: null };
      } catch (e) {
        console.error("Error deleting account:", e);
        return { error: e.message };
      }
    },
    [userId]
  );

  /**
   * Bulk update accounts with debounced sync to Supabase
   */
  const setAccounts = useCallback(
    async (updater) => {
      if (!userId) return;

      const newAccounts =
        typeof updater === "function" ? updater(accounts) : updater;

      // Update local state immediately for responsiveness
      setAccountsState(newAccounts);

      // Debounce the Supabase sync to avoid too many requests
      if (debounceTimers.current.accounts) {
        clearTimeout(debounceTimers.current.accounts);
      }

      debounceTimers.current.accounts = setTimeout(async () => {
        try {
          // Upsert all accounts
          for (const acc of newAccounts) {
            const dbAcc = mapAccountToDb(acc, userId);
            await supabase
              .from("accounts")
              .upsert(dbAcc, { onConflict: "id" });
          }

          // Delete accounts that were removed
          const newIds = new Set(newAccounts.map((a) => a.id));
          for (const acc of accounts) {
            if (!newIds.has(acc.id)) {
              await supabase
                .from("accounts")
                .delete()
                .eq("id", acc.id)
                .eq("user_id", userId);
            }
          }
        } catch (e) {
          console.error("Error syncing accounts:", e);
        }
      }, 1000);
    },
    [accounts, userId]
  );

  /**
   * Bulk update firms (admin only) with debounced sync to Supabase
   */
  const setFirms = useCallback(
    async (updater) => {
      if (!isAdmin) return;

      const newFirms =
        typeof updater === "function" ? updater(firms) : updater;

      // Update local state immediately for responsiveness
      setFirmsState(newFirms);

      // Debounce the Supabase sync
      if (debounceTimers.current.firms) {
        clearTimeout(debounceTimers.current.firms);
      }

      debounceTimers.current.firms = setTimeout(async () => {
        try {
          for (const firm of newFirms) {
            const dbFirm = mapFirmToDb(firm);
            await supabase
              .from("firms")
              .upsert(dbFirm, { onConflict: "id" });
          }

          const newIds = new Set(newFirms.map((f) => f.id));
          for (const firm of firms) {
            if (!newIds.has(firm.id)) {
              await supabase
                .from("firms")
                .delete()
                .eq("id", firm.id);
            }
          }
        } catch (e) {
          console.error("Error syncing firms:", e);
        }
      }, 1000);
    },
    [firms, isAdmin]
  );

  /**
   * Save user preferences to Supabase
   */
  const savePreferences = useCallback(
    async (prefs) => {
      if (!userId) return;

      setPreferencesState(prefs);

      try {
        await supabase.from("user_preferences").upsert(
          {
            user_id: userId,
            dark_mode: prefs.darkMode,
            language: prefs.lang,
          },
          { onConflict: "user_id" }
        );
      } catch (e) {
        console.error("Error saving preferences:", e);
      }
    },
    [userId]
  );

  /**
   * Admin: get list of all admin users
   */
  const getAdminUsers = useCallback(async () => {
    if (!isAdmin) return [];
    try {
      const { data, error } = await supabase
        .from("admin_users")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error("Error fetching admin users:", e);
      return [];
    }
  }, [isAdmin]);

  /**
   * Admin: add a new admin user by their auth user_id
   */
  const addAdminUser = useCallback(
    async (targetUserId) => {
      if (!isAdmin) return { error: "Not authorized" };
      try {
        const { data, error } = await supabase
          .from("admin_users")
          .insert({ user_id: targetUserId })
          .select()
          .single();
        if (error) throw error;
        return { data, error: null };
      } catch (e) {
        console.error("Error adding admin:", e);
        return { data: null, error: e.message };
      }
    },
    [isAdmin]
  );

  /**
   * Admin: remove an admin user
   */
  const removeAdminUser = useCallback(
    async (targetUserId) => {
      if (!isAdmin) return { error: "Not authorized" };
      // Don't allow removing yourself
      if (targetUserId === userId) return { error: "Cannot remove yourself" };
      try {
        const { error } = await supabase
          .from("admin_users")
          .delete()
          .eq("user_id", targetUserId);
        if (error) throw error;
        return { error: null };
      } catch (e) {
        console.error("Error removing admin:", e);
        return { error: e.message };
      }
    },
    [isAdmin, userId]
  );

  /**
   * Force a full reload of all data
   */
  const reload = useCallback(() => {
    loadAllData();
  }, [userId]);

  return {
    // State
    firms,
    accounts,
    preferences,
    loading,
    isAdmin,

    // Firms operations (admin only for mutations)
    setFirms,
    saveFirm,
    deleteFirm,

    // Accounts operations (per-user)
    setAccounts,
    saveAccount,
    deleteAccount,

    // Preferences operations (per-user)
    savePreferences,

    // Admin operations
    getAdminUsers,
    addAdminUser,
    removeAdminUser,

    // Utilities
    reload,
  };
}
