import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { PlanAdherence, QueuedFill, Trade } from "./types";
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

interface JournalState {
  trades: Trade[];
  updateTrade: (id: number, patch: Partial<Trade>) => void;

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
  const [queue, setQueue] = useState<QueuedFill[]>(QUEUE);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("review");
  const [sessionFocus, setSessionFocus] = useState<number>(TODAY.focus);
  const [gateChecked, setGateChecked] = useState<number[]>(TODAY.gateChecked);

  const value = useMemo<JournalState>(
    () => ({
      trades,
      updateTrade: (id, patch) =>
        setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t))),

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
    [trades, queue, captureMode, sessionFocus, gateChecked]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJournal(): JournalState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useJournal must be used inside <JournalProvider>");
  return v;
}

export type { PlanAdherence };
