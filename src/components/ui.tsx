import type { ReactNode } from "react";

/** The faded hairline used between sections throughout the design. */
export function Divider({ inset = 48 }: { inset?: number }) {
  return (
    <div
      className="h-px"
      style={{
        background: `linear-gradient(to right, transparent, rgba(41,43,49,0.18) ${inset}px, rgba(41,43,49,0.18) calc(100% - ${inset}px), transparent)`,
      }}
    />
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] tracking-[0.08em] uppercase text-dim">{children}</span>
  );
}

export interface PillOption<T extends string> {
  value: T;
  label: string;
}

export function PillGroup<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex gap-1 border border-line-strong rounded-md p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={[
              "border-0 cursor-pointer rounded-sm transition-colors",
              size === "sm" ? "px-4 py-[5px] text-[12px]" : "px-4 py-2 text-[12.5px]",
              on
                ? "bg-[rgba(145,132,217,0.16)] text-accent-deep"
                : "bg-transparent text-dim hover:text-ink",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FocusRating({
  value,
  onChange,
  height = 34,
}: {
  value: number;
  onChange: (n: number) => void;
  height?: number;
}) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            style={{ height }}
            className={[
              "flex-1 rounded-md cursor-pointer border text-[13px] transition-colors",
              on
                ? "border-accent bg-[rgba(145,132,217,0.18)] text-accent-deep"
                : "border-line-strong bg-transparent text-dim",
            ].join(" ")}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

export const FOCUS_LABELS = [
  "",
  "Scattered — stop trading",
  "Distracted",
  "Adequate",
  "Sharp",
  "Locked in",
];

export function Tag({ children, tone = "line" }: { children: ReactNode; tone?: "line" | "soft" }) {
  return (
    <span
      className={
        tone === "soft"
          ? "text-[11.5px] px-3 py-[2px] rounded-sm bg-accent-soft text-accent-ink"
          : "text-[11.5px] px-3 py-[2px] rounded-sm border border-line-strong text-muted"
      }
    >
      {children}
    </span>
  );
}

export function Meter({ pct, colorVar }: { pct: number; colorVar: string }) {
  return (
    <div className="h-[3px] rounded-[3px] bg-line overflow-hidden">
      <div
        className="h-full"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: colorVar }}
      />
    </div>
  );
}

export const WIN = "oklch(0.52 0.13 155)";
export const LOSS = "oklch(0.52 0.16 25)";
export const WARN = "oklch(0.58 0.11 75)";
