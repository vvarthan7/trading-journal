import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { JournalEntry, PlanAdherence, QueuedFill, Trade } from "./types";
import { missingFields, nextLevel, nowLocalInput } from "./lib/format";
import { supabase } from "./lib/supabase";
import { fromRow, toRow } from "./lib/journalRows";
import type { JournalRow } from "./lib/journalRows";
import { brokerConfigured as isBrokerConfigured, fetchTradeBook } from "./lib/smartapi";
import { toLots } from "./lib/tradeLots";
import { fromRow as tradeFromRow, toInsert } from "./lib/tradeRows";
import type { DbTrade, TradeRow } from "./lib/tradeRows";
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

  /** Lots stored in `public.trades`, newest first. */
  dbTrades: DbTrade[];
  tradesLoading: boolean;
  tradesError: string | null;
  syncing: boolean;
  /** False until the SmartAPI credentials are filled in `.env.local`. */
  brokerConfigured: boolean;
  /** Pull today's fills, FIFO-match them into lots, and upsert them into `trades`. */
  syncBrokerTrades: () => Promise<void>;
  /** The initial stop loss, typed by hand. Postgres recomputes risk and R from it. */
  setTradeStop: (id: number, stop: number | null) => void;

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
  const [dbTrades, setDbTrades] = useState<DbTrade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
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

  /** Pending stop writes per row, debounced like the journal's edits. */
  const pendingStops = useRef(new Map<number, number>());

  const loadTrades = useCallback(async () => {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      .order("trade_date", { ascending: false })
      .order("entry_time", { ascending: false });
    if (error) setTradesError(error.message);
    else {
      setDbTrades((data as TradeRow[]).map(tradeFromRow));
      setTradesError(null);
    }
    setTradesLoading(false);
  }, []);

  useEffect(() => {
    void loadTrades();
  }, [loadTrades]);

  const syncBrokerTrades = useCallback(async () => {
    if (!isBrokerConfigured()) return;
    setSyncing(true);
    try {
      const lots = toLots(await fetchTradeBook());
      if (lots.length > 0) {
        // Keyed on (user_id, entry_fill_id, lot_seq), so re-running a sync updates the rows it
        // wrote before rather than duplicating them — and leaves stop_price untouched.
        const { data, error } = await supabase
          .from("trades")
          .upsert(lots.map(toInsert), { onConflict: "user_id,entry_fill_id,lot_seq" })
          .select("id");
        if (error) throw new Error(error.message);
        if (!data.length) throw new Error(NOT_SAVED);
      }
      await loadTrades();
    } catch (e) {
      setTradesError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [loadTrades]);

  const flushStop = useCallback(
    async (id: number, stop: number | null) => {
      pendingStops.current.delete(id);
      const { data, error } = await supabase
        .from("trades")
        .update({ stop_price: stop })
        .eq("id", id)
        .select("id");
      if (error || !data.length) setTradesError(error?.message ?? NOT_SAVED);
      else setTradesError(null);
      // Reload either way: Postgres recomputes initial_risk and rr from the new stop.
      void loadTrades();
    },
    [loadTrades]
  );

  const setTradeStop = useCallback(
    (id: number, stop: number | null) => {
      setDbTrades((prev) => prev.map((t) => (t.id === id ? { ...t, stopPrice: stop } : t)));
      const timer = pendingStops.current.get(id);
      if (timer) clearTimeout(timer);
      pendingStops.current.set(
        id,
        window.setTimeout(() => void flushStop(id, stop), SAVE_DELAY_MS)
      );
    },
    [flushStop]
  );

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
    // Every existing row must be complete before another can be started.
    if (journal.some((e) => missingFields(e).size > 0)) return;
    // …and there must be a level with room for it that has been unlocked.
    const level = nextLevel(journal);
    if (level === null) return;
    const { data, error } = await supabase
      .from("journal_entries")
      .insert({ date_time: nowLocalInput(), level })
      .select()
      .single();
    if (error) {
      setSyncError(error.message);
      return;
    }
    setSyncError(null);
    setJournal((prev) => [...prev, fromRow(data as JournalRow)]);
  }, [journal]);

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

      dbTrades,
      tradesLoading,
      tradesError,
      syncing,
      brokerConfigured: isBrokerConfigured(),
      syncBrokerTrades,
      setTradeStop,

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
      dbTrades,
      tradesLoading,
      tradesError,
      syncing,
      syncBrokerTrades,
      setTradeStop,
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
