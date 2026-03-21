import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useReducer } from 'spacetimedb/react';
import { reducers } from './module_bindings';
import { SpacetimeDBProvider } from './SpacetimeDBProvider';
import { useConnectivity } from './hooks/useConnectivity';
import { useAuth } from './hooks/useAuth';
import NavBar from './components/NavBar';
import ReconnectingOverlay from './components/ReconnectingOverlay';
import ProtectedRoute from './components/ProtectedRoute';
import { Breadcrumbs } from './components/Breadcrumbs';

// Named imports for screen components
import { LoginScreen } from './pages/LoginScreen';
import { ProfileScreen } from './pages/ProfileScreen';
import { VenuesListScreen } from './pages/VenuesListScreen';
import { NewVenueScreen } from './pages/NewVenueScreen';
import { VenueChannelsScreen } from './pages/VenueChannelsScreen';
import { VenueSettingsScreen } from './pages/VenueSettingsScreen';
import { VenuePermissionsScreen } from './pages/VenuePermissionsScreen';
import { VenueMemberScreen } from './pages/VenueMemberScreen';
import { NewChannelScreen } from './pages/NewChannelScreen';
import { ChannelScreen } from './pages/ChannelScreen';
import { SendMessageScreen } from './pages/SendMessageScreen';
import { ChannelSettingsScreen } from './pages/ChannelSettingsScreen';
import { ChannelTemplatesScreen } from './pages/ChannelTemplatesScreen';
import { ChannelTemplateEditScreen } from './pages/ChannelTemplateEditScreen';
import { JoinVenueScreen } from './pages/JoinVenueScreen';
import { DesktopDisplaySyncScreen } from './pages/DesktopDisplaySyncScreen';
import { AddNodeScreen } from './pages/AddNodeScreen';

// Inner content that uses SpacetimeDB context
function AppContent() {
  const { status, nextRetryIn, reconnect, connectionError, isInitialLoad } = useConnectivity();
  const { isLoggedIn } = useAuth();
  const extendSession = useReducer(reducers.extendSession);

  // Extend session on mount/re-connect if logged in
  useEffect(() => {
    if (status === 'online' && isLoggedIn) {
      extendSession();
    }
  }, [status, isLoggedIn, extendSession]);

  // Show the friendly overlay for BOTH initial loading and reconnection
  if (status !== 'online') {
    return (
      <ReconnectingOverlay 
        nextRetryIn={nextRetryIn} 
        isInitialLoad={isInitialLoad}
        onRetryNow={reconnect}
        error={connectionError}
      />
    );
  }

  return (
    <>
      <NavBar />
      <Breadcrumbs />
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/venues" replace />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/venues" element={<VenuesListScreen />} />
          <Route path="/venues/new" element={<NewVenueScreen />} />
          <Route path="/venues/:venueLink" element={<VenueChannelsScreen />} />
          <Route path="/venues/:venueLink/settings" element={<VenueSettingsScreen />} />
          <Route path="/venues/:venueLink/permissions" element={<VenuePermissionsScreen />} />
          <Route path="/venues/:venueLink/permissions/:memberIdStr" element={<VenueMemberScreen />} />
          <Route path="/venues/:venueLink/channels/new" element={<NewChannelScreen />} />
          <Route path="/venues/:venueLink/channels/:channelId" element={<ChannelScreen />} />
          <Route path="/venues/:venueLink/channels/:channelId/send" element={<SendMessageScreen />} />
          <Route path="/venues/:venueLink/channels/:channelId/settings" element={<ChannelSettingsScreen />} />
          <Route path="/venues/:venueLink/channels/:channelId/templates" element={<ChannelTemplatesScreen />} />
          <Route path="/venues/:venueLink/channels/:channelId/templates/:templateId" element={<ChannelTemplateEditScreen />} />
          <Route path="/venues/:venueLink/desktop-displays" element={<DesktopDisplaySyncScreen />} />
          <Route path="/venues/:venueLink/desktop-displays/new" element={<AddNodeScreen />} />
          <Route path="/join/:venueLink/:token" element={<JoinVenueScreen />} />
          <Route path="*" element={<Navigate to="/venues" replace />} />
        </Route>
      </Routes>
    </>
  );
}

function App() {
  return (
    <SpacetimeDBProvider>
      <AppContent />
    </SpacetimeDBProvider>
  );
}

export default App;
