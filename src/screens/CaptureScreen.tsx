import { useJournal } from "../store";
import { CUR } from "../lib/format";
import { Eyebrow, PillGroup, WIN, WARN, LOSS } from "../components/ui";

export default function CaptureScreen() {
  const { captureSources, captureRules, captureMode, setCaptureMode } = useJournal();

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em] leading-[1.12]">
            Capture
          </h1>
          <div className="text-[13px] text-muted">
            The browser extension watches your broker tabs and writes fills into the journal.
          </div>
        </div>
        <PillGroup
          size="sm"
          value={captureMode}
          onChange={setCaptureMode}
          options={[
            { value: "review", label: "Review first" },
            { value: "auto", label: "Auto-save" },
          ]}
        />
      </header>

      {/* Main grid */}
      <section className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Connected sources */}
          <div className="border border-line rounded-md bg-surface overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <span className="text-[14px] font-medium">Connected sources</span>
              <button className="border border-accent bg-transparent text-accent-deep px-4 py-2 rounded-md text-[12.5px] cursor-pointer hover:bg-[rgba(145,132,217,0.12)] transition-colors">
                + Watch a tab
              </button>
            </div>
            {captureSources.map((c) => {
              const stateColor = c.state === "live" ? WIN : c.state === "needs-reauth" ? WARN : "var(--color-dim)";
              const stateLabel = c.state === "live" ? "Live" : c.state === "needs-reauth" ? "Needs re-auth" : "Paused";
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_132px_116px_92px] gap-5 items-center px-6 py-4 border-b border-line-soft"
                >
                  <div className="flex flex-col gap-[2px] min-w-0">
                    <span className="text-[14px] font-medium">{c.broker}</span>
                    <span className="text-[11.5px] text-dim">{c.account}</span>
                  </div>
                  <span className="text-[12.5px] text-muted">{c.detail}</span>
                  <span className="text-[12.5px] text-dim">{c.trades}</span>
                  <span className="inline-flex items-center gap-2 text-[12.5px]" style={{ color: stateColor }}>
                    <span className="w-[6px] h-[6px] rounded-full" style={{ background: stateColor }} />
                    {stateLabel}
                  </span>
                  <button className="justify-self-end border border-line-strong bg-transparent text-ink-2 px-4 py-[5px] rounded-md text-[12.5px] cursor-pointer hover:border-accent hover:text-ink transition-colors">
                    Manage
                  </button>
                </div>
              );
            })}
          </div>

          {/* Capture rules */}
          <div className="border border-line rounded-md bg-surface overflow-hidden">
            <div className="px-6 py-4 border-b border-line flex items-center justify-between">
              <span className="text-[14px] font-medium">What happens to a captured fill</span>
              <span className="text-[11.5px] text-dim">
                {captureMode === "review" ? "nothing is written until you approve" : "already in the ledger, just needs your words"}
              </span>
            </div>
            {captureRules.map((r) => (
              <div key={r.id} className="flex items-start gap-4 px-6 py-4 border-b border-line-soft">
                <span className="flex-none w-[16px] h-[16px] mt-[2px] rounded-sm border border-accent bg-accent text-[#f5f4ff] text-[10px] leading-[14px] text-center font-bold">
                  ✓
                </span>
                <div className="flex flex-col gap-[2px]">
                  <span className="text-[13.5px] text-ink">{r.label}</span>
                  <span className="text-[12.5px] text-dim leading-[1.45]">{r.detail}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Fallbacks */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <span className="text-[14px] font-medium">If the extension cannot reach a broker</span>
            <div className="flex gap-4 flex-wrap">
              <button className="border border-line-strong bg-transparent text-ink-2 px-5 py-3 rounded-md text-[13px] cursor-pointer inline-flex items-center gap-[7px] hover:border-accent hover:text-ink transition-colors">
                <i className="ph ph-file-csv" /> Import a contract note or CSV
              </button>
              <button className="border border-line-strong bg-transparent text-ink-2 px-5 py-3 rounded-md text-[13px] cursor-pointer inline-flex items-center gap-[7px] hover:border-accent hover:text-ink transition-colors">
                <i className="ph ph-clipboard-text" /> Paste an orderbook
              </button>
              <button className="border border-line-strong bg-transparent text-ink-2 px-5 py-3 rounded-md text-[13px] cursor-pointer inline-flex items-center gap-[7px] hover:border-accent hover:text-ink transition-colors">
                <i className="ph ph-pencil-simple" /> Enter it by hand
              </button>
            </div>
          </div>
        </div>

        {/* Right column - Extension popup mock */}
        <div className="flex flex-col gap-4">
          <Eyebrow>The extension popup</Eyebrow>
          <div className="border border-line-strong rounded-[14px] bg-subtle overflow-hidden shadow-[0_16px_40px_rgba(41,43,49,0.14)]">
            {/* Popup header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
              <span className="w-[18px] h-[18px] rounded-sm border border-accent flex items-center justify-center text-accent text-[11px]">
                <i className="ph ph-notebook" />
              </span>
              <span className="text-[13px] font-medium">Ledgerbook</span>
              <span className="ml-auto inline-flex items-center gap-[5px] text-[11.5px]" style={{ color: WIN }}>
                <span className="w-[5px] h-[5px] rounded-full" style={{ background: WIN }} />
                Watching
              </span>
            </div>

            {/* Popup body */}
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Eyebrow>This tab</Eyebrow>
                <span className="text-[13px] text-ink-2">kite.zerodha.com — orderbook detected</span>
              </div>

              {/* Trade card */}
              <div className="border border-accent-line rounded-md bg-surface p-4 flex flex-col gap-[7px]">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13.5px] font-medium">FINNIFTY 23500 CE</span>
                  <span className="text-[13.5px] font-medium" style={{ color: LOSS }}>−{CUR}596</span>
                </div>
                <span className="text-[12px] text-dim">80 qty / 2 lot · 96.20 → 88.75 · held 13m</span>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-[11px] px-[7px] py-[2px] rounded-sm bg-accent-soft text-accent-ink">Scalp</span>
                  <span className="text-[11px] px-[7px] py-[2px] rounded-sm border border-line-strong text-muted">ORB continuation?</span>
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-[7px]">
                <i className="ph ph-warning text-[14px] mt-[2px]" style={{ color: WARN }} />
                <span className="text-[12px] leading-[1.45]" style={{ color: WARN }}>
                  This would be your 6th trade — one past your session limit.
                </span>
              </div>

              {/* Buttons */}
              <div className="flex gap-[7px]">
                <button className="flex-1 border border-line-strong bg-transparent text-dim py-[7px] rounded-md text-[12.5px] cursor-pointer hover:text-ink transition-colors">
                  Skip
                </button>
                <button className="flex-[2] border border-accent bg-transparent text-accent-deep py-[7px] rounded-md text-[12.5px] font-medium cursor-pointer hover:bg-[rgba(145,132,217,0.12)] transition-colors">
                  Send to journal
                </button>
              </div>
            </div>
          </div>
          <span className="text-[12px] text-dim leading-[1.5]">
            In auto-save mode the popup skips the confirm and only shows what it wrote.
          </span>
        </div>
      </section>
    </div>
  );
}
