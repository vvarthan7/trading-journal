import { useJournal } from "../store";
import type { JournalEntry, YesNo } from "../types";
import { levelOf } from "../lib/format";
import { LOSS, WIN } from "./ui";

const TRADE_TYPES = ["Options Selling", "Options Buying", "Index Futures", "Equity"];

const STRATEGIES = [
  "123",
  "KAR",
  "Adv KAR",
  "ID type A",
  "ID type B",
  "ID type A multi",
  "ID type B multi",
  "ID PP in wick",
  "A.Imb",
  "A.Imb-Fail",
  "D-UW",
];

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
  { head: "Level", min: 44, fixed: true },
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

const FIELD =
  "w-full h-[30px] px-2 rounded-sm border border-line-strong bg-bg text-[12.5px] text-ink hover:border-accent-line focus-visible:border-accent transition-colors";

function Choice<T extends string>({
  value,
  options,
  onChange,
  tone,
  label,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T | null) => void;
  tone?: (v: T) => string | undefined;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as T))}
      className={`${FIELD} cursor-pointer`}
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

/** Quick per-trade journal: one editable row per trade, behaviour flags as yes/no. */
export default function TradeJournal() {
  const { journal, addJournalEntry, updateJournalEntry, removeJournalEntry } = useJournal();

  const set = (id: number, patch: Partial<JournalEntry>) => updateJournalEntry(id, patch);

  return (
    <div className="border border-line rounded-md overflow-hidden bg-surface">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-line">
        <i className="ph ph-notebook text-[16px] text-accent-deep" />
        <span className="text-[14px] font-medium">Trade journal</span>
        <span className="text-[11.5px] text-dim">
          {journal.length} {journal.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: MIN_WIDTH }}>
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
              <span className="text-[12.5px] text-ink-2">{levelOf(i)}</span>

              <input
                type="datetime-local"
                aria-label="Date and time"
                value={e.dateTime}
                onChange={(ev) => set(e.id, { dateTime: ev.target.value })}
                className={FIELD}
              />

              <input
                type="text"
                aria-label="Instrument"
                placeholder="NIFTY"
                value={e.instrument}
                onChange={(ev) => set(e.id, { instrument: ev.target.value.toUpperCase() })}
                className={`${FIELD} placeholder:text-dim/60`}
              />

              <Choice
                label="Trade type"
                value={e.tradeType}
                options={asOptions(TRADE_TYPES)}
                onChange={(v) => set(e.id, { tradeType: v })}
              />

              <Choice
                label="MIS or Normal"
                value={e.product}
                options={[
                  { value: "mis", label: "MIS" },
                  { value: "normal", label: "Normal" },
                ]}
                onChange={(v) => set(e.id, { product: v })}
              />

              <Choice
                label="Strategy"
                value={e.strategy}
                options={asOptions(STRATEGIES)}
                onChange={(v) => set(e.id, { strategy: v })}
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
              />

              <Choice
                label="Skill or luck"
                value={e.skillLuck}
                options={[
                  { value: "skill", label: "Skill" },
                  { value: "luck", label: "Luck" },
                ]}
                onChange={(v) => set(e.id, { skillLuck: v })}
              />

              {FLAGS.map((f) => (
                <Choice
                  key={f.key}
                  label={f.label}
                  value={e[f.key]}
                  options={YES_NO}
                  onChange={(v) => set(e.id, { [f.key]: v })}
                  tone={(v) => (v === f.good ? WIN : LOSS)}
                />
              ))}

              <button
                type="button"
                aria-label={`Remove row ${i + 1}`}
                disabled={journal.length === 1}
                onClick={() => removeJournalEntry(e.id)}
                className="grid place-items-center h-[24px] w-[24px] rounded-sm border-0 bg-transparent text-dim cursor-pointer hover:text-loss hover:bg-bg disabled:opacity-30 disabled:cursor-default disabled:hover:text-dim disabled:hover:bg-transparent transition-colors"
              >
                <i className="ph ph-x text-[13px]" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={addJournalEntry}
        className="flex items-center gap-2 w-full px-6 py-3 border-0 bg-transparent cursor-pointer text-[12.5px] text-accent-deep hover:bg-subtle transition-colors"
      >
        <i className="ph ph-plus text-[13px]" />
        Add row
      </button>
    </div>
  );
}
