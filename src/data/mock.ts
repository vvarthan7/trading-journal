import type {
  CapitalEvent,
  CaptureRule,
  CaptureSource,
  DayLog,
  GateItem,
  HardLimit,
  PlaybookStrategy,
  QueuedFill,
  RuleFlag,
  SessionWindow,
  Trade,
} from "../types";

const PATH_UP = [212, 208, 214, 206, 198, 204, 190, 182, 186, 178, 184, 176, 182, 190, 186, 196, 204, 198, 210, 206, 216, 222, 214, 226, 232, 224, 236, 230, 242, 238];
const PATH_DOWN = [...PATH_UP].reverse();

export const TRADES: Trade[] = [
  {
    id: 1, date: "2026-08-31", symbol: "NIFTY 24800 CE", market: "NSE F&O", kind: "Options",
    style: "Scalp", direction: "long", qtyLabel: "150 / 2", lots: 2, units: 150,
    entry: 182.4, exit: 214.1, entryTime: "09:42", exitTime: "10:06", held: "24m",
    stop: 168, target: 228, plannedRR: 2.4, realisedR: 2.1, pnl: 4755,
    strategy: "ORB continuation", tags: ["breakout", "trend-day"], plan: "on", basis: "technical",
    catalyst: "Technical — 15m opening range break on expanding volume.",
    notes: "Clean break of the opening range. Waited for the retest instead of chasing, trailed behind 5m structure, exited on the first lower high. Textbook.",
    line: "Waited for the retest instead of chasing. Trailed behind 5m structure and let it run.",
    focus: 5, absorptionConfirmed: true, roomPoints: 92,
    path: PATH_UP, entryIndex: 6, exitIndex: 24,
  },
  {
    id: 2, date: "2026-08-31", symbol: "BANKNIFTY 54200 PE", market: "NSE F&O", kind: "Options",
    style: "Scalp", direction: "short", qtyLabel: "90 / 3", lots: 3, units: 90,
    entry: 301, exit: 268.5, entryTime: "10:21", exitTime: "10:34", held: "13m",
    stop: 268, target: 345, plannedRR: 1.8, realisedR: -1.0, pnl: -2925,
    strategy: "Mean reversion", tags: ["counter-trend", "stopped"], plan: "on", basis: "technical",
    catalyst: "Technical — fade of a VWAP extension.",
    notes: "Valid setup, market simply kept trending. Stop honoured without hesitation. No error here.",
    line: "Valid setup, market kept trending. Stop honoured without hesitation — a good loss.",
    focus: 4, absorptionConfirmed: true, roomPoints: 74,
    path: PATH_DOWN, entryIndex: 5, exitIndex: 22,
  },
  {
    id: 3, date: "2026-08-31", symbol: "NIFTY 24800 CE", market: "NSE F&O", kind: "Options",
    style: "Scalp", direction: "long", qtyLabel: "75 / 1", lots: 1, units: 75,
    entry: 196, exit: 221.3, entryTime: "10:48", exitTime: "11:12", held: "24m",
    stop: 184, target: 232, plannedRR: 1.5, realisedR: 1.4, pnl: 1897,
    strategy: "ORB continuation", tags: ["re-entry"], plan: "off", basis: "technical",
    catalyst: "Technical — second push, but the size rule forbids re-entry in the same session.",
    notes: "Made money and still shouldn't have taken it. Re-entry after a stop-out is explicitly a rule break. Logging it as a loss of discipline.",
    line: "Made money and still shouldn't have taken it — re-entry after a stop-out is a rule break.",
    focus: 3, absorptionConfirmed: false, roomPoints: 41,
    path: PATH_UP, entryIndex: 8, exitIndex: 26,
  },
  {
    id: 4, date: "2026-08-31", symbol: "RELIANCE", market: "NSE Equity", kind: "Equity",
    style: "Intraday", direction: "long", qtyLabel: "200", lots: null, units: 200,
    entry: 1482.6, exit: 1502.9, entryTime: "11:02", exitTime: "14:26", held: "3h 24m",
    stop: 1472, target: 1512, plannedRR: 2.0, realisedR: 1.9, pnl: 4060,
    strategy: "Gap-and-go", tags: ["gap", "large-cap"], plan: "on", basis: "technical",
    catalyst: "Technical — gap held above the prior day high.",
    notes: "Sized correctly, held through one shakeout because structure never broke.",
    line: "Held through one shakeout because structure never broke.",
    focus: 4, absorptionConfirmed: true, roomPoints: 118,
    path: PATH_UP, entryIndex: 4, exitIndex: 27,
  },
  {
    id: 5, date: "2026-08-30", symbol: "TATAMOTORS", market: "NSE Equity", kind: "Equity",
    style: "BTST", direction: "long", qtyLabel: "300", lots: null, units: 300,
    entry: 1012.4, exit: 1041.8, entryTime: "15:18", exitTime: "09:22", held: "overnight",
    stop: 1001, target: 1048, plannedRR: 2.6, realisedR: 2.4, pnl: 8820,
    strategy: "Close strength", tags: ["btst", "momentum"], plan: "on", basis: "technical",
    catalyst: "Technical — closed at the day high above a weekly level.",
    notes: "Standard BTST rules: strong close, no earnings, no event risk overnight.",
    line: "Strong close above a weekly level, no event risk overnight.",
    focus: 4, absorptionConfirmed: true, roomPoints: 88,
    path: PATH_UP, entryIndex: 7, exitIndex: 25,
  },
  {
    id: 6, date: "2026-08-29", symbol: "BTCUSDT PERP", market: "Binance", kind: "Perp",
    style: "Swing", direction: "long", qtyLabel: "0.4 BTC", lots: null, units: 0.4,
    entry: 63410, exit: 64980, entryTime: "20:10", exitTime: "04:15", held: "1d 8h",
    stop: 62900, target: 65600, plannedRR: 3.0, realisedR: 2.8, pnl: 5216,
    strategy: "Range breakout", tags: ["crypto", "overnight"], plan: "on", basis: "technical",
    catalyst: "Technical — daily range compression break.",
    notes: "Set the alert, took the trade, slept with the stop at breakeven.",
    line: "Set the alert, took the trade, slept with the stop at breakeven.",
    focus: 3, absorptionConfirmed: true, roomPoints: 1400,
    path: PATH_UP, entryIndex: 6, exitIndex: 23,
  },
  {
    id: 7, date: "2026-08-29", symbol: "EURUSD", market: "Forex", kind: "Spot FX",
    style: "Intraday", direction: "long", qtyLabel: "1.5 std lot", lots: null, units: 1.5,
    entry: 1.0842, exit: 1.0817, entryTime: "14:30", exitTime: "15:05", held: "35m",
    stop: 1.0817, target: 1.0898, plannedRR: 2.2, realisedR: -1.0, pnl: -3750,
    strategy: "London reversal", tags: ["fx", "news"], plan: "off", basis: "news",
    catalyst: "News — traded straight into an ECB headline.",
    notes: "Impulsive. Saw the spike and wanted in. This is the pattern that costs me the most.",
    line: "Saw the spike and wanted in. This is the pattern that costs me the most.",
    focus: 2, absorptionConfirmed: false, roomPoints: 32,
    path: PATH_DOWN, entryIndex: 5, exitIndex: 20,
  },
  {
    id: 8, date: "2026-08-28", symbol: "NIFTY 24700 PE", market: "NSE F&O", kind: "Options",
    style: "Intraday", direction: "short", qtyLabel: "150 / 2", lots: 2, units: 150,
    entry: 143.2, exit: 189.6, entryTime: "09:28", exitTime: "10:52", held: "1h 24m",
    stop: 128, target: 196, plannedRR: 3.2, realisedR: 3.1, pnl: 6960,
    strategy: "ORB continuation", tags: ["breakout", "trend-day"], plan: "on", basis: "technical",
    catalyst: "Technical — failed gap, short side of the opening range.",
    notes: "Best trade of the week. Full position, full plan, no interference.",
    line: "Full position, full plan, no interference.",
    focus: 5, absorptionConfirmed: true, roomPoints: 134,
    path: PATH_UP, entryIndex: 5, exitIndex: 27,
  },
  {
    id: 9, date: "2026-08-28", symbol: "HDFCBANK", market: "NSE Equity", kind: "Equity",
    style: "Intraday", direction: "long", qtyLabel: "120", lots: null, units: 120,
    entry: 1646, exit: 1631.4, entryTime: "13:52", exitTime: "14:18", held: "26m",
    stop: 1631, target: 1668, plannedRR: 1.5, realisedR: -1.0, pnl: -1752,
    strategy: "Pullback long", tags: ["afternoon", "low-conviction"], plan: "off", basis: "technical",
    catalyst: "Technical — but taken out of boredom after 13:40.",
    notes: "Post-13:40 trade again. That window is where my edge disappears.",
    line: "Post-13:40 trade again. That window is where my edge disappears.",
    focus: 2, absorptionConfirmed: false, roomPoints: 22,
    path: PATH_DOWN, entryIndex: 6, exitIndex: 21,
  },
  {
    id: 10, date: "2026-08-21", symbol: "GOLD OCT FUT", market: "MCX", kind: "Futures",
    style: "Positional", direction: "long", qtyLabel: "1 lot", lots: 1, units: 100,
    entry: 71240, exit: 73890, entryTime: "18:05", exitTime: "15:40", held: "6d",
    stop: 70120, target: 74400, plannedRR: 2.5, realisedR: 2.3, pnl: 26500,
    strategy: "Trend pullback", tags: ["commodity", "swing"], plan: "on", basis: "technical",
    catalyst: "Technical — 20EMA pullback inside an established uptrend.",
    notes: "Patient entry at the level, no chasing, scaled out in thirds.",
    line: "Patient entry at the level, scaled out in thirds.",
    focus: 4, absorptionConfirmed: true, roomPoints: 2100,
    path: PATH_UP, entryIndex: 6, exitIndex: 26,
  },
  {
    id: 11, date: "2026-08-19", symbol: "AAPL", market: "NASDAQ", kind: "Equity",
    style: "Swing", direction: "long", qtyLabel: "60", lots: null, units: 60,
    entry: 228.4, exit: 236.1, entryTime: "19:45", exitTime: "18:10", held: "3d",
    stop: 225.6, target: 237, plannedRR: 2.8, realisedR: 2.6, pnl: 38900,
    strategy: "Base breakout", tags: ["us-equity", "breakout"], plan: "on", basis: "technical",
    catalyst: "Technical — six-week base resolved higher.",
    notes: "Sized to 0.5% risk because of the overnight gap exposure.",
    line: "Sized to 0.5% risk because of overnight gap exposure.",
    focus: 4, absorptionConfirmed: true, roomPoints: 860,
    path: PATH_UP, entryIndex: 7, exitIndex: 24,
  },
];

export const EQUITY: number[] = [
  500000, 504200, 499600, 508900, 515400, 511200, 522800, 519400, 531600, 528300,
  540100, 552700, 547900, 561300, 573800, 569200, 584600, 596100, 592400, 608900,
  621500, 617800, 633200, 648700, 644100, 659800, 673400, 668900, 684200, 697600,
  693100, 709400, 724800, 719600, 736200, 751900, 747300, 763800, 779400, 774900,
  791200, 806700, 802100, 818600, 834900, 830400, 847100, 863800, 859200, 876500,
  893100, 888600, 905200, 921800, 917300, 934600, 951200, 946700, 963400, 980100,
  975600, 992800, 1009500, 1024300,
];

export const DEPOSIT_MARKS = [18, 41];
export const EQUITY_LABELS = ["12 Jun", "5 Jul", "24 Jul", "12 Aug", "31 Aug"];

export const CAPITAL_EVENTS: CapitalEvent[] = [
  { id: 1, date: "27 Aug", label: "Withdrawal — quarterly draw", amount: -75000 },
  { id: 2, date: "12 Aug", label: "Capital addition", amount: 150000 },
  { id: 3, date: "18 Jul", label: "Capital addition", amount: 100000 },
  { id: 4, date: "01 Jul", label: "Month close — trading profit", amount: 84600 },
  { id: 5, date: "12 Jun", label: "Opening balance", amount: 500000 },
];

export const WINDOWS: SessionWindow[] = [
  { id: 1, name: "Morning momentum", start: "09:15", end: "11:30", tradable: true },
  { id: 2, name: "Midday — no trading", start: "11:30", end: "13:40", tradable: false },
  { id: 3, name: "Closing drift", start: "14:40", end: "15:20", tradable: true },
];

export const GATE: GateItem[] = [
  { id: 0, label: "Levels marked before the open" },
  { id: 1, label: "Max loss for the session set" },
  { id: 2, label: "No positions carried from yesterday" },
  { id: 3, label: "Economic calendar checked" },
  { id: 4, label: "Phone away, one screen only" },
];

export const QUEUE: QueuedFill[] = [
  {
    id: 101, symbol: "FINNIFTY 23500 CE", market: "NSE F&O", kind: "Options",
    qty: "80 / 2", entry: 96.2, exit: 88.75, held: "13m", pnl: -596, entryTime: "11:31",
  },
  {
    id: 102, symbol: "SILVERMIC SEP", market: "MCX", kind: "Futures",
    qty: "2 lot", entry: 88420, exit: 89110, held: "37m", pnl: 1380, entryTime: "11:34",
  },
];

export const TODAY: DayLog = {
  date: "2026-08-31",
  windowId: 1,
  title: "Monday session",
  focus: 4,
  gateChecked: [0, 1, 2, 3, 4],
  notes: [
    { time: "09:05", kind: "info", text: "Gate cleared — levels marked, loss cap set at ₹12,000, calendar checked." },
    { time: "10:40", kind: "warn", text: "Rule flagged — re-entry after a stop-out, 14 minutes after the BANKNIFTY stop." },
    { time: "11:30", kind: "end", text: "Window closes. Anything after this is off-plan by definition." },
  ],
};

export const RULE_FLAGS: RuleFlag[] = [
  {
    id: 1,
    rule: "No re-entry after a stop-out",
    detail: "NIFTY 24800 CE taken 14 min after the BANKNIFTY stop",
    status: "breached",
    icon: "ph ph-warning-octagon",
  },
  {
    id: 2,
    rule: "Max 5 trades per session",
    detail: "5 of 5 used — the next fill will be flagged",
    status: "at-limit",
    icon: "ph ph-warning",
  },
  {
    id: 3,
    rule: "Daily loss cap ₹12,000",
    detail: "currently +₹7,787",
    status: "clear",
    icon: "ph ph-check-circle",
  },
  {
    id: 4,
    rule: "No trades after 13:40",
    detail: "session window closes at 11:30",
    status: "clear",
    icon: "ph ph-check-circle",
  },
];

export const PLAYBOOK: PlaybookStrategy[] = [
  {
    id: 1, name: "ORB continuation", styleTag: "Scalp · Intraday", markets: "NSE F&O · NASDAQ",
    tradeCount: 22, winRate: 73, pnl: 62300, status: "core",
    rules: [
      "Only in the first 60 minutes",
      "Range must be ≥ 0.4% of spot",
      "Volume on the break > 1.5× the 20-bar average",
      "One entry per session, no re-entry",
      "Stop below the range mid, target 2R minimum",
    ],
  },
  {
    id: 2, name: "Trend pullback", styleTag: "Swing · Positional", markets: "MCX · Crypto",
    tradeCount: 15, winRate: 67, pnl: 38900, status: "core",
    rules: [
      "Higher high / higher low structure on the daily",
      "Entry at the 20EMA, never mid-air",
      "Risk 0.5% max because of gap exposure",
      "Scale out in thirds at 1R, 2R, trail the rest",
    ],
  },
  {
    id: 3, name: "Close strength (BTST)", styleTag: "BTST", markets: "NSE Equity",
    tradeCount: 9, winRate: 71, pnl: 22400, status: "core",
    rules: [
      "Close in the top 10% of the day range",
      "No earnings or event inside 48 hours",
      "Exit inside the first 30 minutes next session",
      "Half normal size",
    ],
  },
  {
    id: 4, name: "Mean reversion", styleTag: "Scalp", markets: "NSE F&O",
    tradeCount: 9, winRate: 33, pnl: -9800, status: "probation",
    rules: [
      "Only against a 2.5σ VWAP extension",
      "Never on a trend day (ADX > 25)",
      "Hard stop, no averaging",
    ],
  },
  {
    id: 5, name: "News fade", styleTag: "Scalp", markets: "Forex · MCX",
    tradeCount: 7, winRate: 29, pnl: -23940, status: "retired",
    rules: [
      "Retired 24 Aug — the data says you cannot do this profitably",
    ],
  },
];

export const HARD_LIMITS: HardLimit[] = [
  { id: 1, label: "Daily loss cap", value: "12,000" },
  { id: 2, label: "Max trades per session", value: "5" },
  { id: 3, label: "Risk per trade", value: "1.0%" },
];

export const CAPTURE_SOURCES: CaptureSource[] = [
  {
    id: 1, broker: "Zerodha Kite", account: "ZP4821 · NSE / MCX",
    detail: "orderbook + positions · polled every 15s",
    trades: "38 trades captured", state: "live",
  },
  {
    id: 2, broker: "Binance", account: "Futures · sub-account 2",
    detail: "trade history tab · polled every 60s",
    trades: "11 trades captured", state: "live",
  },
  {
    id: 3, broker: "Interactive Brokers", account: "U8842190",
    detail: "session expired 2 days ago",
    trades: "15 trades captured", state: "needs-reauth",
  },
];

export const CAPTURE_RULES: CaptureRule[] = [
  { id: 1, label: "Match fills into round-trip trades", detail: "opposite-side fills on the same instrument inside the session are paired automatically", enabled: true },
  { id: 2, label: "Categorise style by hold time", detail: "< 15m scalp · same day intraday · overnight BTST · multi-day swing · > 2 weeks positional", enabled: true },
  { id: 3, label: "Attach the chart at both fill times", detail: "pulls a 5m window around entry and exit", enabled: true },
  { id: 4, label: "Guess the strategy from the playbook", detail: "matched on instrument, time of day and setup shape — always shown as a suggestion", enabled: true },
  { id: 5, label: "Flag rule breaks on arrival", detail: "runs the rules engine before the trade reaches your inbox", enabled: true },
];

export const BUCKET_NOTE: Record<string, string> = {
  Scalp: "64% win, +₹31.2k",
  Intraday: "58% win, +₹18.6k",
  BTST: "71% win, +₹22.4k",
  Swing: "55% win, +₹26.1k",
  Positional: "40% win, −₹16.7k",
};

// Review screen stats
export const DISCIPLINE_STATS = [
  { label: "Followed the strategy", value: "78%", pct: 78 },
  { label: "Stop honoured", value: "94%", pct: 94 },
  { label: "Avg session focus", value: "3.6 / 5", pct: 72 },
  { label: "Inside session window", value: "61%", pct: 61 },
];

export const STRATEGY_STATS = [
  { name: "ORB continuation", wr: "73%", pnl: 62300 },
  { name: "Trend pullback", wr: "67%", pnl: 38900 },
  { name: "Base breakout", wr: "60%", pnl: 24400 },
  { name: "Mean reversion", wr: "33%", pnl: -9800 },
  { name: "News fade", wr: "29%", pnl: -23940 },
];

export const STYLE_STATS = [
  { name: "Scalp", wr: "64%", pnl: 31200 },
  { name: "Intraday", wr: "58%", pnl: 18600 },
  { name: "BTST", wr: "71%", pnl: 22400 },
  { name: "Swing", wr: "55%", pnl: 26100 },
  { name: "Positional", wr: "40%", pnl: -16740 },
];

export const TAG_STATS = [
  { name: "breakout", pnl: 48200 },
  { name: "trend-day", pnl: 31600 },
  { name: "btst", pnl: 22400 },
  { name: "gap", pnl: 12400 },
  { name: "re-entry", pnl: -6700 },
  { name: "afternoon", pnl: -14900 },
  { name: "news", pnl: -12600 },
  { name: "low-conviction", pnl: -18400 },
];
