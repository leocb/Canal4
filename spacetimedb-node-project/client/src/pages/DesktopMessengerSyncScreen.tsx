import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { Trash2, Edit2 } from 'lucide-react';

export const DesktopMessengerSyncScreen = () => {
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [messengerDevices] = useTable(tables.MessengerDevice);
  
  const deleteDevice = useReducer(reducers.deleteMessengerDevice);
  const updateDeviceName = useReducer(reducers.updateMessengerName);

  // Force re-render periodically to update relative status times
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

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

  const isNodeConnected = (device: any) => {
    if (!device.lastConnectedAt) return false;
    const lastActive = Number(device.lastConnectedAt.microsSinceUnixEpoch / 1000n);
    const now = Date.now();
    // Heartbeat is 5s, threshold is 17s
    return (now - lastActive) < 17000;
  };

  const handleDelete = async (device: any) => {
    if (!window.confirm(`Are you sure you want to remove the display node "${device.name}"? This cannot be undone.`)) return;
    try {
      await deleteDevice({ messengerId: device.messengerId });
    } catch (err: any) {
      alert("Error deleting device: " + err.message);
    }
  };

  const handleEditName = async (device: any) => {
    const newName = prompt("Enter new name for this display node:", device.name);
    if (newName && newName.trim() && newName !== device.name) {
      try {
        await updateDeviceName({ messengerId: device.messengerId, newName: newName.trim() });
      } catch (err: any) {
        alert("Error updating name: " + err.message);
      }
    }
  };

  const NodeIndicator = ({ device }: { device: any }) => {
    const connected = isNodeConnected(device);
    const lastTime = device.lastConnectedAt?.microsSinceUnixEpoch?.toString();
    
    return (
      <div style={{ position: 'relative', width: '10px', height: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {connected && (
          <div key={lastTime} className="pulse-ring" />
        )}
        <div style={{ 
          width: '10px', height: '10px', borderRadius: '50%', 
          background: connected ? '#10B981' : '#64748b',
          boxShadow: connected ? '0 0 10px rgba(16,185,129,0.5)' : 'none',
          zIndex: 1
        }} />
      </div>
    );
  };

  return (
    <div className="app-container">
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
            venueDevices.map(device => {
              const connected = isNodeConnected(device);
              return (
                <div 
                  key={device.messengerId.toString()} 
                  className="glass-panel" 
                  style={{ padding: '24px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div className="flex-row" style={{ gap: '20px', alignItems: 'center' }}>
                    <NodeIndicator device={device} />
                    
                    <div className="flex-col" style={{ gap: '4px' }}>
                      <h3 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600 }}>
                        {device.name}
                      </h3>
                      <div className="flex-row" style={{ gap: '12px', marginTop: '6px', alignItems: 'center' }}>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          color: connected ? '#10B981' : 'var(--text-secondary)',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em'
                        }}>
                          {connected ? 'Connected' : 'Offline'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.1)' }}>|</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Last seen: {new Date(Number(device.lastConnectedAt.microsSinceUnixEpoch / 1000n)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-row" style={{ gap: '8px' }}>
                    <button 
                      className="icon-button" 
                      onClick={() => handleEditName(device)}
                      title="Rename display node"
                      style={{ 
                        padding: '8px', 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Edit2 size={18} color="var(--text-secondary)" />
                    </button>

                    <button 
                      className="icon-button danger" 
                      onClick={() => handleDelete(device)}
                      title="Delete Display Node"
                      style={{ 
                        padding: '8px',
                        background: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Trash2 size={18} color="#EF4444" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
};
