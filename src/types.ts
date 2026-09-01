export type PlanAdherence = "on" | "partly" | "off";
export type Basis = "technical" | "news" | "mixed";
export type Direction = "long" | "short";

export interface Trade {
  id: number;
  /** ISO date of entry, yyyy-mm-dd */
  date: string;
  symbol: string;
  /** free text: "NSE F&O", "MCX", "Binance", "NASDAQ" */
  market: string;
  /** Options | Futures | Equity | Perp | Spot FX */
  kind: string;
  /** Scalp | Intraday | BTST | Swing | Positional */
  style: string;
  direction: Direction;

  qtyLabel: string;
  lots: number | null;
  units: number;

  entry: number;
  exit: number;
  entryTime: string;
  exitTime: string;
  held: string;

  stop: number;
  target: number;
  plannedRR: number;
  realisedR: number;
  pnl: number;

  strategy: string;
  tags: string[];
  plan: PlanAdherence;
  basis: Basis;
  catalyst: string;
  notes: string;
  /** one-line version of the note, shown on the session timeline */
  line: string;

  focus: number | null;
  absorptionConfirmed: boolean | null;
  roomPoints: number | null;

  /** price path used by the auto chart */
  path: number[];
  entryIndex: number;
  exitIndex: number;

  screenshotUrl?: string | null;
}

export interface CapitalEvent {
  id: number;
  date: string;
  label: string;
  amount: number;
}

export interface SessionWindow {
  id: number;
  name: string;
  start: string;
  end: string;
  tradable: boolean;
}

export interface GateItem {
  id: number;
  label: string;
}

export interface QueuedFill {
  id: number;
  symbol: string;
  market: string;
  kind: string;
  qty: string;
  entry: number;
  exit: number;
  held: string;
  pnl: number;
  entryTime: string;
}

export interface SessionNote {
  time: string;
  kind: "info" | "warn" | "end";
  text: string;
}

export interface DayLog {
  date: string;
  windowId: number;
  title: string;
  focus: number;
  gateChecked: number[];
  notes: SessionNote[];
}

export interface RuleFlag {
  id: number;
  rule: string;
  detail: string;
  status: "breached" | "at-limit" | "clear";
  icon: string;
}

export interface PlaybookStrategy {
  id: number;
  name: string;
  styleTag: string;
  markets: string;
  tradeCount: number;
  winRate: number;
  pnl: number;
  status: "core" | "probation" | "retired";
  rules: string[];
}

export interface HardLimit {
  id: number;
  label: string;
  value: string;
}

export interface CaptureSource {
  id: number;
  broker: string;
  account: string;
  detail: string;
  trades: string;
  state: "live" | "needs-reauth" | "paused";
}

export interface CaptureRule {
  id: number;
  label: string;
  detail: string;
  enabled: boolean;
}
