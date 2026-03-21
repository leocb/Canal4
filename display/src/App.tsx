import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTable, useReducer } from "spacetimedb/react";
import { tables, reducers } from "./module_bindings/index";
import { useTranslation } from "react-i18next";
import { SettingsScreen } from "./pages/SettingsScreen";
import { TickerScreen } from "./pages/TickerScreen";
import { ErrorBoundary } from "./ErrorBoundary";
import { useConnectivity } from "./SpacetimeDBProvider";

function App() {
  const { t, i18n } = useTranslation();
  const { status, setHeartbeatError } = useConnectivity();
  const connected = status === 'online';
  const displayConnect = useReducer(reducers.displayConnect);
  const [machineUid, setMachineUid] = useState<string>('');

  useEffect(() => {
    if (window.api?.updateTray) {
      window.api.updateTray({
        settingsLabel: t('tray.settings'),
        quitLabel: t('tray.quit'),
        tooltip: t('tray.tooltip')
      });
    }
  }, [i18n.language, t]);

  useEffect(() => {
    if (window.api?.getMachineId) {
      window.api.getMachineId().then((uid: string) => setMachineUid(uid));
    } else {
      const id = localStorage.getItem('fallback_uid') || 'fallback_' + Math.random().toString(36).slice(2, 9);
      if (!localStorage.getItem('fallback_uid')) localStorage.setItem('fallback_uid', id);
      setMachineUid(id);
    }
  }, []);

  const [devices] = useTable(tables.DisplayDeviceView);
  const myDevicesCount = devices.filter(d => d.uid === machineUid).length;

  // Heartbeat to keep lastConnectedAt fresh in the database
  useEffect(() => {
    if (!connected || !machineUid || myDevicesCount === 0) return;

    const runHeartbeat = () => {
      console.log("[App] Sending heartbeat for UID:", machineUid);
      displayConnect({ displayUid: machineUid })
        .then(() => setHeartbeatError(undefined))
        .catch(err => {
          console.error("[App] Heartbeat failed:", err);
          // Only show error if it's still paired (avoids race conditions)
          setHeartbeatError(err?.message || String(err));
        });
    };

    const interval = setInterval(runHeartbeat, 5000); // 5s heartbeat
    runHeartbeat();

    return () => clearInterval(interval);
  }, [connected, machineUid, myDevicesCount]);

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
