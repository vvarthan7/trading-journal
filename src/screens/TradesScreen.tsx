import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useJournal } from "../store";
import { longDay, todayIso } from "../lib/format";
import { buildRows } from "../lib/tradeGroups";
import TradesTable from "../components/TradesTable";
import BasketSuggestions from "../components/BasketSuggestions";
import { PillGroup } from "../components/ui";

type Filter = "all" | "winners" | "losers" | "open";

const FILTERS = [
  { value: "all" as const, label: "All" },
  { value: "winners" as const, label: "Winners" },
  { value: "losers" as const, label: "Losers" },
  { value: "open" as const, label: "Open" },
];

export default function TradesScreen() {
  const {
    todayTrades,
    tradeGroups,
    tradesLoading,
    tradesError,
    syncing,
    brokerConfigured,
    syncBrokerTrades,
    session,
  } = useJournal();
  const [filter, setFilter] = useState<Filter>("all");

  /** Baskets fold their legs in before filtering, so a basket filters and counts as one trade. */
  const all = useMemo(() => buildRows(todayTrades, tradeGroups), [todayTrades, tradeGroups]);

  const rows = all.filter((row) => {
    const pnl = row.kind === "lot" ? row.trade.pnl : row.summary.net;
    const isOpen = row.kind === "lot" ? row.trade.open : row.summary.open;
    if (filter === "winners") return (pnl ?? 0) > 0;
    if (filter === "losers") return (pnl ?? 0) < 0;
    if (filter === "open") return isOpen;
    return true;
  });

  const status = !brokerConfigured
    ? "Broker not connected — add your credentials to .env.local"
    : !session
      ? "Sign in to sync — writing trades requires being signed in"
      : syncing
        ? "Syncing today's fills…"
        : tradesError
          ? tradesError
          : `${todayTrades.length} ${todayTrades.length === 1 ? "lot" : "lots"} stored for today`;

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em] leading-[1.12]">
            Trades
          </h1>
          <div className="text-[13px] text-muted">
            {longDay(todayIso())} · {rows.length} shown · one row per entry lot
          </div>
        </div>
        <div className="flex items-center gap-4">
          <PillGroup options={FILTERS} value={filter} onChange={setFilter} />
          <Link
            to="/history"
            className="px-4 py-2 text-[12.5px] rounded-md border border-line-strong text-dim no-underline transition-colors hover:text-ink"
          >
            All trades
          </Link>
        </div>
      </header>

      {/* Sync bar */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border border-line rounded-md bg-surface text-[12.5px]">
        <span className={tradesError ? "text-loss" : "text-muted"}>{status}</span>
        <button
          type="button"
          onClick={() => void syncBrokerTrades()}
          disabled={!brokerConfigured || !session || syncing}
          className="px-4 py-[5px] text-[12px] rounded-sm border border-line-strong bg-transparent text-muted cursor-pointer transition-colors hover:text-ink disabled:opacity-40 disabled:cursor-default"
        >
          {syncing ? "Syncing…" : "Sync from broker"}
        </button>
      </div>

      {/* Legs from this session that look like they were one decision */}
      <BasketSuggestions scope="today" />

      <TradesTable rows={rows} from="/trades" />

      {rows.length === 0 && !tradesLoading && (
        <div className="py-20 text-center text-[13.5px] text-dim">
          {!brokerConfigured
            ? "Connect the broker to sync your trades."
            : !session
              ? "Sign in, then sync to store today's fills."
              : todayTrades.length === 0
                ? "Nothing stored for today. Hit Sync to pull today's fills from Angel One."
                : "No trades match this filter."}
        </div>
      )}
    </div>
  );
}
