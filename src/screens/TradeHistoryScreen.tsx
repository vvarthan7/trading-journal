/**
 * Every lot ever stored, straight out of `public.trades`.
 *
 * Deliberately has no broker path: the SmartAPI trade book only ever returns the current
 * session, so history can only come from the database. `TradesScreen` is the same table scoped
 * to today, and owns the sync.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useJournal } from "../store";
import { money, plain, price, rLabel, shortDay } from "../lib/format";
import { PillGroup, WIN, LOSS } from "../components/ui";

type Filter = "all" | "winners" | "losers" | "open";

const FILTERS = [
  { value: "all" as const, label: "All" },
  { value: "winners" as const, label: "Winners" },
  { value: "losers" as const, label: "Losers" },
  { value: "open" as const, label: "Open" },
];

const COLS =
  "grid-cols-[62px_minmax(0,1.2fr)_70px_52px_42px_78px_78px_54px_54px_84px_76px_56px_86px]";

/** Shown wherever there is nothing yet — no exit, or no stop typed in. */
const DASH = "—";

/** The month pill's value for "no month filter". */
const ALL_MONTHS = "all";

/** yyyy-mm out of a yyyy-mm-dd trade date. */
function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(ym: string): string {
  return new Date(ym + "-01T00:00:00").toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

export default function TradeHistoryScreen() {
  const { dbTrades, tradesLoading, tradesError, reloadTrades, setTradeStop } = useJournal();
  const [filter, setFilter] = useState<Filter>("all");
  const [month, setMonth] = useState<string>(ALL_MONTHS);
  const [query, setQuery] = useState("");

  /** Newest month first. */
  const months = useMemo(() => {
    const seen = new Set(dbTrades.map((t) => monthOf(t.tradeDate)));
    return [...seen].sort().reverse();
  }, [dbTrades]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return dbTrades.filter((t) => {
      if (month !== ALL_MONTHS && monthOf(t.tradeDate) !== month) return false;
      if (needle && !t.instrument.toLowerCase().includes(needle)) return false;
      if (filter === "winners") return (t.pnl ?? 0) > 0;
      if (filter === "losers") return (t.pnl ?? 0) < 0;
      if (filter === "open") return t.open;
      return true;
    });
  }, [dbTrades, filter, month, query]);

  /** Totals for what is on screen, not for the whole table. */
  const net = rows.reduce((a, t) => a + (t.pnl ?? 0), 0);
  const closed = rows.filter((t) => t.pnl !== null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0).length;
  const winRate = closed.length === 0 ? null : Math.round((wins / closed.length) * 100);

  const status = tradesLoading
    ? "Loading stored trades…"
    : tradesError
      ? tradesError
      : `${dbTrades.length} ${dbTrades.length === 1 ? "lot" : "lots"} in the journal`;

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em] leading-[1.12]">
            Trade history
          </h1>
          <div className="text-[13px] text-muted">
            {rows.length} shown · every session stored, newest first
          </div>
        </div>
        <div className="flex items-center gap-4">
          <PillGroup options={FILTERS} value={filter} onChange={setFilter} />
          <Link
            to="/trades"
            className="px-4 py-2 text-[12.5px] rounded-md border border-line-strong text-dim no-underline transition-colors hover:text-ink"
          >
            Today
          </Link>
        </div>
      </header>

      {/* Status bar — reads Supabase only, so there is no broker button here. */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border border-line rounded-md bg-surface text-[12.5px]">
        <span className={tradesError ? "text-loss" : "text-muted"}>{status}</span>
        <div className="flex items-center gap-6">
          <span className="text-dim">
            Net{" "}
            <span className="font-medium" style={{ color: net >= 0 ? WIN : LOSS }}>
              {money(net)}
            </span>
          </span>
          <span className="text-dim">
            Win rate {winRate === null ? DASH : `${winRate}%`} · {closed.length} closed
          </span>
          <button
            type="button"
            onClick={() => void reloadTrades()}
            className="px-4 py-[5px] text-[12px] rounded-sm border border-line-strong bg-transparent text-muted cursor-pointer transition-colors hover:text-ink"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Month and instrument narrowing */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {[ALL_MONTHS, ...months].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonth(m)}
              className={[
                "px-4 py-[5px] text-[12px] rounded-sm border cursor-pointer transition-colors",
                month === m
                  ? "border-accent bg-[rgba(145,132,217,0.16)] text-accent-deep"
                  : "border-line-strong bg-transparent text-dim hover:text-ink",
              ].join(" ")}
            >
              {m === ALL_MONTHS ? "All time" : monthLabel(m)}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by instrument"
          className="w-[220px] px-4 py-[5px] text-[12px] rounded-sm border border-line-strong bg-transparent text-ink-2 focus:border-accent"
        />
      </div>

      {/* Table */}
      <div className="border border-line rounded-md overflow-hidden bg-surface">
        <div
          className={`grid ${COLS} gap-3 px-6 py-3 border-b border-line-strong text-[10.5px] tracking-[0.08em] uppercase text-dim`}
        >
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
          <span className="text-right">P&L</span>
        </div>

        {rows.map((t) => {
          const pnlColor = (t.pnl ?? 0) >= 0 ? WIN : LOSS;
          const rColor = (t.rr ?? 0) >= 0 ? WIN : LOSS;
          return (
            <div
              key={t.id}
              className={`grid ${COLS} gap-3 items-center px-6 py-[10px] border-b border-line-soft last:border-b-0 text-[12.5px] text-muted`}
            >
              <span>{shortDay(t.tradeDate)}</span>
              <span className="flex flex-col gap-[1px] min-w-0">
                <Link
                  to={`/trades/${t.id}`}
                  state={{ from: "/history" }}
                  className="text-ink font-medium text-[13px] truncate no-underline hover:text-accent-deep transition-colors"
                >
                  {t.instrument}
                </Link>
                <span className="text-[11px] text-dim">
                  {t.exchange} · {t.direction}
                </span>
              </span>
              <span className="text-dim">{t.type}</span>
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
                onChange={(e) =>
                  setTradeStop(t.id, e.target.value === "" ? null : Number(e.target.value))
                }
                className="w-full px-2 py-[3px] text-[12px] text-right rounded-sm border border-line-strong bg-transparent text-ink-2 focus:border-accent"
              />

              <span className="text-right">
                {t.initialRisk === null ? DASH : plain(t.initialRisk)}
              </span>
              <span className="text-right" style={{ color: t.rr === null ? undefined : rColor }}>
                {t.rr === null ? DASH : rLabel(t.rr)}
              </span>
              <span
                className="text-right text-[13.5px] font-medium"
                style={{ color: t.pnl === null ? undefined : pnlColor }}
              >
                {t.pnl === null ? <span className="text-dim">open</span> : money(t.pnl)}
              </span>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && !tradesLoading && (
        <div className="py-20 text-center text-[13.5px] text-dim">
          {dbTrades.length === 0
            ? "No trades stored yet. Sync a session on the Trades screen and it will show up here."
            : "No trades match these filters."}
        </div>
      )}
    </div>
  );
}
