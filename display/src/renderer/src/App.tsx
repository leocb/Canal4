import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "./module_bindings/index";
import { SettingsScreen } from "./pages/SettingsScreen";
import { TickerScreen } from "./pages/TickerScreen";
import { ErrorBoundary } from "./ErrorBoundary";
import { useConnectivity } from "./SpacetimeDBProvider";

function App() {
  const { status, setHeartbeatError } = useConnectivity();
  const connected = status === 'online';
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
        .then(() => setHeartbeatError(undefined))
        .catch(err => {
          console.error("[App] Heartbeat failed:", err);
          setHeartbeatError(err?.message || String(err));
        });
    };

    const interval = setInterval(runHeartbeat, 5000); // 5s heartbeat
    runHeartbeat();

    return () => clearInterval(interval);
  }, [connected, machineUid]);

  return (
    <Routes>
      <Route path="/ticker" element={<ErrorBoundary><TickerScreen /></ErrorBoundary>} />
      <Route path="/settings" element={<ErrorBoundary><SettingsScreen /></ErrorBoundary>} />
      <Route path="/settings/:tab" element={<ErrorBoundary><SettingsScreen /></ErrorBoundary>} />
      <Route path="*" element={<Navigate to="/settings/pairing" replace />} />
    </Routes>
  );
}

export default App;
