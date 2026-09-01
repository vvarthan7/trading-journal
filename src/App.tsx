import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import SessionScreen from "./screens/SessionScreen";
import TradesScreen from "./screens/TradesScreen";
import TradeDetailScreen from "./screens/TradeDetailScreen";
import ReviewScreen from "./screens/ReviewScreen";
import PlaybookScreen from "./screens/PlaybookScreen";
import CaptureScreen from "./screens/CaptureScreen";
import { useJournal } from "./store";

export default function App() {
  const { equity, captureMode, queue } = useJournal();
  const capital = equity[equity.length - 1];
  const start = equity[0];
  const returnPct = ((capital - start) / start) * 100;

  return (
    <div className="grid grid-cols-[212px_1fr] min-h-screen bg-bg text-ink">
      <Sidebar
        capital={capital}
        returnPct={returnPct}
        captureMode={captureMode}
        queueCount={queue.length}
      />
      <main className="min-w-[1180px]">
        <Routes>
          <Route path="/" element={<Navigate to="/session" replace />} />
          <Route path="/session" element={<SessionScreen />} />
          <Route path="/trades" element={<TradesScreen />} />
          <Route path="/trades/:id" element={<TradeDetailScreen />} />
          <Route path="/review" element={<ReviewScreen />} />
          <Route path="/playbook" element={<PlaybookScreen />} />
          <Route path="/capture" element={<CaptureScreen />} />
          <Route path="*" element={<Navigate to="/session" replace />} />
        </Routes>
      </main>
    </div>
  );
}
