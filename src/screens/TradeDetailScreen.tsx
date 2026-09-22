/**
 * One stored lot, opened from the Trades or Trade history table.
 *
 * Everything here comes out of `public.trades`. The broker reports fills, not intent, so there
 * is no target, no strategy tag and no price path to chart — the levels strip is drawn from the
 * three prices the row actually holds. `stop_price` and `strategies` are the hand-entered
 * columns, saved the way the journal's fields are — locally at once, batched to Postgres 500ms
 * later. What you write about the trade is in `trade_details`, and its screenshots are rows in
 * `trade_screenshots`; both hang off the trade rather than sitting on it.
 */
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useJournal } from "../store";
import type { DbTrade } from "../lib/tradeRows";
import TradeScreenshots from "../components/TradeScreenshots";
import TradeDetails from "../components/TradeDetails";
import { dayLabel, money, plain, pnlTone, price, rLabel } from "../lib/format";
import { TRADE_TYPES, autoTypeOf, effectiveType } from "../lib/tradeTypes";
import { Divider, Eyebrow, WIN, LOSS } from "../components/ui";

/** Shown wherever there is nothing yet — no exit, or no stop typed in. */
const DASH = "—";

/** Minutes between two hh:mm clock readings, or null if either is missing. */
function heldMinutes(from: string, to: string): number | null {
  if (!from || !to) return null;
  const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const span = mins(to) - mins(from);
  return Number.isFinite(span) && span >= 0 ? span : null;
}

function heldLabel(from: string, to: string): string {
  const m = heldMinutes(from, to);
  if (m === null) return DASH;
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * Stop, entry and exit on one scale. Positions are real prices, so a stop sitting far from the
 * entry looks far — that is the whole point of drawing it.
 */
function Levels({ t }: { t: DbTrade }) {
  const marks = [
    { key: "stop", label: "Stop", value: t.stopPrice, color: LOSS },
    { key: "entry", label: "Entry", value: t.entryPrice, color: "#5d5294" },
    { key: "exit", label: "Exit", value: t.exitPrice, color: WIN },
  ].filter((m): m is { key: string; label: string; value: number; color: string } =>
    m.value !== null
  );

  const values = marks.map((m) => m.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  /** Single-price rows would all pile up at 0%, so centre them instead. */
  const pct = (v: number) => (marks.length < 2 ? 50 : ((v - min) / span) * 100);

  return (
    <div className="flex flex-col gap-4">
      {/* Labels above the rail */}
      <div className="relative h-[34px]">
        {marks.map((m) => (
          <div
            key={m.key}
            className="absolute bottom-0 flex flex-col items-center gap-1 -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${pct(m.value)}%` }}
          >
            <span className="text-[10.5px] tracking-[0.08em] uppercase text-dim">{m.label}</span>
            <span className="text-[13px]" style={{ color: m.color }}>
              {price(m.value)}
            </span>
          </div>
        ))}
      </div>

      <div className="relative h-[3px] rounded-[3px] bg-line">
        {marks.map((m) => (
          <span
            key={m.key}
            className="absolute top-1/2 w-[9px] h-[9px] rounded-full -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${pct(m.value)}%`, background: m.color }}
          />
        ))}
      </div>
    </div>
  );
}

export default function TradeDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { dbTrades, tradeGroups, tradesLoading, tradesError, setTradeStop, setTradeType, session } =
    useJournal();
  /** Rupee amounts and size are the owner's business — a signed-out visitor sees the shape only. */
  const signedIn = session !== null;

  /** Where the row was clicked from, so Back returns there rather than always to /trades. */
  const from = (location.state as { from?: string } | null)?.from ?? "/trades";
  const backLabel = from === "/history" ? "Trade history" : "Trades";

  const t = dbTrades.find((x) => x.id === Number(id));

  if (!t) {
    return (
      <div className="p-8 pb-20">
        <p className="text-[14px] text-muted">
          {tradesLoading ? (
            "Loading…"
          ) : (
            <>
              That trade isn't in the journal.{" "}
              <Link to={from} className="text-accent-deep">
                Back to {backLabel.toLowerCase()}
              </Link>
            </>
          )}
        </p>
      </div>
    );
  }

  /** The basket this leg belongs to, when it is part of one rather than a trade on its own. */
  const basket = t.groupId === null ? null : (tradeGroups.find((g) => g.id === t.groupId) ?? null);

  const turnover = t.entryPrice * t.quantity;
  const riskPerUnit = t.stopPrice === null ? null : Math.abs(t.entryPrice - t.stopPrice);
  const returnPct = t.pnl === null || turnover === 0 ? null : (t.pnl / turnover) * 100;

  const facts = [
    { k: "Direction", v: t.direction, color: "var(--color-accent-deep)" },
    { k: "Instrument type", v: t.type || DASH, color: "var(--color-muted)" },
    { k: "Exchange", v: t.exchange || DASH, color: "var(--color-muted)" },
    { k: "Quantity", v: String(t.quantity), color: "var(--color-muted)", owner: true },
    { k: "Lots", v: t.lot === null ? DASH : String(t.lot), color: "var(--color-muted)", owner: true },
    { k: "Entry price", v: price(t.entryPrice), color: "var(--color-muted)" },
    {
      k: "Exit price",
      v: t.exitPrice === null ? DASH : price(t.exitPrice),
      color: "var(--color-muted)",
    },
    { k: "Entry time", v: t.entryTime || DASH, color: "var(--color-muted)" },
    { k: "Exit time", v: t.exitTime || DASH, color: "var(--color-muted)" },
    { k: "Hold", v: heldLabel(t.entryTime, t.exitTime), color: "var(--color-muted)" },
    { k: "Turnover", v: plain(turnover), color: "var(--color-muted)", owner: true },
    {
      k: "Return on turnover",
      v: returnPct === null ? DASH : `${returnPct >= 0 ? "+" : "−"}${Math.abs(returnPct).toFixed(2)}%`,
      color: returnPct === null ? "var(--color-muted)" : returnPct >= 0 ? WIN : LOSS,
    },
    {
      k: "Risk per unit",
      v: riskPerUnit === null ? DASH : price(riskPerUnit),
      color: "var(--color-muted)",
    },
    {
      k: "Initial risk",
      v: t.initialRisk === null ? DASH : plain(t.initialRisk),
      color: "var(--color-muted)",
      owner: true,
    },
    {
      k: "Realised",
      v: t.rr === null ? DASH : rLabel(t.rr),
      color: t.rr === null ? "var(--color-muted)" : t.rr >= 0 ? WIN : LOSS,
    },
  ].filter((f) => signedIn || !f.owner);

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Back button */}
      <button
        type="button"
        onClick={() => navigate(from)}
        className="self-start inline-flex items-center gap-[5px] border-0 bg-transparent text-dim text-[12.5px] cursor-pointer p-0 hover:text-accent-deep transition-colors"
      >
        <i className="ph ph-arrow-left" /> {backLabel}
      </button>

      {/* Header */}
      <header className="flex items-start justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em]">{t.instrument}</h1>
            <span className="text-[11.5px] px-3 py-[3px] rounded-sm bg-accent-line text-accent-ink">
              {t.direction}
            </span>
            {t.type && (
              <span className="text-[11.5px] px-3 py-[3px] rounded-sm border border-line-strong text-ink-2">
                {t.type}
              </span>
            )}
            {t.exchange && (
              <span className="text-[11.5px] px-3 py-[3px] rounded-sm border border-line-strong text-ink-2">
                {t.exchange}
              </span>
            )}
            {t.open && (
              <span className="text-[11.5px] px-3 py-[3px] rounded-sm border border-line-strong text-dim">
                open
              </span>
            )}
            {/* A leg of a basket is not a trade on its own — say so, and say which. */}
            {basket && (
              <Link
                to={`/groups/${basket.id}`}
                state={{ from }}
                className="text-[11.5px] px-3 py-[3px] rounded-sm border border-accent text-accent-deep no-underline hover:bg-accent-line transition-colors"
              >
                <i className="ph ph-stack" /> {basket.name}
              </Link>
            )}
          </div>
          <div className="text-[13px] text-muted">
            {dayLabel(t.tradeDate)} · {t.entryTime || DASH} → {t.exitTime || DASH}
            {signedIn && <> · {t.quantity} qty</>}
          </div>
        </div>
        <div className="text-right flex flex-col gap-1">
          {signedIn && t.pnl !== null && (
            <div className={`text-[30px] font-medium tracking-[-0.015em] ${pnlTone(t.pnl)}`}>
              {money(t.pnl)}
            </div>
          )}
          {t.pnl === null && (
            <div className="text-[30px] font-medium tracking-[-0.015em] text-dim">open</div>
          )}
          <div className="text-[12.5px] text-dim">
            {signedIn && <>risk {t.initialRisk === null ? DASH : plain(t.initialRisk)} · </>}
            realised {t.rr === null ? DASH : rLabel(t.rr)}
          </div>
        </div>
      </header>

      {/* Main grid */}
      <section className="grid grid-cols-[1fr_332px] gap-6 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Levels */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium">Levels</span>
              <span className="text-[12px] text-dim">
                {t.stopPrice === null
                  ? "No stop recorded — type one to get risk and R"
                  : "Stop, entry and exit to scale"}
              </span>
            </div>

            <Levels t={t} />

            <Divider inset={24} />

            <div className="flex gap-6 text-[12px] text-dim flex-wrap">
              <span style={{ color: "#5d5294" }}>● entry {price(t.entryPrice)} @ {t.entryTime || DASH}</span>
              <span style={{ color: WIN }}>
                ● exit {t.exitPrice === null ? DASH : price(t.exitPrice)} @ {t.exitTime || DASH}
              </span>
              <span>held {heldLabel(t.entryTime, t.exitTime)}</span>
            </div>
          </div>

          <TradeDetails scope={{ tradeId: t.id }} />

          <TradeScreenshots tradeId={t.id} />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Stop — the one field the broker cannot tell us */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <span className="text-[14px] font-medium">Initial stop</span>
            <Eyebrow>Where the trade was wrong</Eyebrow>
            <input
              type="number"
              step="0.05"
              inputMode="decimal"
              value={t.stopPrice ?? ""}
              placeholder={DASH}
              onChange={(e) =>
                setTradeStop(t.id, e.target.value === "" ? null : Number(e.target.value))
              }
              className="w-full px-4 py-2 text-[14px] text-right rounded-md border border-line-strong bg-bg text-ink focus:border-accent"
            />
            <span className="text-[11.5px] text-dim leading-[1.5]">
              Postgres derives Initial risk and R:R from this — the broker never reports it.
            </span>
            {/* Without this a rejected write is invisible: the box keeps the typed value. */}
            {tradesError && <span className="text-[12px] text-loss">{tradesError}</span>}
          </div>

          {/* What kind of trade this was — the same vocabulary a basket uses */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <span className="text-[14px] font-medium">Trade type</span>
            <select
              value={effectiveType(t)}
              disabled={!signedIn}
              onChange={(e) => setTradeType(t.id, e.target.value)}
              className="w-full px-4 py-2 text-[13px] rounded-md border border-line-strong bg-bg text-ink focus:border-accent"
            >
              {TRADE_TYPES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <span className="text-[11.5px] text-dim leading-[1.5]">
              {t.tradeType
                ? `Set by hand. The instrument alone says "${autoTypeOf(t)}".`
                : "Derived from the instrument — nothing is stored until you change it."}
            </span>
          </div>

          {/* Facts */}
          <div className="border border-line rounded-md bg-surface overflow-hidden">
            {facts.map((f) => (
              <div
                key={f.k}
                className="flex items-center justify-between gap-4 px-5 py-3 border-b border-line-soft last:border-b-0"
              >
                <span className="text-[10.5px] tracking-[0.08em] uppercase text-dim">{f.k}</span>
                <span className="text-[13px]" style={{ color: f.color }}>
                  {f.v}
                </span>
              </div>
            ))}
          </div>

          {/* Broker linkage — what makes a re-sync update this row instead of duplicating it */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-3">
            <span className="text-[14px] font-medium">Broker linkage</span>
            <div className="flex items-center justify-between gap-4">
              <Eyebrow>Entry fill</Eyebrow>
              <span className="text-[12.5px] text-muted truncate">{t.entryFillId || DASH}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Eyebrow>Exit fill</Eyebrow>
              <span className="text-[12.5px] text-muted truncate">{t.exitFillId || DASH}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Eyebrow>Lot seq</Eyebrow>
              <span className="text-[12.5px] text-muted">{t.lotSeq}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
