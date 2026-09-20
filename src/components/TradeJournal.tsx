import { useJournal } from "../store";
import type { JournalEntry, YesNo } from "../types";
import {
  LEVELS,
  WINS_TO_ADVANCE,
  canUseLevel,
  levelWins,
  missingFields,
  nextLevel,
} from "../lib/format";
import { STRATEGIES } from "../lib/strategies";
import { LOSS, WIN } from "./ui";

const TRADE_TYPES = ["Options Selling", "Options Buying", "Index Futures", "Equity"];

type FlagKey =
  | "rulesFollowed"
  | "positionSizing"
  | "fomo"
  | "revenge"
  | "earlyEntry"
  | "earlyExit"
  | "overtrading"
  | "wrongTrade";

/**
 * Yes/no columns. `good` is the answer that reads green; the other reads red.
 * `head` is the column title with its line break; `label` is the one-line accessible name.
 */
const FLAGS: { key: FlagKey; label: string; head: string; good: YesNo }[] = [
  { key: "rulesFollowed", label: "Rules followed", head: "Rules\nfollowed", good: "yes" },
  { key: "positionSizing", label: "Position sizing", head: "Position\nsizing", good: "yes" },
  { key: "fomo", label: "FOMO", head: "FOMO", good: "no" },
  { key: "revenge", label: "Revenge", head: "Revenge", good: "no" },
  { key: "earlyEntry", label: "Early entry", head: "Early\nentry", good: "no" },
  { key: "earlyExit", label: "Early exit", head: "Early\nexit", good: "no" },
  { key: "overtrading", label: "Overtrading", head: "Over-\ntrading", good: "no" },
  { key: "wrongTrade", label: "Wrong trade", head: "Wrong\ntrade", good: "no" },
];

const YES_NO = [
  { value: "yes" as const, label: "Yes" },
  { value: "no" as const, label: "No" },
];

/**
 * Column order must match the cells rendered per row. `min` is the px floor before scrolling.
 * Two-word titles break onto two lines at the `\n` so columns can stay as narrow as their
 * dropdowns; every title is vertically centred in the header row.
 */
const COLS: { head: string; min: number; fixed?: boolean }[] = [
  { head: "#", min: 30, fixed: true },
  { head: "Level", min: 52, fixed: true },
  { head: "Date &\ntime", min: 176 },
  { head: "Instrument", min: 108 },
  { head: "Trade\ntype", min: 132 },
  { head: "MIS /\nNormal", min: 76 },
  { head: "Strategy", min: 132 },
  { head: "Profit /\nLoss", min: 74 },
  { head: "Skill /\nLuck", min: 68 },
  ...FLAGS.map((f) => ({ head: f.head, min: 66 })),
  { head: "", min: 24, fixed: true },
];

const GAP = 8;
/** px-6 on each row: 2 × 16.8px */
const ROW_PAD = 34;

const TEMPLATE = COLS.map((c) => (c.fixed ? `${c.min}px` : `minmax(${c.min}px, ${c.min}fr)`)).join(" ");
const MIN_WIDTH = COLS.reduce((sum, c) => sum + c.min, 0) + GAP * (COLS.length - 1) + ROW_PAD;

const GRID = { gridTemplateColumns: TEMPLATE, columnGap: GAP };

const FIELD_BASE =
  "w-full h-[30px] px-2 rounded-sm border bg-bg text-[12.5px] text-ink hover:border-accent-line focus-visible:border-accent disabled:cursor-default transition-colors";

/** Field classes. An empty required field keeps a warn border until it's filled. */
const field = (missing = false) =>
  `${FIELD_BASE} ${
    missing
      ? "border-warn disabled:hover:border-warn"
      : "border-line-strong disabled:hover:border-line-strong"
  }`;

function Choice<T extends string>({
  value,
  options,
  onChange,
  tone,
  label,
  missing,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T | null) => void;
  tone?: (v: T) => string | undefined;
  label: string;
  missing?: boolean;
}) {
  return (
    <select
      aria-label={label}
      aria-invalid={missing || undefined}
      required
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as T))}
      className={`${field(missing)} cursor-pointer`}
      style={{ color: value && tone ? tone(value) : value ? undefined : "var(--color-dim)" }}
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const asOptions = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));

const LEVEL_OPTIONS = Array.from({ length: LEVELS }, (_, i) => i + 1);

/** Quick per-trade journal: one editable row per trade, behaviour flags as yes/no. */
export default function TradeJournal() {
  const {
    session,
    journal,
    journalLoading,
    syncError,
    addJournalEntry,
    updateJournalEntry,
    removeJournalEntry,
  } = useJournal();
  const canEdit = session !== null;

  const set = (id: number, patch: Partial<JournalEntry>) => updateJournalEntry(id, patch);

  /** Per-row empty required fields; only flagged for the owner, who can fill them. */
  const missing = journal.map((e) => (canEdit ? missingFields(e) : new Set<keyof JournalEntry>()));
  /** 1-based numbers of rows that still have an empty field. */
  const incomplete = missing.flatMap((m, i) => (m.size > 0 ? [i + 1] : []));

  /** Why no new row can go on any level, or null when one can. */
  const last = journal[journal.length - 1];
  const levelBlock =
    !last || nextLevel(journal) !== null
      ? null
      : last.level === LEVELS
        ? `Level ${LEVELS} is full.`
        : `Level ${last.level} is full with ${levelWins(journal, last.level)} wins — ${WINS_TO_ADVANCE} are needed to move to level ${last.level + 1}.`;

  return (
    <div className="border border-line rounded-md overflow-hidden bg-surface">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-line">
        <i className="ph ph-notebook text-[16px] text-accent-deep" />
        <span className="text-[14px] font-medium">Trade journal</span>
        <span className="text-[11.5px] text-dim">
          {journal.length} {journal.length === 1 ? "entry" : "entries"}
        </span>
        {syncError ? (
          <span className="ml-auto text-[11.5px] text-loss">{syncError}</span>
        ) : (
          !canEdit && (
            <span className="ml-auto flex items-center gap-1 text-[11.5px] text-dim">
              <i className="ph ph-lock-simple text-[12px]" />
              Read only
            </span>
          )
        )}
      </div>

      <div className="overflow-x-auto">
        {/* A disabled fieldset makes every control inside it read-only in one place. */}
        <fieldset disabled={!canEdit} style={{ minWidth: MIN_WIDTH }}>
          {/* Header row */}
          <div
            className="grid items-center px-6 py-3 border-b border-line-strong text-[10.5px] leading-[1.3] tracking-[0.08em] uppercase text-dim"
            style={GRID}
          >
            {COLS.map((c, i) => (
              <span key={i} className="whitespace-pre-line">
                {c.head}
              </span>
            ))}
          </div>

          {/* Rows */}
          {journal.map((e, i) => (
            <div
              key={e.id}
              className="grid items-center px-6 py-2 border-b border-line-soft hover:bg-subtle transition-colors"
              style={GRID}
            >
              <span className="text-[12.5px] text-dim">{i + 1}</span>
              {/* Picked by hand. A full level, or one whose level below lacks the wins, is greyed out. */}
              <select
                aria-label="Level"
                value={e.level}
                onChange={(ev) => set(e.id, { level: Number(ev.target.value) })}
                className={`${field()} cursor-pointer`}
              >
                {LEVEL_OPTIONS.map((l) => (
                  <option
                    key={l}
                    value={l}
                    disabled={l !== e.level && !canUseLevel(journal, l, e.id)}
                  >
                    {l}
                  </option>
                ))}
              </select>

              <input
                type="datetime-local"
                aria-label="Date and time"
                aria-invalid={missing[i].has("dateTime") || undefined}
                required
                value={e.dateTime}
                onChange={(ev) => set(e.id, { dateTime: ev.target.value })}
                className={field(missing[i].has("dateTime"))}
              />

              <input
                type="text"
                aria-label="Instrument"
                aria-invalid={missing[i].has("instrument") || undefined}
                required
                placeholder="NIFTY"
                value={e.instrument}
                onChange={(ev) => set(e.id, { instrument: ev.target.value.toUpperCase() })}
                className={`${field(missing[i].has("instrument"))} placeholder:text-dim/60`}
              />

              <Choice
                label="Trade type"
                value={e.tradeType}
                options={asOptions(TRADE_TYPES)}
                onChange={(v) => set(e.id, { tradeType: v })}
                missing={missing[i].has("tradeType")}
              />

              <Choice
                label="MIS or Normal"
                value={e.product}
                options={[
                  { value: "mis", label: "MIS" },
                  { value: "normal", label: "Normal" },
                ]}
                onChange={(v) => set(e.id, { product: v })}
                missing={missing[i].has("product")}
              />

              <Choice
                label="Strategy"
                value={e.strategy}
                options={asOptions(STRATEGIES)}
                onChange={(v) => set(e.id, { strategy: v })}
                missing={missing[i].has("strategy")}
              />

              <Choice
                label="Profit or loss"
                value={e.outcome}
                options={[
                  { value: "profit", label: "Profit" },
                  { value: "loss", label: "Loss" },
                ]}
                onChange={(v) => set(e.id, { outcome: v })}
                tone={(v) => (v === "profit" ? WIN : LOSS)}
                missing={missing[i].has("outcome")}
              />

              <Choice
                label="Skill or luck"
                value={e.skillLuck}
                options={[
                  { value: "skill", label: "Skill" },
                  { value: "luck", label: "Luck" },
                ]}
                onChange={(v) => set(e.id, { skillLuck: v })}
                missing={missing[i].has("skillLuck")}
              />

              {FLAGS.map((f) => (
                <Choice
                  key={f.key}
                  label={f.label}
                  value={e[f.key]}
                  options={YES_NO}
                  onChange={(v) => set(e.id, { [f.key]: v })}
                  tone={(v) => (v === f.good ? WIN : LOSS)}
                  missing={missing[i].has(f.key)}
                />
              ))}

              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove row ${i + 1}`}
                  onClick={() => {
                    if (window.confirm(`Delete row ${i + 1}? This can't be undone.`)) {
                      void removeJournalEntry(e.id);
                    }
                  }}
                  className="grid place-items-center h-[24px] w-[24px] rounded-sm border-0 bg-transparent text-dim cursor-pointer hover:text-loss hover:bg-bg transition-colors"
                >
                  <i className="ph ph-x text-[13px]" />
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}

          {journal.length === 0 && (
            <div className="px-6 py-6 text-[12.5px] text-dim">
              {journalLoading ? "Loading…" : "No entries yet."}
            </div>
          )}
        </fieldset>
      </div>

      {canEdit && (
        <div className="flex items-center">
          <button
            type="button"
            disabled={incomplete.length > 0 || levelBlock !== null}
            onClick={() => void addJournalEntry()}
            className="flex items-center gap-2 px-6 py-3 border-0 bg-transparent cursor-pointer text-[12.5px] text-accent-deep hover:bg-subtle disabled:cursor-not-allowed disabled:text-dim disabled:hover:bg-transparent transition-colors"
          >
            <i className="ph ph-plus text-[13px]" />
            Add row
          </button>
          {incomplete.length > 0 ? (
            <span className="ml-auto px-6 text-[11.5px] text-warn">
              Fill in every field in {incomplete.length === 1 ? "row" : "rows"}{" "}
              {incomplete.join(", ")} to add another row.
            </span>
          ) : (
            levelBlock && (
              <span className="ml-auto px-6 text-[11.5px] text-warn">{levelBlock}</span>
            )
          )}
        </div>
      )}
    </div>
  );
}
