/**
 * The lots-and-baskets table, shared by the Trades and Trade history screens.
 *
 * Those two screens are deliberate twins — same columns, same rows, different scope — and each
 * still owns its own header, filters and status bar. Only the table itself lives here, because
 * grouping gave it selection, expansion and two kinds of row, and that is too much intricate
 * behaviour to keep correct in two copies.
 *
 * A lot in no basket renders exactly as it always did, unless it is one of several lots that
 * together make one position — those fold into a single expandable row.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useJournal } from "../store";
import { money, plain, price, rLabel, shortDay } from "../lib/format";
import type { DbTrade } from "../lib/tradeRows";
import { chargesOf } from "../lib/tradeGroups";
import type { GroupDirection, PositionSummary, TableRow } from "../lib/tradeGroups";
import { classify, nameFor } from "../lib/basketSuggest";
import { TRADE_TYPES, effectiveType, shortType } from "../lib/tradeTypes";
import { WIN, LOSS } from "./ui";

/** Shown wherever there is nothing yet — no exit, or no stop typed in. */
const DASH = "—";

/** A leading 26px for the chevron or tick, and a wider Type column for the trade type. */
const COLS =
  "grid-cols-[26px_62px_minmax(0,1.2fr)_92px_52px_42px_78px_78px_54px_54px_84px_76px_56px_66px_86px]";

const DIRECTIONS: GroupDirection[] = ["long", "short", "neutral"];

const ROW = "grid gap-3 items-center px-6 py-[10px] border-b border-line-soft last:border-b-0";

/**
 * Baskets and positions wrap their row and its expanded lots in a div. Collapsed, the row is that
 * div's last child and loses its border to `last:`, so the wrapper carries the separator instead.
 */
const WRAP = "border-b border-line-soft last:border-b-0";

export default function TradesTable({ rows, from }: { rows: TableRow[]; from: string }) {
  const { setTradeStop, createGroup, session } = useJournal();

  /** Expanded rows, keyed `g<group id>` or `p<first lot id>` so the two id spaces never collide. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  /** Overrides stay null until typed, so the proposal tracks the selection as it changes. */
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [typeOverride, setTypeOverride] = useState<string | null>(null);
  const [dirOverride, setDirOverride] = useState<GroupDirection | null>(null);

  /**
   * Derived from the *filtered* rows, not from the tick marks alone. Ticking a row and then
   * filtering it away drops it from the selection rather than grouping something off screen,
   * and it comes back if the filter is undone.
   */
  const selected = useMemo(
    () =>
      rows.flatMap((r) =>
        r.kind === "lot"
          ? picked.has(r.trade.id)
            ? [r.trade]
            : []
          : r.kind === "position"
            ? r.summary.lots.filter((l) => picked.has(l.id))
            : []
      ),
    [rows, picked]
  );

  const auto = useMemo(() => classify(selected), [selected]);
  const draftName = nameOverride ?? (selected.length > 0 ? nameFor(selected, auto) : "");
  const draftType = typeOverride ?? auto.tradeType;
  const draftDirection = dirOverride ?? auto.direction;

  const toggleRow = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** A position is picked whole: its lots were one decision, so they join a basket together. */
  const togglePosition = (ids: number[]) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const all = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const clear = () => {
    setPicked(new Set());
    setNameOverride(null);
    setTypeOverride(null);
    setDirOverride(null);
  };

  const group = async () => {
    if (draftName.trim() === "" || selected.length < 2) return;
    setSaving(true);
    const id = await createGroup(
      { name: draftName.trim(), tradeType: draftType, direction: draftDirection },
      selected.map((t) => t.id)
    );
    setSaving(false);
    if (id !== null) clear();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Grouping bar — only once there are two legs to make a basket out of */}
      {selected.length >= 2 && (
        <div className="flex items-center gap-4 flex-wrap px-6 py-4 border border-accent rounded-md bg-[rgba(145,132,217,0.08)]">
          <span className="text-[12.5px] text-accent-deep font-medium">
            {selected.length} legs selected
          </span>
          <input
            value={draftName}
            onChange={(e) => setNameOverride(e.target.value)}
            placeholder="Name this trade"
            className="w-[240px] px-4 py-[5px] text-[12.5px] rounded-sm border border-line-strong bg-bg text-ink focus:border-accent"
          />
          <select
            value={draftType}
            onChange={(e) => setTypeOverride(e.target.value)}
            className="px-2 py-[5px] text-[12.5px] rounded-sm border border-line-strong bg-bg text-ink focus:border-accent"
          >
            <option value="">Trade type…</option>
            {TRADE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={draftDirection}
            onChange={(e) => setDirOverride(e.target.value as GroupDirection)}
            className="px-2 py-[5px] text-[12.5px] rounded-sm border border-line-strong bg-bg text-ink focus:border-accent"
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={saving || !session || draftName.trim() === ""}
            onClick={() => void group()}
            className="px-4 py-[5px] text-[12px] rounded-sm border border-accent bg-[rgba(145,132,217,0.16)] text-accent-deep cursor-pointer disabled:opacity-40 disabled:cursor-default"
          >
            {saving ? "Grouping…" : "Group as one trade"}
          </button>
          <button
            type="button"
            onClick={clear}
            className="px-4 py-[5px] text-[12px] rounded-sm border border-line-strong bg-transparent text-dim cursor-pointer transition-colors hover:text-ink"
          >
            Clear
          </button>
          {!session && <span className="text-[12px] text-dim">Sign in to group trades.</span>}
        </div>
      )}

      <div className="border border-line rounded-md overflow-hidden bg-surface">
        <div
          className={`grid ${COLS} gap-3 px-6 py-3 border-b border-line-strong text-[10.5px] tracking-[0.08em] uppercase text-dim`}
        >
          <span />
          <span>Date</span>
          <span>Instrument</span>
          <span>Type</span>
          <span>Qty</span>
          <span>Lot</span>
          <span>Entry</span>
          <span>Exit</span>
          <span>In</span>
          <span>Out</span>
          <span>Stop</span>
          <span className="text-right">Risk</span>
          <span className="text-right">R:R</span>
          <span className="text-right" title="Brokerage, exchange charges, STT, stamp duty, SEBI fees and GST">
            Charges
          </span>
          <span className="text-right">P&L</span>
        </div>

        {rows.map((row) =>
          row.kind === "group" ? (
            <div key={`g${row.group.id}`} className={WRAP}>
              {/* Basket: one trade, whatever it took to put it on */}
              <div className={`${ROW} ${COLS} text-[12.5px] text-muted bg-[rgba(145,132,217,0.05)]`}>
                <button
                  type="button"
                  aria-expanded={open.has(`g${row.group.id}`)}
                  aria-label={open.has(`g${row.group.id}`) ? "Collapse legs" : "Expand legs"}
                  onClick={() => toggleOpen(`g${row.group.id}`)}
                  className="border-0 bg-transparent p-0 text-[13px] text-dim cursor-pointer transition-colors hover:text-accent-deep"
                >
                  <i className={`ph ph-caret-${open.has(`g${row.group.id}`) ? "down" : "right"}`} />
                </button>
                <span>{shortDay(row.summary.tradeDate)}</span>
                <span className="flex flex-col gap-[1px] min-w-0">
                  <Link
                    to={`/groups/${row.group.id}`}
                    state={{ from }}
                    className="text-ink font-medium text-[13px] truncate no-underline hover:text-accent-deep transition-colors"
                  >
                    {row.group.name}
                  </Link>
                  <span className="text-[11px] text-dim">
                    {row.summary.legs.length} legs · {row.group.direction}
                  </span>
                </span>
                <span className="text-dim truncate" title={row.group.tradeType}>
                  {shortType(row.group.tradeType) || DASH}
                </span>
                <span>{row.summary.quantity}</span>
                <span>{DASH}</span>
                <span>{DASH}</span>
                <span>{DASH}</span>
                <span>{row.summary.entryTime || DASH}</span>
                <span>{row.summary.exitTime || DASH}</span>
                <span className="text-dim">{DASH}</span>
                <span
                  className="text-right"
                  title={row.summary.riskFromLegs ? "Summed from the legs' stops" : "Typed on the basket"}
                >
                  {row.summary.risk === null ? DASH : plain(row.summary.risk)}
                </span>
                <span
                  className="text-right"
                  style={{ color: row.summary.r === null ? undefined : row.summary.r >= 0 ? WIN : LOSS }}
                >
                  {row.summary.r === null ? DASH : rLabel(row.summary.r)}
                </span>
                <span
                  className="text-right"
                  title={row.summary.charges === null ? "Not known for every leg" : "Summed from the legs"}
                >
                  {row.summary.charges === null ? DASH : plain(row.summary.charges)}
                </span>
                <PnlCell
                  gross={row.summary.net}
                  net={row.summary.netAfterCharges}
                  className="text-[13.5px] font-medium"
                />
              </div>

              {open.has(`g${row.group.id}`) &&
                row.summary.legs.map((t) => <LegRow key={t.id} t={t} from={from} />)}
            </div>
          ) : row.kind === "position" ? (
            <PositionRow
              key={`p${row.summary.lots[0].id}`}
              p={row.summary}
              from={from}
              expanded={open.has(`p${row.summary.lots[0].id}`)}
              onExpand={() => toggleOpen(`p${row.summary.lots[0].id}`)}
              picked={row.summary.lots.every((l) => picked.has(l.id))}
              canPick={Boolean(session)}
              onPick={() => togglePosition(row.summary.lots.map((l) => l.id))}
              onStop={(v) => row.summary.lots.forEach((l) => setTradeStop(l.id, v))}
            />
          ) : (
            <LotRow
              key={row.trade.id}
              t={row.trade}
              from={from}
              picked={picked.has(row.trade.id)}
              onPick={() => toggleRow(row.trade.id)}
              onStop={(v) => setTradeStop(row.trade.id, v)}
              canPick={Boolean(session)}
            />
          )
        )}
      </div>
    </div>
  );
}

/**
 * One position the broker filled in several lots — scaled in, partially filled, or exited in
 * parts. Prices are size-weighted averages; the stop typed here is written to every lot, since
 * Postgres derives each lot's risk from its own stop. Expanding shows the lots as stored.
 */
function PositionRow({
  p,
  from,
  expanded,
  onExpand,
  picked,
  canPick,
  onPick,
  onStop,
}: {
  p: PositionSummary;
  from: string;
  expanded: boolean;
  onExpand: () => void;
  picked: boolean;
  canPick: boolean;
  onPick: () => void;
  onStop: (v: number | null) => void;
}) {
  const first = p.lots[0];
  return (
    <div className={WRAP}>
      <div className={`${ROW} ${COLS} text-[12.5px] text-muted`}>
        <input
          type="checkbox"
          checked={picked}
          disabled={!canPick}
          onChange={onPick}
          aria-label={`Select ${p.instrument} for grouping`}
          className="w-[13px] h-[13px] accent-accent-deep cursor-pointer disabled:cursor-default"
        />
        <span>{shortDay(p.tradeDate)}</span>
        <span className="flex flex-col gap-[1px] min-w-0">
          <Link
            to={`/trades/${first.id}`}
            state={{ from }}
            className="text-ink font-medium text-[13px] truncate no-underline hover:text-accent-deep transition-colors"
          >
            {p.instrument}
          </Link>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onExpand}
            className="self-start border-0 bg-transparent p-0 text-[11px] text-dim cursor-pointer transition-colors hover:text-accent-deep"
          >
            <i className={`ph ph-caret-${expanded ? "down" : "right"}`} /> {p.lots.length} lots ·{" "}
            {p.exchange} · {p.direction}
          </button>
        </span>
        <span className="text-dim truncate" title={effectiveType(first)}>
          {shortType(effectiveType(first))}
        </span>
        <span>{p.quantity}</span>
        <span>{p.lot ?? DASH}</span>
        <span title="Size-weighted average">{price(p.entryPrice)}</span>
        <span title="Size-weighted average">{p.exitPrice === null ? DASH : price(p.exitPrice)}</span>
        <span>{p.entryTime || DASH}</span>
        <span>{p.exitTime || DASH}</span>

        <input
          type="number"
          step="0.05"
          inputMode="decimal"
          value={p.stop ?? ""}
          placeholder={p.mixedStop ? "mixed" : DASH}
          title="Applies to every lot in this position"
          onChange={(e) => onStop(e.target.value === "" ? null : Number(e.target.value))}
          className="w-full px-2 py-[3px] text-[12px] text-right rounded-sm border border-line-strong bg-transparent text-ink-2 focus:border-accent"
        />

        <span className="text-right">{p.risk === null ? DASH : plain(p.risk)}</span>
        <span className="text-right" style={{ color: p.r === null ? undefined : p.r >= 0 ? WIN : LOSS }}>
          {p.r === null ? DASH : rLabel(p.r)}
        </span>
        <span className="text-right" title={p.charges === null ? "Not known for every lot" : "Summed from the lots"}>
          {p.charges === null ? DASH : plain(p.charges)}
        </span>
        <PnlCell gross={p.net} net={p.netAfterCharges} className="text-[13.5px] font-medium" />
      </div>

      {expanded && p.lots.map((t) => <LegRow key={t.id} t={t} from={from} />)}
    </div>
  );
}

/** A leg inside a basket or a position: the same facts, indented and dimmed, still openable. */
function LegRow({ t, from }: { t: DbTrade; from: string }) {
  return (
    <div className={`${ROW} ${COLS} text-[12px] text-dim bg-bg`}>
      <span />
      <span className="pl-4">↳</span>
      <span className="flex flex-col gap-[1px] min-w-0">
        <Link
          to={`/trades/${t.id}`}
          state={{ from }}
          className="text-ink-2 text-[12.5px] truncate no-underline hover:text-accent-deep transition-colors"
        >
          {t.instrument}
        </Link>
        <span className="text-[11px] text-dim">
          {t.exchange} · {t.direction}
        </span>
      </span>
      <span className="truncate" title={effectiveType(t)}>
        {shortType(effectiveType(t))}
      </span>
      <span>{t.quantity}</span>
      <span>{t.lot ?? DASH}</span>
      <span>{price(t.entryPrice)}</span>
      <span>{t.exitPrice === null ? DASH : price(t.exitPrice)}</span>
      <span>{t.entryTime || DASH}</span>
      <span>{t.exitTime || DASH}</span>
      <span>{t.stopPrice === null ? DASH : price(t.stopPrice)}</span>
      <span className="text-right">{t.initialRisk === null ? DASH : plain(t.initialRisk)}</span>
      <span className="text-right">{t.rr === null ? DASH : rLabel(t.rr)}</span>
      <ChargesCell t={t} />
      <PnlCell gross={t.pnl} net={t.netPnl} className="text-[12.5px]" />
    </div>
  );
}

/** A lot in no basket — a trade on its own, exactly as this table has always shown one. */
function LotRow({
  t,
  from,
  picked,
  canPick,
  onPick,
  onStop,
}: {
  t: DbTrade;
  from: string;
  picked: boolean;
  canPick: boolean;
  onPick: () => void;
  onStop: (v: number | null) => void;
}) {
  const rColor = (t.rr ?? 0) >= 0 ? WIN : LOSS;

  return (
    <div className={`${ROW} ${COLS} text-[12.5px] text-muted`}>
      <input
        type="checkbox"
        checked={picked}
        disabled={!canPick}
        onChange={onPick}
        aria-label={`Select ${t.instrument} for grouping`}
        className="w-[13px] h-[13px] accent-accent-deep cursor-pointer disabled:cursor-default"
      />
      <span>{shortDay(t.tradeDate)}</span>
      <span className="flex flex-col gap-[1px] min-w-0">
        <Link
          to={`/trades/${t.id}`}
          state={{ from }}
          className="text-ink font-medium text-[13px] truncate no-underline hover:text-accent-deep transition-colors"
        >
          {t.instrument}
        </Link>
        <span className="text-[11px] text-dim">
          {t.exchange} · {t.direction}
        </span>
      </span>
      <span className="text-dim truncate" title={effectiveType(t)}>
        {shortType(effectiveType(t))}
      </span>
      <span>{t.quantity}</span>
      <span>{t.lot ?? DASH}</span>
      <span>{price(t.entryPrice)}</span>
      <span>{t.exitPrice === null ? DASH : price(t.exitPrice)}</span>
      <span>{t.entryTime || DASH}</span>
      <span>{t.exitTime || DASH}</span>

      {/* The one hand-entered field. Postgres derives Risk and R:R from it. */}
      <input
        type="number"
        step="0.05"
        inputMode="decimal"
        value={t.stopPrice ?? ""}
        placeholder={DASH}
        onChange={(e) => onStop(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full px-2 py-[3px] text-[12px] text-right rounded-sm border border-line-strong bg-transparent text-ink-2 focus:border-accent"
      />

      <span className="text-right">{t.initialRisk === null ? DASH : plain(t.initialRisk)}</span>
      <span className="text-right" style={{ color: t.rr === null ? undefined : rColor }}>
        {t.rr === null ? DASH : rLabel(t.rr)}
      </span>
      <ChargesCell t={t} />
      <PnlCell gross={t.pnl} net={t.netPnl} className="text-[13.5px] font-medium" />
    </div>
  );
}

/** A lot's charges, with the brokerage / everything-else split on hover. */
function ChargesCell({ t }: { t: DbTrade }) {
  const c = chargesOf(t);
  return (
    <span
      className="text-right"
      title={
        c === null
          ? "Not synced with charges"
          : `Brokerage ${plain(t.brokerage ?? 0)} · taxes & fees ${plain(t.txnCharges ?? 0)}`
      }
    >
      {c === null ? DASH : plain(c)}
    </span>
  );
}

/** Gross P&L, and the net after charges beneath it once the charges are known. */
function PnlCell({ gross, net, className }: { gross: number | null; net: number | null; className: string }) {
  if (gross === null) {
    return <span className={`text-right text-dim ${className}`}>open</span>;
  }
  return (
    <span className="text-right flex flex-col gap-[1px]">
      <span className={className} style={{ color: gross >= 0 ? WIN : LOSS }}>
        {money(gross)}
      </span>
      {net !== null && (
        <span className="text-[11px]" style={{ color: net >= 0 ? WIN : LOSS }}>
          net {money(net)}
        </span>
      )}
    </span>
  );
}
