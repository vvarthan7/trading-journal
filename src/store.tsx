import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { JournalEntry, PlanAdherence, QueuedFill, Trade } from "./types";
import { nowLocalInput } from "./lib/format";
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

function blankJournalEntry(id: number): JournalEntry {
  return {
    id,
    dateTime: nowLocalInput(),
    instrument: "",
    tradeType: null,
    product: null,
    strategy: null,
    outcome: null,
    skillLuck: null,
    rulesFollowed: null,
    positionSizing: null,
    fomo: null,
    revenge: null,
    earlyEntry: null,
    earlyExit: null,
    overtrading: null,
    wrongTrade: null,
  };
}

interface JournalState {
  trades: Trade[];
  updateTrade: (id: number, patch: Partial<Trade>) => void;

  journal: JournalEntry[];
  addJournalEntry: () => void;
  updateJournalEntry: (id: number, patch: Partial<JournalEntry>) => void;
  removeJournalEntry: (id: number) => void;

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
  const [trades, setTrades] = useState<Trade[]>(TRADES);
  const [journal, setJournal] = useState<JournalEntry[]>(() => [blankJournalEntry(1)]);
  const [queue, setQueue] = useState<QueuedFill[]>(QUEUE);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("review");
  const [sessionFocus, setSessionFocus] = useState<number>(TODAY.focus);
  const [gateChecked, setGateChecked] = useState<number[]>(TODAY.gateChecked);

  const value = useMemo<JournalState>(
    () => ({
      trades,
      updateTrade: (id, patch) =>
        setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),

      journal,
      addJournalEntry: () =>
        setJournal((prev) => [
          ...prev,
          blankJournalEntry(prev.reduce((max, e) => Math.max(max, e.id), 0) + 1),
        ]),
      updateJournalEntry: (id, patch) =>
        setJournal((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e))),
      removeJournalEntry: (id) => setJournal((prev) => prev.filter((e) => e.id !== id)),

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
    [trades, journal, queue, captureMode, sessionFocus, gateChecked]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJournal(): JournalState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useJournal must be used inside <JournalProvider>");
  return v;
}

export type { PlanAdherence };
