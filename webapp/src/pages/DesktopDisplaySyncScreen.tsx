import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { Trash2, Edit2, ArrowLeft, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const DesktopDisplaySyncScreen = () => {
  const { t } = useTranslation();
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [venues] = useTable(tables.VenueView);
  const [venueMembers] = useTable(tables.VenueMemberView);
  const [displayDevices] = useTable(tables.DisplayDeviceView);
  
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
  
  const venueDevices = displayDevices.filter(d => d.venueId === venueIdBigInt).sort((a, b) => a.name.localeCompare(b.name));

  if (!venue) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.venue_not_found')}</h2>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>{t('common.back')}</button>
      </div>
    );
  }

  // Ensure user has permissions to view this screen
  const myMember = venueMembers.find(m => m.venueId === venueIdBigInt && m.userId === user?.userId);
  const isVenueOwner = myMember?.role.tag === 'Owner';
  const isVenueAdmin = myMember?.role.tag === 'Admin';
  const canManageDisplays = isVenueOwner || isVenueAdmin;

  if (!canManageDisplays) {
    return (
      <div className="app-container empty-state">
        <h2>{t('display_nodes.unauthorized')}</h2>
        <p>{t('display_nodes.unauthorized_helper')}</p>
        <button onClick={() => navigate(`/venues/${venue.link}`)} style={{ marginTop: '16px' }}>{t('common.back')}</button>
      </div>
    );
  }


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


  return (
    <div className="app-container">
      <div className="content-area">
        <div className="screen-header" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="icon-button" 
              onClick={() => navigate(`/venues/${venue.link}`)}
            >
              <ArrowLeft size={20} />
            </button>
            <h2>{t('display_nodes.title', { name: venue.name })}</h2>
          </div>
          <button 
            className="icon-button"
            onClick={() => navigate(`/venues/${venue.link}/desktop-displays/new`)}
            title={t('display_nodes.add_button')}
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="flex-col" style={{ paddingBottom: '24px' }}>
          {venueDevices.length === 0 ? (
            <div className="empty-state glass-panel">
              <h3 style={{ color: 'var(--text-primary)'}}>{t('display_nodes.no_displays')}</h3>
              <p style={{ marginTop: '8px' }}>{t('display_nodes.no_displays_helper')}</p>
            </div>
          ) : (
            venueDevices.map(device => {
              const status = getNodeStatus(device);
              const statusColor = status === 'online' ? '#10B981' : status === 'unstable' ? '#F59E0B' : 'var(--text-secondary)';
              const statusLabel = status === 'online' ? t('channel.connected') : status === 'unstable' ? t('node_status.unstable') : t('channel.offline');

              return (
                <div 
                  key={device.displayId.toString()} 
                  className="glass-panel" 
                  style={{ padding: '24px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}
                >
                  {/* 1st row: Name on the left, edit/delete buttons on the right */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="flex-row" style={{ gap: '12px', alignItems: 'center' }}>
                      <NodeIndicator device={device} />
                      <h3 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 600 }}>
                        {device.name}
                      </h3>
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
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
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
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                      >
                        <Trash2 size={18} color="#EF4444" />
                      </button>
                    </div>
                  </div>

                  {/* 2nd row: last seen */}
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                    {t('display_nodes.last_seen', { date: new Date(Number(device.lastConnectedAt.microsSinceUnixEpoch / 1000n)).toLocaleString() })}
                  </div>

                  {/* 3rd row: Connection badge */}
                  <div>
                    <span style={{ 
                      fontSize: '0.72rem', 
                      color: statusColor,
                      background: status === 'online' ? 'rgba(16,185,129,0.1)' : status === 'unstable' ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${status === 'online' ? 'rgba(16,185,129,0.2)' : status === 'unstable' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: '20px',
                      padding: '4px 12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}>
                      {statusLabel}
                    </span>
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

const getNodeStatus = (device: any): 'online' | 'unstable' | 'offline' => {
  if (!device.lastConnectedAt) return 'offline';
  try {
    const lastActive = Number(BigInt(device.lastConnectedAt.microsSinceUnixEpoch) / 1000n);
    const now = Date.now();
    const diff = now - lastActive;
    if (diff < 7000) return 'online';
    if (diff < 17000) return 'unstable';
    return 'offline';
  } catch {
    return 'offline';
  }
};

const NodeIndicator = ({ device }: { device: any }) => {
  const status = getNodeStatus(device);
  const lastTime = device.lastConnectedAt?.microsSinceUnixEpoch?.toString();
  
  const color = status === 'online' ? '#10B981' : status === 'unstable' ? '#F59E0B' : '#64748b';
  const shadow = status === 'online' ? '0 0 10px rgba(16,185,129,0.5)' : status === 'unstable' ? '0 0 10px rgba(245,158,11,0.5)' : 'none';

  // We use the lastConnectedAt value as a key to trigger the pulse-ring animation whenever it updates.
  // Defining this outside the main component prevents it from remounting and restarting the animation 
  // on every parent re-render (e.g. from the 5s timer).
  return (
    <div style={{ position: 'relative', width: '10px', height: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {status === 'online' && (
        <div key={lastTime} className="pulse-ring" />
      )}
      <div style={{ 
        width: '10px', height: '10px', borderRadius: '50%', 
        background: color,
        boxShadow: shadow,
        zIndex: 1
      }} />
    </div>
  );
};
