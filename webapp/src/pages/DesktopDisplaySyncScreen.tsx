import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { Trash2, Edit2, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const DesktopDisplaySyncScreen = () => {
  const { t } = useTranslation();
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [displayDevices] = useTable(tables.DisplayDevice);
  
  const deleteDevice = useReducer(reducers.deleteDisplayDevice);
  const updateDeviceName = useReducer(reducers.updateDisplayName);

  // Force re-render periodically to update relative status times
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  const venue = venues.find(v => v.link === venueLink);
  const venueIdBigInt = venue ? venue.venueId : 0n;
  
  const venueChannels = channels.filter(c => c.venueId === venueIdBigInt);
  const venueDevices = displayDevices.filter(d => d.venueId === venueIdBigInt);

  if (!venue) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.venue_not_found')}</h2>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>{t('common.back')}</button>
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
        <h2>{t('display_nodes.unauthorized')}</h2>
        <p>{t('display_nodes.unauthorized_helper')}</p>
        <button onClick={() => navigate(`/venues/${venue.link}`)} style={{ marginTop: '16px' }}>{t('common.back')}</button>
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
    if (!window.confirm(t('display_nodes.confirm_delete', { name: device.name }))) return;
    try {
      await deleteDevice({ displayId: device.displayId });
    } catch (err: any) {
      alert(t('display_nodes.error_delete', { error: t(err.message) }));
    }
  };

  const handleEditName = async (device: any) => {
    const newName = prompt(t('display_nodes.rename_prompt'), device.name);
    if (newName && newName.trim() && newName !== device.name) {
      try {
        await updateDeviceName({ displayId: device.displayId, newName: newName.trim() });
      } catch (err: any) {
        alert(t('display_nodes.error_rename', { error: t(err.message) }));
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
            style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            onClick={() => navigate(`/venues/${venue.link}`)}
          >
            <ArrowLeft size={16} /> {t('display_nodes.back_to_channels')}
          </span>
          <h2>{t('display_nodes.title', { name: venue.name })}</h2>
        </div>
        <button onClick={() => navigate(`/venues/${venue.link}/desktop-displays/new`)}>
          {t('display_nodes.add_button')}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '24px' }}>
        <div className="flex-col">
          {venueDevices.length === 0 ? (
            <div className="empty-state glass-panel">
              <h3 style={{ color: 'var(--text-primary)'}}>{t('display_nodes.no_displays')}</h3>
              <p style={{ marginTop: '8px' }}>{t('display_nodes.no_displays_helper')}</p>
            </div>
          ) : (
            venueDevices.map(device => {
              const connected = isNodeConnected(device);
              return (
                <div 
                  key={device.displayId.toString()} 
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
                          {connected ? t('channel.connected') : t('channel.offline')}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.1)' }}>|</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {t('display_nodes.last_seen', { date: new Date(Number(device.lastConnectedAt.microsSinceUnixEpoch / 1000n)).toLocaleString() })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-row" style={{ gap: '8px' }}>
                    <button 
                      className="icon-button" 
                      onClick={() => handleEditName(device)}
                      title={t('display_nodes.rename_tooltip')}
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
                      title={t('display_nodes.delete_tooltip')}
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
