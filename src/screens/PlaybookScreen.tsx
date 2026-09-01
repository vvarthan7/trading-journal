import { useJournal } from "../store";
import { CUR, money } from "../lib/format";
import { Eyebrow, WIN, WARN, LOSS } from "../components/ui";

export default function PlaybookScreen() {
  const { playbook, hardLimits, gate, windows, today } = useJournal();

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em] leading-[1.12]">
            Playbook
          </h1>
          <div className="text-[13px] text-muted">
            Your strategies, written down. The rules engine reads from here.
          </div>
        </div>
        <button className="inline-flex items-center gap-2 border border-accent bg-transparent text-accent-deep px-5 py-[7px] rounded-md text-[13px] font-medium cursor-pointer hover:bg-[rgba(145,132,217,0.12)] transition-colors">
          <i className="ph ph-plus" /> New strategy
        </button>
      </header>

      {/* Main grid */}
      <section className="grid grid-cols-[minmax(0,1fr)_316px] gap-6 items-start">
        {/* Left column - Strategies */}
        <div className="flex flex-col gap-4 min-w-0">
          {playbook.map((p) => {
            const pnlColor = p.pnl >= 0 ? WIN : LOSS;
            const statusColor = p.status === "core" ? WIN : p.status === "probation" ? WARN : LOSS;
            return (
              <div key={p.id} className="border border-line rounded-md bg-surface overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_88px_68px_104px_92px] gap-5 items-center px-6 py-5 border-b border-line-soft">
                  <div className="flex flex-col gap-[2px] min-w-0">
                    <span className="text-[15px] font-medium">{p.name}</span>
                    <span className="text-[11.5px] text-dim">{p.styleTag}</span>
                  </div>
                  <span className="text-[12.5px] text-muted">{p.markets}</span>
                  <span className="text-[12.5px] text-dim">{p.tradeCount} trades</span>
                  <span className="text-[12.5px] text-ink-2">{p.winRate}%</span>
                  <span className="text-[13.5px] font-medium" style={{ color: pnlColor }}>
                    {money(p.pnl)}
                  </span>
                  <span
                    className="justify-self-end text-[11.5px] px-3 py-[3px] rounded-sm border border-line-strong"
                    style={{ color: statusColor }}
                  >
                    {p.status === "core" ? "Core" : p.status === "probation" ? "On probation" : "Retired"}
                  </span>
                </div>
                {/* Rules */}
                <div className="px-6 py-5 flex flex-col gap-[7px]">
                  <Eyebrow>Rules</Eyebrow>
                  {p.rules.map((r, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <i className="ph ph-dot-outline text-[16px] text-accent mt-[1px]" />
                      <span className="text-[13px] text-ink-2 leading-[1.5]">{r}</span>
                    </div>
                  ))}
                  <button className="self-start mt-1 border border-dashed border-line-strong bg-transparent text-dim px-4 py-[5px] rounded-md text-[12.5px] cursor-pointer hover:border-accent hover:text-accent-deep transition-colors">
                    + Add rule
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Hard limits */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <span className="text-[14px] font-medium">Hard limits</span>
            <span className="text-[12px] text-dim leading-[1.45]">
              Enforced across every strategy. Breaches surface on the session screen as they happen.
            </span>
            <div className="flex flex-col gap-3">
              {hardLimits.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-4">
                  <span className="text-[13px] text-ink-2">{h.label}</span>
                  <input
                    defaultValue={h.value}
                    className="w-[96px] text-right bg-bg border border-line-strong rounded-md text-ink text-[13px] px-3 py-[5px]"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between gap-4">
                <span className="text-[13px] text-ink-2">Re-entry after a stop-out</span>
                <span className="text-[12.5px] px-3 py-[3px] rounded-sm border border-line-strong" style={{ color: LOSS }}>
                  Forbidden
                </span>
              </div>
            </div>
          </div>

          {/* Pre-session checklist */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-3">
            <span className="text-[14px] font-medium">Pre-session checklist</span>
            <span className="text-[12px] text-dim leading-[1.45]">
              This is the gate. Logging stays locked until it is clear.
            </span>
            {gate.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 py-[5px] border-b border-line-soft">
                <span className="text-[12.5px] text-ink-2 leading-[1.4]">{c.label}</span>
                <button className="border-0 bg-transparent text-dim cursor-pointer text-[14px] p-0 hover:text-loss transition-colors">
                  <i className="ph ph-x" />
                </button>
              </div>
            ))}
            <button className="self-start mt-1 border border-dashed border-line-strong bg-transparent text-dim px-4 py-[5px] rounded-md text-[12.5px] cursor-pointer hover:border-accent hover:text-accent-deep transition-colors">
              + Add item
            </button>
          </div>

          {/* Session windows */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-3">
            <span className="text-[14px] font-medium">Session windows</span>
            {windows.map((w) => (
              <div key={w.id} className="flex items-center justify-between gap-4 py-[6px] border-b border-line-soft">
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
            <button className="self-start mt-1 border border-dashed border-line-strong bg-transparent text-dim px-4 py-[5px] rounded-md text-[12.5px] cursor-pointer hover:border-accent hover:text-accent-deep transition-colors">
              + Add window
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
