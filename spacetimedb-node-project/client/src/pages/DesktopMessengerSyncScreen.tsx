import { useParams, useNavigate } from 'react-router-dom';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';

export const DesktopMessengerSyncScreen = () => {
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [messengerDevices] = useTable(tables.MessengerDevice);
  const venue = venues.find(v => v.link === venueLink);
  const venueIdBigInt = venue ? venue.venueId : 0n;
  
  const venueChannels = channels.filter(c => c.venueId === venueIdBigInt);
  const venueDevices = messengerDevices.filter(d => d.venueId === venueIdBigInt);

  if (!venue) {
    return (
      <div className="app-container empty-state">
        <h2>Venue not found</h2>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>Go back</button>
      </div>
    );
  }

  // Ensure user has permissions to view this screen
  const isOwner = venue.ownerId === user?.userId;
  const userRolesInVenue = channelRoles.filter(r => 
    r.userId === user?.userId && 
    venueChannels.some(c => c.channelId === r.channelId)
  );
  const isAdmin = userRolesInVenue.some(r => r.role.tag === 'Admin' || r.role.tag === 'Owner');
  const canManageDisplays = isOwner || isAdmin;

  if (!canManageDisplays) {
    return (
      <div className="app-container empty-state">
        <h2>Unauthorized</h2>
        <p>Only Admins and Owners can manage desktop displays.</p>
        <button onClick={() => navigate(`/venues/${venue.link}`)} style={{ marginTop: '16px' }}>Go back</button>
      </div>
    );
  }



  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="screen-header" style={{ flexShrink: 0 }}>
        <div className="flex-col" style={{ gap: '4px' }}>
          <span 
            style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => navigate(`/venues/${venue.link}`)}
          >
            ← Back to Channel List
          </span>
          <h2>{venue.name} Desktop Displays</h2>
        </div>
        <button onClick={() => navigate(`/venues/${venue.link}/desktop-displays/new`)}>
          Add Node
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '24px' }}>
        <div className="flex-col">
          {venueDevices.length === 0 ? (
            <div className="empty-state glass-panel">
              <h3 style={{ color: 'var(--text-primary)'}}>No displays registered</h3>
              <p style={{ marginTop: '8px' }}>Pair a new desktop messenger below to see it here.</p>
            </div>
          ) : (
            venueDevices.map(device => (
              <div 
                key={device.messengerId.toString()} 
                className="glass-panel flex-row" 
                style={{ padding: '20px 24px', justifyContent: 'space-between', marginBottom: '12px' }}
              >
                <div>
                  <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{device.name}</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Registered: {new Date(Number(device.registeredAt.microsSinceUnixEpoch / 1000n)).toLocaleString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};
