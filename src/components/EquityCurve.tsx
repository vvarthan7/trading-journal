import { useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { useJournal } from "../store";
import { CUR, money, plain, seriesPath, shortDay } from "../lib/format";
import { equitySeries } from "../lib/equity";
import type { EquityPoint } from "../lib/equity";
import { Eyebrow, LOSS, WIN } from "./ui";

/** SVG user units; the charts stretch to the card with preserveAspectRatio="none". */
const W = 1000;
const EQ_H = 220;
const DD_H = 110;
/** Headroom so the line never touches the frame. */
const PAD = 10;

function pct(n: number | null): string {
  return n === null ? "" : `${n <= 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
}

function whole(n: number): string {
  return (n < 0 ? "−" : "") + CUR + Math.round(Math.abs(n)).toLocaleString("en-IN");
}

/**
 * Account equity and its drawdown, one point per closed lot, anchored to the broker's account
 * value (see `src/lib/equity.ts` for why it is rebuilt backwards). The two charts share an x axis
 * and a hover crosshair, so a dip in one lines up with the trade that caused it in the other.
 */
export default function EquityCurve() {
  const { dbTrades, funds, fundsError, reloadFunds, tradesLoading } = useJournal();
  const accountValue = funds?.net ?? null;
  const s = useMemo(() => equitySeries(dbTrades, accountValue), [dbTrades, accountValue]);
  const [hover, setHover] = useState<number | null>(null);

  const n = s.points.length;
  const eq = seriesPath(s.points.map((p) => p.equity), W, PAD, EQ_H - PAD * 2);
  const dd = seriesPath(s.points.map((p) => p.drawdown), W, 0, DD_H - PAD);
  const eqArea = eq.d ? `${eq.d} L ${W} ${EQ_H} L 0 ${EQ_H} Z` : "";
  const ddArea = dd.d ? `${dd.d} L ${W} 0 L 0 0 Z` : "";

  const eqValues = s.points.map((p) => p.equity);
  const eqMax = Math.max(...eqValues);
  const eqMin = Math.min(...eqValues);
  const last = s.points[n - 1];

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setHover(Math.round(f * (n - 1)));
  };
  const at = hover === null ? null : s.points[hover];
  const xPct = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 0);

  const tiles = [
    {
      label: "Account value",
      value: accountValue === null ? "—" : plain(Math.round(accountValue)),
      sub: s.anchored ? "from Angel One, now" : fundsError ?? "account value unavailable",
      color: "var(--color-ink)",
    },
    {
      label: "Net P&L",
      value: money(Math.round(s.totalPnl)),
      sub: s.anchored && s.start > 0 ? `${s.totalPnl < 0 ? "−" : "+"}${Math.abs((s.totalPnl / s.start) * 100).toFixed(1)}% on ${whole(s.start)}` : `${n - 1} closed lots`,
      color: s.totalPnl >= 0 ? WIN : LOSS,
    },
    {
      label: "Max drawdown",
      value: whole(s.maxDrawdown),
      sub: s.maxDrawdown < 0 ? `${pct(s.maxDrawdownPct)} · ${shortDay(s.points[s.maxDrawdownAt].tradeDate)}` : "none yet",
      color: s.maxDrawdown < 0 ? LOSS : "var(--color-ink)",
    },
    {
      label: "Current drawdown",
      value: whole(last?.drawdown ?? 0),
      sub: last && last.drawdown < 0 ? `${pct(last.drawdownPct)} below peak ${whole(last.peak)}` : "at equity high",
      color: last && last.drawdown < 0 ? LOSS : WIN,
    },
  ];

  const ticks = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [];

  return (
    <div className="border border-line rounded-md overflow-hidden bg-surface">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-line">
        <i className="ph ph-chart-line-up text-[16px] text-accent-deep" />
        <span className="text-[14px] font-medium">Account equity</span>
        <span className="text-[11.5px] text-dim">
          {s.anchored
            ? "anchored to today's account value · deposits and withdrawals not separated"
            : "cumulative P&L from zero"}
          {s.grossOnly > 0 && ` · ${s.grossOnly} lots before charges`}
        </span>
        <button
          onClick={() => void reloadFunds()}
          className="ml-auto border border-line-strong bg-transparent text-dim px-3 py-1 rounded-md text-[12px] cursor-pointer hover:text-ink transition-colors"
          title="Fetch the account value from the broker again"
        >
          <i className="ph ph-arrows-clockwise" />
        </button>
      </div>

      <section className="grid grid-cols-4 gap-px bg-line border-b border-line">
        {tiles.map((t) => (
          <div key={t.label + t.sub} className="bg-surface px-6 py-5 flex flex-col gap-2">
            <Eyebrow>{t.label}</Eyebrow>
            <div className="text-[21px] font-medium tracking-[-0.015em]" style={{ color: t.color }}>
              {t.value}
            </div>
            <div className="text-[12px] text-dim truncate" title={t.sub}>{t.sub}</div>
          </div>
        ))}
      </section>

      {n < 2 ? (
        <div className="px-6 py-10 text-center text-[13px] text-dim">
          {tradesLoading ? "Loading trades…" : "No closed trades to chart yet."}
        </div>
      ) : (
        <div className="px-6 py-6 flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_84px] gap-4">
            <div className="flex flex-col gap-3">
              <div
                className="relative cursor-crosshair"
                onMouseMove={onMove}
                onMouseLeave={() => setHover(null)}
              >
                <Chart label="Equity" height={EQ_H}>
                  <defs>
                    <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9184d9" stopOpacity="0.26" />
                      <stop offset="100%" stopColor="#9184d9" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0.25, 0.5, 0.75].map((f) => (
                    <line key={f} x1="0" y1={EQ_H * f} x2={W} y2={EQ_H * f} stroke="#e4e7f5" vectorEffect="non-scaling-stroke" />
                  ))}
                  <path d={eqArea} fill="url(#eqFill)" />
                  <path d={eq.d} fill="none" stroke="#9184d9" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </Chart>
                <Chart label="Drawdown" height={DD_H} className="mt-3">
                  <line x1="0" y1="0.5" x2={W} y2="0.5" stroke="#cfd3e5" vectorEffect="non-scaling-stroke" />
                  <path d={ddArea} fill={LOSS} fillOpacity="0.14" />
                  <path d={dd.d} fill="none" stroke={LOSS} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </Chart>

                {at && hover !== null && (
                  <Crosshair
                    point={at}
                    x={xPct(hover)}
                    eqY={eq.points[hover][1] / EQ_H}
                    ddY={dd.points[hover][1] / DD_H}
                  />
                )}
              </div>
              <div className="relative h-[16px] text-[11px] text-dim">
                {ticks.map((i, k) => (
                  <span
                    key={i}
                    className="absolute top-0"
                    style={{
                      left: `${xPct(i)}%`,
                      transform: k === 0 ? "none" : k === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                    }}
                  >
                    {shortDay(s.points[i].tradeDate)}
                  </span>
                ))}
              </div>
            </div>

            {/* Value axis: the ends of each chart's range, where the eye looks for them. */}
            <div className="flex flex-col gap-3 text-[11px] text-dim text-right">
              <div className="flex flex-col justify-between" style={{ height: EQ_H }}>
                <span>{whole(eqMax)}</span>
                <span>{whole(eqMin)}</span>
              </div>
              <div className="flex flex-col justify-between mt-3" style={{ height: DD_H }}>
                <span>{CUR}0</span>
                <span>{whole(s.maxDrawdown)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Chart({
  label,
  height,
  className = "",
  children,
}: {
  label: string;
  height: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-2 top-1 text-[11px] tracking-[0.08em] uppercase text-dim pointer-events-none">
        {label}
      </span>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="w-full block overflow-visible"
        style={{ height }}
        role="img"
        aria-label={label}
      >
        {children}
      </svg>
    </div>
  );
}

/**
 * The hover layer is HTML over the SVG: the charts stretch non-uniformly, so a circle drawn in
 * SVG units would render as an ellipse.
 */
function Crosshair({ point, x, eqY, ddY }: { point: EquityPoint; x: number; eqY: number; ddY: number }) {
  // Chart tops, in px from the hover box: equity at 0, drawdown below it after the mt-3 gap.
  const ddTop = EQ_H + 8.4;
  const flip = x > 62;
  return (
    <>
      <div className="absolute top-0 bottom-0 w-px bg-line-strong pointer-events-none" style={{ left: `${x}%` }} />
      <Dot left={x} top={eqY * EQ_H} color="#9184d9" />
      <Dot left={x} top={ddTop + ddY * DD_H} color={LOSS} />
      <div
        className="absolute top-6 z-10 pointer-events-none bg-surface border border-line-strong rounded-md px-4 py-3 shadow-[0_4px_16px_rgba(41,43,49,0.08)] flex flex-col gap-1 min-w-[190px]"
        style={{ left: `${x}%`, transform: flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
      >
        <span className="text-[11.5px] text-dim">
          {point.index === 0
            ? `Before ${shortDay(point.tradeDate)}`
            : `${shortDay(point.tradeDate)} · ${point.exitTime} · #${point.index}`}
        </span>
        <span className="text-[12.5px] text-ink-2 truncate max-w-[220px]">{point.instrument}</span>
        {point.index > 0 && (
          <Row label="Trade" value={money(Math.round(point.pnl))} color={point.pnl >= 0 ? WIN : LOSS} />
        )}
        <Row label="Equity" value={whole(point.equity)} color="var(--color-ink)" />
        <Row
          label="Drawdown"
          value={`${whole(point.drawdown)}${point.drawdownPct !== null && point.drawdown < 0 ? ` · ${pct(point.drawdownPct)}` : ""}`}
          color={point.drawdown < 0 ? LOSS : "var(--color-ink)"}
        />
      </div>
    </>
  );
}

function Dot({ left, top, color }: { left: number; top: number; color: string }) {
  return (
    <span
      className="absolute w-[9px] h-[9px] rounded-full pointer-events-none border-2 border-surface"
      style={{ left: `${left}%`, top, background: color, transform: "translate(-50%, -50%)" }}
    />
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between gap-6 text-[12px]">
      <span className="text-dim">{label}</span>
      <span className="font-medium" style={{ color }}>{value}</span>
    </div>
  );
}
