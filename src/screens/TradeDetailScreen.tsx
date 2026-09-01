import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useJournal } from "../store";
import { BUCKET_NOTE } from "../data/mock";
import type { PlanAdherence } from "../types";
import { money, pnlTone, price, rLabel, seriesPath, shortDay } from "../lib/format";
import {
  Divider,
  Eyebrow,
  FocusRating,
  PillGroup,
  Tag,
  WIN,
  LOSS,
} from "../components/ui";

export default function TradeDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trades, updateTrade } = useJournal();
  const [chart, setChart] = useState<"auto" | "shot">("auto");

  const t = trades.find((x) => x.id === Number(id));
  if (!t) {
    return (
      <div className="p-8 pb-20">
        <p className="text-[14px] text-muted">
          That trade isn't in the log.{" "}
          <Link to="/trades" className="text-accent-deep">
            Back to trades
          </Link>
        </p>
      </div>
    );
  }

  const { d, points } = seriesPath(t.path, 900, 30, 240);
  const entryPt = points[Math.min(t.entryIndex, points.length - 1)];
  const exitPt = points[Math.min(t.exitIndex, points.length - 1)];

  const facts = [
    { k: "Trade style", v: t.style, color: "var(--color-accent-deep)" },
    { k: "Instrument type", v: t.kind, color: "var(--color-muted)" },
    { k: "Market", v: t.market, color: "var(--color-muted)" },
    { k: "Quantity / lots", v: t.qtyLabel, color: "var(--color-muted)" },
    { k: "Entry price", v: price(t.entry), color: "var(--color-muted)" },
    { k: "Exit price", v: price(t.exit), color: "var(--color-muted)" },
    { k: "Entry time", v: t.entryTime, color: "var(--color-muted)" },
    { k: "Exit time", v: t.exitTime, color: "var(--color-muted)" },
    { k: "Hold", v: t.held, color: "var(--color-muted)" },
    { k: "Planned R:R", v: `1:${t.plannedRR.toFixed(1)}`, color: "var(--color-muted)" },
    { k: "Realised", v: rLabel(t.realisedR), color: t.realisedR >= 0 ? WIN : LOSS },
    { k: "Session", v: "Morning momentum", color: "var(--color-muted)" },
  ];

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate("/trades")}
        className="self-start inline-flex items-center gap-[5px] border-0 bg-transparent text-dim text-[12.5px] cursor-pointer p-0 hover:text-accent-deep transition-colors"
      >
        <i className="ph ph-arrow-left" /> Trades
      </button>

      {/* Header */}
      <header className="flex items-start justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em]">{t.symbol}</h1>
            <span className="text-[11.5px] px-3 py-[3px] rounded-sm bg-accent-line text-accent-ink">
              {t.style}
            </span>
            <span className="text-[11.5px] px-3 py-[3px] rounded-sm border border-line-strong text-ink-2">
              {t.kind}
            </span>
            <span className="text-[11.5px] px-3 py-[3px] rounded-sm border border-line-strong text-ink-2">
              {t.market}
            </span>
          </div>
          <div className="text-[13px] text-muted">
            {shortDay(t.date)} · {t.entryTime} → {t.exitTime} · {t.strategy}
          </div>
        </div>
        <div className="text-right flex flex-col gap-1">
          <div className={`text-[30px] font-medium tracking-[-0.015em] ${pnlTone(t.pnl)}`}>
            {money(t.pnl)}
          </div>
          <div className="text-[12.5px] text-dim">
            planned 1:{t.plannedRR.toFixed(1)} · realised {rLabel(t.realisedR)}
          </div>
        </div>
      </header>

      {/* Main grid */}
      <section className="grid grid-cols-[1fr_332px] gap-6 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Chart */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium">Entry → exit</span>
              <PillGroup
                size="sm"
                value={chart}
                onChange={setChart}
                options={[
                  { value: "auto", label: "Auto chart" },
                  { value: "shot", label: "My screenshot" },
                ]}
              />
            </div>

            {chart === "auto" ? (
              <svg viewBox="0 0 900 300" className="w-full h-[300px] block rounded-md bg-subtle">
                <line x1="0" y1="86" x2="900" y2="86" stroke={WIN} strokeWidth="1" strokeDasharray="5 5" />
                <line x1="0" y1="238" x2="900" y2="238" stroke={LOSS} strokeWidth="1" strokeDasharray="5 5" />
                <text x="10" y="78" fill={WIN} fontSize="11">target {price(t.target)}</text>
                <text x="10" y="254" fill={LOSS} fontSize="11">stop {price(t.stop)}</text>
                <path d={d} fill="none" stroke="#595d6c" strokeWidth="1.6" />
                {entryPt && (
                  <>
                    <line x1={entryPt[0]} y1="0" x2={entryPt[0]} y2="300" stroke="rgba(41,43,49,0.14)" strokeWidth="1" />
                    <circle cx={entryPt[0]} cy={entryPt[1]} r="5" fill="#fbfcff" stroke={WIN} strokeWidth="2" />
                  </>
                )}
                {exitPt && (
                  <>
                    <line x1={exitPt[0]} y1="0" x2={exitPt[0]} y2="300" stroke="rgba(41,43,49,0.14)" strokeWidth="1" />
                    <circle cx={exitPt[0]} cy={exitPt[1]} r="5" fill="#fbfcff" stroke="#5d5294" strokeWidth="2" />
                  </>
                )}
              </svg>
            ) : t.screenshotUrl ? (
              <img
                src={t.screenshotUrl}
                alt={`Chart screenshot for ${t.symbol}`}
                className="w-full rounded-md"
              />
            ) : (
              <svg viewBox="0 0 900 300" className="w-full h-[300px] block rounded-md bg-subtle">
                <defs>
                  <pattern id="hatch" width="9" height="9" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="0" x2="0" y2="9" stroke="#dfe3f2" strokeWidth="4.5" />
                  </pattern>
                </defs>
                <rect x="0" y="0" width="900" height="300" fill="url(#hatch)" />
                <text x="450" y="146" textAnchor="middle" fill="#75798c" fontSize="13" letterSpacing="1.4">
                  DROP YOUR CHART SCREENSHOT
                </text>
                <text x="450" y="170" textAnchor="middle" fill="#8a8fa0" fontSize="11.5">
                  annotations and all — kept alongside the auto chart
                </text>
              </svg>
            )}

            <div className="flex gap-6 text-[12px] text-dim flex-wrap">
              <span style={{ color: WIN }}>● entry {price(t.entry)} @ {t.entryTime}</span>
              <span style={{ color: "#5d5294" }}>● exit {price(t.exit)} @ {t.exitTime}</span>
              <span>held {t.held}</span>
              <span>max adverse −0.4R</span>
            </div>
          </div>

          {/* Notes */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <span className="text-[14px] font-medium">Notes</span>
            <textarea
              value={t.notes}
              onChange={(e) => updateTrade(t.id, { notes: e.target.value })}
              className="bg-bg border border-line-strong rounded-md text-ink text-[13.5px] leading-[1.6] px-4 py-4 min-h-[124px] resize-y"
            />
            <div className="flex flex-wrap gap-2">
              {t.tags.map((tag) => (
                <span key={tag} className="text-[12px] px-3 py-[3px] rounded-sm bg-accent-soft text-accent-ink">
                  {tag}
                </span>
              ))}
              <button className="text-[12px] px-3 py-[3px] rounded-sm bg-transparent border border-dashed border-line-strong text-dim cursor-pointer hover:border-accent hover:text-accent-deep transition-colors">
                + tag
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Facts */}
          <div className="border border-line rounded-md bg-surface overflow-hidden">
            {facts.map((f) => (
              <div key={f.k} className="flex items-center justify-between gap-4 px-5 py-3 border-b border-line-soft">
                <span className="text-[10.5px] tracking-[0.08em] uppercase text-dim">{f.k}</span>
                <span className="text-[13px]" style={{ color: f.color }}>{f.v}</span>
              </div>
            ))}
          </div>

          {/* Execution review */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <span className="text-[14px] font-medium">Execution review</span>

            <Eyebrow>Followed the strategy?</Eyebrow>
            <div className="flex gap-2">
              {(
                [
                  ["on", "Yes"],
                  ["partly", "Partly"],
                  ["off", "No"],
                ] as [PlanAdherence, string][]
              ).map(([v, label]) => {
                const on = t.plan === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateTrade(t.id, { plan: v })}
                    className={[
                      "flex-1 px-1 py-[7px] rounded-md cursor-pointer text-[12.5px] border transition-colors",
                      on
                        ? "border-accent bg-[rgba(145,132,217,0.16)] text-accent-deep"
                        : "border-line-strong bg-transparent text-dim",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <Eyebrow>Focus during this trade</Eyebrow>
            <FocusRating
              height={30}
              value={t.focus ?? 3}
              onChange={(n) => updateTrade(t.id, { focus: n })}
            />

            <Divider inset={24} />

            <Eyebrow>Trigger</Eyebrow>
            <span className="text-[13px] text-ink-2 leading-[1.5]">{t.catalyst}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
