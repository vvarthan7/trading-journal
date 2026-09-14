import type { JournalEntry, Trade } from "../types";

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

/**
 * Level play: six levels of ten boxes. Each journal entry is put on a level by hand, so a level
 * can be left early (say after 6 or 8 wins) and its unused boxes are skipped — but only once it
 * has `WINS_TO_ADVANCE` wins. Without them the next level stays locked.
 */
export const LEVELS = 6;
export const TRADES_PER_LEVEL = 10;
export const WINS_TO_ADVANCE = 6;

/** Entries on `level`, not counting the entry `exceptId`. */
export function levelCount(entries: JournalEntry[], level: number, exceptId?: number): number {
  return entries.filter((e) => e.level === level && e.id !== exceptId).length;
}

/** Wins on `level`, not counting the entry `exceptId`. */
export function levelWins(entries: JournalEntry[], level: number, exceptId?: number): number {
  return entries.filter((e) => e.level === level && e.outcome === "profit" && e.id !== exceptId)
    .length;
}

/**
 * Whether an entry (`exceptId`, or a new one) may go on `level`: the level has a free box and
 * the level below has enough wins without counting that entry.
 */
export function canUseLevel(entries: JournalEntry[], level: number, exceptId?: number): boolean {
  if (levelCount(entries, level, exceptId) >= TRADES_PER_LEVEL) return false;
  return level === 1 || levelWins(entries, level - 1, exceptId) >= WINS_TO_ADVANCE;
}

/**
 * Level for a new entry: the last entry's level while it has a free box, then the next level if
 * it's unlocked. Null when the last level is full and there's nowhere to go.
 */
export function nextLevel(entries: JournalEntry[]): number | null {
  const last = entries[entries.length - 1];
  if (!last) return 1;
  if (levelCount(entries, last.level) < TRADES_PER_LEVEL) return last.level;
  return last.level < LEVELS && canUseLevel(entries, last.level + 1) ? last.level + 1 : null;
}

/** Every journal field is required; `level` always has a value so it isn't listed. */
const REQUIRED = [
  "dateTime",
  "instrument",
  "tradeType",
  "product",
  "strategy",
  "outcome",
  "skillLuck",
  "rulesFollowed",
  "positionSizing",
  "fomo",
  "revenge",
  "earlyEntry",
  "earlyExit",
  "overtrading",
  "wrongTrade",
] as const satisfies readonly (keyof JournalEntry)[];

/** Required fields still empty on `e`. No new row can be added while any entry has one. */
export function missingFields(e: JournalEntry): Set<keyof JournalEntry> {
  return new Set(
    REQUIRED.filter((k) => {
      const v = e[k];
      return v === null || v.trim() === "";
    })
  );
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
