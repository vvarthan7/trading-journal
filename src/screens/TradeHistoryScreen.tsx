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
import { money, plain } from "../lib/format";
import { buildRows, rowDate, rowOpen, rowPnl, statsOf } from "../lib/tradeGroups";
import TradesTable from "../components/TradesTable";
import BasketSuggestions from "../components/BasketSuggestions";
import { PillGroup, WIN, LOSS } from "../components/ui";

type Filter = "all" | "winners" | "losers" | "open";

const FILTERS = [
  { value: "all" as const, label: "All" },
  { value: "winners" as const, label: "Winners" },
  { value: "losers" as const, label: "Losers" },
  { value: "open" as const, label: "Open" },
];

/** Shown wherever there is nothing yet — here, a win rate with nothing closed to compute it. */
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
  const { dbTrades, tradeGroups, tradesLoading, tradesError, reloadTrades } = useJournal();
  const [filter, setFilter] = useState<Filter>("all");
  const [month, setMonth] = useState<string>(ALL_MONTHS);
  const [query, setQuery] = useState("");

  /** Newest month first. */
  const months = useMemo(() => {
    const seen = new Set(dbTrades.map((t) => monthOf(t.tradeDate)));
    return [...seen].sort().reverse();
  }, [dbTrades]);

  /** Baskets and positions fold their lots in before anything is filtered, so each filters as one trade. */
  const all = useMemo(() => buildRows(dbTrades, tradeGroups), [dbTrades, tradeGroups]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((row) => {
      const date = rowDate(row);
      if (month !== ALL_MONTHS && monthOf(date) !== month) return false;

      if (needle) {
        // A basket matches on its own name or on any leg's instrument.
        const hay =
          row.kind === "lot"
            ? row.trade.instrument
            : row.kind === "position"
              ? row.summary.instrument
              : [row.group.name, ...row.summary.legs.map((l) => l.instrument)].join(" ");
        if (!hay.toLowerCase().includes(needle)) return false;
      }

      const pnl = rowPnl(row);
      const isOpen = rowOpen(row);
      if (filter === "winners") return (pnl ?? 0) > 0;
      if (filter === "losers") return (pnl ?? 0) < 0;
      if (filter === "open") return isOpen;
      return true;
    });
  }, [all, filter, month, query]);

  /** Totals for what is on screen, not for the whole table. A basket counts once. */
  const { net, charges, netAfterCharges, uncharged, closed, winRate } = statsOf(rows);
  const total = statsOf(all);

  const status = tradesLoading
    ? "Loading stored trades…"
    : tradesError
      ? tradesError
      : `${total.trades} ${total.trades === 1 ? "trade" : "trades"} · ${total.lots} ${total.lots === 1 ? "lot" : "lots"} in the journal`;

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
            Gross{" "}
            <span className="font-medium" style={{ color: net >= 0 ? WIN : LOSS }}>
              {money(net)}
            </span>
          </span>
          <span
            className="text-dim"
            title={
              uncharged > 0
                ? `${uncharged} closed ${uncharged === 1 ? "trade has" : "trades have"} no charges stored, so net is overstated`
                : "Brokerage, exchange charges, STT, stamp duty, SEBI fees and GST"
            }
          >
            Charges <span className="text-ink-2">{plain(charges)}</span>
            {uncharged > 0 && <span className="text-warn"> · {uncharged} missing</span>}
          </span>
          <span className="text-dim">
            Net{" "}
            <span className="font-medium" style={{ color: netAfterCharges >= 0 ? WIN : LOSS }}>
              {money(netAfterCharges)}
            </span>
          </span>
          <span className="text-dim">
            Win rate {winRate === null ? DASH : `${winRate}%`} · {closed} closed
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

      {/* Baskets worth making out of what is already stored */}
      <BasketSuggestions scope="all" />

      <TradesTable rows={rows} from="/history" />

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
