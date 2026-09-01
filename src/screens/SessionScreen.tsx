import { Link } from "react-router-dom";
import { useJournal } from "../store";
import { CUR, money, planLabel, pnlTone, price, rLabel } from "../lib/format";
import {
  Divider,
  Eyebrow,
  FOCUS_LABELS,
  FocusRating,
  Meter,
  PillGroup,
  WIN,
  WARN,
  LOSS,
} from "../components/ui";

export default function SessionScreen() {
  const {
    trades,
    today,
    windows,
    gate,
    gateChecked,
    toggleGate,
    sessionFocus,
    setSessionFocus,
    queue,
    acceptFill,
    discardFill,
    captureMode,
    setCaptureMode,
    ruleFlags,
  } = useJournal();

  const todays = trades.filter((t) => t.date === today.date);
  const net = todays.reduce((a, t) => a + t.pnl, 0);
  const greens = todays.filter((t) => t.pnl > 0).length;
  const avgR = todays.length
    ? todays.reduce((a, t) => a + t.realisedR, 0) / todays.length
    : 0;
  const win = windows.find((w) => w.id === today.windowId);
  const ruleBreaks = todays.filter((t) => t.plan !== "on").length;

  const onPlan = todays.filter((t) => t.plan === "on").length;
  const stopsHonoured = todays.filter((t) => t.realisedR >= -1.05).length;
  const gateDone = gateChecked.length === gate.length;

  const scoreParts = [
    { label: "Plan adherence", value: `${onPlan} of ${todays.length}`, pct: (onPlan / (todays.length || 1)) * 100 },
    { label: "Stops honoured", value: `${stopsHonoured} of ${todays.length}`, pct: (stopsHonoured / (todays.length || 1)) * 100 },
    { label: "Inside window", value: `${todays.length - 1} of ${todays.length}`, pct: ((todays.length - 1) / (todays.length || 1)) * 100 },
    { label: "Focus", value: `${sessionFocus} / 5`, pct: sessionFocus * 20 },
  ];
  const score = Math.round(scoreParts.reduce((a, p) => a + p.pct, 0) / scoreParts.length);

  const sessionKpis = [
    { label: "Session P&L", value: money(net), sub: `${greens} of ${todays.length} green`, color: net >= 0 ? WIN : LOSS },
    { label: "Trades", value: todays.length.toString(), sub: `${todays.filter(t => t.style === "Scalp").length} scalp · ${todays.filter(t => t.style === "Intraday").length} intraday`, color: "var(--color-ink)" },
    { label: "Avg R realised", value: rLabel(avgR), sub: `planned 1:2.1`, color: "var(--color-ink)" },
    { label: "Rule breaks", value: ruleBreaks.toString(), sub: ruleBreaks > 0 ? "re-entry after stop-out" : "none", color: ruleBreaks > 0 ? WARN : WIN },
    { label: "Focus", value: `${sessionFocus} / 5`, sub: FOCUS_LABELS[sessionFocus], color: "var(--color-accent-deep)" },
  ];

  const breached = ruleFlags.filter((f) => f.status === "breached").length;
  const atLimit = ruleFlags.filter((f) => f.status === "at-limit").length;
  const flagSummary = `${breached} breach${breached !== 1 ? "es" : ""} · ${atLimit} watching`;

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em] leading-[1.12]">
            {today.title}
          </h1>
          <div className="text-[13px] text-muted">
            31 Aug 2026 · window {win?.start} – {win?.end} · 42 min remaining
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <PillGroup
            size="sm"
            value={captureMode}
            onChange={setCaptureMode}
            options={[
              { value: "review", label: "Review first" },
              { value: "auto", label: "Auto-save" },
            ]}
          />
          <button className="inline-flex items-center gap-2 border border-line-strong bg-transparent text-ink-2 px-5 py-[7px] rounded-md text-[13px] font-medium cursor-pointer hover:border-accent hover:text-ink transition-colors">
            <i className="ph ph-plus" /> New trade
          </button>
          <button className="inline-flex items-center gap-2 border border-accent bg-transparent text-accent-deep px-5 py-[7px] rounded-md text-[13px] font-medium cursor-pointer hover:bg-[rgba(145,132,217,0.12)] transition-colors">
            <i className="ph ph-flag-checkered" /> Close session
          </button>
        </div>
      </header>

      {/* KPI Row */}
      <section className="grid grid-cols-5 gap-px bg-line border border-line rounded-md overflow-hidden">
        {sessionKpis.map((k) => (
          <div key={k.label} className="bg-surface px-6 py-5 flex flex-col gap-2">
            <Eyebrow>{k.label}</Eyebrow>
            <div className="text-[22px] font-medium tracking-[-0.015em]" style={{ color: k.color }}>
              {k.value}
            </div>
            <div className="text-[12px] text-dim">{k.sub}</div>
          </div>
        ))}
      </section>

      {/* Main content grid */}
      <section className="grid grid-cols-[1fr_316px] gap-6 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Capture Inbox */}
          <div className="border border-accent-line bg-subtle rounded-md overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line">
              <div className="flex items-center gap-3">
                <i className="ph ph-download-simple text-[16px] text-accent-deep" />
                <span className="text-[14px] font-medium">
                  {captureMode === "review"
                    ? `Awaiting your review — ${queue.length}`
                    : `Saved automatically — ${queue.length} unannotated`}
                </span>
                <span className="text-[11.5px] text-dim">
                  {captureMode === "review"
                    ? "nothing is written until you approve"
                    : "already in the ledger, just needs your words"}
                </span>
              </div>
              <button className="border border-line-strong bg-transparent text-ink-2 px-4 py-2 rounded-md text-[12.5px] cursor-pointer hover:border-accent hover:text-ink transition-colors">
                {captureMode === "review" ? "Approve all" : "Mark all reviewed"}
              </button>
            </div>

            {queue.map((q) => (
              <div
                key={q.id}
                className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-5 items-center px-6 py-4 border-b border-line-soft"
              >
                <div className="flex flex-col gap-[2px] min-w-0">
                  <span className="text-[13.5px] font-medium truncate">{q.symbol}</span>
                  <span className="text-[11.5px] text-dim">{q.market} · {q.kind} · {q.entryTime}</span>
                </div>
                <div className="flex flex-col gap-[2px]">
                  <span className="text-[10.5px] tracking-[0.08em] uppercase text-dim">Qty</span>
                  <span className="text-[13px] text-ink-2">{q.qty}</span>
                </div>
                <div className="flex flex-col gap-[2px]">
                  <span className="text-[10.5px] tracking-[0.08em] uppercase text-dim">Entry → exit</span>
                  <span className="text-[13px] text-ink-2">{price(q.entry)} → {price(q.exit)}</span>
                </div>
                <div className="flex flex-col gap-[2px]">
                  <span className="text-[10.5px] tracking-[0.08em] uppercase text-dim">Held</span>
                  <span className="text-[13px] text-ink-2">{q.held}</span>
                </div>
                <div className="flex flex-col gap-[2px]">
                  <span className="text-[10.5px] tracking-[0.08em] uppercase text-dim">P&L</span>
                  <span className={`text-[14px] font-medium ${pnlTone(q.pnl)}`}>{money(q.pnl)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => discardFill(q.id)}
                    className="border border-line-strong bg-transparent text-dim px-4 py-2 rounded-md text-[12.5px] cursor-pointer hover:text-loss hover:border-loss transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => acceptFill(q.id)}
                    className="border border-accent bg-transparent text-accent-deep px-4 py-2 rounded-md text-[12.5px] font-medium cursor-pointer hover:bg-[rgba(145,132,217,0.12)] transition-colors"
                  >
                    {captureMode === "review" ? "Review" : "Annotate"}
                  </button>
                </div>
              </div>
            ))}

            {queue.length === 0 && (
              <div className="p-8 text-center text-[13px] text-dim">
                Nothing waiting. Every fill today is journalled.
              </div>
            )}
          </div>

          {/* Rules Engine */}
          <div className="border border-line rounded-md overflow-hidden bg-surface">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-line">
              <i className="ph ph-shield-warning text-[16px]" style={{ color: WARN }} />
              <span className="text-[14px] font-medium">Rules engine</span>
              <span className="text-[11.5px] text-dim">{flagSummary}</span>
            </div>
            {ruleFlags.map((f) => {
              const color = f.status === "breached" ? LOSS : f.status === "at-limit" ? WARN : WIN;
              return (
                <div key={f.id} className="flex items-start gap-4 px-6 py-4 border-b border-line-soft">
                  <i className={f.icon} style={{ fontSize: 15, marginTop: 2, color }} />
                  <div className="flex flex-col gap-[2px] flex-1">
                    <span className="text-[13px] text-ink">{f.rule}</span>
                    <span className="text-[12px] text-dim">{f.detail}</span>
                  </div>
                  <span className="text-[12px]" style={{ color }}>
                    {f.status === "breached" ? "Breached" : f.status === "at-limit" ? "At limit" : "Clear"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Logged Today */}
          <div className="border border-line rounded-md overflow-hidden bg-surface">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <span className="text-[14px] font-medium">Logged today</span>
              <span className="text-[11.5px] text-dim">auto-categorised by hold time</span>
            </div>
            {todays.map((t) => {
              const planColor = t.plan === "on" ? WIN : WARN;
              const pnlColor = t.pnl >= 0 ? WIN : LOSS;
              return (
                <Link
                  key={t.id}
                  to={`/trades/${t.id}`}
                  className="grid w-full text-left grid-cols-[5px_minmax(0,1.6fr)_96px_minmax(0,1fr)_78px_92px_96px] gap-4 items-center px-6 py-4 border-0 border-b border-line-soft bg-transparent cursor-pointer no-underline hover:bg-subtle transition-colors"
                >
                  <span className="w-[4px] h-[26px] rounded-sm" style={{ background: pnlColor }} />
                  <span className="flex flex-col gap-[2px] min-w-0">
                    <span className="text-[13.5px] font-medium text-ink truncate">{t.symbol}</span>
                    <span className="text-[11.5px] text-dim">{t.strategy}</span>
                  </span>
                  <span className="text-[11px] px-3 py-[2px] rounded-sm justify-self-start border border-line-strong text-ink-2">
                    {t.style}
                  </span>
                  <span className="text-[12.5px] text-muted">{t.entryTime} → {t.exitTime}</span>
                  <span className="text-[12.5px] text-ink-2">1:{t.plannedRR.toFixed(1)}</span>
                  <span className="text-[12px]" style={{ color: planColor }}>{planLabel(t.plan)}</span>
                  <span className="text-[14px] font-medium text-right" style={{ color: pnlColor }}>
                    {money(t.pnl)}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Pre-session gate */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium">Pre-session gate</span>
              <span className="text-[12px]" style={{ color: gateDone ? WIN : WARN }}>
                {gateDone ? "Unlocked" : `${gate.length - gateChecked.length} left`}
              </span>
            </div>
            <div className="text-[12px] text-dim leading-[1.45]">
              Logging is blocked until every box is ticked.
            </div>
            <div className="flex flex-col gap-3">
              {gate.map((c) => {
                const on = gateChecked.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleGate(c.id)}
                    className="flex items-start gap-3 text-left border-0 bg-transparent p-0 cursor-pointer"
                  >
                    <span
                      className={[
                        "flex-none w-[16px] h-[16px] mt-[2px] rounded-sm border text-[10px] leading-[14px] text-center font-bold",
                        on ? "border-accent bg-accent text-[#f5f4ff]" : "border-line-strong bg-transparent",
                      ].join(" ")}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className={`text-[12.5px] leading-[1.45] ${on ? "text-ink-2" : "text-dim"}`}>
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session Score */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-medium">Session score</span>
              <span className="text-[12px] text-dim">live</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-[36px] font-medium tracking-[-0.015em]"
                style={{ color: score >= 85 ? WIN : WARN }}
              >
                {score}
              </span>
              <span className="text-[13px] text-dim">/ 100</span>
            </div>
            {scoreParts.map((p) => {
              const color = p.pct >= 99 ? WIN : WARN;
              return (
                <div key={p.label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[12.5px]">
                    <span className="text-muted">{p.label}</span>
                    <span style={{ color }}>{p.value}</span>
                  </div>
                  <Meter pct={p.pct} colorVar={color} />
                </div>
              );
            })}
          </div>

          {/* Session Focus */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <span className="text-[14px] font-medium">Session focus</span>
            <FocusRating value={sessionFocus} onChange={setSessionFocus} height={32} />
            <span className="text-[12.5px] text-muted">{FOCUS_LABELS[sessionFocus]}</span>
            <Divider inset={24} />
            <Eyebrow>Session note</Eyebrow>
            <textarea
              placeholder="What shifted in you today?"
              className="bg-bg border border-line-strong rounded-md text-ink text-[13px] leading-[1.5] px-4 py-3 min-h-[96px] resize-y"
            />
          </div>

          {/* Session Windows */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-3">
            <span className="text-[14px] font-medium">Session windows</span>
            {windows.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-4 py-[7px] border-b border-line-soft">
                <span
                  className={`flex items-center gap-3 text-[13px] ${
                    w.id === today.windowId ? "text-ink" : w.tradable ? "text-muted" : "text-dim"
                  }`}
                >
                  <span
                    className="w-[6px] h-[6px] rounded-full"
                    style={{ background: w.id === today.windowId ? WIN : "#cfd3e5" }}
                  />
                  {w.name}
                </span>
                <span className="text-[12.5px] text-muted">{w.start} – {w.end}</span>
              </div>
            ))}
            <button className="self-start mt-1 border border-dashed border-line-strong bg-transparent text-dim px-4 py-2 rounded-md text-[12.5px] cursor-pointer hover:border-accent hover:text-accent-deep transition-colors">
              + Add window
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
