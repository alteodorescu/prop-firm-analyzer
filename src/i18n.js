// ═══════════════════════════════════════════════════════════
// INTERNATIONALIZATION — English + Romanian
// ═══════════════════════════════════════════════════════════

const translations = {
  // ── App title & header ──
  appTitle: { en: "Futures Prop Firm Analyzer", ro: "Analizor Firme Prop Futures" },
  appSubtitle: { en: "Compare, rank, and plan across {0} firms — auto-calculated", ro: "Compară, clasifică și planifică pentru {0} firme — calcul automat" },
  topPick: { en: "Top pick:", ro: "Prima alegere:" },
  overallEase: { en: "Overall Ease", ro: "Ușurință Generală" },
  maxProfit: { en: "max profit", ro: "profit maxim" },
  cost: { en: "cost", ro: "cost" },
  addFirm: { en: "Add Firm", ro: "Adaugă Firmă" },
  lightMode: { en: "Switch to light mode", ro: "Mod luminos" },
  darkMode: { en: "Switch to dark mode", ro: "Mod întunecat" },

  // ── Tabs ──
  tabComparison: { en: "📊 Comparison", ro: "📊 Comparație" },
  tabDetails: { en: "📋 Firm Details", ro: "📋 Detalii Firme" },
  tabTracker: { en: "📈 Account Tracker", ro: "📈 Urmărire Conturi" },
  tabDashboard: { en: "💰 Dashboard", ro: "💰 Panou Control" },

  // ── Common labels ──
  name: { en: "Name", ro: "Nume" },
  date: { en: "Date", ro: "Data" },
  balance: { en: "Balance", ro: "Balanță" },
  pnl: { en: "P&L", ro: "P&L" },
  trades: { en: "Trades", ro: "Tranzacții" },
  flags: { en: "Flags", ro: "Alerte" },
  notes: { en: "Notes", ro: "Notițe" },
  phase: { en: "Phase", ro: "Faza" },
  label: { en: "Label", ro: "Etichetă" },
  firm: { en: "Firm", ro: "Firmă" },
  accounts: { en: "Accounts", ro: "Conturi" },
  expenses: { en: "Expenses", ro: "Cheltuieli" },
  income: { en: "Income", ro: "Venituri" },
  payout: { en: "Payout", ro: "Plată" },
  payouts: { en: "Payouts", ro: "Plăți" },
  resets: { en: "Resets", ro: "Resetări" },
  month: { en: "Month", ro: "Luna" },
  year: { en: "Year", ro: "An" },
  total: { en: "Total", ro: "Total" },
  roi: { en: "ROI", ro: "ROI" },
  none: { en: "None", ro: "Niciunul" },
  cancel: { en: "Cancel", ro: "Anulează" },
  save: { en: "Save", ro: "Salvează" },
  delete: { en: "Delete", ro: "Șterge" },
  edit: { en: "Edit", ro: "Editează" },
  close: { en: "Close", ro: "Închide" },
  confirm: { en: "Confirm", ro: "Confirmă" },
  active: { en: "Active", ro: "Activ" },
  start: { en: "Start", ro: "Start" },

  // ── Firm form ──
  editFirm: { en: "Edit Firm", ro: "Editare Firmă" },
  addNewFirm: { en: "Add New Firm", ro: "Adaugă Firmă Nouă" },
  basicInfo: { en: "Basic Info", ro: "Informații de Bază" },
  firmName: { en: "Firm Name *", ro: "Nume Firmă *" },
  modelPlan: { en: "Model/Plan", ro: "Model/Plan" },
  evalCost: { en: "Eval Cost", ro: "Cost Evaluare" },
  resetCost: { en: "Reset Cost", ro: "Cost Resetare" },
  maxNqContracts: { en: "Max NQ Contracts", ro: "Max Contracte NQ" },
  instantFunded: { en: "Instant Funded", ro: "Finanțare Instantanee" },
  noChallenge: { en: "(no challenge/evaluation phase)", ro: "(fără fază de evaluare)" },
  updateFirm: { en: "Update Firm", ro: "Actualizare Firmă" },

  // ── Challenge section ──
  challengeRules: { en: "Challenge Rules", ro: "Reguli Evaluare" },
  profitTarget: { en: "Profit Target", ro: "Obiectiv Profit" },
  profitTargetReq: { en: "Profit Target *", ro: "Obiectiv Profit *" },
  maxLossLimit: { en: "Max Loss Limit", ro: "Limită Pierdere Maximă" },
  maxLossLimitReq: { en: "Max Loss Limit *", ro: "Limită Pierdere Maximă *" },
  mllDrawdownType: { en: "MLL Drawdown Type", ro: "Tip Drawdown MLL" },
  ddStatic: { en: "Static", ro: "Static" },
  ddTrailingEod: { en: "Trailing EOD", ro: "Trailing EOD" },
  ddTrailingIntraday: { en: "Trailing Intraday", ro: "Trailing Intraday" },
  dailyLossLimit: { en: "Daily Loss Limit", ro: "Limită Pierdere Zilnică" },
  consistency: { en: "Consistency", ro: "Consistență" },
  minProfitDays: { en: "Min Profitable Days", ro: "Zile Profitabile Min" },
  minDailyProfit: { en: "Min Daily Profit", ro: "Profit Zilnic Minim" },
  challengeScaling: { en: "Challenge Scaling Plan", ro: "Plan Scalare Evaluare" },

  // ── Funded section ──
  fundedRules: { en: "Funded Rules", ro: "Reguli Finanțat" },
  activationFee: { en: "Activation Fee", ro: "Taxă Activare" },
  fundedScaling: { en: "Funded Scaling Plan", ro: "Plan Scalare Finanțat" },

  // ── Payout section ──
  payoutRules: { en: "Payout Rules", ro: "Reguli Plată" },
  buffer: { en: "Buffer", ro: "Buffer" },
  profitSplit: { en: "Profit Split", ro: "Împărțire Profit" },
  withdrawalPct: { en: "Withdrawal %", ro: "Retragere %" },
  payoutTiers: { en: "Payout Tiers", ro: "Niveluri Plată" },
  addPayoutTier: { en: "Add Payout Tier", ro: "Adaugă Nivel Plată" },
  addTier: { en: "Add Tier", ro: "Adaugă Nivel" },
  unlimited: { en: "unlimited", ro: "nelimitat" },
  andAbove: { en: "& above", ro: "și peste" },
  min: { en: "min", ro: "min" },
  max: { en: "max", ro: "max" },

  // ── Financials ──
  financialsRoi: { en: "Financials & ROI", ro: "Financiar & ROI" },
  totalCost: { en: "Total Cost", ro: "Cost Total" },
  totalDays: { en: "Total Days", ro: "Zile Totale" },
  minNetProfit: { en: "Min Net Profit", ro: "Profit Net Min" },
  maxNetProfit: { en: "Max Net Profit", ro: "Profit Net Max" },
  maxRoi: { en: "Max ROI", ro: "ROI Maxim" },
  reqBalMin: { en: "Req. Balance (min)", ro: "Balanță Necesară (min)" },
  reqBalMax: { en: "Req. Balance (max)", ro: "Balanță Necesară (max)" },
  minNetPayout: { en: "Min Net Payout", ro: "Plată Netă Min" },
  maxNetPayout: { en: "Max Net Payout", ro: "Plată Netă Max" },
  dailyProfitRate: { en: "Daily $/Day", ro: "Zilnic $/Zi" },
  resetsToBreakeven: { en: "Resets to Break-even", ro: "Resetări până la Break-even" },

  // ── Comparison table ──
  overallEaseCol: { en: "Overall\nEase", ro: "Ușurință\nGenerală" },
  easeToPassCol: { en: "Ease to\nPass", ro: "Ușurință\nPromovare" },
  easeToGetPaidCol: { en: "Ease to\nGet Paid", ro: "Ușurință\nPlată" },
  totalCostCol: { en: "Total\nCost", ro: "Cost\nTotal" },
  maxNetProfitCol: { en: "Max Net\nProfit", ro: "Profit Net\nMax" },
  maxRoiCol: { en: "Max\nROI", ro: "ROI\nMax" },
  dailyProfitRateCol: { en: "Daily\n$/Day", ro: "Zilnic\n$/Zi" },
  resetsBECol: { en: "Resets to\nBreak-even", ro: "Resetări\nBreak-even" },
  daysToPayoutCol: { en: "Days to\nPayout", ro: "Zile până\nla Plată" },
  clickToSort: { en: "Click a column header to sort. Click a firm name to see full details.", ro: "Click pe antet pentru sortare. Click pe firmă pentru detalii." },
  easeGreen: { en: "Ease ≥ 45%", ro: "Ușurință ≥ 45%" },
  easeAmber: { en: "25-45%", ro: "25-45%" },
  easeRed: { en: "< 25%", ro: "< 25%" },
  noFirmsYet: { en: "No firms yet", ro: "Nicio firmă încă" },
  clickAddFirm: { en: "Click \"Add Firm\" to get started", ro: "Click \"Adaugă Firmă\" pentru a începe" },

  // ── Firm detail card ──
  overall: { en: "Overall", ro: "General" },
  ease: { en: "Ease", ro: "Ușurință" },
  pass: { en: "Pass", ro: "Promovare" },
  paid: { en: "Paid", ro: "Plată" },
  evalPlusActivation: { en: "{0} eval + {1} activation", ro: "{0} evaluare + {1} activare" },
  perDay: { en: "per day", ro: "pe zi" },
  daysTotal: { en: "days total", ro: "zile total" },
  days: { en: "days", ro: "zile" },
  noResets: { en: "No resets", ro: "Fără resetări" },
  xResets: { en: "{0}× resets", ro: "{0}× resetări" },
  bestPlan: { en: "Best Plan", ro: "Cel Mai Bun Plan" },
  daysToPass: { en: "Days to Pass", ro: "Zile pentru Promovare" },
  daysToPayout: { en: "Days to Payout", ro: "Zile pentru Plată" },
  calculated: { en: "(calculated)", ro: "(calculat)" },
  fundedTarget: { en: "funded target", ro: "obiectiv finanțat" },
  scalingFactor: { en: "Scaling Factor", ro: "Factor Scalare" },
  contractsLimited: { en: "contracts limited in early tiers", ro: "contracte limitate în nivelurile inferioare" },
  trailingEod: { en: "trailing EOD", ro: "trailing EOD" },
  trailingIntraday: { en: "trailing intraday", ro: "trailing intraday" },

  // ── How it works ──
  howCalculated: { en: "How are these scores calculated?", ro: "Cum sunt calculate aceste scoruri?" },
  easeToPassTitle: { en: "Ease to Pass (evaluation difficulty)", ro: "Ușurință Promovare (dificultate evaluare)" },
  easeToGetPaidTitle: { en: "Ease to Get Paid (funded → payout difficulty)", ro: "Ușurință Plată (finanțat → dificultate plată)" },
  overallEaseTitle: { en: "Overall Ease Score", ro: "Scor Ușurință General" },
  daysFormula: { en: "Days to Pass / Days to Payout", ro: "Zile Promovare / Zile Plată" },
  tunableParams: { en: "Tunable Parameters", ro: "Parametri Ajustabili" },

  // ── Account Tracker ──
  trackAccount: { en: "Track Account", ro: "Urmărește Cont" },
  trackNewAccount: { en: "Track New Account", ro: "Urmărește Cont Nou" },
  noAccountsYet: { en: "No tracked accounts yet", ro: "Niciun cont urmărit" },
  clickTrackAccount: { en: "Click \"Track Account\" to link a firm and start logging your trading journal.", ro: "Click \"Urmărește Cont\" pentru a lega o firmă și a începe jurnalul de tranzacționare." },
  searchAccounts: { en: "Search accounts...", ro: "Caută conturi..." },
  allPhases: { en: "All phases", ro: "Toate fazele" },
  challenge: { en: "Challenge", ro: "Evaluare" },
  funded: { en: "Funded", ro: "Finanțat" },
  allStatuses: { en: "All statuses", ro: "Toate statusurile" },
  targetHitPayout: { en: "Target hit / Payout ready", ro: "Obiectiv atins / Gata de plată" },
  breached: { en: "Breached", ro: "Depășit" },
  expandAll: { en: "Expand All", ro: "Extinde Tot" },
  collapseAll: { en: "Collapse All", ro: "Restrânge Tot" },
  deselectAll: { en: "Deselect all", ro: "Deselectează tot" },
  deleteSelected: { en: "Delete selected", ro: "Șterge selectate" },
  noAccountsMatch: { en: "No accounts match your filters.", ro: "Niciun cont nu corespunde filtrelor." },
  sortNewest: { en: "Newest first", ro: "Cele mai noi" },
  sortOldest: { en: "Oldest first", ro: "Cele mai vechi" },
  sortPnlHigh: { en: "P&L (high → low)", ro: "P&L (mare → mic)" },
  sortPnlLow: { en: "P&L (low → high)", ro: "P&L (mic → mare)" },
  sortProgress: { en: "Progress (most → least)", ro: "Progres (mult → puțin)" },
  sortDdRisk: { en: "DD Risk (most danger first)", ro: "Risc DD (pericol maxim primul)" },
  sortLiveEase: { en: "Live Ease (high → low)", ro: "Ușurință Live (mare → mic)" },

  // ── Account Card ──
  cycleStart: { en: "cycle start", ro: "start ciclu" },
  target: { en: "target", ro: "obiectiv" },
  complete: { en: "complete", ro: "complet" },
  floor: { en: "floor", ro: "prag" },
  recalculated: { en: "recalculated", ro: "recalculat" },
  profitOfTarget: { en: "Profit: {0}% of target", ro: "Profit: {0}% din obiectiv" },
  safetyDDRoom: { en: "Safety: {0}% DD room left", ro: "Siguranță: {0}% din DD rămas" },
  todaysTradingPlan: { en: "TODAY'S TRADING PLAN", ro: "PLANUL DE TRANZACȚIONARE DE AZI" },
  contracts: { en: "CONTRACTS", ro: "CONTRACTE" },
  aimFor: { en: "AIM FOR", ro: "ȚINTĂ" },
  maxLoss: { en: "MAX LOSS", ro: "PIERDERE MAX" },
  ofMax: { en: "of {0} max", ro: "din {0} max" },
  leftOver: { en: "{0} left over {1}d", ro: "{0} rămas pe {1}z" },
  minToCount: { en: "min {0} to count", ro: "min {0} pentru a conta" },
  doNotProfit: { en: "Do NOT profit more than", ro: "NU profita mai mult de" },
  ddRoom: { en: "DD room:", ro: "Spațiu DD:" },
  profitDaysNeeded: { en: "Profit days needed:", ro: "Zile profitabile necesare:" },
  payoutMax: { en: "Payout #{0} max:", ro: "Plata #{0} max:" },
  remaining: { en: "Remaining", ro: "Rămas" },
  roomToDD: { en: "Room to DD", ro: "Spațiu DD" },
  liveEase: { en: "Live Ease", ro: "Ușurință Live" },
  totalPnl: { en: "Total P&L", ro: "P&L Total" },
  winRate: { en: "Win rate:", ro: "Rata de câștig:" },
  peak: { en: "Peak:", ro: "Maxim:" },
  mll: { en: "MLL:", ro: "MLL:" },

  // ── Status labels ──
  statusActive: { en: "Active", ro: "Activ" },
  statusBreached: { en: "BREACHED ✗", ro: "DEPĂȘIT ✗" },
  statusTargetHit: { en: "TARGET HIT ✓", ro: "OBIECTIV ATINS ✓" },
  statusPayoutReady: { en: "PAYOUT READY ✓", ro: "GATA DE PLATĂ ✓" },
  statusNoFirm: { en: "No firm linked", ro: "Nicio firmă legată" },
  labelChallenge: { en: "CHALLENGE", ro: "EVALUARE" },
  labelFunded: { en: "FUNDED", ro: "FINANȚAT" },
  labelInstant: { en: "INSTANT", ro: "INSTANT" },
  instantFundedBadge: { en: "INSTANT FUNDED", ro: "FINANȚARE INSTANTANEE" },

  // ── Account actions ──
  switchPhase: { en: "Switch phase", ro: "Schimbă faza" },
  logToday: { en: "Log Today", ro: "Adaugă Azi" },
  importCsv: { en: "Import CSV", ro: "Importă CSV" },
  recordPayout: { en: "Record Payout", ro: "Înregistrează Plată" },
  resetAccount: { en: "Reset Account", ro: "Resetează Contul" },
  confirmReset: { en: "Confirm Reset", ro: "Confirmă Resetare" },
  startTracking: { en: "Start Tracking", ro: "Începe Urmărirea" },
  startTrackingEntries: { en: "Start Tracking ({0} entries)", ro: "Începe Urmărirea ({0} intrări)" },

  // ── Rules compliance ──
  rulesCompliance: { en: "RULES COMPLIANCE", ro: "CONFORMITATE REGULI" },
  noViolations: { en: "no violations", ro: "fără încălcări" },
  roomLeft: { en: "room left", ro: "spațiu rămas" },
  floorAt: { en: "floor at", ro: "prag la" },
  daysMet: { en: "days — met", ro: "zile — îndeplinit" },
  needMore: { en: "need {0} more", ro: "mai sunt necesare {0}" },
  compliant: { en: "compliant", ro: "conform" },
  accountBreached: { en: "Balance dropped below DD floor — ACCOUNT BREACHED", ro: "Balanța a scăzut sub pragul DD — CONT DEPĂȘIT" },
  doNotTrade: { en: "⛔ Account Breached — Do Not Trade", ro: "⛔ Cont Depășit — Nu Tranzacționa" },

  // ── Payout/Reset sections ──
  payoutHistory: { en: "Payouts ({0})", ro: "Plăți ({0})" },
  payoutTotal: { en: "Total: {0}", ro: "Total: {0}" },
  netAfterSplit: { en: "Net (after split)", ro: "Net (după împărțire)" },
  newBalance: { en: "New Balance", ro: "Balanță Nouă" },
  payoutAmount: { en: "Payout Amount (gross)", ro: "Sumă Plată (brut)" },
  newStartBalance: { en: "New Starting Balance", ro: "Balanță Nouă de Start" },
  resetHistory: { en: "Resets ({0})", ro: "Resetări ({0})" },
  resetCostLabel: { en: "Cost", ro: "Cost" },

  // ── Journal ──
  tradingJournal: { en: "Trading Journal", ro: "Jurnal Tranzacționare" },
  entriesInCycle: { en: "{0} entries in current cycle • {1} total", ro: "{0} intrări în ciclul curent • {1} total" },
  entries: { en: "{0} entries", ro: "{0} intrări" },
  eodBalance: { en: "EOD Balance", ro: "Balanță EOD" },
  dayPnl: { en: "Day P&L", ro: "P&L Zilnic" },
  numTrades: { en: "# Trades", ro: "# Tranzacții" },
  addEntry: { en: "Add Entry", ro: "Adaugă Intrare" },
  updateEntry: { en: "Update", ro: "Actualizare" },

  // ── New account form ──
  linkToFirm: { en: "Link to Firm *", ro: "Leagă de Firmă *" },
  challengeEval: { en: "Challenge (Evaluation)", ro: "Evaluare (Challenge)" },
  fundedPayout: { en: "Funded (Payout Phase)", ro: "Finanțat (Faza de Plată)" },
  fundedInstant: { en: "Funded (Instant)", ro: "Finanțat (Instant)" },
  startBalance: { en: "Starting Balance", ro: "Balanță de Start" },
  startDate: { en: "Start Date", ro: "Data de Start" },
  quickStartCsv: { en: "Quick Start — Import CSV", ro: "Start Rapid — Import CSV" },
  csvImportDesc: { en: "Import one or more CSV files — multiple accounts are detected automatically", ro: "Importă unul sau mai multe fișiere CSV — conturile multiple sunt detectate automat" },
  importCsvs: { en: "Import CSV(s)", ro: "Importă CSV(-uri)" },
  bulkImport: { en: "Bulk Import — {0} accounts detected", ro: "Import în Masă — {0} conturi detectate" },
  assignFirm: { en: "Assign a firm to each account, then import all at once.", ro: "Asignează o firmă fiecărui cont, apoi importă toate odată." },
  importAccounts: { en: "Import {0} Account{1}", ro: "Importă {0} Cont{1}" },
  addMoreCsvs: { en: "Add More CSVs", ro: "Adaugă Mai Multe CSV-uri" },
  startBal: { en: "Start Bal", ro: "Balanță Start" },

  // ── Financial Dashboard ──
  financialDashboard: { en: "Financial Dashboard", ro: "Panou Financiar" },
  evalFeesActivResets: { en: "eval fees + activations + resets", ro: "taxe evaluare + activări + resetări" },
  totalExpenses: { en: "Total Expenses", ro: "Cheltuieli Totale" },
  totalIncome: { en: "Total Income", ro: "Venituri Totale" },
  actualPnl: { en: "Actual P&L", ro: "P&L Efectiv" },
  incomeMinusExpenses: { en: "income − expenses", ro: "venituri − cheltuieli" },
  actualRoi: { en: "Actual ROI", ro: "ROI Efectiv" },
  pnlDivExpenses: { en: "P&L ÷ expenses", ro: "P&L ÷ cheltuieli" },
  avgPayout: { en: "Avg Payout", ro: "Plată Medie" },
  costPerPayout: { en: "cost/payout", ro: "cost/plată" },
  gotPayouts: { en: "Got payouts", ro: "Au plăți" },
  ofAccounts: { en: "of accounts", ro: "din conturi" },
  successRate: { en: "Success rate", ro: "Rată de succes" },
  breakEvenIn: { en: "Break-even in", ro: "Break-even în" },
  morePayouts: { en: "more payout(s)", ro: "plăți încă" },
  byFirm: { en: "By Firm", ro: "Pe Firmă" },
  byMonth: { en: "By Month", ro: "Pe Lună" },
  byYear: { en: "By Year", ro: "Pe An" },
  cumulativePnl: { en: "Cumulative P&L", ro: "P&L Cumulativ" },
  noActivity: { en: "Start tracking accounts to see your financial dashboard.", ro: "Începe urmărirea conturilor pentru a vedea panoul financiar." },

  // ── Trading plan states ──
  payoutReady: { en: "Payout Ready!", ro: "Gata de Plată!" },
  targetReached: { en: "Target Reached!", ro: "Obiectiv Atins!" },
  requestPayout: { en: "Request payout #{0}.", ro: "Solicită plata #{0}." },
  advanceToFunded: { en: "Ready to advance to funded phase.", ro: "Gata pentru avansare la faza finanțată." },
  congratulations: { en: "Congratulations! It is recommended to request your reward! You might not get a second chance!", ro: "Felicitări! Este recomandat să îți soliciți recompensa! S-ar putea să nu mai ai o a doua șansă!" },
  payoutAtRisk: { en: "Payout eligibility at risk:", ro: "Eligibilitate plată la risc:" },
  targetAdjusted: { en: "Target adjusted:", ro: "Obiectiv ajustat:" },
  moreSpreadProfit: { en: "Need {0} more profit spread across other days before requesting max payout.", ro: "Sunt necesare {0} profit distribuit pe alte zile înainte de a solicita plata maximă." },
  moreToComply: { en: "Need {0} more profit spread across other days to become compliant, or spread profits across more days.", ro: "Sunt necesare {0} mai mult profit distribuit pe alte zile pentru conformitate." },

  // ── Alert messages ──
  alertNameRequired: { en: "Name is required.", ro: "Numele este obligatoriu." },
  alertChallengeRequired: { en: "Name, Profit Target, and MLL are required for challenge firms.\nCheck 'Instant Funded' if this firm has no challenge phase.", ro: "Numele, Obiectivul de Profit și MLL sunt obligatorii pentru firmele cu evaluare.\nBifați 'Finanțare Instantanee' dacă firma nu are fază de evaluare." },
  alertDeleteEntry: { en: "Delete this entry?", ro: "Ștergi această intrare?" },
  alertDeletePayout: { en: "Delete this payout? Metrics will recalculate from the previous payout (or account start).", ro: "Ștergi această plată? Metricile se vor recalcula de la plata anterioară (sau startul contului)." },
  alertDeleteReset: { en: "Delete this reset record? (Journal data from before this reset cannot be recovered.)", ro: "Ștergi această resetare? (Datele din jurnal de dinainte nu pot fi recuperate.)" },
  alertDeleteFirm: { en: "Delete this firm?", ro: "Ștergi această firmă?" },
  alertDeleteAccount: { en: "Delete this tracked account and all journal entries?", ro: "Ștergi acest cont și toate intrările din jurnal?" },
  alertDeleteSelected: { en: "Delete {0} selected account(s) and all their data?", ro: "Ștergi {0} cont(uri) selectate și toate datele?" },
  alertBalanceRequired: { en: "Balance is required", ro: "Balanța este obligatorie" },
  alertPayoutAmount: { en: "Enter a payout amount", ro: "Introduceți suma plății" },
  alertSelectFirm: { en: "Select a firm", ro: "Selectează o firmă" },
  alertNoValidData: { en: "No valid data found in selected files", ro: "Nu s-au găsit date valide în fișierele selectate" },
  alertNoValidEntries: { en: "No valid entries found", ro: "Nu s-au găsit intrări valide" },
  alertDatesExist: { en: "All dates already exist in journal", ro: "Toate datele există deja în jurnal" },
  alertNoValidAccounts: { en: "No valid accounts to import", ro: "Niciun cont valid de importat" },

  // ── Sorting options ──
  sortOverallEase: { en: "Overall Ease", ro: "Ușurință Generală" },
  sortEaseToPass: { en: "Ease to Pass", ro: "Ușurință Promovare" },
  sortEaseToGetPaid: { en: "Ease to Get Paid", ro: "Ușurință Plată" },
  sortMaxRoi: { en: "Max ROI", ro: "ROI Maxim" },
  sortLowestCost: { en: "Lowest Cost", ro: "Cost Minim" },
  sortMaxProfit: { en: "Max Profit", ro: "Profit Maxim" },
  sortDailyRate: { en: "Daily $/Day", ro: "Zilnic $/Zi" },
  sortMostResets: { en: "Most Resets", ro: "Cele Mai Multe Resetări" },

  // ── Scaling / payout descriptions ──
  scalingDesc: { en: "Contract limits based on profit level during evaluation. Leave empty if no scaling.", ro: "Limite contracte bazate pe nivel profit în evaluare. Lasă gol dacă nu există scalare." },
  scalingFundDesc: { en: "Contract limits based on profit level in funded phase. Leave empty if no scaling.", ro: "Limite contracte bazate pe nivel profit în faza finanțată. Lasă gol dacă nu există scalare." },
  aboveMax: { en: "Above", ro: "Peste" },
  maxContracts: { en: "max contracts", ro: "contracte max" },

  // ── Misc ──
  started: { en: "Started:", ro: "Început:" },
  journalEntries: { en: "journal entries", ro: "intrări jurnal" },
  resetN: { en: "reset", ro: "resetare" },
  payoutN: { en: "payout", ro: "plată" },
  eod: { en: "(eod)", ro: "(eod)" },
  ofMaxPct: { en: "max", ro: "max" },
  allowed: { en: "Allowed:", ro: "Permise:" },
  dll: { en: "DLL:", ro: "DLL:" },
  na: { en: "N/A", ro: "N/A" },
  sameAsEval: { en: "same as eval", ro: "la fel ca evaluarea" },
  emptyNone: { en: "empty = none", ro: "gol = niciunul" },
  firmNoReset: { en: "(firm has no reset option)", ro: "(firma nu oferă opțiune de resetare)" },
  resetsLeftBE: { en: "Resets left to breakeven at current reset price", ro: "Resetări rămase până la break-even la prețul curent" },
  alreadyExceeded: { en: "Already exceeded — net loss from resets", ro: "Deja depășit — pierdere netă din resetări" },
  lossOnMinPayout: { en: "⚠ loss on min payout", ro: "⚠ pierdere la plata minimă" },
  breakeven: { en: "breakeven", ro: "break-even" },
  lossEvenAtMax: { en: "⚠ loss even at max", ro: "⚠ pierdere chiar și la max" },
  richTextHelp: { en: "Select text then click to format, or type **bold** *italic* ==highlight== ~~strike~~", ro: "Selectează text apoi click pentru formatare, sau tastează **bold** *italic* ==highlight== ~~strike~~" },
  specialRulesPlaceholder: { en: "Special rules, promo codes, observations... Use **bold**, *italic*, ==highlight==", ro: "Reguli speciale, coduri promoționale, observații... Folosește **bold**, *italic*, ==highlight==" },

  // ── Tab: Metrics Guide ──
  tabMetrics: { en: "📐 Metrics Guide", ro: "📐 Ghid Metrici" },

  // ── Metrics Guide page ──
  mgTitle: { en: "How All Metrics Are Calculated", ro: "Cum Sunt Calculate Toate Metricile" },
  mgIntro: { en: "This page explains every metric in the app — the mathematical formula, what each input means, what the result tells you, and a worked example with real numbers.", ro: "Această pagină explică fiecare metrică din aplicație — formula matematică, ce înseamnă fiecare input, ce arată rezultatul, și un exemplu calculat cu numere reale." },

  // Section headers
  mgSectionComparison: { en: "Comparison & Ranking Metrics", ro: "Metrici de Comparație & Clasificare" },
  mgSectionLive: { en: "Live Account Metrics", ro: "Metrici Cont Live" },
  mgSectionFinancial: { en: "Financial Metrics", ro: "Metrici Financiare" },
  mgSectionTrading: { en: "Today's Trading Plan", ro: "Planul de Tranzacționare de Azi" },

  // ── Effective MLL (Trailing Drawdown Adjustment) ──
  mgEffMllTitle: { en: "Effective MLL (Trailing Drawdown Adjustment)", ro: "MLL Efectiv (Ajustare Drawdown Trailing)" },
  mgEffMllFormula: { en: "effectiveMLL = MLL² ÷ (MLL + k × Target)", ro: "MLL_efectiv = MLL² ÷ (MLL + k × Obiectiv)" },
  mgEffMllInputs: {
    en: "MLL = Max Loss Limit (the firm's drawdown allowance).\nk = penalty factor: 0 for static, 0.5 for trailing EOD, 1.0 for trailing intraday.\nTarget = profit target (PT for challenge, required balance for funded).",
    ro: "MLL = Limită Pierdere Maximă (alocarea de drawdown a firmei).\nk = factor de penalizare: 0 pentru static, 0.5 pentru trailing EOD, 1.0 pentru trailing intraday.\nObiectiv = obiectiv de profit (PT pentru evaluare, balanță necesară pentru finanțat)."
  },
  mgEffMllDesc: {
    en: "Trailing drawdowns eat into your effective room as you profit — the floor follows your equity up. This formula converts a trailing MLL into a 'static equivalent' so we can fairly compare firms. Static MLL stays unchanged; trailing EOD gets a moderate penalty; trailing intraday gets the harshest penalty.",
    ro: "Drawdown-urile trailing reduc spațiul efectiv pe măsură ce profitezi — pragul urmează capitalul în sus. Această formulă convertește un MLL trailing într-un 'echivalent static' pentru a compara firmele corect. MLL static rămâne neschimbat; trailing EOD primește o penalizare moderată; trailing intraday primește cea mai severă penalizare."
  },
  mgEffMllExample: {
    en: "Firm has MLL = $2,500, Target = $3,000, trailing EOD (k=0.5).\neffectiveMLL = 2500² ÷ (2500 + 0.5 × 3000) = 6,250,000 ÷ 4,000 = $1,562.50\nThe trailing drawdown reduces your effective room from $2,500 to about $1,563.",
    ro: "Firma are MLL = $2.500, Obiectiv = $3.000, trailing EOD (k=0,5).\nMLL_efectiv = 2500² ÷ (2500 + 0,5 × 3000) = 6.250.000 ÷ 4.000 = $1.562,50\nDrawdown-ul trailing reduce spațiul efectiv de la $2.500 la aproximativ $1.563."
  },

  // ── Room Score ──
  mgRoomScoreTitle: { en: "Room Score", ro: "Scor Spațiu" },
  mgRoomScoreFormula: {
    en: "If DLL exists: Room = (DLL ÷ Target) × (1 + log₂(eMLL ÷ DLL) × 0.25)\nIf no DLL: Room = eMLL ÷ Target",
    ro: "Dacă DLL există: Spațiu = (DLL ÷ Obiectiv) × (1 + log₂(eMLL ÷ DLL) × 0,25)\nFără DLL: Spațiu = eMLL ÷ Obiectiv"
  },
  mgRoomScoreInputs: {
    en: "DLL = Daily Loss Limit (max you can lose in a single session).\neMLL = effective MLL (adjusted for trailing drawdown type).\nTarget = profit target you must reach.\nlog₂ = base-2 logarithm (measures how many 'doublings' of DLL fit in eMLL).",
    ro: "DLL = Limita Pierdere Zilnică (maximul pe care îl poți pierde într-o sesiune).\neMLL = MLL efectiv (ajustat pentru tipul de drawdown trailing).\nObiectiv = obiectivul de profit de atins.\nlog₂ = logaritm în baza 2 (măsoară câte 'dublări' ale DLL încap în eMLL)."
  },
  mgRoomScoreDesc: {
    en: "Room Score measures how much margin for error you have relative to the profit target. When a DLL exists, it limits how much you can lose per day — but a larger MLL gives you more total runway (more 'lives'). The logarithmic bonus rewards deeper MLL without making it dominate. When there's no DLL, the full MLL is your room. Higher room = easier evaluation.",
    ro: "Scorul Spațiu măsoară cât de mare este marja de eroare relativ la obiectivul de profit. Când DLL există, limitează cât poți pierde pe zi — dar un MLL mai mare oferă mai multă pistă totală (mai multe 'vieți'). Bonusul logaritmic recompensează MLL-ul mai adânc fără a-l face dominant. Fără DLL, întregul MLL este spațiul tău. Spațiu mai mare = evaluare mai ușoară."
  },
  mgRoomScoreExample: {
    en: "DLL = $1,000, MLL = $2,500 (static), Target = $3,000.\neMLL = $2,500 (static, no penalty).\nRoom = (1000 ÷ 3000) × (1 + log₂(2500 ÷ 1000) × 0.25)\n     = 0.333 × (1 + log₂(2.5) × 0.25)\n     = 0.333 × (1 + 1.322 × 0.25)\n     = 0.333 × 1.33 = 0.443",
    ro: "DLL = $1.000, MLL = $2.500 (static), Obiectiv = $3.000.\neMLL = $2.500 (static, fără penalizare).\nSpațiu = (1000 ÷ 3000) × (1 + log₂(2500 ÷ 1000) × 0,25)\n        = 0,333 × (1 + log₂(2,5) × 0,25)\n        = 0,333 × (1 + 1,322 × 0,25)\n        = 0,333 × 1,33 = 0,443"
  },

  // ── Days Factor ──
  mgDaysFactorTitle: { en: "Days Factor", ro: "Factor Zile" },
  mgDaysFactorFormula: { en: "DaysFactor = (1 ÷ effectiveDays) ^ 0.3", ro: "FactorZile = (1 ÷ zileEfective) ^ 0,3" },
  mgDaysFactorInputs: {
    en: "effectiveDays = MAX(Min profitable days required, ⌈1 ÷ Consistency%⌉).\nIf neither Min days nor Consistency is set, effectiveDays = 1.\n0.3 = the exponent that controls how severely more days penalize the score.",
    ro: "zileEfective = MAX(Zile profitabile minime necesare, ⌈1 ÷ Consistență%⌉).\nDacă nici Zile minime nici Consistența nu sunt setate, zileEfective = 1.\n0,3 = exponentul care controlează cât de sever penalizează zilele suplimentare scorul."
  },
  mgDaysFactorDesc: {
    en: "This penalizes firms that require more trading days. The exponent 0.3 means 10 required days roughly halves the score compared to 1 day. The penalty is sub-linear: going from 1 to 3 days hurts more than going from 7 to 9.",
    ro: "Aceasta penalizează firmele care necesită mai multe zile de tranzacționare. Exponentul 0,3 înseamnă că 10 zile necesare aproximativ înjumătățesc scorul comparativ cu 1 zi. Penalizarea este sub-liniară: trecerea de la 1 la 3 zile afectează mai mult decât de la 7 la 9."
  },
  mgDaysFactorExample: {
    en: "Firm requires consistency 40% and min 5 days.\neffectiveDays = MAX(5, ⌈1/0.4⌉) = MAX(5, 3) = 5\nDaysFactor = (1/5)^0.3 = 0.2^0.3 = 0.617\nThe 5-day requirement reduces the ease score by about 38%.",
    ro: "Firma necesită consistență 40% și minim 5 zile.\nzileEfective = MAX(5, ⌈1/0,4⌉) = MAX(5, 3) = 5\nFactorZile = (1/5)^0,3 = 0,2^0,3 = 0,617\nCerința de 5 zile reduce scorul de ușurință cu aproximativ 38%."
  },

  // ── Scaling Factor ──
  mgScalingFactorTitle: { en: "Scaling Factor", ro: "Factor Scalare" },
  mgScalingFactorFormula: { en: "ScalingFactor = WeightedAverageContracts ÷ MaxContracts", ro: "FactorScalare = MediaPonderatăContracte ÷ MaxContracte" },
  mgScalingFactorInputs: {
    en: "Scaling tiers define how many contracts you can trade at each profit level.\nMaxContracts = the maximum NQ contracts allowed.\nThe weighted average multiplies each tier's contract count by the dollar range it covers, then divides by (target × max contracts).",
    ro: "Nivelurile de scalare definesc câte contracte poți tranzacționa la fiecare nivel de profit.\nMaxContracte = numărul maxim de contracte NQ permise.\nMedia ponderată înmulțește numărul de contracte al fiecărui nivel cu intervalul de dolari acoperit, apoi împarte la (obiectiv × contracte maxime)."
  },
  mgScalingFactorDesc: {
    en: "If a firm restricts you to fewer contracts in early tiers, you earn slower. A scaling factor of 100% means no restrictions — you trade max contracts from the start. A factor of 50% means on average you can only use half your allowed contracts across the profit journey, effectively doubling the time to reach target.",
    ro: "Dacă o firmă te restricționează la mai puține contracte în nivelurile inferioare, câștigi mai lent. Un factor de scalare de 100% înseamnă fără restricții — tranzacționezi contracte maxime de la început. Un factor de 50% înseamnă că în medie poți folosi doar jumătate din contractele permise, dublând efectiv timpul pentru atingerea obiectivului."
  },
  mgScalingFactorExample: {
    en: "Target = $3,000, MaxNQ = 4. Scaling: 2 contracts up to $1,000, 3 up to $2,000, then 4.\nWeighted = (2×1000) + (3×1000) + (4×1000) = 9,000\nScalingFactor = 9,000 ÷ (3,000 × 4) = 9,000 ÷ 12,000 = 0.75 (75%)",
    ro: "Obiectiv = $3.000, MaxNQ = 4. Scalare: 2 contracte până la $1.000, 3 până la $2.000, apoi 4.\nPonderat = (2×1000) + (3×1000) + (4×1000) = 9.000\nFactorScalare = 9.000 ÷ (3.000 × 4) = 9.000 ÷ 12.000 = 0,75 (75%)"
  },

  // ── Ease to Pass ──
  mgEaseToPassTitle: { en: "Ease to Pass", ro: "Ușurință Promovare" },
  mgEaseToPassFormula: { en: "EaseToPass = RoomScore × DaysFactor × ScalingFactor", ro: "UșurințăPromovare = ScorSpațiu × FactorZile × FactorScalare" },
  mgEaseToPassInputs: {
    en: "RoomScore = how much margin you have (see Room Score above).\nDaysFactor = penalty for required trading days (see Days Factor above).\nScalingFactor = penalty for contract limitations (see Scaling Factor above).\nAll three use CHALLENGE parameters (challenge MLL, DLL, PT, consistency, min days, scaling plan).",
    ro: "ScorSpațiu = cât de mare este marja (vezi Scor Spațiu mai sus).\nFactorZile = penalizare pentru zilele de tranzacționare necesare (vezi Factor Zile mai sus).\nFactorScalare = penalizare pentru limitările de contracte (vezi Factor Scalare mai sus).\nToate trei folosesc parametrii de EVALUARE (MLL, DLL, PT, consistență, zile minime, plan scalare evaluare)."
  },
  mgEaseToPassDesc: {
    en: "Measures how easy the challenge/evaluation phase is. Higher score = easier to pass. A score above 45% is considered good (green), 25-45% is moderate (amber), below 25% is difficult (red). For Instant Funded firms, this metric is null — there's no challenge to pass.",
    ro: "Măsoară cât de ușoară este faza de evaluare. Scor mai mare = mai ușor de promovat. Un scor peste 45% este considerat bun (verde), 25-45% este moderat (galben), sub 25% este dificil (roșu). Pentru firmele cu Finanțare Instantanee, această metrică este nulă — nu există evaluare de promovat."
  },
  mgEaseToPassExample: {
    en: "Using our earlier numbers: Room = 0.443, DaysFactor = 0.617, ScalingFactor = 0.75\nEaseToPass = 0.443 × 0.617 × 0.75 = 0.205 (20.5%)\nThis is in the red zone — a tough evaluation. You'd need $3,000 profit with only $1,000 DLL and contract restrictions.",
    ro: "Folosind numerele anterioare: Spațiu = 0,443, FactorZile = 0,617, FactorScalare = 0,75\nUșurințăPromovare = 0,443 × 0,617 × 0,75 = 0,205 (20,5%)\nAceasta este în zona roșie — o evaluare dificilă. Ai nevoie de $3.000 profit cu doar $1.000 DLL și restricții de contracte."
  },

  // ── Ease to Get Paid ──
  mgEaseToGetPaidTitle: { en: "Ease to Get Paid", ro: "Ușurință Plată" },
  mgEaseToGetPaidFormula: { en: "EaseToGetPaid = RoomScore × DaysFactor × ScalingFactor\n(using funded parameters)", ro: "UșurințăPlată = ScorSpațiu × FactorZile × FactorScalare\n(folosind parametrii finanțat)" },
  mgEaseToGetPaidInputs: {
    en: "Same formula as Ease to Pass, but with FUNDED rules.\nTarget = MAX(Buffer + MaxPayout, MaxPayout ÷ WithdrawalPct).\nThis handles two payout models:\n  • Buffer model (withdrawal 100%): target = Buffer + MaxPayout\n  • Profit-split model (e.g. 50%): target = MaxPayout ÷ 0.5 = 2× MaxPayout\nThe MAX picks whichever is stricter.",
    ro: "Aceeași formulă ca Ușurință Promovare, dar cu regulile FINANȚAT.\nObiectiv = MAX(Buffer + MaxPlată, MaxPlată ÷ ProcentRetragere).\nAceasta gestionează două modele de plată:\n  • Model buffer (retragere 100%): obiectiv = Buffer + MaxPlată\n  • Model împărțire profit (ex. 50%): obiectiv = MaxPlată ÷ 0,5 = 2× MaxPlată\nMAX alege pe cel mai strict."
  },
  mgEaseToGetPaidDesc: {
    en: "Measures how easy it is to accumulate enough profit in the funded account to request the maximum payout. Some firms have generous challenge parameters but restrictive funded rules — this metric catches that imbalance.",
    ro: "Măsoară cât de ușor este să acumulezi suficient profit în contul finanțat pentru a solicita plata maximă. Unele firme au parametri generoși la evaluare dar reguli restrictive la finanțat — această metrică surprinde acel dezechilibru."
  },
  mgEaseToGetPaidExample: {
    en: "Funded rules: DLL = none, MLL = $2,500 (trailing EOD), Buffer = $0, MaxPayout = $2,000, Withdrawal = 100%, no consistency rule, min 5 days.\nTarget = MAX(0 + 2000, 2000 ÷ 1.0) = $2,000\neMLL = 2500² ÷ (2500 + 0.5 × 2000) = 6,250,000 ÷ 3,500 = $1,786\nRoom = 1786 ÷ 2000 = 0.893 (no DLL, so simple ratio)\nDaysFactor = (1/5)^0.3 = 0.617\nEaseToGetPaid = 0.893 × 0.617 × 1.0 = 0.551 (55.1% — green!)",
    ro: "Reguli finanțat: DLL = niciunul, MLL = $2.500 (trailing EOD), Buffer = $0, MaxPlată = $2.000, Retragere = 100%, fără regulă consistență, minim 5 zile.\nObiectiv = MAX(0 + 2000, 2000 ÷ 1,0) = $2.000\neMLL = 2500² ÷ (2500 + 0,5 × 2000) = 6.250.000 ÷ 3.500 = $1.786\nSpațiu = 1786 ÷ 2000 = 0,893 (fără DLL, raport simplu)\nFactorZile = (1/5)^0,3 = 0,617\nUșurințăPlată = 0,893 × 0,617 × 1,0 = 0,551 (55,1% — verde!)"
  },

  // ── Overall Ease ──
  mgOverallEaseTitle: { en: "Overall Ease Score", ro: "Scor Ușurință General" },
  mgOverallEaseFormula: { en: "OverallEase = √(EaseToPass × EaseToGetPaid)\nFor Instant Funded: OverallEase = EaseToGetPaid", ro: "UșurințăGenerală = √(UșurințăPromovare × UșurințăPlată)\nPentru Finanțare Instantanee: UșurințăGenerală = UșurințăPlată" },
  mgOverallEaseInputs: {
    en: "EaseToPass = challenge phase ease score.\nEaseToGetPaid = funded phase ease score.\n√ = square root (geometric mean of two values).",
    ro: "UșurințăPromovare = scorul de ușurință al fazei de evaluare.\nUșurințăPlată = scorul de ușurință al fazei finanțate.\n√ = rădăcină pătrată (media geometrică a două valori)."
  },
  mgOverallEaseDesc: {
    en: "The geometric mean penalizes imbalance. Unlike a regular average, if one score is very high but the other is very low, the overall score drops significantly. A firm needs BOTH a reasonable challenge AND a reasonable funded phase to rank well. This prevents firms from gaming with an easy challenge but predatory funded conditions (or vice versa).",
    ro: "Media geometrică penalizează dezechilibrul. Spre deosebire de media obișnuită, dacă un scor este foarte mare dar celălalt foarte mic, scorul general scade semnificativ. O firmă are nevoie de AMBELE — o evaluare rezonabilă ȘI o fază finanțată rezonabilă — pentru a se clasa bine. Aceasta previne firmele să manipuleze cu o evaluare ușoară dar condiții finanțate prădătoare (sau invers)."
  },
  mgOverallEaseExample: {
    en: "EaseToPass = 20.5%, EaseToGetPaid = 55.1%\nOverall = √(0.205 × 0.551) = √(0.113) = 0.336 (33.6% — amber)\nNote: the regular average would be 37.8%, but the geometric mean gives 33.6%, penalizing the low pass score.",
    ro: "UșurințăPromovare = 20,5%, UșurințăPlată = 55,1%\nGeneral = √(0,205 × 0,551) = √(0,113) = 0,336 (33,6% — galben)\nNotă: media obișnuită ar fi 37,8%, dar media geometrică dă 33,6%, penalizând scorul scăzut de promovare."
  },

  // ── Days to Pass / Days to Payout ──
  mgDaysTitle: { en: "Days to Pass / Days to Payout", ro: "Zile pentru Promovare / Zile pentru Plată" },
  mgDaysFormula: { en: "Days = MAX(MinProfitableDays, ⌈1 ÷ Consistency⌉)\nIf neither is set, Days = 1", ro: "Zile = MAX(ZileProfitabileMinime, ⌈1 ÷ Consistență⌉)\nDacă niciunul nu este setat, Zile = 1" },
  mgDaysInputs: {
    en: "MinProfitableDays = the firm's explicit minimum trading days.\nConsistency = max % of total profit from a single day (e.g. 40%).\n⌈x⌉ = ceiling function (rounds up to next integer).",
    ro: "ZileProfitabileMinime = zilele minime de tranzacționare explicite ale firmei.\nConsistență = % maxim din profitul total dintr-o singură zi (ex. 40%).\n⌈x⌉ = funcția plafon (rotunjire în sus la următorul întreg)."
  },
  mgDaysDesc: {
    en: "Takes the stricter of two requirements. If the firm says 'minimum 5 days' and consistency implies at least 3 days (⌈1/0.4⌉ = 3), you need 5 days. If consistency requires 10 days (⌈1/0.1⌉ = 10) but minimum is 5, you need 10 days. Same formula applies to both challenge and funded phases.",
    ro: "Ia cerința mai strictă din două. Dacă firma spune 'minim 5 zile' și consistența implică cel puțin 3 zile (⌈1/0,4⌉ = 3), ai nevoie de 5 zile. Dacă consistența necesită 10 zile (⌈1/0,1⌉ = 10) dar minimul este 5, ai nevoie de 10 zile. Aceeași formulă se aplică atât fazei de evaluare cât și celei finanțate."
  },
  mgDaysExample: {
    en: "Firm A: consistency 30%, min days = 5.\n⌈1/0.3⌉ = ⌈3.33⌉ = 4 days from consistency.\nDays = MAX(5, 4) = 5 (the explicit minimum wins).\n\nFirm B: consistency 10%, min days = 3.\n⌈1/0.1⌉ = 10 days from consistency.\nDays = MAX(3, 10) = 10 (consistency is stricter).",
    ro: "Firma A: consistență 30%, zile minime = 5.\n⌈1/0,3⌉ = ⌈3,33⌉ = 4 zile din consistență.\nZile = MAX(5, 4) = 5 (minimul explicit câștigă).\n\nFirma B: consistență 10%, zile minime = 3.\n⌈1/0,1⌉ = 10 zile din consistență.\nZile = MAX(3, 10) = 10 (consistența este mai strictă)."
  },

  // ── Total Cost, Net Profit, ROI, Daily Profit Rate ──
  mgTotalCostTitle: { en: "Total Cost", ro: "Cost Total" },
  mgTotalCostFormula: { en: "TotalCost = EvalCost + ActivationFee\nFor Instant Funded: TotalCost = EvalCost (no activation)", ro: "CostTotal = CostEvaluare + TaxăActivare\nPentru Finanțare Instantanee: CostTotal = CostEvaluare (fără activare)" },
  mgTotalCostDesc: { en: "Your total cash outlay before receiving any payout. This is what you risk upfront.", ro: "Cheltuiala totală în numerar înainte de a primi orice plată. Aceasta este suma pe care o riști inițial." },

  mgNetProfitTitle: { en: "Net Profit", ro: "Profit Net" },
  mgNetProfitFormula: { en: "MinNetProfit = MinPayout × ProfitSplit − TotalCost\nMaxNetProfit = MaxPayout × ProfitSplit − TotalCost", ro: "ProfitNetMin = PlatăMinimă × ÎmpărțireProfit − CostTotal\nProfitNetMax = PlatăMaximă × ÎmpărțireProfit − CostTotal" },
  mgNetProfitDesc: { en: "What you actually pocket after the firm takes its share and you subtract your investment. If negative, you lose money even at max payout.", ro: "Ce încasezi efectiv după ce firma își ia partea și scazi investiția. Dacă este negativ, pierzi bani chiar și la plata maximă." },
  mgNetProfitExample: {
    en: "EvalCost = $150, Activation = $0, MaxPayout = $2,000, Split = 90%.\nTotalCost = $150 + $0 = $150\nMaxNetProfit = $2,000 × 0.9 − $150 = $1,800 − $150 = $1,650",
    ro: "CostEvaluare = $150, Activare = $0, MaxPlată = $2.000, Split = 90%.\nCostTotal = $150 + $0 = $150\nProfitNetMax = $2.000 × 0,9 − $150 = $1.800 − $150 = $1.650"
  },

  mgRoiTitle: { en: "ROI (Return on Investment)", ro: "ROI (Rentabilitatea Investiției)" },
  mgRoiFormula: { en: "ROI = NetProfit ÷ TotalCost", ro: "ROI = ProfitNet ÷ CostTotal" },
  mgRoiDesc: { en: "How much you earn per dollar invested. An ROI of 5× means you get $5 back for every $1 spent (total return of $6). Higher is better.", ro: "Cât câștigi pe fiecare dolar investit. Un ROI de 5× înseamnă că primești $5 înapoi pentru fiecare $1 cheltuit (returnare totală de $6). Mai mare = mai bine." },
  mgRoiExample: {
    en: "MaxNetProfit = $1,650, TotalCost = $150.\nROI = $1,650 ÷ $150 = 11.0× (1,100%)\nFor every $1 invested, you earn $11 in profit.",
    ro: "ProfitNetMax = $1.650, CostTotal = $150.\nROI = $1.650 ÷ $150 = 11,0× (1.100%)\nPentru fiecare $1 investit, câștigi $11 profit."
  },

  mgDailyRateTitle: { en: "Daily Profit Rate ($/Day)", ro: "Rată Profit Zilnic ($/Zi)" },
  mgDailyRateFormula: { en: "DailyRate = MaxNetProfit ÷ TotalDays\nTotalDays = DaysToPass + DaysToPayout", ro: "RatăZilnică = ProfitNetMax ÷ ZileTotale\nZileTotale = ZilePromovare + ZilePlată" },
  mgDailyRateDesc: { en: "Your effective earning rate per trading day from start to payout. Helps compare firms with different timeframes — a firm with lower profit but fewer days might be more efficient.", ro: "Rata efectivă de câștig pe zi de tranzacționare de la start la plată. Ajută la compararea firmelor cu intervale de timp diferite — o firmă cu profit mai mic dar mai puține zile poate fi mai eficientă." },
  mgDailyRateExample: {
    en: "MaxNetProfit = $1,650, DaysToPass = 5, DaysToPayout = 5.\nTotalDays = 5 + 5 = 10\nDailyRate = $1,650 ÷ 10 = $165/day",
    ro: "ProfitNetMax = $1.650, ZilePromovare = 5, ZilePlată = 5.\nZileTotale = 5 + 5 = 10\nRatăZilnică = $1.650 ÷ 10 = $165/zi"
  },

  // ── Resets to Breakeven ──
  mgResetsTitle: { en: "Resets to Break-even", ro: "Resetări până la Break-even" },
  mgResetsFormula: { en: "ResetsToBreakeven = ⌊MaxNetPayout ÷ ResetCost⌋\nMaxNetPayout = MaxPayout × ProfitSplit", ro: "ResetăriBE = ⌊PlatăNetăMax ÷ CostResetare⌋\nPlatăNetăMax = MaxPlată × ÎmpărțireProfit" },
  mgResetsInputs: {
    en: "MaxNetPayout = the maximum amount you receive after the firm's split.\nResetCost = cost to retry the evaluation after failing.\n⌊x⌋ = floor function (rounds down to the nearest integer).",
    ro: "PlatăNetăMax = suma maximă pe care o primești după split-ul firmei.\nCostResetare = costul pentru a reîncerca evaluarea după eșec.\n⌊x⌋ = funcția podea (rotunjire în jos la cel mai apropiat întreg)."
  },
  mgResetsDesc: {
    en: "How many times you can fail and reset the evaluation before your total spending exceeds your max payout. More resets = more margin for error. If a firm offers cheap resets, you can afford many attempts, making it forgiving even if it's hard.",
    ro: "De câte ori poți eșua și reseta evaluarea înainte ca cheltuiala totală să depășească plata maximă. Mai multe resetări = mai multă marjă de eroare. Dacă o firmă oferă resetări ieftine, îți poți permite multe încercări, făcând-o indulgentă chiar dacă este dificilă."
  },
  mgResetsExample: {
    en: "MaxPayout = $2,000, Split = 90%, ResetCost = $100.\nMaxNetPayout = $2,000 × 0.9 = $1,800\nResets = ⌊$1,800 ÷ $100⌋ = 18 attempts before you're net negative.",
    ro: "MaxPlată = $2.000, Split = 90%, CostResetare = $100.\nPlatăNetăMax = $2.000 × 0,9 = $1.800\nResetări = ⌊$1.800 ÷ $100⌋ = 18 încercări înainte de a fi pe minus net."
  },

  // ── LIVE METRICS ──
  // ── Consistency Tracking ──
  mgConsistencyTitle: { en: "Consistency Tracking", ro: "Urmărire Consistență" },
  mgConsistencyFormula: { en: "ConsistencyPct = BiggestDayProfit ÷ TotalProfit\nConsistencyOK = ConsistencyPct ≤ ConsistencyLimit\nAdjustedTarget = MAX(BaseTarget, BiggestDay ÷ ConsistencyLimit)", ro: "PctConsistență = ProfitZiMaximă ÷ ProfitTotal\nConsistențăOK = PctConsistență ≤ LimităConsistență\nObiectivAjustat = MAX(ObiectivBază, ZiMaximă ÷ LimităConsistență)" },
  mgConsistencyInputs: {
    en: "BiggestDayProfit = your largest single-day profit in the current cycle.\nTotalProfit = sum of all daily P&L (balance-derived) in the current cycle.\nConsistencyLimit = the firm's maximum allowed % (e.g. 0.40 for 40%).\nBaseTarget = the original profit target (PT for challenge, required balance for funded).",
    ro: "ProfitZiMaximă = cel mai mare profit într-o singură zi din ciclul curent.\nProfitTotal = suma tuturor P&L zilnice (derivate din balanță) din ciclul curent.\nLimităConsistență = % maxim permis de firmă (ex. 0,40 pentru 40%).\nObiectivBază = obiectivul original de profit (PT pentru evaluare, balanță necesară pentru finanțat)."
  },
  mgConsistencyDesc: {
    en: "If your best day's profit is too large compared to your total, you breach the consistency rule. The app auto-adjusts the effective target upward — meaning you'll need more total profit (spread across multiple days) before you're eligible. This prevents traders from passing with one lucky day.",
    ro: "Dacă profitul celei mai bune zile este prea mare comparativ cu totalul, încalci regula de consistență. Aplicația ajustează automat obiectivul efectiv în sus — adică vei avea nevoie de mai mult profit total (distribuit pe mai multe zile) înainte de a fi eligibil. Aceasta previne traderii să promoveze cu o singură zi norocoasă."
  },
  mgConsistencyExample: {
    en: "Consistency limit = 40%, base target = $3,000. You've earned $2,000 total, best day was $1,200.\nConsistencyPct = $1,200 ÷ $2,000 = 60% (exceeds 40%!)\nAdjustedTarget = MAX($3,000, $1,200 ÷ 0.40) = MAX($3,000, $3,000) = $3,000\nYou still need $1,000 more, but it must be spread so no single day exceeds 40% of the new total.",
    ro: "Limită consistență = 40%, obiectiv bază = $3.000. Ai câștigat $2.000 total, cea mai bună zi a fost $1.200.\nPctConsistență = $1.200 ÷ $2.000 = 60% (depășește 40%!)\nObiectivAjustat = MAX($3.000, $1.200 ÷ 0,40) = MAX($3.000, $3.000) = $3.000\nMai ai nevoie de $1.000, dar trebuie distribuit astfel încât nicio zi să nu depășească 40% din noul total."
  },

  // ── Max Safe Day Profit ──
  mgMaxSafeTitle: { en: "Max Safe Day Profit (Consistency Cap)", ro: "Profit Maxim Sigur pe Zi (Plafonul Consistenței)" },
  mgMaxSafeFormula: { en: "MaxSafeDayProfit = ⌊C × TotalPnl ÷ (1 − C)⌋", ro: "ProfitMaxZiSigur = ⌊C × PnlTotal ÷ (1 − C)⌋" },
  mgMaxSafeInputs: {
    en: "C = consistency limit (e.g. 0.40 for 40%).\nTotalPnl = your current total profit in this cycle.\n⌊x⌋ = floor (round down).\nThis formula finds the maximum new-day profit D such that D ÷ (TotalPnl + D) ≤ C.",
    ro: "C = limita de consistență (ex. 0,40 pentru 40%).\nPnlTotal = profitul total curent în acest ciclu.\n⌊x⌋ = podea (rotunjire în jos).\nAceastă formulă găsește profitul maxim pe o zi nouă D astfel încât D ÷ (PnlTotal + D) ≤ C."
  },
  mgMaxSafeDesc: {
    en: "This tells you the absolute maximum you should profit on any single day without breaking the consistency rule. If you earn more than this, your best day will exceed C% of the new total. The formula works because: if new day D becomes the biggest, we need D/(TotalPnl+D) ≤ C, which solves to D ≤ C×TotalPnl/(1−C).",
    ro: "Aceasta îți spune maximul absolut pe care ar trebui să-l câștigi într-o singură zi fără a încălca regula de consistență. Dacă câștigi mai mult, cea mai bună zi va depăși C% din noul total. Formula funcționează deoarece: dacă ziua nouă D devine cea mai mare, avem nevoie ca D/(PnlTotal+D) ≤ C, care se rezolvă la D ≤ C×PnlTotal/(1−C)."
  },
  mgMaxSafeExample: {
    en: "Consistency = 40%, TotalPnl = $3,000.\nMaxSafe = ⌊0.40 × 3000 ÷ (1 − 0.40)⌋ = ⌊1200 ÷ 0.60⌋ = ⌊2000⌋ = $2,000\nIf you profit $2,000 tomorrow: new total = $5,000, best day ratio = $2,000/$5,000 = 40% (exactly at the limit).\nIf you profit $2,001: ratio = $2,001/$5,001 = 40.01% (breach!).",
    ro: "Consistență = 40%, PnlTotal = $3.000.\nMaxSigur = ⌊0,40 × 3000 ÷ (1 − 0,40)⌋ = ⌊1200 ÷ 0,60⌋ = ⌊2000⌋ = $2.000\nDacă câștigi $2.000 mâine: total nou = $5.000, raport cea mai bună zi = $2.000/$5.000 = 40% (exact la limită).\nDacă câștigi $2.001: raport = $2.001/$5.001 = 40,01% (încălcare!)."
  },

  // ── Ideal Daily Target (Aim For) ──
  mgIdealTargetTitle: { en: "Ideal Daily Target (Aim For)", ro: "Obiectiv Zilnic Ideal (Țintă)" },
  mgIdealTargetFormula: { en: "MinDaysToComplete = MAX(DaysRemaining, ⌈RemainingProfit ÷ MaxSafeDayProfit⌉, 1)\nIdealDailyTarget = MAX(MinProfit, ⌈RemainingProfit ÷ MinDaysToComplete⌉)", ro: "ZileMinComplete = MAX(ZileRămase, ⌈ProfitRămas ÷ ProfitMaxZiSigur⌉, 1)\nObiectivZilnicIdeal = MAX(ProfitMinim, ⌈ProfitRămas ÷ ZileMinComplete⌉)" },
  mgIdealTargetInputs: {
    en: "DaysRemaining = profitable days still needed to meet the minimum days rule.\nRemainingProfit = profit still needed to reach the (consistency-adjusted) target.\nMaxSafeDayProfit = maximum single-day profit from the consistency cap formula.\nMinProfit = minimum daily profit required for a day to count as 'profitable'.",
    ro: "ZileRămase = zile profitabile încă necesare pentru cerința de zile minime.\nProfitRămas = profitul încă necesar pentru a atinge obiectivul (ajustat pentru consistență).\nProfitMaxZiSigur = profitul maxim pe o zi din formula plafonului de consistență.\nProfitMinim = profitul zilnic minim necesar pentru ca o zi să conteze ca 'profitabilă'."
  },
  mgIdealTargetDesc: {
    en: "This tells you exactly how much to aim for each day to reach payout in the shortest time possible. It considers three constraints: (1) you need at least N more profitable days, (2) you can't exceed the consistency cap per day, (3) each day must meet the minimum profit threshold. The algorithm finds the minimum number of days needed given these constraints, then divides remaining profit evenly across those days.",
    ro: "Aceasta îți spune exact cât să țintești în fiecare zi pentru a ajunge la plată în cel mai scurt timp posibil. Consideră trei constrângeri: (1) ai nevoie de cel puțin N zile profitabile în plus, (2) nu poți depăși plafonul de consistență pe zi, (3) fiecare zi trebuie să atingă pragul minim de profit. Algoritmul găsește numărul minim de zile necesare date aceste constrângeri, apoi împarte profitul rămas uniform pe acele zile."
  },
  mgIdealTargetExample: {
    en: "Remaining profit = $1,500, days remaining = 2, consistency cap = $2,000, min profit = $250.\nMinDaysFromCap = ⌈1500 ÷ 2000⌉ = 1\nMinDaysToComplete = MAX(2, 1, 1) = 2 (need at least 2 more profitable days)\nIdealTarget = MAX(250, ⌈1500 ÷ 2⌉) = MAX(250, 750) = $750/day\nAim for $750 each day for the next 2 days to reach payout.",
    ro: "Profit rămas = $1.500, zile rămase = 2, plafon consistență = $2.000, profit minim = $250.\nZileMinDinPlafon = ⌈1500 ÷ 2000⌉ = 1\nZileMinComplete = MAX(2, 1, 1) = 2 (ai nevoie de cel puțin 2 zile profitabile în plus)\nObiectivIdeal = MAX(250, ⌈1500 ÷ 2⌉) = MAX(250, 750) = $750/zi\nȚintește $750 pe zi pentru următoarele 2 zile pentru a ajunge la plată."
  },

  // ── Drawdown Tracking ──
  mgDrawdownTitle: { en: "Drawdown Tracking (MLL Floor)", ro: "Urmărire Drawdown (Prag MLL)" },
  mgDrawdownFormula: {
    en: "Static: ddFloor = StartBalance − MLL\nTrailing: ddFloor = MAX(StartBalance − MLL, PeakBalance − MLL)\nRoomToDD = CurrentBalance − ddFloor\nDD% = RoomToDD ÷ MLL",
    ro: "Static: pragDD = BalanțăStart − MLL\nTrailing: pragDD = MAX(BalanțăStart − MLL, BalanțăMaximă − MLL)\nSpațiuDD = BalanțăCurentă − pragDD\nDD% = SpațiuDD ÷ MLL"
  },
  mgDrawdownDesc: {
    en: "The DD floor is the balance level at which your account gets breached (terminated). For static drawdown, this never moves. For trailing, the floor rises as your balance reaches new highs — meaning your safety cushion can shrink even as you profit. The app tracks this in real-time and shows your remaining room as a percentage. If DD% reaches 0, the account is breached.",
    ro: "Pragul DD este nivelul balanței la care contul tău este depășit (terminat). Pentru drawdown static, acesta nu se mișcă niciodată. Pentru trailing, pragul crește pe măsură ce balanța atinge noi maxime — ceea ce înseamnă că perna de siguranță se poate micșora chiar dacă profitezi. Aplicația urmărește acest lucru în timp real și arată spațiul rămas ca procent. Dacă DD% ajunge la 0, contul este depășit."
  },
  mgDrawdownExample: {
    en: "Start balance = $50,000, MLL = $2,500, trailing EOD.\nDay 1: balance reaches $51,500.\n  Peak = $51,500, floor = $51,500 − $2,500 = $49,000\n  Room = $51,500 − $49,000 = $2,500 (100%)\nDay 2: balance drops to $50,200.\n  Peak still $51,500, floor still $49,000\n  Room = $50,200 − $49,000 = $1,200 (48%) ⚠️\nDay 3: balance rises to $52,000.\n  Peak = $52,000, floor = $52,000 − $2,500 = $49,500\n  Room = $52,000 − $49,500 = $2,500 (100%)",
    ro: "Balanță start = $50.000, MLL = $2.500, trailing EOD.\nZiua 1: balanța ajunge la $51.500.\n  Maxim = $51.500, prag = $51.500 − $2.500 = $49.000\n  Spațiu = $51.500 − $49.000 = $2.500 (100%)\nZiua 2: balanța scade la $50.200.\n  Maxim tot $51.500, prag tot $49.000\n  Spațiu = $50.200 − $49.000 = $1.200 (48%) ⚠️\nZiua 3: balanța crește la $52.000.\n  Maxim = $52.000, prag = $52.000 − $2.500 = $49.500\n  Spațiu = $52.000 − $49.500 = $2.500 (100%)"
  },

  // ── All Rules Met ──
  mgAllRulesTitle: { en: "All Rules Met (Target Hit / Payout Ready)", ro: "Toate Regulile Îndeplinite (Obiectiv Atins / Gata de Plată)" },
  mgAllRulesFormula: { en: "AllRulesMet = ProfitTarget met AND ProfitDays ≥ RequiredDays AND ConsistencyOK AND NOT MllBreached AND DD% > 0", ro: "ToateRegulile = ObiectivProfit atins ȘI ZileProfitabile ≥ ZileNecesare ȘI ConsistențăOK ȘI NU MllDepășit ȘI DD% > 0" },
  mgAllRulesDesc: {
    en: "ALL five conditions must be true simultaneously for your account to show 'Target Hit' (challenge) or 'Payout Ready' (funded). Missing even one — say you hit profit but lack one profitable day — and you're still 'Active'. This prevents premature celebration and keeps you focused on remaining requirements.",
    ro: "TOATE cele cinci condiții trebuie îndeplinite simultan pentru ca contul să arate 'Obiectiv Atins' (evaluare) sau 'Gata de Plată' (finanțat). Dacă lipsește chiar și una — de exemplu ai atins profitul dar îți lipsește o zi profitabilă — ești încă 'Activ'. Aceasta previne celebrarea prematură și te ține concentrat pe cerințele rămase."
  },

  // ── Live Ease ──
  mgLiveEaseTitle: { en: "Live Ease", ro: "Ușurință Live" },
  mgLiveEaseFormula: { en: "LiveEase = calcEase(DLL, MLL, RemainingProfit, Consistency, RemainingDays, ScalingFactor, MllType)", ro: "UșurințăLive = calcEase(DLL, MLL, ProfitRămas, Consistență, ZileRămase, FactorScalare, TipMll)" },
  mgLiveEaseDesc: {
    en: "The same Ease formula, but recalculated in real-time with your REMAINING profit target and REMAINING days. As you make progress, this number should go UP (getting easier). If you lose money, it goes down. Helps you gauge at a glance how your account is trending.",
    ro: "Aceeași formulă de Ușurință, dar recalculată în timp real cu obiectivul de profit RĂMAS și zilele RĂMASE. Pe măsură ce progresezi, acest număr ar trebui să CREASCĂ (devine mai ușor). Dacă pierzi bani, scade. Te ajută să evaluezi dintr-o privire cum evoluează contul."
  },

  // ── Scaling (Live) ──
  mgLiveScalingTitle: { en: "Contract Scaling (Live)", ro: "Scalare Contracte (Live)" },
  mgLiveScalingFormula: { en: "CumulativeProfit = CurrentBalance − OriginalStartBalance + TotalPayouts\nContractsAllowed = ScalingTier(CumulativeProfit)", ro: "ProfitCumulativ = BalanțăCurentă − BalanțăStartOriginală + TotalPlăți\nContractePermise = NivelScalare(ProfitCumulativ)" },
  mgLiveScalingDesc: {
    en: "Uses cumulative profit (not just current cycle profit) to determine your contract tier. This means after a payout, you don't lose your scaling progress — if you've earned $5,000 lifetime but withdrew $3,000, your scaling tier is still based on the $5,000 level. This reflects real firm behavior: unlocked tiers persist.",
    ro: "Folosește profitul cumulativ (nu doar profitul ciclului curent) pentru a determina nivelul de contracte. Aceasta înseamnă că după o plată, nu pierzi progresul de scalare — dacă ai câștigat $5.000 pe parcurs dar ai retras $3.000, nivelul de scalare este încă bazat pe nivelul de $5.000. Aceasta reflectă comportamentul real al firmei: nivelurile deblocate persistă."
  },

  // ── Required Balance ──
  mgReqBalTitle: { en: "Required Balance for Payout", ro: "Balanță Necesară pentru Plată" },
  mgReqBalFormula: { en: "ReqBalance = MAX(Buffer + MaxPayout, MaxPayout ÷ WithdrawalPct)", ro: "BalanțăNecesară = MAX(Buffer + MaxPlată, MaxPlată ÷ ProcentRetragere)" },
  mgReqBalDesc: {
    en: "The profit amount (above starting balance) you need to accumulate before you can request the maximum payout. Two models exist: the buffer model (keep a buffer amount untouched, withdraw the rest) and the profit-split model (e.g. you need $4,000 profit to withdraw $2,000 at 50%). The formula takes whichever requires more.",
    ro: "Suma de profit (peste balanța de start) pe care trebuie să o acumulezi înainte de a putea solicita plata maximă. Două modele există: modelul buffer (păstrează o sumă buffer neatinsă, retrage restul) și modelul împărțire profit (ex. ai nevoie de $4.000 profit pentru a retrage $2.000 la 50%). Formula ia pe cel care necesită mai mult."
  },

  // ── Generic labels for MetricsGuide formatting ──
  mgFormula: { en: "Formula", ro: "Formulă" },
  mgInputs: { en: "Inputs", ro: "Variabile" },
  mgDescription: { en: "What it means", ro: "Ce înseamnă" },
  mgExample: { en: "Example", ro: "Exemplu" },
  mgNote: { en: "Note", ro: "Notă" },

  // ── Auth ──
  authSignIn: { en: "Sign In", ro: "Autentificare" },
  authSignUp: { en: "Sign Up", ro: "Înregistrare" },
  authEmail: { en: "Email", ro: "Email" },
  authPassword: { en: "Password", ro: "Parolă" },
  authSignInBtn: { en: "Sign In", ro: "Autentifică-te" },
  authSignUpBtn: { en: "Create Account", ro: "Creează Cont" },
  authToggleSignUp: { en: "Don't have an account? Sign up", ro: "Nu ai cont? Înregistrează-te" },
  authToggleSignIn: { en: "Already have an account? Sign in", ro: "Ai deja cont? Autentifică-te" },
  authGoogleBtn: { en: "Continue with Google", ro: "Continuă cu Google" },
  authOr: { en: "or", ro: "sau" },
  authError: { en: "Authentication error", ro: "Eroare de autentificare" },
  authCheckEmail: { en: "Check your email for a confirmation link!", ro: "Verifică email-ul pentru linkul de confirmare!" },
  authSignOut: { en: "Sign Out", ro: "Deconectare" },
  authWelcome: { en: "Welcome", ro: "Bine ai venit" },
  authRequiredTitle: { en: "Sign in to continue", ro: "Autentifică-te pentru a continua" },
  authRequiredDesc: { en: "Account Tracker and Dashboard require authentication to save your personal trading data.", ro: "Urmărirea conturilor și Panoul de control necesită autentificare pentru a salva datele tale personale de tranzacționare." },

  // ── Admin ──
  tabAdmin: { en: "Admin", ro: "Admin" },
  adminTitle: { en: "Admin User Management", ro: "Gestionare Utilizatori Admin" },
  adminEmailPlaceholder: { en: "Enter user email to add as admin...", ro: "Introdu email-ul utilizatorului pentru a-l adăuga ca admin..." },
  adminAdd: { en: "Add Admin", ro: "Adaugă Admin" },
  adminRemove: { en: "Remove", ro: "Elimină" },
  adminYou: { en: "you", ro: "tu" },
  adminUserNotFound: { en: "User not found. They must sign up first.", ro: "Utilizator negăsit. Trebuie să se înregistreze mai întâi." },
  adminUserAdded: { en: "Admin user added successfully!", ro: "Utilizator admin adăugat cu succes!" },
  adminConfirmRemove: { en: "Remove this user from admins?", ro: "Elimini acest utilizator din adminii?" },
  loading: { en: "Loading", ro: "Se încarcă" },
};

// ── Language state ──
let currentLang = "en";
try {
  const saved = localStorage.getItem("propFirmLang");
  if (saved === "ro" || saved === "en") currentLang = saved;
} catch {}

export function getLang() { return currentLang; }

export function setLang(lang) {
  currentLang = lang;
  try { localStorage.setItem("propFirmLang", lang); } catch {}
}

/**
 * Translate a key, with optional {0}, {1}, ... placeholders.
 * t("appSubtitle", 5) → "Compare, rank, and plan across 5 firms — auto-calculated"
 */
export function t(key, ...args) {
  const entry = translations[key];
  if (!entry) return key;
  let str = entry[currentLang] || entry.en || key;
  args.forEach((arg, i) => {
    str = str.replace(`{${i}}`, arg);
  });
  return str;
}
