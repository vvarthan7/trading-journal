/**
 * Reading a basket out of a set of legs: what kind of trade it is, which way it leans, and —
 * after a sync — which legs look like they were one decision.
 *
 * Nothing here writes. `suggestBaskets` proposes; a basket only exists once it is accepted.
 * `classify` is exported separately because manual grouping needs the same answer: ticking a CE
 * buy and a PE sell at the same strike should pre-fill "Synthetic Futures Long" before anything
 * is typed.
 */
import type { DbTrade } from "./tradeRows";
import type { GroupDirection } from "./tradeGroups";
import { shortDay } from "./format";

/** Legs entered further apart than this were two decisions, not one. */
const WINDOW_MINUTES = 5;

/** Below this share of the gross exposure, the legs offset and the basket is not taking a side. */
const NEUTRAL_BAND = 0.05;

export interface Classification {
  tradeType: string;
  direction: GroupDirection;
}

export interface Suggestion extends Classification {
  legs: DbTrade[];
  name: string;
}

/** "09:21" → minutes past midnight. Missing times sort first and chain freely. */
function mins(hhmm: string): number {
  if (!hhmm) return 0;
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
}

/** What the leg cost or collected — the weight that matters when legs disagree. */
function exposure(t: DbTrade): number {
  return Math.abs(t.entryPrice * t.quantity);
}

/** Which way a leg leans: a bought call and a sold put are both bullish. */
function sign(t: DbTrade): 1 | -1 {
  if (t.optionType === "CE") return t.direction === "long" ? 1 : -1;
  if (t.optionType === "PE") return t.direction === "long" ? -1 : 1;
  return t.direction === "long" ? 1 : -1;
}

/**
 * The net bias of a set of legs, weighted by premium rather than quantity.
 *
 * Quantity would be wrong precisely where it matters: the far-OTM hedge on a synthetic is often
 * bought in double the lots of the leg it protects, so counting contracts would let a cheap
 * hedge cancel out the trade it exists to protect. What was actually paid or collected tracks
 * the real exposure far better.
 */
export function biasOf(legs: DbTrade[]): GroupDirection {
  let net = 0;
  let gross = 0;
  for (const l of legs) {
    const w = exposure(l);
    net += sign(l) * w;
    gross += w;
  }
  if (gross === 0 || Math.abs(net) / gross < NEUTRAL_BAND) return "neutral";
  return net > 0 ? "long" : "short";
}

/** A long and a short option of opposite types at one strike — the synthetic future itself. */
function syntheticSide(legs: DbTrade[]): { side: "Long" | "Short"; strike: number } | null {
  for (const a of legs) {
    if (!a.optionType || a.strike === null) continue;
    for (const b of legs) {
      if (b === a || b.strike !== a.strike) continue;
      if (!b.optionType || b.optionType === a.optionType) continue;
      if (a.direction === b.direction) continue;
      const call = a.optionType === "CE" ? a : b;
      return { side: call.direction === "long" ? "Long" : "Short", strike: a.strike };
    }
  }
  return null;
}

/**
 * The trade type a set of legs describes. Order matters: a synthetic future is also, read
 * carelessly, "some short options and some long ones", so it has to be recognised first.
 */
export function classify(legs: DbTrade[]): Classification {
  const direction = biasOf(legs);
  if (legs.length === 0) return { tradeType: "", direction };

  const options = legs.filter((l) => l.optionType !== "");
  const shorts = options.filter((l) => l.direction === "short");
  const longs = options.filter((l) => l.direction === "long");

  const synthetic = syntheticSide(legs);
  if (synthetic) {
    // Anything bought beyond the synthetic's own two legs is there to cap the short side.
    const hedged = legs.length > 2;
    return {
      tradeType: `Synthetic Futures ${synthetic.side}${hedged ? " W Hedge" : ""}`,
      direction,
    };
  }

  if (legs.some((l) => l.type === "Futures")) return { tradeType: "Index Futures", direction };

  if (options.length === legs.length && options.length > 0) {
    // A long leg of the same type as a short one, further out, is a hedge on it.
    if (shorts.length > 0 && longs.length > 0) {
      return { tradeType: "Option Selling W Hedge", direction };
    }
    if (shorts.length > 0) return { tradeType: "Options Selling", direction };
    return { tradeType: "Options Buying", direction };
  }

  return { tradeType: "Equity", direction };
}

/** The leg the basket is really about: the one with the most money in it. */
function dominant(legs: DbTrade[]): DbTrade {
  return legs.reduce((best, l) => (exposure(l) > exposure(best) ? l : best), legs[0]);
}

/**
 * "NIFTY 30 Sep 24800 PE +hedge", falling back to the raw symbol when identity is missing.
 *
 * The suffix follows the classification, not the leg count: a short strangle is two legs and no
 * hedge, and calling it "+hedge" would put a claim in the name that the trade does not make.
 */
export function nameFor(legs: DbTrade[], cls: Classification): string {
  const lead = dominant(legs);
  const when = lead.expiry ? ` ${shortDay(lead.expiry)}` : "";
  const extra = legs.length - 1;
  const suffix = cls.tradeType.endsWith("W Hedge")
    ? " +hedge"
    : extra > 0
      ? ` +${extra}`
      : "";

  if (cls.tradeType.startsWith("Synthetic Futures")) {
    const synthetic = syntheticSide(legs);
    const strike = synthetic ? ` ${synthetic.strike}` : "";
    return `${lead.underlying || lead.instrument}${when}${strike} synthetic${
      cls.tradeType.endsWith("W Hedge") ? " +hedge" : ""
    }`;
  }

  if (lead.underlying && lead.strike !== null && lead.optionType) {
    return `${lead.underlying}${when} ${lead.strike} ${lead.optionType}${suffix}`;
  }

  return `${lead.instrument}${suffix}`;
}

/**
 * Baskets worth proposing out of everything not already in one.
 *
 * A chain needs at least two *different* contracts. That is what keeps the ordinary case quiet:
 * a lone option buy is one leg, and scaling into the same contract twice is one contract, so
 * neither is ever suggested. A short strangle — two different contracts, both sold — is.
 */
export function suggestBaskets(trades: DbTrade[]): Suggestion[] {
  const buckets = new Map<string, DbTrade[]>();

  for (const t of trades) {
    if (t.groupId !== null) continue;
    // Falling back to the symbol keeps this working on rows synced before the identity columns
    // existed, which is what makes back-filling old history possible.
    const key = `${t.tradeDate}|${t.underlying || t.instrument.slice(0, 5)}|${t.expiry ?? ""}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(t);
    else buckets.set(key, [t]);
  }

  const out: Suggestion[] = [];

  for (const bucket of buckets.values()) {
    const ordered = [...bucket].sort((a, b) => mins(a.entryTime) - mins(b.entryTime));

    let chain: DbTrade[] = [];
    const flush = () => {
      const contracts = new Set(chain.map((l) => l.instrument));
      if (chain.length >= 2 && contracts.size >= 2) {
        const cls = classify(chain);
        out.push({ legs: chain, name: nameFor(chain, cls), ...cls });
      }
      chain = [];
    };

    for (const t of ordered) {
      const last = chain[chain.length - 1];
      if (last && mins(t.entryTime) - mins(last.entryTime) > WINDOW_MINUTES) flush();
      chain.push(t);
    }
    flush();
  }

  return out;
}
