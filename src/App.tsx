import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import DashboardScreen from "./screens/DashboardScreen";
import SessionScreen from "./screens/SessionScreen";
import TradesScreen from "./screens/TradesScreen";
import TradeHistoryScreen from "./screens/TradeHistoryScreen";
import TradeDetailScreen from "./screens/TradeDetailScreen";
import GroupDetailScreen from "./screens/GroupDetailScreen";
import ReviewScreen from "./screens/ReviewScreen";
import PlaybookScreen from "./screens/PlaybookScreen";
import CaptureScreen from "./screens/CaptureScreen";
import SignInScreen from "./screens/SignInScreen";
import { useJournal } from "./store";

/** The old unlinked sign-in URL. Kept only so bookmarks to it land on the dashboard. */
const SIGN_IN_PATH = import.meta.env.VITE_SIGN_IN_PATH || "/signin";

/**
 * The whole site is private. Signed out, every URL renders the sign-in screen in place, so the
 * address is kept and signing in lands on the page that was asked for.
 */
export default function App() {
  const { session, authReady } = useJournal();
  // Reading the stored session is async; render nothing until it resolves so a signed-in
  // reload never flashes the sign-in screen.
  if (!authReady) return <div className="min-h-screen bg-bg" />;
  if (!session) return <SignInScreen />;

  return (
    <Routes>
      <Route path={SIGN_IN_PATH} element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}

/** Sidebar layout wrapping every screen except sign-in. */
function Shell() {
  const { equity, captureMode, queue } = useJournal();
  const capital = equity[equity.length - 1];
  const start = equity[0];
  const returnPct = ((capital - start) / start) * 100;

  return (
    <div className="grid grid-cols-[168px_1fr] min-h-screen bg-bg text-ink">
      <Sidebar
        capital={capital}
        returnPct={returnPct}
        captureMode={captureMode}
        queueCount={queue.length}
      />
      <main className="min-w-[1180px]">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/session" element={<SessionScreen />} />
          <Route path="/trades" element={<TradesScreen />} />
          <Route path="/history" element={<TradeHistoryScreen />} />
          <Route path="/trades/:id" element={<TradeDetailScreen />} />
          <Route path="/groups/:id" element={<GroupDetailScreen />} />
          <Route path="/review" element={<ReviewScreen />} />
          <Route path="/playbook" element={<PlaybookScreen />} />
          <Route path="/capture" element={<CaptureScreen />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
