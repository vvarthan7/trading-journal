import { NavLink } from "react-router-dom";
import AuthPanel from "./AuthPanel";

interface SidebarProps {
  capital: number;
  returnPct: number;
  captureMode: "review" | "auto";
  queueCount: number;
}

const NAV = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: "ph ph-squares-four",
    hasBadge: false,
  },
  // { to: "/session", label: "Session", icon: "ph ph-crosshair", hasBadge: true },
  // {
  //   to: "/trades",
  //   label: "Trades",
  //   icon: "ph ph-list-dashes",
  //   hasBadge: false,
  // },
  // {
  //   to: "/playbook",
  //   label: "Playbook",
  //   icon: "ph ph-book-open-text",
  //   hasBadge: false,
  // },
  // {
  //   to: "/review",
  //   label: "Review",
  //   icon: "ph ph-chart-line-up",
  //   hasBadge: false,
  // },
  // {
  //   to: "/capture",
  //   label: "Capture",
  //   icon: "ph ph-plugs-connected",
  //   hasBadge: false,
  // },
];

export default function Sidebar({ queueCount }: SidebarProps) {
  return (
    <aside className="w-[168px] border-r border-line px-4 py-8 flex flex-col gap-8 sticky top-0 h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 px-3">
        <span className="w-[22px] h-[22px] rounded-sm border border-accent flex items-center justify-center text-accent text-[13px]">
          <i className="ph ph-notebook" />
        </span>
        <span className="text-[14px] font-medium tracking-[-0.015em]">
          The Journal
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-[2px]">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 w-full text-left px-3 py-3 rounded-md cursor-pointer text-[13.5px] font-medium transition-colors",
                isActive
                  ? "bg-line text-ink"
                  : "bg-transparent text-dim hover:bg-[rgba(145,132,217,0.10)] hover:text-ink",
              ].join(" ")
            }
          >
            <i className={`${item.icon} text-[16px]`} />
            <span>{item.label}</span>
            {item.hasBadge && queueCount > 0 && (
              <span className="ml-auto text-[11px] px-2 py-[1px] rounded-sm bg-accent-line text-accent-ink">
                {queueCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <AuthPanel />
      </div>

      {/* Bottom section (broker link + capital) — hidden for now */}
      {/* <div className="mt-auto flex flex-col gap-6">
        <div className="border border-line rounded-md p-4">
          <div className="text-[11px] tracking-[0.08em] uppercase text-dim mb-3">
            Broker link
          </div>
          <div className="flex items-center gap-[6px]">
            <span
              className="w-[6px] h-[6px] rounded-full bg-win"
              style={{ animation: "pulse 2.4s ease-in-out infinite" }}
            />
            <span className="text-[12.5px] text-ink-2">
              {captureMode === "review"
                ? "Capturing · review first"
                : "Capturing · auto-saving"}
            </span>
          </div>
          <div className="text-[11.5px] text-dim mt-2">
            3 tabs watched · 11:29
          </div>
        </div>

        <div className="px-2 flex flex-col gap-1">
          <div className="text-[11px] tracking-[0.08em] uppercase text-dim">
            Capital
          </div>
          <div className="text-[20px] font-medium tracking-[-0.015em]">
            {CUR}
            {capital.toLocaleString("en-IN")}
          </div>
          <div
            className={`text-[12px] ${returnPct >= 0 ? "text-win" : "text-loss"}`}
          >
            {returnPct >= 0 ? "+" : "−"}
            {Math.abs(returnPct).toFixed(1)}% since 12 Jun
          </div>
        </div>
      </div> */}
    </aside>
  );
}
