import LevelPlay from "../components/LevelPlay";
import TradeJournal from "../components/TradeJournal";

export default function DashboardScreen() {
  return (
    <div className="p-8 pb-20 flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[25px] font-medium tracking-[-0.015em] leading-[1.12]">
          Dashboard
        </h1>
        <div className="text-[13px] text-muted">Your progress at a glance</div>
      </header>

      <LevelPlay />
      <TradeJournal />
    </div>
  );
}
