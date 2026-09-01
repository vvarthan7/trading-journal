import { useState } from "react";
import { Link } from "react-router-dom";
import { useJournal } from "../store";
import { money, planLabel, pnlTone, price, rLabel, shortDay } from "../lib/format";
import { PillGroup, WIN, WARN, LOSS } from "../components/ui";

type Filter = "all" | "winners" | "losers" | "offplan" | "news" | "scalps";

const FILTERS = [
  { value: "all" as const, label: "All" },
  { value: "winners" as const, label: "Winners" },
  { value: "losers" as const, label: "Losers" },
  { value: "offplan" as const, label: "Off plan" },
  { value: "news" as const, label: "News" },
  { value: "scalps" as const, label: "Scalps" },
];

export default function TradesScreen() {
  const { trades } = useJournal();
  const [filter, setFilter] = useState<Filter>("all");

  const rows = trades.filter((t) => {
    if (filter === "winners") return t.pnl > 0;
    if (filter === "losers") return t.pnl < 0;
    if (filter === "offplan") return t.plan !== "on";
    if (filter === "news") return t.basis !== "technical";
    if (filter === "scalps") return t.style === "Scalp";
    return true;
  });

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em] leading-[1.12]">
            Trades
          </h1>
          <div className="text-[13px] text-muted">
            {rows.length} shown · every market, one ledger
          </div>
        </div>
        <PillGroup options={FILTERS} value={filter} onChange={setFilter} />
      </header>

      {/* Table */}
      <div className="border border-line rounded-md overflow-hidden bg-surface">
        {/* Header row */}
        <div className="grid grid-cols-[74px_minmax(0,1.5fr)_84px_92px_88px_118px_108px_64px_minmax(0,1fr)_74px_88px] gap-4 px-6 py-3 border-b border-line-strong text-[10.5px] tracking-[0.08em] uppercase text-dim">
          <span>Date</span>
          <span>Instrument</span>
          <span>Style</span>
          <span>Type</span>
          <span>Qty/lot</span>
          <span>Entry→exit</span>
          <span>In → out</span>
          <span>R:R</span>
          <span>Strategy / tags</span>
          <span>Plan</span>
          <span className="text-right">P&L</span>
        </div>

        {/* Rows */}
        {rows.map((t) => {
          const pnlColor = t.pnl >= 0 ? WIN : LOSS;
          const planColor = t.plan === "on" ? WIN : WARN;
          const rColor = t.realisedR >= 0 ? WIN : LOSS;
          return (
            <Link
              key={t.id}
              to={`/trades/${t.id}`}
              className="grid w-full text-left grid-cols-[74px_minmax(0,1.5fr)_84px_92px_88px_118px_108px_64px_minmax(0,1fr)_74px_88px] gap-4 items-center px-6 py-[10px] border-0 border-b border-line-soft bg-transparent cursor-pointer text-[12.5px] text-muted no-underline hover:bg-subtle transition-colors"
            >
              <span>{shortDay(t.date)}</span>
              <span className="flex flex-col gap-[1px] min-w-0">
                <span className="text-ink font-medium text-[13px] truncate">{t.symbol}</span>
                <span className="text-[11px] text-dim">{t.market}</span>
              </span>
              <span className="text-[11px] px-[7px] py-[2px] rounded-sm justify-self-start border border-line-strong text-ink-2">
                {t.style}
              </span>
              <span className="text-dim">{t.kind}</span>
              <span>{t.qtyLabel}</span>
              <span>{price(t.entry)} → {price(t.exit)}</span>
              <span>{t.entryTime} → {t.exitTime}</span>
              <span style={{ color: rColor }}>{rLabel(t.realisedR)}</span>
              <span className="flex flex-col gap-[1px] min-w-0">
                <span className="text-[12.5px] text-ink-2">{t.strategy}</span>
                <span className="text-[11px] text-dim truncate">{t.tags.join(" · ")}</span>
              </span>
              <span className="text-[12px]" style={{ color: planColor }}>{planLabel(t.plan)}</span>
              <span className="text-right text-[13.5px] font-medium" style={{ color: pnlColor }}>
                {money(t.pnl)}
              </span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 && (
        <div className="py-20 text-center text-[13.5px] text-dim">
          No trades match this filter. Clear it to see the full log.
        </div>
      )}
    </div>
  );
}
