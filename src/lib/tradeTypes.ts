/**
 * The one list of trade types, shared by the dashboard journal's single-select, a basket's type
 * and a single lot's type. Same rule as `strategies.ts`: plain text from a fixed list, no table
 * to point a foreign key at, and nothing forks it.
 *
 * The two synthetic entries are split by side because long and short are different trades —
 * long CE + short PE is a long synthetic, short CE + long PE is a short one, and calling both
 * "Synthetic Futures" would lose the only thing that distinguishes them. No data migration was
 * needed for the split: every stored `journal_entries.trade_type` is "Options Buying".
 */
import type { DbTrade } from "./tradeRows";

export const TRADE_TYPES = [
  "Options Selling",
  "Option Selling W Hedge",
  "Options Buying",
  "Index Futures",
  "Synthetic Futures Long",
  "Synthetic Futures Short",
  "Synthetic Futures Long W Hedge",
  "Synthetic Futures Short W Hedge",
  "Equity",
];

/**
 * Table cells are 92px; "Synthetic Futures Long W Hedge" is not going to fit. The full name goes
 * in a `title` beside it.
 */
const SHORT: Record<string, string> = {
  "Options Selling": "Opt Sell",
  "Option Selling W Hedge": "Opt Sell +H",
  "Options Buying": "Opt Buy",
  "Index Futures": "Futures",
  "Synthetic Futures Long": "Syn Long",
  "Synthetic Futures Short": "Syn Short",
  "Synthetic Futures Long W Hedge": "Syn Long +H",
  "Synthetic Futures Short W Hedge": "Syn Short +H",
  Equity: "Equity",
};

export function shortType(name: string): string {
  return SHORT[name] ?? name;
}

/**
 * The type a lot implies on its own, used whenever nothing was set by hand. A short option is
 * being written, a long one bought; everything else follows the instrument kind.
 *
 * Deliberately never says "W Hedge" — a hedge is a relationship between legs, and a single lot
 * has no legs to be in a relationship with. That answer only comes from `classify` on a basket.
 */
export function autoTypeOf(t: DbTrade): string {
  if (t.type === "Options") return t.direction === "short" ? "Options Selling" : "Options Buying";
  if (t.type === "Futures") return "Index Futures";
  return "Equity";
}

/** What to show: the hand-set type if there is one, otherwise the one the instrument implies. */
export function effectiveType(t: DbTrade): string {
  return t.tradeType || autoTypeOf(t);
}
