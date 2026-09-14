import type { JournalEntry, YesNo } from "../types";

/** A `journal_entries` row as Supabase returns it (snake_case columns). */
export interface JournalRow {
  id: number;
  user_id: string;
  /** Postgres `timestamp`, e.g. 2026-09-14T10:30:00 — local wall-clock time, no zone */
  date_time: string;
  instrument: string;
  trade_type: string | null;
  product: JournalEntry["product"];
  strategy: string | null;
  outcome: JournalEntry["outcome"];
  skill_luck: JournalEntry["skillLuck"];
  rules_followed: YesNo | null;
  position_sizing: YesNo | null;
  fomo: YesNo | null;
  revenge: YesNo | null;
  early_entry: YesNo | null;
  early_exit: YesNo | null;
  overtrading: YesNo | null;
  wrong_trade: YesNo | null;
  created_at: string;
}

const COLUMNS: Record<Exclude<keyof JournalEntry, "id">, keyof JournalRow> = {
  dateTime: "date_time",
  instrument: "instrument",
  tradeType: "trade_type",
  product: "product",
  strategy: "strategy",
  outcome: "outcome",
  skillLuck: "skill_luck",
  rulesFollowed: "rules_followed",
  positionSizing: "position_sizing",
  fomo: "fomo",
  revenge: "revenge",
  earlyEntry: "early_entry",
  earlyExit: "early_exit",
  overtrading: "overtrading",
  wrongTrade: "wrong_trade",
};

export function fromRow(r: JournalRow): JournalEntry {
  return {
    id: r.id,
    dateTime: r.date_time.slice(0, 16),
    instrument: r.instrument,
    tradeType: r.trade_type,
    product: r.product,
    strategy: r.strategy,
    outcome: r.outcome,
    skillLuck: r.skill_luck,
    rulesFollowed: r.rules_followed,
    positionSizing: r.position_sizing,
    fomo: r.fomo,
    revenge: r.revenge,
    earlyEntry: r.early_entry,
    earlyExit: r.early_exit,
    overtrading: r.overtrading,
    wrongTrade: r.wrong_trade,
  };
}

/** Column patch for an entry patch. A cleared date is left out: `date_time` is not null. */
export function toRow(patch: Partial<JournalEntry>): Partial<JournalRow> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "id" || (key === "dateTime" && !value)) continue;
    row[COLUMNS[key as keyof typeof COLUMNS]] = value;
  }
  return row as Partial<JournalRow>;
}
