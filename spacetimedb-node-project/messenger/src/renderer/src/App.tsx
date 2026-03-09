import { Routes, Route, Navigate } from "react-router-dom";
import { useSpacetimeDB } from "spacetimedb/react";
import { SettingsScreen } from "./pages/SettingsScreen";
import { TickerScreen } from "./pages/TickerScreen";

function App() {
  const { isActive: connected, connectionError: error } = useSpacetimeDB();

  if (error) {
    return (
      <div className="app-container empty-state" style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <h2 style={{color: "var(--error-color)"}}>Connection Error</h2>
        <p style={{ marginTop: '12px' }}>{error.message}</p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="app-container empty-state" style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Connecting Messenger...</h2>
        <div style={{ marginTop: '16px', borderTop: '2px solid var(--accent-color)', width: '40px', borderRadius: '2px', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        {/* The Default Route for the transparent Ticker Window */}
        <Route path="/ticker" element={<TickerScreen />} />
        
        {/* The User Control Panel Route */}
        <Route path="/settings" element={<SettingsScreen />} />
        
        {/* Fallback to Settings if opened normally */}
        <Route path="*" element={<Navigate to="/settings" replace />} />
      </Routes>
    </>
  );
}

export default App;
