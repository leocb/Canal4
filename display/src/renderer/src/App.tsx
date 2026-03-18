import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useSpacetimeDB, useReducer } from "spacetimedb/react";
import { reducers } from "./module_bindings/index";
import { SettingsScreen } from "./pages/SettingsScreen";
import { TickerScreen } from "./pages/TickerScreen";
import { ErrorBoundary } from "./ErrorBoundary";

function App() {
  const { isActive: connected } = useSpacetimeDB();
  const displayConnect = useReducer(reducers.displayConnect);
  const [machineUid, setMachineUid] = useState<string>('');

  useEffect(() => {
    // @ts-ignore
    if (window.api?.getMachineId) {
      // @ts-ignore
      window.api.getMachineId().then((uid: string) => setMachineUid(uid));
    } else {
      const id = localStorage.getItem('fallback_uid') || 'fallback_' + Math.random().toString(36).slice(2, 9);
      if (!localStorage.getItem('fallback_uid')) localStorage.setItem('fallback_uid', id);
      setMachineUid(id);
    }
  }, []);

  // Heartbeat to keep lastConnectedAt fresh in the database
  useEffect(() => {
    if (!connected || !machineUid) return;

    const runHeartbeat = () => {
      console.log("[App] Sending heartbeat for UID:", machineUid);
      displayConnect({ displayUid: machineUid })
        .catch(err => console.error("[App] Heartbeat failed:", err));
    };

    const interval = setInterval(runHeartbeat, 5000); // 5s heartbeat
    runHeartbeat();

    return () => clearInterval(interval);
  }, [connected, machineUid]);

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
