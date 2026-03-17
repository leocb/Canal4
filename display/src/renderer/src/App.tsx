import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useSpacetimeDB, useReducer, useTable } from "spacetimedb/react";
import { reducers, tables } from "./module_bindings/index";
import { SettingsScreen } from "./pages/SettingsScreen";
import { TickerScreen } from "./pages/TickerScreen";
import { ErrorBoundary } from "./ErrorBoundary";
import { useTranslation } from 'react-i18next';

function App() {
  const { t } = useTranslation();
  const { isActive: connected, identity } = useSpacetimeDB();
  const displayConnect = useReducer(reducers.displayConnect);
  const loginOrCreateUser = useReducer(reducers.loginOrCreateUser);
  const [userIdentities] = useTable(tables.UserIdentity);

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

  const [hasAttemptedAutoRegister, setHasAttemptedAutoRegister] = useState(false);

  // Automatic User Registration (if identity is not linked to a user)
  useEffect(() => {
    if (!connected || !identity || !machineUid || hasAttemptedAutoRegister) return;

    // Check if we are already registered
    const myUserIdentity = userIdentities.find(ui => ui.identity.isEqual(identity));

    // We only attempt if we are connected and the data has had a chance to sync
    // (We assume if we find NOTHING after connection, we might need registration, 
    // but the backend reducer is idempotent anyway)
    if (!myUserIdentity) {
      console.log("[App] Identity not registered as User, auto-registering...");
      setHasAttemptedAutoRegister(true);
      loginOrCreateUser({
        email: `display-${machineUid.slice(0, 12)}@canal4.local`,
        name: t('app.default_node_name', { id: machineUid.slice(0, 6) })
      }).catch(err => {
        console.error("[App] Auto-registration failed:", err);
        setHasAttemptedAutoRegister(false); // Allow retry on failure
      });
    } else {
      // We found ourselves, so no need to register
      setHasAttemptedAutoRegister(true);
    }
  }, [connected, identity, machineUid, userIdentities, hasAttemptedAutoRegister]);

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
