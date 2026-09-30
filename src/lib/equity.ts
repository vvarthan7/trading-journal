/**
 * Account equity and drawdown, rebuilt from closed lots.
 *
 * SmartAPI has no balance history, so the curve is anchored to the account's value *now* (the
 * RMS `net`) and walked backwards: the balance before the first trade is today's value less every
 * closed lot's P&L. That is exact only while no money has been added or withdrawn in between — a
 * deposit shows up as a step in the reconstructed starting balance, not as a move on the curve.
 * With no account value (backend down, signed out) the curve starts at 0 and plots P&L alone.
 */
import type { DbTrade } from "./tradeRows";

export interface EquityPoint {
  /** 0 is the starting balance, before any trade; 1…n are closed lots in exit order. */
  index: number;
  tradeDate: string;
  exitTime: string;
  instrument: string;
  /** This lot's P&L — net of charges when known, gross otherwise. */
  pnl: number;
  equity: number;
  /** Highest equity reached so far. */
  peak: number;
  /** equity − peak: 0 at a new high, negative below it. */
  drawdown: number;
  /** drawdown ÷ peak, as a percentage. Null when the peak is not a real balance (≤ 0). */
  drawdownPct: number | null;
}

export interface EquitySeries {
  points: EquityPoint[];
  /** Balance before the first closed lot. */
  start: number;
  /** True when anchored to the broker's account value, false when it is P&L from zero. */
  anchored: boolean;
  totalPnl: number;
  /** Lots whose charges were unknown, so their gross P&L was used. */
  grossOnly: number;
  /** The highest the account has been, and the point it was reached at (0 = the start). */
  high: number;
  highAt: number;
  /** The deepest drawdown, in rupees (≤ 0), and the point it happened at. */
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  maxDrawdownAt: number;
}

/** Closed lots oldest first: by date, then exit time, then id for lots closed in the same minute. */
function closedInOrder(trades: DbTrade[]): DbTrade[] {
  return trades
    .filter((t) => !t.open && t.pnl !== null)
    .sort(
      (a, b) =>
        a.tradeDate.localeCompare(b.tradeDate) ||
        a.exitTime.localeCompare(b.exitTime) ||
        a.id - b.id
    );
}

export function equitySeries(trades: DbTrade[], accountValue: number | null): EquitySeries {
  const lots = closedInOrder(trades);
  const pnlOf = (t: DbTrade) => t.netPnl ?? t.pnl ?? 0;
  const totalPnl = lots.reduce((a, t) => a + pnlOf(t), 0);
  const anchored = accountValue !== null;
  const start = anchored ? accountValue - totalPnl : 0;

  const first = lots[0];
  const points: EquityPoint[] = [
    {
      index: 0,
      tradeDate: first?.tradeDate ?? "",
      exitTime: "",
      instrument: "Starting balance",
      pnl: 0,
      equity: start,
      peak: start,
      drawdown: 0,
      drawdownPct: start > 0 ? 0 : null,
    },
  ];

  let equity = start;
  let peak = start;
  let maxDrawdown = 0;
  let maxDrawdownPct: number | null = null;
  let maxDrawdownAt = 0;
  let highAt = 0;
  lots.forEach((t, i) => {
    const pnl = pnlOf(t);
    equity += pnl;
    if (equity > peak) {
      peak = equity;
      highAt = i + 1;
    }
    const drawdown = equity - peak;
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : null;
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPct = drawdownPct;
      maxDrawdownAt = i + 1;
    }
    points.push({
      index: i + 1,
      tradeDate: t.tradeDate,
      exitTime: t.exitTime,
      instrument: t.instrument,
      pnl,
      equity,
      peak,
      drawdown,
      drawdownPct,
    });
  });

  return {
    points,
    start,
    anchored,
    totalPnl,
    high: peak,
    highAt,
    grossOnly: lots.filter((t) => t.netPnl === null).length,
    maxDrawdown,
    maxDrawdownPct: maxDrawdown < 0 ? maxDrawdownPct : start > 0 ? 0 : null,
    maxDrawdownAt,
  };
}
