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

/** A lot's brokerage plus its other charges, or null unless both are known. */
export function chargesOf(t: DbTrade): number | null {
  return t.brokerage === null || t.txnCharges === null ? null : t.brokerage + t.txnCharges;
}

/** Everything a basket's row needs to render, computed once. */
export interface GroupSummary {
  legs: DbTrade[];
  /** Σ leg P&L. Null while any leg is still open — a half-closed basket has no result yet. */
  net: number | null;
  /** Σ leg charges. Null unless every leg's are known — a partial sum would flatter the basket. */
  charges: number | null;
  /** net less charges. Null while open or while any leg's charges are unknown. */
  netAfterCharges: number | null;
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
  const legCharges = legs.map(chargesOf);
  const charges = legCharges.some((c) => c === null)
    ? null
    : legCharges.reduce<number>((a, c) => a + (c ?? 0), 0);

  const legRisk = legs.reduce((a, l) => a + (l.initialRisk ?? 0), 0);
  const riskFromLegs = group.riskAmount === null;
  const risk = riskFromLegs ? (legRisk > 0 ? legRisk : null) : group.riskAmount;

  const entries = legs.map((l) => l.entryTime).filter(Boolean).sort();
  const exits = legs.map((l) => l.exitTime).filter(Boolean).sort();
  const dates = legs.map((l) => l.tradeDate).filter(Boolean).sort();

  return {
    legs,
    net,
    charges,
    netAfterCharges: net === null || charges === null ? null : net - charges,
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

/**
 * Several lots of one instrument, held from flat back to flat: one trade the broker filled in
 * pieces. Scaling in, a partially filled order, or exiting in parts each split a position into
 * lots, because `public.trades` stores one row per entry lot. This folds them back together for
 * display only — the lots stay exactly as stored, and nothing about them is written.
 */
export interface PositionSummary {
  /** Oldest entry first. */
  lots: DbTrade[];
  instrument: string;
  exchange: string;
  direction: DbTrade["direction"];
  tradeDate: string;
  entryTime: string;
  exitTime: string;
  quantity: number;
  /** Σ lots, or null when any lot has no lot count (equity). */
  lot: number | null;
  /** Size-weighted average. */
  entryPrice: number;
  /** Size-weighted average; null while any lot is open. */
  exitPrice: number | null;
  /** The stop every lot shares, or null when none is typed or they differ. */
  stop: number | null;
  /** True when lots carry different stops, so no single stop can be shown. */
  mixedStop: boolean;
  /** Σ lot risk, or null unless every lot has one — a partial sum would flatter the R. */
  risk: number | null;
  r: number | null;
  /** Σ lot P&L. Null while any lot is open, the same rule a basket follows. */
  net: number | null;
  charges: number | null;
  netAfterCharges: number | null;
  open: boolean;
}

function summarisePosition(lots: DbTrade[]): PositionSummary {
  const open = lots.some((l) => l.open);
  const quantity = lots.reduce((a, l) => a + l.quantity, 0);
  const weighted = (f: (l: DbTrade) => number) =>
    quantity === 0 ? 0 : lots.reduce((a, l) => a + f(l) * l.quantity, 0) / quantity;

  const net = open ? null : lots.reduce((a, l) => a + (l.pnl ?? 0), 0);
  const legCharges = lots.map(chargesOf);
  const charges = legCharges.some((c) => c === null)
    ? null
    : legCharges.reduce<number>((a, c) => a + (c ?? 0), 0);

  const stops = new Set(lots.map((l) => l.stopPrice));
  const risk = lots.every((l) => l.initialRisk !== null)
    ? lots.reduce((a, l) => a + (l.initialRisk ?? 0), 0)
    : null;
  const exits = lots.map((l) => l.exitTime).filter(Boolean).sort();

  return {
    lots,
    instrument: lots[0].instrument,
    exchange: lots[0].exchange,
    direction: lots[0].direction,
    tradeDate: lots[0].tradeDate,
    entryTime: lots[0].entryTime,
    exitTime: open ? "" : (exits[exits.length - 1] ?? ""),
    quantity,
    lot: lots.every((l) => l.lot !== null) ? lots.reduce((a, l) => a + (l.lot ?? 0), 0) : null,
    entryPrice: weighted((l) => l.entryPrice),
    exitPrice: open ? null : weighted((l) => l.exitPrice ?? 0),
    stop: stops.size === 1 ? lots[0].stopPrice : null,
    mixedStop: stops.size > 1,
    risk,
    r: net === null || risk === null || risk === 0 ? null : net / risk,
    net,
    charges,
    netAfterCharges: net === null || charges === null ? null : net - charges,
    open,
  };
}

/**
 * Split lots into positions. Lots of one instrument, direction and day belong together while
 * their holding periods overlap: FIFO matching means a position's lots always chain, and the
 * first lot entered after everything before it was closed starts a new position. A lot still
 * open holds its position open to the end of the day.
 *
 * Times are to the minute, so a position flattened and re-entered within the same minute reads
 * as one. That errs towards fewer rows, which is the safer mistake here.
 */
function positionsOf(lots: DbTrade[]): DbTrade[][] {
  const buckets = new Map<string, DbTrade[]>();
  for (const t of lots) {
    const key = `${t.tradeDate}|${t.exchange}|${t.instrument}|${t.direction}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(t);
    else buckets.set(key, [t]);
  }

  const positions: DbTrade[][] = [];
  for (const bucket of buckets.values()) {
    const sorted = [...bucket].sort(
      (a, b) => a.entryTime.localeCompare(b.entryTime) || a.id - b.id
    );
    let current: DbTrade[] = [];
    let heldUntil = "";
    for (const t of sorted) {
      if (current.length > 0 && t.entryTime > heldUntil) {
        positions.push(current);
        current = [];
        heldUntil = "";
      }
      current.push(t);
      const until = t.open ? "99:99" : t.exitTime;
      if (until > heldUntil) heldUntil = until;
    }
    if (current.length > 0) positions.push(current);
  }
  return positions;
}

/**
 * One row of a trades table: a basket with its legs, a position folded from several lots, or a
 * lot that is a trade on its own.
 */
export type TableRow =
  | { kind: "group"; group: TradeGroup; summary: GroupSummary }
  | { kind: "position"; summary: PositionSummary }
  | { kind: "lot"; trade: DbTrade };

/** Gross P&L of whatever the row is. Null while open. */
export function rowPnl(row: TableRow): number | null {
  return row.kind === "lot" ? row.trade.pnl : row.summary.net;
}

export function rowOpen(row: TableRow): boolean {
  return row.kind === "lot" ? row.trade.open : row.summary.open;
}

export function rowDate(row: TableRow): string {
  return row.kind === "lot" ? row.trade.tradeDate : row.summary.tradeDate;
}

/** Newest first, matching the order `loadTrades` asks Postgres for. */
function sortKey(row: TableRow): string {
  if (row.kind === "lot") return `${row.trade.tradeDate} ${row.trade.entryTime}`;
  return `${row.summary.tradeDate} ${row.summary.entryTime}`;
}

/**
 * Fold lots into baskets and positions. A lot with no `groupId` that is the whole of its
 * position comes back untouched as a `lot` row and renders through the table's existing markup.
 * Lots that together make one position become a single `position` row; lots in a basket stay in
 * the basket, which is the grouping you chose by hand and always wins.
 *
 * A basket sits where its earliest leg's entry is, so grouping never moves a trade in the table.
 * A group whose legs have all been removed is dropped rather than rendered empty.
 */
export function buildRows(trades: DbTrade[], groups: TradeGroup[]): TableRow[] {
  const legsByGroup = new Map<number, DbTrade[]>();
  const loose: DbTrade[] = [];
  const rows: TableRow[] = [];

  for (const t of trades) {
    if (t.groupId === null) {
      loose.push(t);
      continue;
    }
    const bucket = legsByGroup.get(t.groupId);
    if (bucket) bucket.push(t);
    else legsByGroup.set(t.groupId, [t]);
  }

  for (const lots of positionsOf(loose)) {
    if (lots.length === 1) rows.push({ kind: "lot", trade: lots[0] });
    else rows.push({ kind: "position", summary: summarisePosition(lots) });
  }

  for (const g of groups) {
    const legs = legsByGroup.get(g.id);
    if (legs && legs.length > 0) rows.push({ kind: "group", group: g, summary: summarise(g, legs) });
  }

  return rows.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

/** A basket or a position counts once, not once per lot — the whole point of grouping. */
export interface TableStats {
  /** Gross, before any charge. */
  net: number;
  /** Σ charges on closed trades whose charges are known. */
  charges: number;
  /** net less charges. Only exact when `uncharged` is 0. */
  netAfterCharges: number;
  /** Closed trades with no charges stored — synced before charges were, or unpriced. */
  uncharged: number;
  trades: number;
  lots: number;
  closed: number;
  wins: number;
  winRate: number | null;
}

export function statsOf(rows: TableRow[]): TableStats {
  let net = 0;
  let charges = 0;
  let uncharged = 0;
  let lots = 0;
  let closed = 0;
  let wins = 0;

  for (const row of rows) {
    const pnl = rowPnl(row);
    lots +=
      row.kind === "lot" ? 1 : row.kind === "group" ? row.summary.legs.length : row.summary.lots.length;
    net += pnl ?? 0;
    if (pnl !== null) {
      const c = row.kind === "lot" ? chargesOf(row.trade) : row.summary.charges;
      if (c === null) uncharged += 1;
      else charges += c;
      closed += 1;
      if (pnl > 0) wins += 1;
    }
  }

  return {
    net,
    charges,
    netAfterCharges: net - charges,
    uncharged,
    trades: rows.length,
    lots,
    closed,
    wins,
    winRate: closed === 0 ? null : Math.round((wins / closed) * 100),
  };
}
