import { useState } from "react";
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

export default function TradesScreen() {
  const {
    dbTrades,
    tradesLoading,
    tradesError,
    syncing,
    brokerConfigured,
    syncBrokerTrades,
    setTradeStop,
    session,
  } = useJournal();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = dbTrades.filter((t) => {
    if (filter === "winners") return (t.pnl ?? 0) > 0;
    if (filter === "losers") return (t.pnl ?? 0) < 0;
    if (filter === "open") return t.open;
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
          : `${dbTrades.length} ${dbTrades.length === 1 ? "lot" : "lots"} stored`;

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em] leading-[1.12]">
            Trades
          </h1>
          <div className="text-[13px] text-muted">
            {rows.length} shown · one row per entry lot
          </div>
        </div>
        <PillGroup options={FILTERS} value={filter} onChange={setFilter} />
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
                <span className="text-ink font-medium text-[13px] truncate">{t.instrument}</span>
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
          {!brokerConfigured
            ? "Connect the broker to sync your trades."
            : !session
              ? "Sign in, then sync to store today's fills."
              : dbTrades.length === 0
                ? "Nothing stored yet. Hit Sync to pull today's fills from Angel One."
                : "No trades match this filter."}
        </div>
      )}
    </div>
  );
}
