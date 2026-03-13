import { Routes, Route, Navigate } from "react-router-dom";
import { useSpacetimeDB } from "spacetimedb/react";
import { SettingsScreen } from "./pages/SettingsScreen";
import { TickerScreen } from "./pages/TickerScreen";
import { ErrorBoundary } from "./ErrorBoundary";

function App() {
  useSpacetimeDB();

  // The ticker screen silently skips rendering until connected. (handled in TickerScreen)

  return (
    <Routes>
      {/* The transparent ticker overlay window */}
      <Route path="/ticker" element={<ErrorBoundary><TickerScreen /></ErrorBoundary>} />

      {/* The settings/log control panel */}
      <Route path="/settings" element={<ErrorBoundary><SettingsScreen /></ErrorBoundary>} />
      <Route path="/settings/:tab" element={<ErrorBoundary><SettingsScreen /></ErrorBoundary>} />

      {/* Default — show settings when opened directly */}
      <Route path="*" element={<Navigate to="/settings/pairing" replace />} />
    </Routes>
  );
}

export default App;
