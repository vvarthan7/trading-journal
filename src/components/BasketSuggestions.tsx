/**
 * Baskets the app thinks were one decision, offered after a sync.
 *
 * Nothing here is automatic. A suggestion is a proposal with an editable name and type; no
 * basket exists until Accept is clicked, and dismissing one only hides the card for this visit.
 * If the heuristic is wrong the cost is a card you ignore.
 */
import { useMemo, useState } from "react";
import { useJournal } from "../store";
import { suggestBaskets } from "../lib/basketSuggest";
import type { GroupDirection } from "../lib/tradeGroups";
import { TRADE_TYPES } from "../lib/tradeTypes";
import { price } from "../lib/format";

/** A suggestion is identified by its legs, so it survives the list being recomputed. */
function keyOf(ids: number[]): string {
  return ids.join(",");
}

export default function BasketSuggestions({ scope }: { scope: "today" | "all" }) {
  const { dbTrades, todayTrades, createGroup, session } = useJournal();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { name: string; tradeType: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const source = scope === "today" ? todayTrades : dbTrades;
  const suggestions = useMemo(() => suggestBaskets(source), [source]);

  const shown = suggestions.filter((s) => !dismissed.has(keyOf(s.legs.map((l) => l.id))));
  if (!session || shown.length === 0) return null;

  /** On success the legs gain a groupId, so the suggestion drops out of the list by itself. */
  const accept = async (
    key: string,
    name: string,
    tradeType: string,
    direction: GroupDirection,
    ids: number[]
  ) => {
    setSaving(key);
    await createGroup({ name: name.trim(), tradeType, direction }, ids);
    setSaving(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {shown.map((s) => {
        const ids = s.legs.map((l) => l.id);
        const key = keyOf(ids);
        const edit = edits[key] ?? { name: s.name, tradeType: s.tradeType };
        const patch = (p: Partial<typeof edit>) =>
          setEdits((prev) => ({ ...prev, [key]: { ...edit, ...p } }));

        return (
          <div
            key={key}
            className="border border-accent-line rounded-md bg-[rgba(145,132,217,0.06)] px-6 py-4 flex flex-col gap-3"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <i className="ph ph-stack text-[14px] text-accent-deep" />
              <span className="text-[12.5px] text-accent-deep font-medium">
                These {s.legs.length} legs look like one trade
              </span>
              <span className="text-[11.5px] text-dim">
                {s.legs[0].entryTime} · {s.direction}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              {s.legs.map((l) => (
                <div key={l.id} className="flex items-center gap-4 text-[12px] text-muted">
                  <span className="w-[52px] text-dim">{l.direction}</span>
                  <span className="min-w-[180px] text-ink-2">{l.instrument}</span>
                  <span className="w-[52px]">{l.quantity}</span>
                  <span className="text-dim">@ {price(l.entryPrice)}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <input
                value={edit.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="w-[240px] px-4 py-[5px] text-[12.5px] rounded-sm border border-line-strong bg-bg text-ink focus:border-accent"
              />
              <select
                value={edit.tradeType}
                onChange={(e) => patch({ tradeType: e.target.value })}
                className="px-2 py-[5px] text-[12.5px] rounded-sm border border-line-strong bg-bg text-ink focus:border-accent"
              >
                <option value="">Trade type…</option>
                {TRADE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving === key || edit.name.trim() === ""}
                onClick={() => void accept(key, edit.name, edit.tradeType, s.direction, ids)}
                className="px-4 py-[5px] text-[12px] rounded-sm border border-accent bg-[rgba(145,132,217,0.16)] text-accent-deep cursor-pointer disabled:opacity-40 disabled:cursor-default"
              >
                {saving === key ? "Grouping…" : "Accept"}
              </button>
              <button
                type="button"
                onClick={() => setDismissed((prev) => new Set(prev).add(key))}
                className="px-4 py-[5px] text-[12px] rounded-sm border border-line-strong bg-transparent text-dim cursor-pointer transition-colors hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
