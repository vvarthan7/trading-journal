/**
 * Everything hand-entered about a trade — the idea, the notes and the strategies used — from
 * `public.trade_details`. See `supabase/trade_details.sql` and `trade_details_strategies.sql`.
 *
 * All three are rows in one table separated by `kind`; the only difference is how many there
 * may be. A trade has at most one 'idea' (a partial unique index enforces it), any number of
 * 'note' rows, and one 'strategy' row per strategy selected — a multi-select is rows, not an
 * array. Facts about the trade — instrument, entry price, quantity, P&L — stay in `trades` and
 * reach the screen through `dbTrades`.
 *
 * Scoped to one trade and read only on its detail screen, so unlike `trades` and
 * `journal_entries` this does not live in the store: loading every note for every trade at boot
 * would be work nothing asks for.
 */
import { supabase } from "./supabase";

/** RLS rejects a write by matching zero rows rather than erroring. */
const NOT_SAVED = "Not saved — are you still signed in?";

export type DetailKind = "idea" | "note" | "strategy";

/** A `trade_details` row as Supabase returns it. */
interface TradeDetailRow {
  id: number;
  trade_id: number;
  kind: DetailKind;
  body: string;
  created_at: string;
  updated_at: string;
}

/** One piece of writing about a trade. */
export interface TradeDetail {
  id: number;
  kind: DetailKind;
  body: string;
  createdAt: string;
  /** Later than `createdAt` once it has been edited. */
  updatedAt: string;
}

function fromRow(r: TradeDetailRow): TradeDetail {
  return {
    id: r.id,
    kind: r.kind,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Everything on a trade, oldest first. One read serves both panels and the chips. */
export async function listDetails(tradeId: number): Promise<TradeDetail[]> {
  const { data, error } = await supabase
    .from("trade_details")
    .select("*")
    .eq("trade_id", tradeId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as TradeDetailRow[]).map(fromRow);
}

/** Returns the stored row, so the caller can show it without a second read. */
export async function addDetail(
  tradeId: number,
  kind: DetailKind,
  body: string
): Promise<TradeDetail> {
  const { data, error } = await supabase
    .from("trade_details")
    .insert({ trade_id: tradeId, kind, body: body.trim() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data as TradeDetailRow);
}

export async function editDetail(id: number, body: string): Promise<void> {
  const { data, error } = await supabase
    .from("trade_details")
    .update({ body: body.trim() })
    .eq("id", id)
    .select("id");
  if (error || !data.length) throw new Error(error?.message ?? NOT_SAVED);
}

export async function removeDetail(id: number): Promise<void> {
  const { data, error } = await supabase
    .from("trade_details")
    .delete()
    .eq("id", id)
    .select("id");
  if (error || !data.length) throw new Error(error?.message ?? NOT_SAVED);
}

/**
 * Write the trade's idea, whatever state it is in: create the row, update it, or — when the box
 * has been emptied — delete it, since `body` may not be blank. Returns the row's id, or null if
 * there is no longer one.
 *
 * Done here rather than with an upsert because the uniqueness is a *partial* index
 * (`where kind = 'idea'`), and PostgREST's on-conflict cannot name an index predicate.
 */
export async function saveIdea(
  tradeId: number,
  existingId: number | null,
  body: string
): Promise<number | null> {
  const text = body.trim();
  if (!text) {
    if (existingId !== null) await removeDetail(existingId);
    return null;
  }
  if (existingId === null) return (await addDetail(tradeId, "idea", text)).id;
  await editDetail(existingId, text);
  return existingId;
}
