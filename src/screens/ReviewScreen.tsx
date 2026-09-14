import { useState } from "react";
import { useJournal } from "../store";
import { DEPOSIT_MARKS, EQUITY_LABELS, DISCIPLINE_STATS, STRATEGY_STATS, STYLE_STATS, TAG_STATS } from "../data/mock";
import { CUR, computeKpis, money, seriesPath } from "../lib/format";
import { Eyebrow, PillGroup, WARN, WIN, LOSS } from "../components/ui";

type Range = "1M" | "3M" | "6M" | "All";

const RANGES = [
  { value: "1M" as const, label: "1M" },
  { value: "3M" as const, label: "3M" },
  { value: "6M" as const, label: "6M" },
  { value: "All" as const, label: "All" },
];

export default function ReviewScreen() {
  const { trades, equity, capitalEvents } = useJournal();
  const [range, setRange] = useState<Range>("3M");

  const k = computeKpis(trades);
  const onPlan = trades.filter((t) => t.plan === "on").length;

  const { d: eqLine, points } = seriesPath(equity, 820, 14, 214);
  const eqArea = points.length > 0 ? `${eqLine} L 820 240 L 0 240 Z` : "";

  const kpis = [
    { label: "Net P&L", value: money(k.net), sub: "after costs", color: k.net >= 0 ? WIN : LOSS },
    { label: "Win rate", value: `${k.winRate}%`, sub: `${k.wins}W / ${k.losses}L`, color: "var(--color-ink)" },
    { label: "Avg R:R", value: `1 : ${k.avgPlannedRR.toFixed(1)}`, sub: `realised ${k.avgRealisedR.toFixed(1)}`, color: "var(--color-ink)" },
    { label: "Profit factor", value: k.profitFactor.toFixed(2), sub: "win ÷ loss", color: "var(--color-ink)" },
    { label: "Discipline", value: `${Math.round((onPlan / trades.length) * 100)}`, sub: `${trades.length - onPlan} rule breaks`, color: WARN },
    { label: "Expectancy", value: `${k.expectancy >= 0 ? "+" : ""}${k.expectancy.toFixed(2)}R`, sub: "per trade", color: k.expectancy >= 0 ? WIN : LOSS },
  ];

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em] leading-[1.12]">
            Review
          </h1>
          <div className="text-[13px] text-muted">
            {trades.length} trades · 12 Jun – 31 Aug 2026
          </div>
        </div>
        <PillGroup options={RANGES} value={range} onChange={setRange} />
      </header>

      {/* KPI Row */}
      <section className="grid grid-cols-6 gap-px bg-line border border-line rounded-md overflow-hidden">
        {kpis.map((kp) => (
          <div key={kp.label} className="bg-surface px-6 py-5 flex flex-col gap-2">
            <Eyebrow>{kp.label}</Eyebrow>
            <div className="text-[21px] font-medium tracking-[-0.015em]" style={{ color: kp.color }}>
              {kp.value}
            </div>
            <div className="text-[12px] text-dim">{kp.sub}</div>
          </div>
        ))}
      </section>

      {/* Capital growth + Discipline */}
      <section className="grid grid-cols-[1.6fr_1fr] gap-6">
        {/* Equity curve */}
        <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] font-medium">Capital growth</span>
            <span className="text-[11.5px] text-dim">deposits marked, excluded from return</span>
          </div>
          <svg viewBox="0 0 820 240" preserveAspectRatio="none" className="w-full h-[240px] block">
            <defs>
              <linearGradient id="eqA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#9184d9" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#9184d9" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="60" x2="820" y2="60" stroke="#e4e7f5" />
            <line x1="0" y1="120" x2="820" y2="120" stroke="#e4e7f5" />
            <line x1="0" y1="180" x2="820" y2="180" stroke="#e4e7f5" />
            <path d={eqArea} fill="url(#eqA)" />
            <path d={eqLine} fill="none" stroke="#9184d9" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {DEPOSIT_MARKS.map((i) => {
              const x = (i / (equity.length - 1)) * 820;
              return (
                <line key={i} x1={x} y1="0" x2={x} y2="240" stroke={WARN} strokeWidth="1" strokeDasharray="3 4" />
              );
            })}
          </svg>
          <div className="flex justify-between text-[11px] text-dim">
            {EQUITY_LABELS.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>

        {/* Discipline */}
        <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-5">
          <span className="text-[14px] font-medium">Discipline</span>
          {DISCIPLINE_STATS.map((d) => {
            const color = d.pct >= 80 ? WIN : WARN;
            return (
              <div key={d.label} className="flex flex-col gap-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-[12.5px] text-ink-2">{d.label}</span>
                  <span className="text-[12.5px] font-medium" style={{ color }}>{d.value}</span>
                </div>
                <div className="h-[4px] rounded-sm bg-line overflow-hidden">
                  <div className="h-full" style={{ width: `${d.pct}%`, background: color }} />
                </div>
              </div>
            );
          })}
          <div className="mt-auto pt-4 border-t border-line flex flex-col gap-2">
            <Eyebrow>Biggest leak</Eyebrow>
            <span className="text-[13px] leading-[1.5] text-ink-2">
              Off-plan entries cost <span style={{ color: LOSS }}>−{CUR}18,420</span>, and every one of them was taken after 13:40.
            </span>
          </div>
        </div>
      </section>

      {/* By strategy / style / tags */}
      <section className="grid grid-cols-3 gap-6">
        {/* By strategy */}
        <div className="border border-line rounded-md bg-surface p-6">
          <div className="text-[14px] font-medium mb-4">By strategy</div>
          {STRATEGY_STATS.map((s) => {
            const color = s.pnl >= 0 ? WIN : LOSS;
            return (
              <div key={s.name} className="grid grid-cols-[1fr_40px_84px] gap-3 items-center py-[7px] border-b border-line-soft">
                <span className="text-[12.5px] text-ink">{s.name}</span>
                <span className="text-[12px] text-dim">{s.wr}</span>
                <span className="text-[12.5px] text-right" style={{ color }}>{money(s.pnl)}</span>
              </div>
            );
          })}
        </div>

        {/* By trade style */}
        <div className="border border-line rounded-md bg-surface p-6">
          <div className="text-[14px] font-medium mb-4">By trade style</div>
          {STYLE_STATS.map((s) => {
            const color = s.pnl >= 0 ? WIN : LOSS;
            return (
              <div key={s.name} className="grid grid-cols-[1fr_40px_84px] gap-3 items-center py-[7px] border-b border-line-soft">
                <span className="text-[12.5px] text-ink">{s.name}</span>
                <span className="text-[12px] text-dim">{s.wr}</span>
                <span className="text-[12.5px] text-right" style={{ color }}>{money(s.pnl)}</span>
              </div>
            );
          })}
        </div>

        {/* Tags */}
        <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
          <div className="text-[14px] font-medium">Tags</div>
          <div className="flex flex-wrap gap-2">
            {TAG_STATS.map((t) => {
              const color = t.pnl >= 0 ? WIN : LOSS;
              return (
                <span key={t.name} className="inline-flex items-center gap-2 px-3 py-1 rounded-sm border border-line-strong text-[12px] text-ink-2">
                  {t.name} <span style={{ color }}>{t.pnl >= 0 ? "+" : "−"}{Math.abs(t.pnl / 1000).toFixed(1)}k</span>
                </span>
              );
            })}
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-[rgba(41,43,49,0.18)] to-transparent" />
          <div className="flex gap-8">
            <div className="flex flex-col gap-1">
              <Eyebrow>Technical</Eyebrow>
              <span className="text-[17px]" style={{ color: WIN }}>+{CUR}94,210</span>
              <span className="text-[11.5px] text-dim">51 trades · 64% win</span>
            </div>
            <div className="flex flex-col gap-1">
              <Eyebrow>News</Eyebrow>
              <span className="text-[17px]" style={{ color: LOSS }}>−{CUR}12,650</span>
              <span className="text-[11.5px] text-dim">13 trades · 38% win</span>
            </div>
          </div>
        </div>
      </section>

      {/* Capital ledger */}
      <section className="border border-line rounded-md bg-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <span className="text-[14px] font-medium">Capital ledger</span>
          <button className="border border-accent bg-transparent text-accent-deep px-4 py-2 rounded-md text-[12.5px] cursor-pointer hover:bg-[rgba(145,132,217,0.12)] transition-colors">
            + Capital event
          </button>
        </div>
        {capitalEvents.map((e) => {
          const color = e.amount >= 0 ? (e.label.includes("profit") ? WIN : WARN) : LOSS;
          return (
            <div key={e.id} className="grid grid-cols-[96px_1fr_140px_150px] gap-4 px-6 py-3 border-b border-line-soft text-[13px] text-muted">
              <span>{e.date}</span>
              <span className="text-ink-2">{e.label}</span>
              <span className="text-right" style={{ color }}>
                {e.amount >= 0 ? (e.label === "Opening balance" ? "" : "+") : "−"}{CUR}{Math.abs(e.amount).toLocaleString("en-IN")}
              </span>
              <span className="text-right">{CUR}{Math.abs(e.amount).toLocaleString("en-IN")}</span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
