import { Routes, Route, Navigate } from "react-router-dom";
import { useSpacetimeDB } from "spacetimedb/react";
import NavBar from "./components/NavBar";

import { LoginScreen } from "./pages/LoginScreen";
import { VenuesListScreen } from "./pages/VenuesListScreen";
import { VenueChannelsScreen } from "./pages/VenueChannelsScreen";
import { ChannelScreen } from "./pages/ChannelScreen";
import { DesktopMessengerSyncScreen } from "./pages/DesktopMessengerSyncScreen";
import { NewVenueScreen } from "./pages/NewVenueScreen";
import { NewChannelScreen } from "./pages/NewChannelScreen";
import { AddNodeScreen } from "./pages/AddNodeScreen";
import { JoinVenueScreen } from "./pages/JoinVenueScreen";
import { VenueSettingsScreen } from "./pages/VenueSettingsScreen";
import { VenuePermissionsScreen } from "./pages/VenuePermissionsScreen";
import { VenueMemberScreen } from "./pages/VenueMemberScreen";
import { ChannelSettingsScreen } from "./pages/ChannelSettingsScreen";

function App() {
  const { isActive: connected, connectionError: error } = useSpacetimeDB();

  if (error) {
    return (
      <div className="app-container empty-state">
        <h2 style={{color: "var(--error-color)"}}>Connection Error</h2>
        <p style={{ marginTop: '12px' }}>{error.message}</p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="app-container empty-state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Connecting to Space...</h2>
        <div style={{ marginTop: '16px', borderTop: '2px solid var(--accent-color)', width: '40px', borderRadius: '2px', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Navigate to="/venues" replace />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/venues" element={<VenuesListScreen />} />
        <Route path="/venues/new" element={<NewVenueScreen />} />
        <Route path="/venues/:venueLink" element={<VenueChannelsScreen />} />
        <Route path="/venues/:venueLink/settings" element={<VenueSettingsScreen />} />
        <Route path="/venues/:venueLink/permissions" element={<VenuePermissionsScreen />} />
        <Route path="/venues/:venueLink/permissions/:memberIdStr" element={<VenueMemberScreen />} />
        <Route path="/venues/:venueLink/channels/new" element={<NewChannelScreen />} />
        <Route path="/venues/:venueLink/channels/:channelId" element={<ChannelScreen />} />
        <Route path="/venues/:venueLink/channels/:channelId/settings" element={<ChannelSettingsScreen />} />
        <Route path="/venues/:venueLink/desktop-displays" element={<DesktopMessengerSyncScreen />} />
        <Route path="/venues/:venueLink/desktop-displays/new" element={<AddNodeScreen />} />
        <Route path="/join/:venueLink/:token" element={<JoinVenueScreen />} />
        <Route path="*" element={<Navigate to="/venues" replace />} />
      </Routes>
    </>
  );
}

export default App;
