import { useJournal } from "../store";
import { LEVELS, TRADES_PER_LEVEL, WINS_TO_ADVANCE, levelWins } from "../lib/format";

/**
 * Six levels of ten boxes each. Every journal entry lands in the next box of the level picked
 * for it. Once any entry sits on a higher level, a lower level's unused boxes read "—". A level
 * stays locked until the one below has `WINS_TO_ADVANCE` wins.
 */
export default function LevelPlay() {
  const { journal } = useJournal();
  const highest = Math.max(0, ...journal.map((e) => e.level));

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
        <div className="grid grid-cols-[72px_1fr_40px] items-center gap-5">
          <span />
          <div className="grid grid-cols-10 gap-3">
            {Array.from({ length: TRADES_PER_LEVEL }, (_, b) => (
              <span key={b} className="text-center text-[11.5px] text-dim">
                {b + 1}
              </span>
            ))}
          </div>
          <span />
        </div>
        {Array.from({ length: LEVELS }, (_, i) => i + 1).map((level) => {
          const entries = journal.filter((e) => e.level === level);
          const skipped = level < highest;
          const wins = entries.filter((e) => e.outcome === "profit").length;
          const locked =
            level > 1 &&
            entries.length === 0 &&
            levelWins(journal, level - 1) < WINS_TO_ADVANCE;
          return (
            <div key={level} className="grid grid-cols-[72px_1fr_40px] items-center gap-5">
              <span className="flex items-center gap-1 text-[13px] text-muted">
                Level {level}
                {locked && (
                  <i
                    className="ph ph-lock-simple text-[12px] text-dim"
                    title={`Locked — needs ${WINS_TO_ADVANCE} wins on level ${level - 1}`}
                  />
                )}
              </span>
              <div className="grid grid-cols-10 gap-3">
                {Array.from({ length: TRADES_PER_LEVEL }, (_, b) => {
                  const entry = entries[b];
                  const outcome = entry?.outcome;
                  return (
                    <div
                      key={b}
                      title={
                        entry
                          ? `Trade ${journal.indexOf(entry) + 1}`
                          : skipped
                            ? "Skipped"
                            : undefined
                      }
                      className={[
                        "h-16 rounded-md border grid place-items-center text-[14px] font-medium",
                        outcome === "profit"
                          ? "bg-win border-win text-white"
                          : outcome === "loss"
                            ? "bg-loss border-loss text-white"
                            : "bg-bg border-line-strong text-dim",
                      ].join(" ")}
                    >
                      {outcome === "profit"
                        ? "W"
                        : outcome === "loss"
                          ? "L"
                          : !entry && skipped
                            ? "—"
                            : null}
                    </div>
                  );
                })}
              </div>
              <span
                title={`${wins}/${TRADES_PER_LEVEL} wins`}
                className={`text-[13px] font-medium ${wins > 0 ? "text-win" : "text-dim"}`}
              >
                {wins} W
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
