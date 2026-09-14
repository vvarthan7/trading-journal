import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { JournalEntry, PlanAdherence, QueuedFill, Trade } from "./types";
import { nowLocalInput } from "./lib/format";
import { supabase } from "./lib/supabase";
import { fromRow, toRow } from "./lib/journalRows";
import type { JournalRow } from "./lib/journalRows";
import {
  CAPITAL_EVENTS,
  CAPTURE_RULES,
  CAPTURE_SOURCES,
  EQUITY,
  GATE,
  HARD_LIMITS,
  PLAYBOOK,
  QUEUE,
  RULE_FLAGS,
  TODAY,
  TRADES,
  WINDOWS,
} from "./data/mock";

type CaptureMode = "review" | "auto";

/** Edits to a row are batched and written this long after the last keystroke or pick. */
const SAVE_DELAY_MS = 500;

/** RLS rejects a write by matching zero rows rather than erroring. */
const NOT_SAVED = "Not saved — are you still signed in?";

interface JournalState {
  session: Session | null;
  /** Resolves to an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;

  trades: Trade[];
  updateTrade: (id: number, patch: Partial<Trade>) => void;

  journal: JournalEntry[];
  journalLoading: boolean;
  /** Last failed Supabase read or write, cleared by the next successful write. */
  syncError: string | null;
  addJournalEntry: () => Promise<void>;
  updateJournalEntry: (id: number, patch: Partial<JournalEntry>) => void;
  removeJournalEntry: (id: number) => Promise<void>;

  queue: QueuedFill[];
  acceptFill: (id: number) => void;
  discardFill: (id: number) => void;

  captureMode: CaptureMode;
  setCaptureMode: (m: CaptureMode) => void;

  sessionFocus: number;
  setSessionFocus: (n: number) => void;

  gateChecked: number[];
  toggleGate: (id: number) => void;

  gate: typeof GATE;
  windows: typeof WINDOWS;
  capitalEvents: typeof CAPITAL_EVENTS;
  equity: number[];
  today: typeof TODAY;
  ruleFlags: typeof RULE_FLAGS;
  playbook: typeof PLAYBOOK;
  hardLimits: typeof HARD_LIMITS;
  captureSources: typeof CAPTURE_SOURCES;
  captureRules: typeof CAPTURE_RULES;
}

const Ctx = createContext<JournalState | null>(null);

export function JournalProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [trades, setTrades] = useState<Trade[]>(TRADES);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedFill[]>(QUEUE);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("review");
  const [sessionFocus, setSessionFocus] = useState<number>(TODAY.focus);
  const [gateChecked, setGateChecked] = useState<number[]>(TODAY.gateChecked);

  /** Unsaved patch and its pending save timer, per journal row. */
  const pending = useRef(new Map<number, { patch: Partial<JournalEntry>; timer: number }>());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadJournal = useCallback(async () => {
    const { data, error } = await supabase.from("journal_entries").select("*").order("id");
    if (error) setSyncError(error.message);
    else setJournal((data as JournalRow[]).map(fromRow));
    setJournalLoading(false);
  }, []);

  useEffect(() => {
    void loadJournal();
  }, [loadJournal]);

  /** Write a row's batched patch now. On failure, show why and reload the truth from the DB. */
  const flush = useCallback(
    async (id: number) => {
      const item = pending.current.get(id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.current.delete(id);

      const row = toRow(item.patch);
      if (Object.keys(row).length === 0) return;
      const { data, error } = await supabase
        .from("journal_entries")
        .update(row)
        .eq("id", id)
        .select("id");
      if (error || !data.length) {
        setSyncError(error?.message ?? NOT_SAVED);
        void loadJournal();
      } else {
        setSyncError(null);
      }
    },
    [loadJournal]
  );

  const flushAll = useCallback(
    () => Promise.all([...pending.current.keys()].map(flush)).then(() => undefined),
    [flush]
  );

  useEffect(() => {
    const onHide = () => void flushAll();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flushAll]);

  const addJournalEntry = useCallback(async () => {
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({ date_time: nowLocalInput() })
      .select()
      .single();
    if (error) {
      setSyncError(error.message);
      return;
    }
    setSyncError(null);
    setJournal((prev) => [...prev, fromRow(data as JournalRow)]);
  }, []);

  const updateJournalEntry = useCallback(
    (id: number, patch: Partial<JournalEntry>) => {
      setJournal((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      const prev = pending.current.get(id);
      if (prev) clearTimeout(prev.timer);
      pending.current.set(id, {
        patch: { ...prev?.patch, ...patch },
        timer: window.setTimeout(() => void flush(id), SAVE_DELAY_MS),
      });
    },
    [flush]
  );

  const removeJournalEntry = useCallback(
    async (id: number) => {
      const item = pending.current.get(id);
      if (item) {
        clearTimeout(item.timer);
        pending.current.delete(id);
      }
      setJournal((prev) => prev.filter((e) => e.id !== id));
      const { data, error } = await supabase
        .from("journal_entries")
        .delete()
        .eq("id", id)
        .select("id");
      if (error || !data.length) {
        setSyncError(error?.message ?? NOT_SAVED);
        void loadJournal();
      } else {
        setSyncError(null);
      }
    },
    [loadJournal]
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await flushAll();
    await supabase.auth.signOut();
  }, [flushAll]);

  const value = useMemo<JournalState>(
    () => ({
      session,
      signIn,
      signOut,

      trades,
      updateTrade: (id, patch) =>
        setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),

      journal,
      journalLoading,
      syncError,
      addJournalEntry,
      updateJournalEntry,
      removeJournalEntry,

      queue,
      acceptFill: (id) => setQueue((prev) => prev.filter((q) => q.id !== id)),
      discardFill: (id) => setQueue((prev) => prev.filter((q) => q.id !== id)),

      captureMode,
      setCaptureMode,

      sessionFocus,
      setSessionFocus,

      gateChecked,
      toggleGate: (id) =>
        setGateChecked((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        ),

      gate: GATE,
      windows: WINDOWS,
      capitalEvents: CAPITAL_EVENTS,
      equity: EQUITY,
      today: TODAY,
      ruleFlags: RULE_FLAGS,
      playbook: PLAYBOOK,
      hardLimits: HARD_LIMITS,
      captureSources: CAPTURE_SOURCES,
      captureRules: CAPTURE_RULES,
    }),
    [
      session,
      signIn,
      signOut,
      trades,
      journal,
      journalLoading,
      syncError,
      addJournalEntry,
      updateJournalEntry,
      removeJournalEntry,
      queue,
      captureMode,
      sessionFocus,
      gateChecked,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJournal(): JournalState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useJournal must be used inside <JournalProvider>");
  return v;
}

export type { PlanAdherence };
