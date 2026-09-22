import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { JournalEntry, PlanAdherence, QueuedFill, Trade } from "./types";
import { missingFields, nextLevel, nowLocalInput, todayIso } from "./lib/format";
import { supabase } from "./lib/supabase";
import { fromRow, toRow } from "./lib/journalRows";
import type { JournalRow } from "./lib/journalRows";
import { brokerConfigured as isBrokerConfigured, fetchTradeBook } from "./lib/smartapi";
import { toLots } from "./lib/tradeLots";
import { fromRow as tradeFromRow, toInsert } from "./lib/tradeRows";
import type { DbTrade, TradeRow } from "./lib/tradeRows";
import { fromRow as groupFromRow, toRow as groupToRow } from "./lib/tradeGroups";
import type { GroupDraft, TradeGroup, TradeGroupRow } from "./lib/tradeGroups";
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

  /** Every lot stored in `public.trades`, newest first. Read from Supabase, never the broker. */
  dbTrades: DbTrade[];
  /** The `dbTrades` dated today — what the Trades screen works on. */
  todayTrades: DbTrade[];
  tradesLoading: boolean;
  tradesError: string | null;
  syncing: boolean;
  /** False until the SmartAPI credentials are filled in `.env.local`. */
  brokerConfigured: boolean;
  /** Pull today's fills, FIFO-match them into lots, and upsert them into `trades`. */
  syncBrokerTrades: () => Promise<void>;
  /** Re-read `trades` from Supabase. No broker call — this is what the history screen uses. */
  reloadTrades: () => Promise<void>;
  /** The initial stop loss, typed by hand. Postgres recomputes risk and R from it. */
  setTradeStop: (id: number, stop: number | null) => void;
  /** A single lot's trade type. '' restores the type derived from the instrument. */
  setTradeType: (id: number, type: string) => void;

  /** Every basket stored in `trade_groups`. Legs point at them through `DbTrade.groupId`. */
  tradeGroups: TradeGroup[];
  /** Create a basket out of `legIds` and move those legs into it. Resolves to its id. */
  createGroup: (draft: GroupDraft, legIds: number[]) => Promise<number | null>;
  updateGroup: (id: number, patch: Partial<TradeGroup>) => void;
  /** Delete the basket. Its legs survive and become single trades again. */
  deleteGroup: (id: number) => Promise<void>;
  /** Move one leg into a basket, or out of the one it is in. */
  setTradeGroup: (tradeId: number, groupId: number | null) => void;
  /** The level's risk per trade — a placeholder for the basket risk box, never stored. */
  expectedRiskPerTrade: number | null;

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
  const [tradeGroups, setTradeGroups] = useState<TradeGroup[]>([]);
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

  /** Unsaved column patch and its pending save timer, per `trades` row. */
  const pendingTrades = useRef(new Map<number, { row: Record<string, unknown>; timer: number }>());

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

  const loadGroups = useCallback(async () => {
    const { data, error } = await supabase
      .from("trade_groups")
      .select("*")
      .order("trade_date", { ascending: false });
    if (error) setTradesError(error.message);
    else setTradeGroups((data as TradeGroupRow[]).map(groupFromRow));
  }, []);

  useEffect(() => {
    void loadTrades();
    void loadGroups();
  }, [loadTrades, loadGroups]);

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

  const flushTrade = useCallback(
    async (id: number) => {
      const item = pendingTrades.current.get(id);
      if (!item) return;
      clearTimeout(item.timer);
      pendingTrades.current.delete(id);

      const { data, error } = await supabase
        .from("trades")
        .update(item.row)
        .eq("id", id)
        .select("id");
      const failed = Boolean(error) || !data || data.length === 0;
      setTradesError(failed ? (error?.message ?? NOT_SAVED) : null);
      // A rejected write must never leave its optimistic value sitting on screen looking saved,
      // so any failure re-reads the truth. RLS rejects by matching zero rows rather than
      // erroring, which is why `data.length` counts as a failure here too.
      if (failed || "stop_price" in item.row) void loadTrades();
    },
    [loadTrades]
  );

  /** Apply a patch locally at once and batch the write, the way journal edits work. */
  const patchTrade = useCallback(
    (id: number, local: Partial<DbTrade>, row: Record<string, unknown>) => {
      setDbTrades((prev) => prev.map((t) => (t.id === id ? { ...t, ...local } : t)));
      const prev = pendingTrades.current.get(id);
      if (prev) clearTimeout(prev.timer);
      pendingTrades.current.set(id, {
        row: { ...prev?.row, ...row },
        timer: window.setTimeout(() => void flushTrade(id), SAVE_DELAY_MS),
      });
    },
    [flushTrade]
  );

  const setTradeStop = useCallback(
    (id: number, stop: number | null) => patchTrade(id, { stopPrice: stop }, { stop_price: stop }),
    [patchTrade]
  );

  const setTradeType = useCallback(
    (id: number, type: string) => patchTrade(id, { tradeType: type }, { trade_type: type }),
    [patchTrade]
  );

  const setTradeGroup = useCallback(
    (id: number, groupId: number | null) =>
      patchTrade(id, { groupId }, { group_id: groupId }),
    [patchTrade]
  );

  /** Unsaved column patch and its pending save timer, per `trade_groups` row. */
  const pendingGroups = useRef(new Map<number, { row: Record<string, unknown>; timer: number }>());

  const flushGroup = useCallback(
    async (id: number) => {
      const item = pendingGroups.current.get(id);
      if (!item) return;
      clearTimeout(item.timer);
      pendingGroups.current.delete(id);

      const { data, error } = await supabase
        .from("trade_groups")
        .update(item.row)
        .eq("id", id)
        .select("id");
      const failed = Boolean(error) || !data || data.length === 0;
      setTradesError(failed ? (error?.message ?? NOT_SAVED) : null);
      // Same contract as flushTrade: a rejected write must never leave its optimistic value on
      // screen looking saved, and RLS rejects by matching zero rows rather than erroring.
      if (failed) void loadGroups();
    },
    [loadGroups]
  );

  const updateGroup = useCallback(
    (id: number, patch: Partial<TradeGroup>) => {
      setTradeGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
      const row = groupToRow(patch);
      if (Object.keys(row).length === 0) return;
      const prev = pendingGroups.current.get(id);
      if (prev) clearTimeout(prev.timer);
      pendingGroups.current.set(id, {
        row: { ...prev?.row, ...row },
        timer: window.setTimeout(() => void flushGroup(id), SAVE_DELAY_MS),
      });
    },
    [flushGroup]
  );

  /**
   * Insert the basket, then move its legs into it. Two writes rather than one because the legs
   * need an id that only exists once the first has returned; if the second fails the basket is
   * deleted again, so a half-made group with no legs never survives.
   */
  const createGroup = useCallback(
    async (draft: GroupDraft, legIds: number[]): Promise<number | null> => {
      if (legIds.length === 0) return null;
      const legs = dbTrades.filter((t) => legIds.includes(t.id));
      const tradeDate = legs.map((t) => t.tradeDate).sort()[0] ?? todayIso();

      const { data, error } = await supabase
        .from("trade_groups")
        .insert({ ...groupToRow(draft), trade_date: tradeDate })
        .select()
        .single();
      if (error || !data) {
        setTradesError(error?.message ?? NOT_SAVED);
        return null;
      }

      const group = groupFromRow(data as TradeGroupRow);
      const moved = await supabase
        .from("trades")
        .update({ group_id: group.id })
        .in("id", legIds)
        .select("id");
      if (moved.error || !moved.data.length) {
        setTradesError(moved.error?.message ?? NOT_SAVED);
        await supabase.from("trade_groups").delete().eq("id", group.id);
        return null;
      }

      setTradesError(null);
      setTradeGroups((prev) => [...prev, group]);
      setDbTrades((prev) =>
        prev.map((t) => (legIds.includes(t.id) ? { ...t, groupId: group.id } : t))
      );
      return group.id;
    },
    [dbTrades]
  );

  /** `on delete set null` frees the legs, so ungrouping never touches broker fact. */
  const deleteGroup = useCallback(
    async (id: number) => {
      const item = pendingGroups.current.get(id);
      if (item) {
        clearTimeout(item.timer);
        pendingGroups.current.delete(id);
      }
      setTradeGroups((prev) => prev.filter((g) => g.id !== id));
      setDbTrades((prev) => prev.map((t) => (t.groupId === id ? { ...t, groupId: null } : t)));

      const { data, error } = await supabase
        .from("trade_groups")
        .delete()
        .eq("id", id)
        .select("id");
      if (error || !data.length) {
        setTradesError(error?.message ?? NOT_SAVED);
        await loadGroups();
        void loadTrades();
      } else {
        setTradesError(null);
      }
    },
    [loadGroups, loadTrades]
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
    const onHide = () => {
      void flushAll();
      for (const id of [...pendingTrades.current.keys()]) void flushTrade(id);
      for (const id of [...pendingGroups.current.keys()]) void flushGroup(id);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flushAll, flushTrade, flushGroup]);

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

  /** Recomputed only when the stored lots change; the date is read once per pass. */
  const todayTrades = useMemo(() => {
    const date = todayIso();
    return dbTrades.filter((t) => t.tradeDate === date);
  }, [dbTrades]);

  /**
   * What a trade is supposed to risk at the level being played — `level × 65 × 10`, the same
   * formula the Level play grid's "Total loss" column uses. Shown as the basket risk box's
   * placeholder so the expected number is visible while typing the actual one; never stored.
   */
  const expectedRiskPerTrade = useMemo(() => {
    const level = nextLevel(journal);
    return level === null ? null : level * 65 * 10;
  }, [journal]);

  const value = useMemo<JournalState>(
    () => ({
      session,
      signIn,
      signOut,

      trades,
      updateTrade: (id, patch) =>
        setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),

      dbTrades,
      todayTrades,
      tradesLoading,
      tradesError,
      syncing,
      brokerConfigured: isBrokerConfigured(),
      syncBrokerTrades,
      reloadTrades: loadTrades,
      setTradeStop,
      setTradeType,

      tradeGroups,
      createGroup,
      updateGroup,
      deleteGroup,
      setTradeGroup,
      expectedRiskPerTrade,

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
      todayTrades,
      tradesLoading,
      tradesError,
      syncing,
      syncBrokerTrades,
      loadTrades,
      setTradeStop,
      setTradeType,
      tradeGroups,
      createGroup,
      updateGroup,
      deleteGroup,
      setTradeGroup,
      expectedRiskPerTrade,
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
