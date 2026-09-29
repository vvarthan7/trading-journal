import { useMemo } from "react";
import { useJournal } from "../store";
import { LEVELS, TRADES_PER_LEVEL, WINS_TO_ADVANCE, levelWins, money, plain } from "../lib/format";
import { buildRows } from "../lib/tradeGroups";
import { FIRST_MATCHED_LEVEL, journalPnl } from "../lib/levelPnl";

const COLS = "grid grid-cols-[72px_1fr_40px_76px_76px_76px_44px] items-center gap-5";

/**
 * Six levels of ten boxes each. Every journal entry lands in the next box of the level picked
 * for it. Once any entry sits on a higher level, a lower level's unused boxes read "—". A level
 * stays locked until the one below has `WINS_TO_ADVANCE` wins, and reads done once it has them.
 *
 * Profit and loss taken come from the broker: from `FIRST_MATCHED_LEVEL` up, each entry is
 * matched to a synced trade (`journalPnl`), and entries with no match are left out of the sums.
 */
export default function LevelPlay() {
  const { journal, dbTrades, tradeGroups } = useJournal();
  const highest = Math.max(0, ...journal.map((e) => e.level));
  const pnl = useMemo(
    () => journalPnl(journal, buildRows(dbTrades, tradeGroups)),
    [journal, dbTrades, tradeGroups]
  );

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
        <div className={COLS}>
          <span />
          <div className="grid grid-cols-10 gap-3">
            {Array.from({ length: TRADES_PER_LEVEL }, (_, b) => (
              <span key={b} className="text-center text-[11.5px] text-dim">
                {b + 1}
              </span>
            ))}
          </div>
          <span />
          <span className="text-right text-[11.5px] text-dim">Total loss</span>
          <span className="text-right text-[11.5px] text-dim">Profit taken</span>
          <span className="text-right text-[11.5px] text-dim">Loss taken</span>
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
          const done = wins >= WINS_TO_ADVANCE;
          const taken = entries.flatMap((e) => (pnl.has(e.id) ? [pnl.get(e.id) as number] : []));
          const profit = taken.filter((n) => n > 0).reduce((a, n) => a + n, 0);
          const loss = taken.filter((n) => n < 0).reduce((a, n) => a + n, 0);
          const matchedTitle =
            level < FIRST_MATCHED_LEVEL
              ? "Not matched to broker trades below level 2"
              : `${taken.length} of ${entries.length} trades matched to the broker`;
          return (
            <div key={level} className={COLS}>
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
                          ? `Trade ${journal.indexOf(entry) + 1}` +
                            (pnl.has(entry.id) ? ` · ${money(Math.round(pnl.get(entry.id) as number))}` : "")
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
              <span
                title={`${level} lot${level > 1 ? "s" : ""} · 65 qty · 10 pts × ${TRADES_PER_LEVEL} trades`}
                className="text-right text-[13px] text-loss"
              >
                {plain(level * 65 * 10 * TRADES_PER_LEVEL)}
              </span>
              <span
                title={matchedTitle}
                className={`text-right text-[13px] ${profit > 0 ? "text-win" : "text-dim"}`}
              >
                {taken.length > 0 ? money(Math.round(profit)) : "—"}
              </span>
              <span
                title={matchedTitle}
                className={`text-right text-[13px] ${loss < 0 ? "text-loss" : "text-dim"}`}
              >
                {taken.length > 0 ? money(Math.round(loss)) : "—"}
              </span>
              <span className="flex justify-end">
                {done && (
                  <span
                    title={`${wins} wins — level done`}
                    className="flex items-center gap-1 text-[11.5px] px-2 py-[1px] rounded-sm bg-accent-line text-accent-ink"
                  >
                    <i className="ph ph-check text-[11px]" />
                    Done
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
