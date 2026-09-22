/**
 * Trade baskets: the `trade_groups` row mapping, and every number derived from a basket.
 *
 * Nothing here reads the database. A basket's net P&L is the sum of its legs and is computed in
 * the app rather than in Postgres, because every leg is already loaded in `dbTrades` — a view or
 * a generated column would be a second source of truth for a number we can add up for free.
 *
 * Derived numbers live in lib, not in components, the same rule `format.ts` follows.
 */
import type { DbTrade } from "./tradeRows";

export type GroupDirection = "long" | "short" | "neutral";

/** A `trade_groups` row as Supabase returns it. */
export interface TradeGroupRow {
  id: number;
  user_id: string;
  trade_date: string;
  name: string;
  trade_type: string;
  direction: GroupDirection;
  risk_amount: number | string | null;
  created_at: string;
  updated_at: string;
}

/** One basket, as the app uses it. */
export interface TradeGroup {
  id: number;
  tradeDate: string;
  name: string;
  tradeType: string;
  direction: GroupDirection;
  /** Hand-typed. Null means "add up the legs' own risk instead". */
  riskAmount: number | null;
}

/** What `createGroup` needs; the date comes from the legs, the id from Postgres. */
export type GroupDraft = Pick<TradeGroup, "name" | "tradeType" | "direction">;

/** PostgREST hands back `numeric` as a string, exactly as in `tradeRows.ts`. */
function num(v: number | string | null): number | null {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fromRow(r: TradeGroupRow): TradeGroup {
  return {
    id: r.id,
    tradeDate: r.trade_date,
    name: r.name,
    tradeType: r.trade_type ?? "",
    direction: r.direction,
    riskAmount: num(r.risk_amount),
  };
}

/** Only the keys actually present are written, so one field's edit never clears another's. */
export function toRow(patch: Partial<TradeGroup>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("name" in patch) row.name = patch.name;
  if ("tradeType" in patch) row.trade_type = patch.tradeType;
  if ("direction" in patch) row.direction = patch.direction;
  if ("riskAmount" in patch) row.risk_amount = patch.riskAmount;
  return row;
}

/** Everything a basket's row needs to render, computed once. */
export interface GroupSummary {
  legs: DbTrade[];
  /** Σ leg P&L. Null while any leg is still open — a half-closed basket has no result yet. */
  net: number | null;
  open: boolean;
  /** The hand-typed basket risk, or the legs' summed `initial_risk` when none was typed. */
  risk: number | null;
  /** True when `risk` came from the legs rather than from the basket. */
  riskFromLegs: boolean;
  /** net ÷ risk. Null unless both are known and risk is non-zero. */
  r: number | null;
  /** The earliest leg's date and entry time — where the basket sits in a table. */
  tradeDate: string;
  entryTime: string;
  exitTime: string;
  quantity: number;
}

/**
 * A basket's numbers.
 *
 * Risk is the one place a basket cannot just add its legs up: hedging means the legs offset, so
 * summing per-leg stops overstates what was actually at risk. The hand-typed figure wins
 * whenever there is one; the sum is only a fallback for baskets where stops were typed per leg.
 */
export function summarise(group: TradeGroup, legs: DbTrade[]): GroupSummary {
  const open = legs.some((l) => l.open);
  const net = open ? null : legs.reduce((a, l) => a + (l.pnl ?? 0), 0);

  const legRisk = legs.reduce((a, l) => a + (l.initialRisk ?? 0), 0);
  const riskFromLegs = group.riskAmount === null;
  const risk = riskFromLegs ? (legRisk > 0 ? legRisk : null) : group.riskAmount;

  const entries = legs.map((l) => l.entryTime).filter(Boolean).sort();
  const exits = legs.map((l) => l.exitTime).filter(Boolean).sort();
  const dates = legs.map((l) => l.tradeDate).filter(Boolean).sort();

  return {
    legs,
    net,
    open,
    risk,
    riskFromLegs,
    r: net === null || risk === null || risk === 0 ? null : net / risk,
    tradeDate: dates[0] ?? group.tradeDate,
    entryTime: entries[0] ?? "",
    exitTime: open ? "" : (exits[exits.length - 1] ?? ""),
    quantity: legs.reduce((a, l) => a + l.quantity, 0),
  };
}

/** One row of a trades table: a basket with its legs, or a lot that is in no basket. */
export type TableRow =
  | { kind: "group"; group: TradeGroup; summary: GroupSummary }
  | { kind: "lot"; trade: DbTrade };

/** Newest first, matching the order `loadTrades` asks Postgres for. */
function sortKey(row: TableRow): string {
  if (row.kind === "lot") return `${row.trade.tradeDate} ${row.trade.entryTime}`;
  return `${row.summary.tradeDate} ${row.summary.entryTime}`;
}

/**
 * Fold lots into baskets. A lot with no `groupId` comes back untouched as a `lot` row and
 * renders through the table's existing markup — with no baskets created, this returns exactly
 * the list it was given.
 *
 * A basket sits where its earliest leg's entry is, so grouping never moves a trade in the table.
 * A group whose legs have all been removed is dropped rather than rendered empty.
 */
export function buildRows(trades: DbTrade[], groups: TradeGroup[]): TableRow[] {
  const legsByGroup = new Map<number, DbTrade[]>();
  const rows: TableRow[] = [];

  for (const t of trades) {
    if (t.groupId === null) {
      rows.push({ kind: "lot", trade: t });
      continue;
    }
    const bucket = legsByGroup.get(t.groupId);
    if (bucket) bucket.push(t);
    else legsByGroup.set(t.groupId, [t]);
  }

  for (const g of groups) {
    const legs = legsByGroup.get(g.id);
    if (legs && legs.length > 0) rows.push({ kind: "group", group: g, summary: summarise(g, legs) });
  }

  return rows.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

/** A basket counts once, not once per leg — the whole point of grouping. */
export interface TableStats {
  net: number;
  trades: number;
  lots: number;
  closed: number;
  wins: number;
  winRate: number | null;
}

export function statsOf(rows: TableRow[]): TableStats {
  let net = 0;
  let lots = 0;
  let closed = 0;
  let wins = 0;

  for (const row of rows) {
    const pnl = row.kind === "lot" ? row.trade.pnl : row.summary.net;
    lots += row.kind === "lot" ? 1 : row.summary.legs.length;
    net += pnl ?? 0;
    if (pnl !== null) {
      closed += 1;
      if (pnl > 0) wins += 1;
    }
  }

  return {
    net,
    trades: rows.length,
    lots,
    closed,
    wins,
    winRate: closed === 0 ? null : Math.round((wins / closed) * 100),
  };
}
