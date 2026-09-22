/**
 * One basket, opened from the Trades or Trade history table.
 *
 * A basket is a trade made of several legs, so this screen is the trade: its net P&L, the risk
 * that was on it, and the one idea, notes thread and set of strategies that belong to the whole
 * thing rather than to whichever leg happened to be first.
 *
 * The legs themselves stay exactly as the broker reported them — each still opens its own detail
 * screen, and removing one from the basket leaves the leg untouched.
 */
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useJournal } from "../store";
import { buildRows } from "../lib/tradeGroups";
import type { GroupDirection } from "../lib/tradeGroups";
import { TRADE_TYPES, effectiveType } from "../lib/tradeTypes";
import TradeDetails from "../components/TradeDetails";
import { dayLabel, money, plain, pnlTone, price, rLabel } from "../lib/format";
import { Eyebrow, WIN, LOSS } from "../components/ui";

const DASH = "—";

const DIRECTIONS: GroupDirection[] = ["long", "short", "neutral"];

const LEG_COLS = "grid-cols-[minmax(0,1.4fr)_64px_52px_78px_78px_54px_54px_86px_76px]";

export default function GroupDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    dbTrades,
    tradeGroups,
    tradesLoading,
    tradesError,
    updateGroup,
    deleteGroup,
    setTradeGroup,
    expectedRiskPerTrade,
    session,
  } = useJournal();

  const from = (location.state as { from?: string } | null)?.from ?? "/trades";
  const backLabel = from === "/history" ? "Trade history" : "Trades";

  const groupId = Number(id);
  const group = tradeGroups.find((g) => g.id === groupId);
  const row = buildRows(dbTrades, tradeGroups).find(
    (r) => r.kind === "group" && r.group.id === groupId
  );

  if (!group || !row || row.kind !== "group") {
    return (
      <div className="p-8 pb-20">
        <p className="text-[14px] text-muted">
          {tradesLoading ? (
            "Loading…"
          ) : (
            <>
              That basket isn't in the journal — it may have been ungrouped.{" "}
              <Link to={from} className="text-accent-deep">
                Back to {backLabel.toLowerCase()}
              </Link>
            </>
          )}
        </p>
      </div>
    );
  }

  const { summary } = row;
  const signedIn = Boolean(session);

  const ungroup = async () => {
    await deleteGroup(group.id);
    navigate(from);
  };

  /**
   * Pulling the last leg out leaves a basket with nothing in it, which is not a trade and would
   * only sit in the table as a ghost. Taking the second-to-last leg out is the same: what is
   * left is one lot, and one lot is a trade on its own. Both cases delete the basket.
   */
  const removeLeg = async (tradeId: number) => {
    if (summary.legs.length <= 2) {
      setTradeGroup(tradeId, null);
      await deleteGroup(group.id);
      navigate(from);
      return;
    }
    setTradeGroup(tradeId, null);
  };

  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(from)}
        className="self-start inline-flex items-center gap-[5px] border-0 bg-transparent text-dim text-[12.5px] cursor-pointer p-0 hover:text-accent-deep transition-colors"
      >
        <i className="ph ph-arrow-left" /> {backLabel}
      </button>

      {/* Header */}
      <header className="flex items-start justify-between gap-8 flex-wrap">
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              value={group.name}
              disabled={!signedIn}
              onChange={(e) => updateGroup(group.id, { name: e.target.value })}
              className="m-0 w-[380px] text-[25px] font-medium tracking-[-0.015em] bg-transparent border-0 border-b border-transparent text-ink px-0 py-1 hover:border-line-strong focus:border-accent focus:outline-none disabled:hover:border-transparent"
            />
            <span className="text-[11.5px] px-3 py-[3px] rounded-sm bg-accent-line text-accent-ink">
              {group.direction}
            </span>
            {summary.open && (
              <span className="text-[11.5px] px-3 py-[3px] rounded-sm border border-line-strong text-dim">
                open
              </span>
            )}
          </div>
          <div className="text-[13px] text-muted">
            {dayLabel(summary.tradeDate)} · {summary.entryTime || DASH} →{" "}
            {summary.exitTime || DASH} · {summary.legs.length} legs · {summary.quantity} qty
          </div>
        </div>
        <div className="text-right flex flex-col gap-1">
          {summary.net === null ? (
            <div className="text-[30px] font-medium tracking-[-0.015em] text-dim">open</div>
          ) : (
            <div className={`text-[30px] font-medium tracking-[-0.015em] ${pnlTone(summary.net)}`}>
              {money(summary.net)}
            </div>
          )}
          <div className="text-[12.5px] text-dim">
            risk {summary.risk === null ? DASH : plain(summary.risk)} ·{" "}
            {summary.r === null ? DASH : rLabel(summary.r)}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-[1fr_332px] gap-6 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Legs */}
          <div className="border border-line rounded-md bg-surface overflow-hidden">
            <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line">
              <span className="text-[14px] font-medium">Legs</span>
              <span className="text-[12px] text-dim">
                Each is still its own broker fill — removing one leaves it untouched
              </span>
            </div>

            <div
              className={`grid ${LEG_COLS} gap-3 px-6 py-3 border-b border-line-strong text-[10.5px] tracking-[0.08em] uppercase text-dim`}
            >
              <span>Instrument</span>
              <span>Side</span>
              <span>Qty</span>
              <span>Entry</span>
              <span>Exit</span>
              <span>In</span>
              <span>Out</span>
              <span className="text-right">P&L</span>
              <span className="text-right">Remove</span>
            </div>

            {summary.legs.map((t) => (
              <div
                key={t.id}
                className={`grid ${LEG_COLS} gap-3 items-center px-6 py-[10px] border-b border-line-soft last:border-b-0 text-[12.5px] text-muted`}
              >
                <span className="flex flex-col gap-[1px] min-w-0">
                  <Link
                    to={`/trades/${t.id}`}
                    state={{ from: `/groups/${group.id}` }}
                    className="text-ink font-medium text-[13px] truncate no-underline hover:text-accent-deep transition-colors"
                  >
                    {t.instrument}
                  </Link>
                  <span className="text-[11px] text-dim">{effectiveType(t)}</span>
                </span>
                <span className="text-dim">{t.direction}</span>
                <span>{t.quantity}</span>
                <span>{price(t.entryPrice)}</span>
                <span>{t.exitPrice === null ? DASH : price(t.exitPrice)}</span>
                <span>{t.entryTime || DASH}</span>
                <span>{t.exitTime || DASH}</span>
                <span
                  className="text-right font-medium"
                  style={{ color: t.pnl === null ? undefined : t.pnl >= 0 ? WIN : LOSS }}
                >
                  {t.pnl === null ? <span className="text-dim">open</span> : money(t.pnl)}
                </span>
                <span className="text-right">
                  <button
                    type="button"
                    disabled={!signedIn}
                    onClick={() => void removeLeg(t.id)}
                    className="border-0 bg-transparent p-0 text-[11.5px] text-dim cursor-pointer transition-colors hover:text-loss disabled:cursor-default disabled:opacity-40"
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>

          {/* One idea, one notes thread, one set of strategies — for the trade, not per leg */}
          <TradeDetails scope={{ groupId: group.id }} />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Risk — the number the legs cannot give us */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <span className="text-[14px] font-medium">Risk on this basket</span>
            <Eyebrow>What the whole thing could lose</Eyebrow>
            <input
              type="number"
              step="1"
              inputMode="decimal"
              disabled={!signedIn}
              value={group.riskAmount ?? ""}
              placeholder={expectedRiskPerTrade === null ? DASH : String(expectedRiskPerTrade)}
              onChange={(e) =>
                updateGroup(group.id, {
                  riskAmount: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="w-full px-4 py-2 text-[14px] text-right rounded-md border border-line-strong bg-bg text-ink focus:border-accent"
            />
            <span className="text-[11.5px] text-dim leading-[1.5]">
              {summary.riskFromLegs
                ? "Empty, so R is using the legs' own stops added up. The hedge is what makes that an overstatement — type the real figure."
                : "R is net P&L over this number."}
              {expectedRiskPerTrade !== null && ` The level expects ${plain(expectedRiskPerTrade)}.`}
            </span>
            {/* Without this a rejected write is invisible: the box keeps the typed value. */}
            {tradesError && <span className="text-[12px] text-loss">{tradesError}</span>}
          </div>

          {/* Type and side */}
          <div className="border border-line rounded-md bg-surface p-6 flex flex-col gap-4">
            <span className="text-[14px] font-medium">What kind of trade</span>
            <select
              value={group.tradeType}
              disabled={!signedIn}
              onChange={(e) => updateGroup(group.id, { tradeType: e.target.value })}
              className="w-full px-4 py-2 text-[13px] rounded-md border border-line-strong bg-bg text-ink focus:border-accent"
            >
              <option value="">Not set</option>
              {TRADE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Eyebrow>Which way it leans</Eyebrow>
            <select
              value={group.direction}
              disabled={!signedIn}
              onChange={(e) =>
                updateGroup(group.id, { direction: e.target.value as GroupDirection })
              }
              className="w-full px-4 py-2 text-[13px] rounded-md border border-line-strong bg-bg text-ink focus:border-accent"
            >
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Facts */}
          <div className="border border-line rounded-md bg-surface overflow-hidden">
            {[
              { k: "Legs", v: String(summary.legs.length) },
              { k: "Total quantity", v: String(summary.quantity) },
              {
                k: "Risk source",
                v: summary.riskFromLegs ? "Summed legs" : "Typed",
              },
              { k: "Net P&L", v: summary.net === null ? DASH : money(summary.net) },
              { k: "R", v: summary.r === null ? DASH : rLabel(summary.r) },
            ].map((f) => (
              <div
                key={f.k}
                className="flex items-center justify-between gap-4 px-5 py-3 border-b border-line-soft last:border-b-0"
              >
                <span className="text-[10.5px] tracking-[0.08em] uppercase text-dim">{f.k}</span>
                <span className="text-[13px] text-muted">{f.v}</span>
              </div>
            ))}
          </div>

          {/* Ungrouping deletes the basket only; every leg survives as its own trade. */}
          <button
            type="button"
            disabled={!signedIn}
            onClick={() => void ungroup()}
            className="px-4 py-2 text-[12.5px] rounded-md border border-line-strong bg-transparent text-dim cursor-pointer transition-colors hover:text-loss hover:border-loss disabled:cursor-default disabled:opacity-40"
          >
            Ungroup — keep the {summary.legs.length} legs
          </button>
        </div>
      </section>
    </div>
  );
}
