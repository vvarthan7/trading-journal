/**
 * Turns SmartAPI fills into `Trade` rows.
 *
 * A trade is a position held from flat back to flat, so it can contain several entries and
 * several exits. Prices shown are size-weighted averages of its legs; when a trade has more
 * than one entry or one exit, `legs` carries each fill with its own time and quantity.
 *
 * Fields the broker cannot know — stop, target, planned R:R, strategy, plan adherence — stay
 * empty here rather than being guessed, and the Trades screen renders them as "—".
 */
import type { Direction, Trade, TradeLeg } from "../types";
import type { SmartApiFill } from "./smartapi";

const OPTION_INSTRUMENTS = new Set(["OPTIDX", "OPTSTK", "OPTCUR", "OPTFUT", "OPTBLN"]);
const FUTURE_INSTRUMENTS = new Set(["FUTIDX", "FUTSTK", "FUTCUR", "FUTCOM", "FUTBLN", "FUTIRC"]);

/** Product type is the only hint the broker gives about holding intent. */
const STYLE_BY_PRODUCT: Record<string, string> = {
  INTRADAY: "Intraday",
  MARGIN: "Intraday",
  BO: "Intraday",
  CO: "Intraday",
  DELIVERY: "Swing",
  CARRYFORWARD: "Positional",
};

export function kindOf(instrumenttype: string): string {
  if (OPTION_INSTRUMENTS.has(instrumenttype)) return "Options";
  if (FUTURE_INSTRUMENTS.has(instrumenttype)) return "Futures";
  return "Equity";
}

function marketOf(exchange: string, instrumenttype: string): string {
  switch (exchange) {
    case "NFO":
      return "NSE F&O";
    case "BFO":
      return "BSE F&O";
    case "MCX":
      return "MCX";
    case "CDS":
      return "NSE Currency";
    case "BSE":
      return "BSE Equity";
    case "NSE":
      return instrumenttype ? "NSE F&O" : "NSE Equity";
    default:
      return exchange;
  }
}

/** "13:27:53" → seconds past midnight. Fill times carry no date; the trade book is same-day. */
export function seconds(filltime: string): number {
  const [h = 0, m = 0, s = 0] = filltime.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

/** "13:27:53" → "13:27", the precision the table shows. */
function hhmm(filltime: string): string {
  return filltime.slice(0, 5);
}

function heldLabel(fromSec: number, toSec: number): string {
  const mins = Math.max(0, Math.round((toSec - fromSec) / 60));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Today in yyyy-mm-dd, local — the trade book only ever returns the current session. */
function today(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

interface Position {
  fills: SmartApiFill[];
  /** Signed units still held; the trade closes when this returns to zero. */
  net: number;
  direction: Direction;
}

function weighted(legs: TradeLeg[]): number {
  const units = legs.reduce((a, l) => a + l.units, 0);
  if (!units) return 0;
  return legs.reduce((a, l) => a + l.price * l.units, 0) / units;
}

function build(position: Position, id: number): Trade {
  const first = position.fills[0];
  const lotSize = Number(first.marketlot) || 0;
  const isLong = position.direction === "long";

  const legs: TradeLeg[] = position.fills.map((f) => {
    const units = Number(f.fillsize) || 0;
    const isBuy = f.transactiontype === "BUY";
    return {
      side: isBuy === isLong ? "entry" : "exit",
      time: hhmm(f.filltime),
      price: Number(f.fillprice) || 0,
      units,
      lots: lotSize > 1 ? Math.round(units / lotSize) : null,
      fillId: f.fillid,
    };
  });

  const entries = legs.filter((l) => l.side === "entry");
  const exits = legs.filter((l) => l.side === "exit");
  const entryUnits = entries.reduce((a, l) => a + l.units, 0);

  // Realised P&L is simply what the sells brought in less what the buys cost.
  const pnl = position.fills.reduce((a, f) => {
    const value = (Number(f.fillprice) || 0) * (Number(f.fillsize) || 0);
    return f.transactiontype === "SELL" ? a + value : a - value;
  }, 0);

  const open = position.net !== 0;
  const entryTimes = position.fills.filter((_, i) => legs[i].side === "entry").map((f) => seconds(f.filltime));
  const exitTimes = position.fills.filter((_, i) => legs[i].side === "exit").map((f) => seconds(f.filltime));

  const prices = legs.map((l) => l.price);
  const path = prices.length > 1 ? prices : [...prices, ...prices];
  const lots = lotSize > 1 ? Math.round(entryUnits / lotSize) : null;

  return {
    id,
    date: today(),
    symbol: first.tradingsymbol,
    market: marketOf(first.exchange, first.instrumenttype),
    kind: kindOf(first.instrumenttype),
    style: STYLE_BY_PRODUCT[first.producttype] ?? "Intraday",
    direction: position.direction,

    qtyLabel: lots ? `${entryUnits} / ${lots}` : `${entryUnits}`,
    lots,
    units: entryUnits,

    entry: weighted(entries),
    exit: open ? 0 : weighted(exits),
    entryTime: entries.length ? entries[0].time : "",
    exitTime: open || !exits.length ? "" : exits[exits.length - 1].time,
    held:
      open || !exitTimes.length
        ? ""
        : heldLabel(Math.min(...entryTimes), Math.max(...exitTimes)),

    // Not knowable from a fill — journalled by hand later.
    stop: 0,
    target: 0,
    plannedRR: 0,
    realisedR: 0,
    pnl: Math.round(pnl),

    strategy: "",
    tags: [],
    plan: "on",
    basis: "technical",
    catalyst: "",
    notes: "",
    line: "",

    focus: null,
    absorptionConfirmed: null,
    roomPoints: null,

    path,
    entryIndex: 0,
    exitIndex: path.length - 1,

    source: "broker",
    legs,
    open,
  };
}

/**
 * Group fills into round trips. Fills are keyed by exchange, symbol and product so the same
 * symbol held intraday and on delivery stays two separate trades, then walked in time order:
 * a trade opens on the first fill and closes when the running position is flat again.
 */
export function toTrades(fills: SmartApiFill[]): Trade[] {
  const groups = new Map<string, SmartApiFill[]>();
  for (const f of fills) {
    const key = `${f.exchange}|${f.tradingsymbol}|${f.producttype}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(f);
    else groups.set(key, [f]);
  }

  const trades: Trade[] = [];
  let id = 1;

  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort((a, b) => seconds(a.filltime) - seconds(b.filltime));
    let position: Position | null = null;

    for (const f of ordered) {
      const size = Number(f.fillsize) || 0;
      const signed = f.transactiontype === "BUY" ? size : -size;

      if (!position) {
        position = { fills: [], net: 0, direction: signed >= 0 ? "long" : "short" };
      }
      position.fills.push(f);
      position.net += signed;

      if (position.net === 0) {
        trades.push(build(position, id++));
        position = null;
      }
    }

    // Anything still held is shown as an open trade with no exit yet.
    if (position) trades.push(build(position, id++));
  }

  return trades.sort((a, b) => (a.entryTime < b.entryTime ? 1 : -1));
}
