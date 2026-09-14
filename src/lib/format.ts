import type { Trade } from "../types";

export const CUR = "₹";

export function money(n: number, cur: string = CUR): string {
  return (n < 0 ? "−" : "+") + cur + Math.abs(n).toLocaleString("en-IN");
}

export function plain(n: number, cur: string = CUR): string {
  return cur + Math.abs(n).toLocaleString("en-IN");
}

export function rLabel(r: number): string {
  return (r > 0 ? "+" : "") + r.toFixed(1) + "R";
}

export function price(n: number): string {
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: n < 100 ? 2 : 0,
    maximumFractionDigits: n < 100 ? 4 : 2,
  });
}

export function pnlTone(n: number): string {
  return n >= 0 ? "text-win" : "text-loss";
}

export function planLabel(p: Trade["plan"]): string {
  return p === "on" ? "On plan" : p === "partly" ? "Partly on plan" : "Off plan";
}

export function planTone(p: Trade["plan"]): string {
  return p === "on" ? "text-win" : p === "partly" ? "text-warn" : "text-loss";
}

export function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function shortDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function longDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Journal trades fill Level play in blocks: trades 1–10 are level 1, 11–20 level 2, … */
export const TRADES_PER_LEVEL = 10;

/** 1-based level for a journal row at 0-based position `index`. */
export function levelOf(index: number): number {
  return Math.floor(index / TRADES_PER_LEVEL) + 1;
}

/** Current local time in the yyyy-mm-ddThh:mm shape a datetime-local input expects. */
export function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** Build an SVG path string from a numeric series scaled into a box. */
export function seriesPath(
  values: number[],
  width: number,
  top: number,
  height: number
): { d: string; points: [number, number][] } {
  if (values.length < 2) return { d: "", points: [] };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map(
    (v, i) =>
      [
        (i / (values.length - 1)) * width,
        top + height - ((v - min) / span) * height,
      ] as [number, number]
  );
  const d = "M " + points.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ");
  return { d, points };
}

export interface Kpis {
  net: number;
  winRate: number;
  wins: number;
  losses: number;
  avgPlannedRR: number;
  avgRealisedR: number;
  profitFactor: number;
  expectancy: number;
}

export function computeKpis(trades: Trade[]): Kpis {
  const n = trades.length || 1;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0)) || 1;
  return {
    net: trades.reduce((a, t) => a + t.pnl, 0),
    winRate: Math.round((wins.length / n) * 100),
    wins: wins.length,
    losses: losses.length,
    avgPlannedRR: trades.reduce((a, t) => a + t.plannedRR, 0) / n,
    avgRealisedR: trades.reduce((a, t) => a + t.realisedR, 0) / n,
    profitFactor: grossWin / grossLoss,
    expectancy: trades.reduce((a, t) => a + t.realisedR, 0) / n,
  };
}

export function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = m.get(k);
    if (bucket) bucket.push(item);
    else m.set(k, [item]);
  }
  return m;
}
