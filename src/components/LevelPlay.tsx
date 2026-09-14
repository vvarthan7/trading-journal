import { useJournal } from "../store";
import { TRADES_PER_LEVEL } from "../lib/format";

const LEVELS = 6;

/** Six levels of ten boxes each, filled in journal order: trade n lands in box n. */
export default function LevelPlay() {
  const { journal } = useJournal();

  return (
    <div className="border border-line rounded-md overflow-hidden bg-surface">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-line">
        <i className="ph ph-stack text-[16px] text-accent-deep" />
        <span className="text-[14px] font-medium">Level play</span>
        <span className="text-[11.5px] text-dim">
          {LEVELS} levels · {TRADES_PER_LEVEL} boxes each
        </span>
      </div>

      <div className="px-6 py-6 flex flex-col gap-4">
        {Array.from({ length: LEVELS }, (_, i) => i + 1).map((level) => (
          <div key={level} className="grid grid-cols-[72px_1fr] items-center gap-5">
            <span className="text-[13px] text-muted">Level {level}</span>
            <div className="grid grid-cols-10 gap-3">
              {Array.from({ length: TRADES_PER_LEVEL }, (_, b) => {
                const n = (level - 1) * TRADES_PER_LEVEL + b;
                const outcome = journal[n]?.outcome;
                return (
                  <div
                    key={b}
                    title={journal[n] ? `Trade ${n + 1}` : undefined}
                    className={[
                      "h-16 rounded-md border grid place-items-center text-[14px] font-medium",
                      outcome === "profit"
                        ? "bg-win border-win text-white"
                        : outcome === "loss"
                          ? "bg-loss border-loss text-white"
                          : "bg-bg border-line-strong",
                    ].join(" ")}
                  >
                    {outcome === "profit" ? "W" : outcome === "loss" ? "L" : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
