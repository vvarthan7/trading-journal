/**
 * FIFO lot matching: turns SmartAPI fills into the one-entry-against-one-exit rows that
 * `public.trades` stores.
 *
 * A fill first closes any open lots facing the other way, oldest first, emitting one row per
 * matched pair. Whatever quantity is left over opens a new lot. So scaling in makes several
 * rows, a partial exit splits a row, and selling more than you hold closes the position and
 * opens the opposite one.
 *
 * `lotSeq` counts the rows produced from a single entry fill, in emission order. That order is
 * deterministic — fills are walked oldest first and matched FIFO — so the same lot keeps the
 * same key on every sync, which is what lets a re-sync update rows instead of duplicating them.
 */
import type { Direction } from "../types";
import type { SmartApiFill } from "./smartapi";
import { kindOf, seconds } from "./brokerTrades";
import { todayIso } from "./format";

/** A row of `public.trades` as the matcher produces it, before it reaches the database. */
export interface TradeLot {
  entryFillId: string;
  entryOrderId: string;
  /** Empty while the lot is still open. */
  exitFillId: string;
  exitOrderId: string;
  lotSeq: number;

  tradeDate: string;
  instrument: string;
  /** Options | Futures | Equity */
  type: string;
  exchange: string;
  direction: Direction;

  quantity: number;
  lot: number | null;

  entryPrice: number;
  exitPrice: number | null;
  /** hh:mm:ss, as the broker reports it. */
  entryTime: string;
  exitTime: string | null;
}

/** An entry fill with quantity still unmatched. */
interface OpenLot {
  fill: SmartApiFill;
  remaining: number;
  direction: Direction;
}

export function toLots(fills: SmartApiFill[]): TradeLot[] {
  const groups = new Map<string, SmartApiFill[]>();
  for (const f of fills) {
    const key = `${f.exchange}|${f.tradingsymbol}|${f.producttype}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(f);
    else groups.set(key, [f]);
  }

  // The trade book only ever returns the current session, so every lot is dated today.
  const date = todayIso();
  const lots: TradeLot[] = [];

  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort((a, b) => seconds(a.filltime) - seconds(b.filltime));

    const open: OpenLot[] = [];
    /** Next lotSeq to hand out per entry fill, so a split fill keeps stable keys. */
    const nextSeq = new Map<string, number>();

    const emit = (entry: OpenLot, exit: SmartApiFill | null, quantity: number) => {
      const seq = nextSeq.get(entry.fill.fillid) ?? 0;
      nextSeq.set(entry.fill.fillid, seq + 1);

      const lotSize = Number(entry.fill.marketlot) || 0;
      lots.push({
        entryFillId: entry.fill.fillid,
        entryOrderId: entry.fill.orderid,
        exitFillId: exit?.fillid ?? "",
        exitOrderId: exit?.orderid ?? "",
        lotSeq: seq,

        tradeDate: date,
        instrument: entry.fill.tradingsymbol,
        type: kindOf(entry.fill.instrumenttype),
        exchange: entry.fill.exchange,
        direction: entry.direction,

        quantity,
        lot: lotSize > 1 ? Math.round(quantity / lotSize) : null,

        entryPrice: Number(entry.fill.fillprice) || 0,
        exitPrice: exit ? Number(exit.fillprice) || 0 : null,
        entryTime: entry.fill.filltime,
        exitTime: exit?.filltime ?? null,
      });
    };

    for (const f of ordered) {
      let quantity = Number(f.fillsize) || 0;
      const side: Direction = f.transactiontype === "BUY" ? "long" : "short";

      // Close whatever is open the other way, oldest lot first.
      while (quantity > 0 && open.length > 0 && open[0].direction !== side) {
        const lot = open[0];
        const matched = Math.min(quantity, lot.remaining);
        emit(lot, f, matched);
        lot.remaining -= matched;
        quantity -= matched;
        if (lot.remaining === 0) open.shift();
      }

      // Anything left opens a new lot — including the far side of a reversal.
      if (quantity > 0) open.push({ fill: f, remaining: quantity, direction: side });
    }

    // Still held at the end of the book: rows with no exit yet.
    for (const lot of open) emit(lot, null, lot.remaining);
  }

  return lots;
}
