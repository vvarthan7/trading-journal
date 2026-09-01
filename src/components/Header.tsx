import { NavLink, useLocation } from "react-router-dom";
import { CUR } from "../lib/format";

const NAV = [
  { to: "/session", label: "Session" },
  { to: "/trades", label: "Trades" },
  { to: "/review", label: "Review" },
];

export default function Header({
  capital,
  returnPct,
  captureMode,
}: {
  capital: number;
  returnPct: number;
  captureMode: "review" | "auto";
}) {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-10 bg-[rgba(243,245,254,0.9)] backdrop-blur-[10px] border-b border-line">
      <div className="max-w-[1080px] mx-auto px-12 h-20 flex items-center gap-12">
        <div className="flex items-center gap-3">
          <span className="w-[20px] h-[20px] rounded-sm border border-accent flex items-center justify-center text-accent text-[12px]">
            <i className="ph ph-notebook" />
          </span>
          <span className="text-[14px] font-medium tracking-[-0.015em]">Ledgerbook</span>
        </div>

        <nav className="flex gap-1">
          {NAV.map((item) => {
            const active =
              pathname === item.to ||
              (item.to === "/trades" && pathname.startsWith("/trades"));
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={[
                  "px-4 py-2 rounded-md text-[13.5px] font-medium border-b-2 transition-colors",
                  active
                    ? "text-ink border-accent"
                    : "text-dim border-transparent hover:text-ink",
                ].join(" ")}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-6">
          <span className="inline-flex items-center gap-2 text-[12.5px] text-muted">
            <span className="w-[6px] h-[6px] rounded-full bg-win" />
            {captureMode === "review" ? "Review before save" : "Auto-saving"}
          </span>
          <span className="text-[13px] text-ink-2">
            {CUR}
            {capital.toLocaleString("en-IN")}{" "}
            <span className={returnPct >= 0 ? "text-win" : "text-loss"}>
              {returnPct >= 0 ? "+" : "−"}
              {Math.abs(returnPct).toFixed(1)}%
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
