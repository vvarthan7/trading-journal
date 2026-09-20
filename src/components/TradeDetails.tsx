/**
 * The hand-entered half of the trade detail screen — the idea, the strategies used, and the
 * notes thread — all backed by `public.trade_details`. One read serves all three, which is the
 * point of them sharing a table.
 *
 * The idea is debounced like the journal's fields, because it is one box you keep editing. A
 * note is posted deliberately, so it writes on Add and commits on Save; a half-typed note is
 * never stored.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useJournal } from "../store";
import {
  addDetail,
  editDetail,
  listDetails,
  removeDetail,
  saveIdea,
  type TradeDetail,
} from "../lib/tradeDetails";
import { STRATEGIES } from "../lib/strategies";
import { stampLabel } from "../lib/format";
import { Divider, Eyebrow } from "./ui";

/** Matches the journal's batching delay. */
const SAVE_DELAY_MS = 500;

export default function TradeDetails({ tradeId }: { tradeId: number }) {
  const { session } = useJournal();
  const signedIn = Boolean(session);

  const [notes, setNotes] = useState<TradeDetail[]>([]);
  /** One row per strategy selected. The rows are the selection — there is no array anywhere. */
  const [strategies, setStrategies] = useState<TradeDetail[]>([]);
  /** The stored idea row, or null when the trade has none yet. */
  const [ideaId, setIdeaId] = useState<number | null>(null);
  const [idea, setIdea] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  /** Pending idea save, so typing does not write on every keystroke. */
  const ideaTimer = useRef<number | undefined>(undefined);
  /** Text typed but not yet written, and a stable handle on the writer for the unmount flush. */
  const unsavedIdea = useRef<string | null>(null);
  const flushRef = useRef<(body: string) => void>(() => {});

  const refresh = useCallback(async () => {
    try {
      const rows = await listDetails(tradeId);
      const stored = rows.find((r) => r.kind === "idea") ?? null;
      setIdeaId(stored?.id ?? null);
      setIdea(stored?.body ?? "");
      setNotes(rows.filter((r) => r.kind === "note"));
      setStrategies(rows.filter((r) => r.kind === "strategy"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [tradeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh();
    }
    setBusy(false);
  };

  const flushIdea = useCallback(
    (body: string) => {
      clearTimeout(ideaTimer.current);
      unsavedIdea.current = null;
      void (async () => {
        try {
          setIdeaId(await saveIdea(tradeId, ideaId, body));
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    },
    [tradeId, ideaId]
  );

  flushRef.current = flushIdea;

  const typeIdea = (body: string) => {
    setIdea(body);
    unsavedIdea.current = body;
    clearTimeout(ideaTimer.current);
    ideaTimer.current = window.setTimeout(() => flushIdea(body), SAVE_DELAY_MS);
  };

  /**
   * Navigating away mid-sentence unmounts without firing blur, so the pending text is written
   * here. Refs rather than deps, so this only ever runs on the way out.
   */
  useEffect(() => {
    return () => {
      clearTimeout(ideaTimer.current);
      if (unsavedIdea.current !== null) flushRef.current(unsavedIdea.current);
    };
  }, []);

  const post = () =>
    run(async () => {
      const body = draft.trim();
      if (!body) return;
      const saved = await addDetail(tradeId, "note", body);
      setNotes((prev) => [...prev, saved]);
      setDraft("");
    });

  const saveEdit = (id: number) =>
    run(async () => {
      const body = editDraft.trim();
      if (!body) return;
      await editDetail(id, body);
      const now = new Date().toISOString();
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, body, updatedAt: now } : n)));
      setEditing(null);
    });

  /** One click is one row: add it, or delete the one that is there. */
  const toggleStrategy = (name: string, row: TradeDetail | undefined) =>
    run(async () => {
      if (row) {
        await removeDetail(row.id);
        setStrategies((prev) => prev.filter((s) => s.id !== row.id));
      } else {
        const saved = await addDetail(tradeId, "strategy", name);
        setStrategies((prev) => [...prev, saved]);
      }
    });

  const drop = (id: number) =>
    run(async () => {
      await removeDetail(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (editing === id) setEditing(null);
    });

  return (
    <>
      {/* Idea — the only part of a trade the broker cannot tell us */}
      <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px] font-medium">Trade idea</span>
          <span className="text-[12px] text-dim">Why you took it</span>
        </div>
        <textarea
          value={idea}
          onChange={(e) => typeIdea(e.target.value)}
          onBlur={() => {
            clearTimeout(ideaTimer.current);
            flushIdea(idea);
          }}
          disabled={!signedIn || loading}
          placeholder={
            signedIn
              ? "The level, the read, what had to happen for this to work."
              : "Sign in to write the idea."
          }
          className="bg-bg border border-line-strong rounded-md text-ink text-[13.5px] leading-[1.6] px-4 py-4 min-h-[86px] resize-y focus:border-accent disabled:opacity-60"
        />

        <Divider inset={24} />

        <div className="flex items-center justify-between gap-4">
          <Eyebrow>Strategies used</Eyebrow>
          <span className="text-[12px] text-dim">
            {strategies.length === 0 ? "None selected" : `${strategies.length} selected`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {STRATEGIES.map((name) => {
            const row = strategies.find((s) => s.body === name);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={Boolean(row)}
                disabled={busy || !signedIn || loading}
                onClick={() => void toggleStrategy(name, row)}
                className={[
                  "text-[12px] px-3 py-[4px] rounded-sm border cursor-pointer transition-colors disabled:cursor-default disabled:opacity-40",
                  row
                    ? "border-accent bg-[rgba(145,132,217,0.16)] text-accent-deep"
                    : "border-line-strong bg-transparent text-dim hover:text-ink",
                ].join(" ")}
              >
                {name}
              </button>
            );
          })}
        </div>

        {/* Failures used to be silent here: the chip toggled, the write lost, nothing said. */}
        {error && <span className="text-[12.5px] text-loss">{error}</span>}
      </div>

      {/* Notes thread */}
      <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[14px] font-medium">Notes</span>
          <span className="text-[12px] text-dim">
            {loading
              ? "Loading…"
              : notes.length === 0
                ? "Nothing written yet"
                : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
          </span>
        </div>

        {error && <span className="text-[12.5px] text-loss">{error}</span>}

        {/* Oldest first — how the read of the trade developed. */}
        {notes.length > 0 && (
          <div className="flex flex-col gap-3">
            {notes.map((n) => (
              <div
                key={n.id}
                className="border border-line-soft rounded-md bg-bg px-4 py-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[11px] tracking-[0.08em] uppercase text-dim">
                    {stampLabel(n.createdAt)}
                    {n.updatedAt !== n.createdAt && " · edited"}
                  </span>
                  {editing !== n.id && (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busy || !signedIn}
                        onClick={() => {
                          setEditing(n.id);
                          setEditDraft(n.body);
                        }}
                        className="border-0 bg-transparent p-0 text-[11.5px] text-dim cursor-pointer transition-colors hover:text-accent-deep disabled:cursor-default disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy || !signedIn}
                        onClick={() => void drop(n.id)}
                        className="border-0 bg-transparent p-0 text-[11.5px] text-dim cursor-pointer transition-colors hover:text-loss disabled:cursor-default disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {editing === n.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      className="bg-surface border border-line-strong rounded-md text-ink text-[13.5px] leading-[1.6] px-4 py-3 min-h-[76px] resize-y focus:border-accent"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busy || editDraft.trim() === ""}
                        onClick={() => void saveEdit(n.id)}
                        className="px-4 py-[5px] text-[12px] rounded-sm border border-accent bg-[rgba(145,132,217,0.16)] text-accent-deep cursor-pointer disabled:opacity-40 disabled:cursor-default"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="px-4 py-[5px] text-[12px] rounded-sm border border-line-strong bg-transparent text-dim cursor-pointer transition-colors hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Newlines are meaningful in a note; nothing else about it is markup. */
                  <p className="m-0 text-[13.5px] text-ink-2 leading-[1.6] whitespace-pre-wrap">
                    {n.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Composer */}
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter belongs to the note; the shortcut needs a modifier.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void post();
              }
            }}
            disabled={!signedIn}
            placeholder={
              signedIn ? "What happened, and what you'd do again." : "Sign in to add notes."
            }
            className="bg-bg border border-line-strong rounded-md text-ink text-[13.5px] leading-[1.6] px-4 py-4 min-h-[86px] resize-y focus:border-accent disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-4">
            <span className="text-[11.5px] text-dim">Ctrl+Enter to add</span>
            <button
              type="button"
              disabled={busy || !signedIn || draft.trim() === ""}
              onClick={() => void post()}
              className="px-4 py-[5px] text-[12px] rounded-sm border border-line-strong bg-transparent text-muted cursor-pointer transition-colors hover:text-ink disabled:opacity-40 disabled:cursor-default"
            >
              {busy ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
