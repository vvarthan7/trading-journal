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
 *
 * Charges are levied per order, so each order's are split across the lots it touched, pro rata
 * by quantity. A lot carries its share of its entry order plus, once closed, its exit order.
 */
import type { Direction } from "../types";
import type { OrderCharges, SmartApiFill } from "./smartapi";
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

  /** Option identity, straight off the entry fill. See `optionIdentity` below. */
  underlying: string;
  expiry: string | null;
  strike: number | null;
  optionType: string;
  lotSize: number | null;

  /** This lot's share of its orders' charges. Null when any order it touched was not priced. */
  brokerage: number | null;
  /** Exchange charges, STT, stamp duty, SEBI fees and GST — everything but brokerage. */
  txnCharges: number | null;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * SmartAPI's "30SEP2025" → "2025-09-30". Returns null for anything that does not parse, which
 * includes the empty string equity fills carry.
 */
function expiryIso(raw: string): string | null {
  const m = /^(\d{1,2})([A-Z]{3})(\d{4})$/.exec(raw.trim().toUpperCase());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]);
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/**
 * The five option fields the broker sends and the app used to discard, normalised.
 *
 * `strikeprice` is -1 on non-option fills and has been seen carrying paise rather than rupees,
 * so it is floored at 0 and only trusted for rows that actually carry an option type. Everything
 * here degrades to empty rather than throwing: a missing field costs a basket suggestion, and
 * that is a far better outcome than a sync that fails.
 */
function optionIdentity(f: SmartApiFill) {
  const optionType = (f.optiontype ?? "").trim().toUpperCase();
  const strike = Number(f.strikeprice);
  return {
    underlying: (f.symbolgroup ?? "").trim().toUpperCase(),
    expiry: expiryIso(f.expirydate ?? ""),
    strike: optionType && Number.isFinite(strike) && strike > 0 ? strike : null,
    optionType: optionType === "CE" || optionType === "PE" ? optionType : "",
    lotSize: Number(f.marketlot) > 0 ? Number(f.marketlot) : null,
  };
}

/** An entry fill with quantity still unmatched. */
interface OpenLot {
  fill: SmartApiFill;
  remaining: number;
  direction: Direction;
}

/** Paise, so a split never stores a fraction of one. */
function paise(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toLots(
  fills: SmartApiFill[],
  charges: Record<string, OrderCharges> | null = null
): TradeLot[] {
  /** Each order's filled quantity — the denominator its charges are split over. */
  const orderQty = new Map<string, number>();
  for (const f of fills) {
    orderQty.set(f.orderid, (orderQty.get(f.orderid) ?? 0) + (Number(f.fillsize) || 0));
  }

  /** `quantity`'s share of one order's charges, or null if the order was not priced. */
  const shareOf = (orderId: string, quantity: number): OrderCharges | null => {
    const c = charges?.[orderId];
    const total = orderQty.get(orderId) ?? 0;
    if (!c || total <= 0) return null;
    return { brokerage: (c.brokerage * quantity) / total, total: (c.total * quantity) / total };
  };

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

      const entryShare = shareOf(entry.fill.orderid, quantity);
      const exitShare = exit ? shareOf(exit.orderid, quantity) : null;
      const priced = entryShare !== null && (exit === null || exitShare !== null);
      const brokerage = (entryShare?.brokerage ?? 0) + (exitShare?.brokerage ?? 0);
      const total = (entryShare?.total ?? 0) + (exitShare?.total ?? 0);

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

        ...optionIdentity(entry.fill),

        brokerage: priced ? paise(brokerage) : null,
        txnCharges: priced ? paise(total - brokerage) : null,
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
