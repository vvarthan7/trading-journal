import type { JournalEntry } from "../types";
import type { DbTrade } from "./tradeRows";
import { rowPnl, type TableRow } from "./tradeGroups";
import { JOURNAL_INSTRUMENT } from "./format";

/** Level play reads broker P&L from this level up; level 1 was played before the broker sync. */
export const FIRST_MATCHED_LEVEL = 2;

/** How far a journal entry's hand-typed time may sit from the broker's entry time. */
const MATCH_MINUTES = 15;

function firstLot(row: TableRow): DbTrade {
  return row.kind === "lot" ? row.trade : row.kind === "group" ? row.summary.legs[0] : row.summary.lots[0];
}

function entryOf(row: TableRow): { date: string; time: string } {
  return row.kind === "lot"
    ? { date: row.trade.tradeDate, time: row.trade.entryTime }
    : { date: row.summary.tradeDate, time: row.summary.entryTime };
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Only NIFTY trades count; everything else is a strategy test. Rows synced before `underlying`
 * existed fall back to the symbol, where NIFTY must be followed by the expiry's digits so that
 * NIFTYNXT50 or FINNIFTY never pass.
 */
function isJournalTrade(lot: DbTrade): boolean {
  return lot.underlying
    ? lot.underlying.toUpperCase() === JOURNAL_INSTRUMENT
    : new RegExp(`^${JOURNAL_INSTRUMENT}\\d`).test(lot.instrument.toUpperCase());
}

/**
 * Broker P&L for each journal entry on a matched level, keyed by entry id. An entry is matched to
 * a closed NIFTY trade row on the same day, entered within `MATCH_MINUTES` of the
 * journal time; the closest pairs are taken first and a row is never used twice. Entries with no
 * match are simply absent — level play ignores them rather than reading them as zero.
 *
 * Rows, not lots, so a basket or a scaled position is one trade here too. P&L is gross, the same
 * figure the trades tables and their win rate use.
 */
export function journalPnl(journal: JournalEntry[], rows: TableRow[]): Map<number, number> {
  const pairs: { entryId: number; row: number; gap: number }[] = [];

  journal.forEach((e) => {
    if (e.level < FIRST_MATCHED_LEVEL || !e.dateTime) return;
    const date = e.dateTime.slice(0, 10);
    const at = minutes(e.dateTime.slice(11, 16));
    rows.forEach((row, i) => {
      if (rowPnl(row) === null) return;
      const entry = entryOf(row);
      if (entry.date !== date || !entry.time || !isJournalTrade(firstLot(row))) return;
      const gap = Math.abs(minutes(entry.time) - at);
      if (gap <= MATCH_MINUTES) pairs.push({ entryId: e.id, row: i, gap });
    });
  });

  pairs.sort((a, b) => a.gap - b.gap);
  const out = new Map<number, number>();
  const used = new Set<number>();
  for (const p of pairs) {
    if (out.has(p.entryId) || used.has(p.row)) continue;
    out.set(p.entryId, rowPnl(rows[p.row]) as number);
    used.add(p.row);
  }
  return out;
}
