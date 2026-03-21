import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useReadyTable } from '../hooks/useReadyTable';
import { useAuth } from '../hooks/useAuth';
import { MoreVertical, Settings, Send, History, LayoutTemplate, Repeat, Trash2, UserX, Clock, Play, CheckCircle2, AlertCircle, WifiOff, Monitor, XCircle, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const ChannelScreen = () => {
  const { t } = useTranslation();
  const { venueLink, channelId } = useParams<{ venueLink: string, channelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [venues, venuesReady] = useReadyTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [messages] = useTable(tables.Message);
  const [venueMembers, membersReady] = useReadyTable(tables.VenueMember);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [users] = useTable(tables.User);
  const [displayDevices] = useTable(tables.DisplayDevice);
  const [deliveryStatuses] = useTable(tables.MessageDeliveryStatus);

  const deleteMessage = useReducer(reducers.deleteMessage);
  const repeatMessage = useReducer(reducers.repeatMessage);
  const blockUser = useReducer(reducers.blockUser);


  const [contextMsg, setContextMsg] = useState<any | null>(null);

  // Menu state
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const venue = venues.find((v: any) => v.link === venueLink);
  const channelIdBigInt = BigInt(channelId || 0);
  const channel = channels.find((c: any) => c.channelId === channelIdBigInt && c.venueId === venue?.venueId);

  // Force re-render periodically to update relative status times
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);


  // Role helpers (need this before messages filtering)
  const myVenueMembership = venueMembers.find(m => m.venueId === venue?.venueId && m.userId === user?.userId);
  const isBlocked = myVenueMembership?.isBlocked ?? false;

  const myChannelRole = (channelRoles as any[]).find(
    r => r.channelId === channelIdBigInt && r.userId === user?.userId
  );

  const roleTag: string = isBlocked ? 'member' : (myChannelRole?.role.tag ?? 'member').toLowerCase();
  const isVenueOwner = !isBlocked && myVenueMembership?.role.tag === 'Owner';
  const isVenueAdmin = !isBlocked && myVenueMembership?.role.tag === 'Admin';
  const isOwner = isVenueOwner || roleTag === 'owner';
  const canUpdate = isOwner || isVenueAdmin;
  const isAdmin = isOwner || roleTag === 'admin';
  const isModerator = isAdmin || roleTag === 'moderator';

  // Messages: reverse chronological (newest at top per spec and notification style UX)
  const channelMessages = [...(messages as any[])]
    .filter(m => m.channelId === channelIdBigInt)
    .filter(m => {
      const isCancelled = Array.from(deliveryStatuses || []).some((ds: any) =>
        BigInt(ds.messageId) === BigInt(m.messageId) && ds.status.tag === 'Cancelled'
      );

      if (isCancelled && !isModerator) return false;

      if (isModerator) return true;
      const ageMicros = BigInt(Date.now()) * 1000n - m.sentAt.microsSinceUnixEpoch;
      const maxAgeMicros = BigInt(channel?.messageMaxAgeHours || 4) * 3600n * 1000000n;
      return ageMicros <= maxAgeMicros;
    })
    .sort((a, b) => Number(b.sentAt.microsSinceUnixEpoch - a.sentAt.microsSinceUnixEpoch))
    .reduce((acc: any[], msg: any) => {
      const lastGroup = acc[acc.length - 1];
      if (lastGroup && lastGroup.msg.content === msg.content) {
        lastGroup.count += 1;
      } else {
        acc.push({ msg, count: 1 });
      }
      return acc;
    }, []);

  // Membership + role resolution
  const membership = venue ? (venueMembers as any[]).find(
    m => m.venueId === venue.venueId && m.userId === user?.userId
  ) : undefined;

  if (!venuesReady || !membersReady) {
    return <div className="app-container empty-state"><h2>{t('login.loading')}</h2></div>;
  }
  if (!channel || !venue) {
    return (
      <div className="app-container empty-state">
        <h2>{t('channel.not_found')}</h2>
        <button onClick={() => navigate(-1)} style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> {t('common.back')}
        </button>
      </div>
    );
  }
  if (!membership) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.access_denied')}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{t('channel.not_member')}</p>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> {t('common.back')}
        </button>
      </div>
    );
  }
  if (membership.isBlocked) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.access_denied')}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{t('channel.blocked_in_venue')}</p>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> {t('common.back')}
        </button>
      </div>
    );
  }



  const getUserName = (userId: bigint) => {
    const u = (users as any[]).find(u => u.userId === userId);
    return u?.name || t('channel.deleted_user');
  };

  // Display devices connected to this venue
  const connectedDevices = (displayDevices as any[]).filter(d => d.venueId === venue.venueId);
  const hasDevices = connectedDevices.length > 0;

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

  const getDeliveryStatus = (messageId: bigint, deviceId: bigint) => {
    const list = Array.from(deliveryStatuses || []);
    const mid = BigInt(messageId);
    const did = BigInt(deviceId);

    // Find matching status record
    const s = list.find((ds: any) => {
      try {
        return BigInt(ds.messageId) === mid && BigInt(ds.displayId) === did;
      } catch {
        return false;
      }
    });

    return s?.status?.tag;
  };

  const getMessageBorderColor = (messageId: bigint, isMe: boolean) => {
    if (!hasDevices) return isMe ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.15)';

    const statuses = connectedDevices.map(d => ({
      status: getDeliveryStatus(messageId, d.displayId),
      nodeStatus: getNodeStatus(d)
    })).filter(s => s.nodeStatus !== 'offline').map(s => s.status);

    if (statuses.length === 0) return isMe ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.15)';

    if (statuses.some(s => s === 'InProgress')) return '#3B82F6';
    if (statuses.some(s => s === 'Unavailable' || s === 'Skipped')) return '#F59E0B';
    if (statuses.every(s => s === 'Cancelled')) return '#EF4444';
    if (statuses.every(s => s === 'Shown')) return '#10B981';
    if (statuses.some(s => s === 'Queued')) return '#94A3B8';

    return isMe ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.15)';
  };



  const NodeIndicator = ({ device }: { device: any }) => {
    const status = getNodeStatus(device);
    const lastTime = device.lastConnectedAt?.microsSinceUnixEpoch?.toString();

    const color = status === 'online' ? '#10B981' : status === 'unstable' ? '#F59E0B' : '#64748b';
    const shadowSize = status === 'unstable' ? '8px' : '8px';
    const shadowOpacity = status === 'unstable' ? '0.5' : '0.4';
    const shadowColor = status === 'online' ? `rgba(16,185,129,${shadowOpacity})` : status === 'unstable' ? `rgba(245,158,11,${shadowOpacity})` : 'transparent';

    // We use the lastConnectedAt value as a key to trigger the pulse-ring animation whenever it updates
    return (
      <div style={{ position: 'relative', width: '8px', height: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {status === 'online' && (
          <div key={lastTime} className="pulse-ring" />
        )}
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: color,
          boxShadow: status !== 'offline' ? `0 0 ${shadowSize} ${shadowColor}` : 'none',
          zIndex: 1
        }} />
      </div>
    );
  };

  const StatusIcon = ({ status, nodeStatus, deviceName }: { status: string | undefined, nodeStatus: 'online' | 'unstable' | 'offline', deviceName: string }) => {
    if (nodeStatus === 'offline') {
      return (
        <span title={`${deviceName}: ${t('node_status.offline')}`}>
          <WifiOff size={14} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
        </span>
      );
    }

    if (!status) {
      return <span title={t('node_status.unknown')}><Clock size={14} style={{ color: 'rgba(255,255,255,0.1)' }} /></span>;
    }

    switch (status) {
      case 'Queued':
        return <span title={`${deviceName}: ${t('node_status.waiting')}`}><Clock size={14} style={{ color: '#94A3B8' }} /></span>;
      case 'InProgress':
        return <span title={`${deviceName}: ${t('node_status.in_progress')}`}><Play size={14} style={{ color: '#3B82F6' }} /></span>;
      case 'Shown':
        return <span title={`${deviceName}: ${t('node_status.shown')}`}><CheckCircle2 size={14} style={{ color: '#10B981' }} /></span>;
      case 'Unavailable':
        return <span title={`${deviceName}: ${t('node_status.unavailable')}`}><AlertCircle size={14} style={{ color: '#F59E0B' }} /></span>;
      case 'Skipped':
        return <span title={`${deviceName}: ${t('node_status.skipped')}`}><AlertCircle size={14} style={{ color: '#F59E0B' }} /></span>;
      case 'Cancelled':
        return <span title={`${deviceName}: ${t('node_status.deleted')}`}><XCircle size={14} style={{ color: '#EF4444' }} /></span>;
      default:
        return <span title={`${deviceName}: ${status}`}><Clock size={14} style={{ color: 'rgba(255,255,255,0.2)' }} /></span>;
    }
  };



  const handleDelete = async (msg: any) => {
    setContextMsg(null);
    try { await deleteMessage({ messageId: msg.messageId }); } catch { /* backend will reject if no permission */ }
  };

  const handleRepeat = async (msg: any) => {
    setContextMsg(null);
    const hasActiveDevices = (displayDevices as any[])
      .filter(d => d.venueId === venue?.venueId)
      .some(d => getNodeStatus(d) !== 'offline');

    if (!hasActiveDevices) {
      if (!window.confirm(t('channel.repeat_no_node_confirm'))) {
        return;
      }
    }
    try { await repeatMessage({ messageId: msg.messageId }); } catch { /* backend will reject if no permission */ }
  };

  const handleDeleteAndBlock = async (msg: any) => {
    if (!window.confirm(t('channel.delete_block_confirm'))) return;
    setContextMsg(null);
    try {
      await deleteMessage({ messageId: msg.messageId });
      await blockUser({ venueId: venue.venueId, targetUserId: msg.senderId });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <div className="app-container">
        {/* Header */}
        <div className="screen-header">
          <div className="flex-col" style={{ gap: '4px' }}>
            <span
              style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={() => navigate(`/venues/${venue.link}`)}
            >
              <ArrowLeft size={16} style={{ transform: 'translateY(1px)' }} /> {venue.name}
            </span>
            <h2>{channel.name}</h2>
          </div>

          {/* 3-dot menu — per spec, only "Channel Settings" (owners only) */}
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button className="icon-button" onClick={() => setShowMenu(s => !s)}>
              <MoreVertical size={20} />
            </button>
            {showMenu && (
              <div className="dropdown-menu glass-panel" style={{ position: 'absolute', right: 0, top: '48px', zIndex: 100, minWidth: '180px', display: 'flex', flexDirection: 'column' }}>
                {canUpdate && (
                  <>
                    <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/channels/${channel.channelId}/settings`); }}>
                      <Settings size={16} /> {t('channel.settings_button')}
                    </button>
                    <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/channels/${channel.channelId}/templates`); }}>
                      <LayoutTemplate size={16} /> {t('channel.templates_button')}
                    </button>
                  </>
                )}
                {!canUpdate && (
                  <div style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {t('channel.no_actions')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Send message — moderators and above only */}
        {isModerator && (
          <div style={{ padding: '24px 24px 0' }}>
            <div className="glass-panel" style={{ padding: '4px', background: 'var(--surface-bg)' }}>

                <button
                type="button"
                onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}/send`)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 16px', borderRadius: '8px' }}>
                <Send size={18} style={{ transform: 'translateY(1px)' }} /> {t('channel.send_broadcast')}
              </button>
            </div>
          </div>
        )}

        {/* Display Nodes Status Shelf — moderators only */}
        {isModerator && hasDevices && (
          <div style={{ padding: '24px 24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <Monitor size={14} /> {t('channel.display_nodes')}
            </div>
            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
              {connectedDevices.map((d: any) => {
                const status = getNodeStatus(d);
                const isOffline = status === 'offline';
                return (
                  <div
                    key={d.displayId.toString()}
                    className="glass-panel"
                    style={{
                      minWidth: '200px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${status === 'online' ? 'rgba(16,185,129,0.2)' : status === 'unstable' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.05)'}`
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <NodeIndicator device={d} />
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{d.name}</div>
                        <div style={{ fontSize: '0.7rem', color: isOffline ? 'var(--text-secondary)' : status === 'online' ? '#10B981' : '#F59E0B' }}>
                          {status === 'online' ? t('channel.connected') : status === 'unstable' ? t('node_status.unstable') : t('channel.offline')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Messages list — newest at top, notification panel style */}
        <div className="flex-col" style={{ flex: 1, overflowY: 'auto', padding: '24px', gap: '12px' }}>
          {channelMessages.length === 0 ? (
            <div className="empty-state glass-panel">
              <History size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <h3 style={{ color: 'var(--text-primary)' }}>{t('channel.no_notifications_title')}</h3>
              <p style={{ marginTop: '8px' }}>
                {isModerator ? t('channel.no_notifications_moderator') : t('channel.no_notifications_member')}
              </p>
            </div>
          ) : (
            channelMessages.map(({ msg, count }: any) => {
              const isMe = msg.senderId === user?.userId;
              const dateObj = new Date(Number(msg.sentAt.microsSinceUnixEpoch / 1000n));
              const isToday = new Date().toDateString() === dateObj.toDateString();
              const timeString = isToday ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : dateObj.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

              return (
                <div
                  key={msg.messageId}
                  className="glass-panel"
                  style={{
                    padding: '16px 20px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    borderLeft: `3px solid ${getMessageBorderColor(msg.messageId, isMe)}`,
                    borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                    cursor: isModerator ? 'pointer' : 'default',
                    userSelect: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => { if (isModerator) setContextMsg(msg); }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {timeString}
                      </span>
                      {count > 1 && (
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          color: '#fff',
                          backgroundColor: 'var(--accent-color)',
                          padding: '2px 8px',
                          borderRadius: '12px'
                        }}>
                          {count}x
                        </span>
                      )}
                    </div>

                    {/* Delivery status icons — moderators and above only */}
                    {isModerator && hasDevices && (
                      <span style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '12px', alignItems: 'center' }}>
                        {connectedDevices.map((d: any) => (
                          <StatusIcon
                            key={d.displayId.toString()}
                            status={getDeliveryStatus(msg.messageId, d.displayId)}
                            nodeStatus={getNodeStatus(d)}
                            deviceName={d.name}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '1.05rem', lineHeight: '1.4', wordBreak: 'break-word', color: 'rgba(255,255,255,0.9)' }}>
                    {msg.content}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Message context menu (long press / right click) */}
      {contextMsg && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setContextMsg(null); }}
        >
          <div className="glass-panel" style={{ padding: '8px', minWidth: '260px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--surface-border)', marginBottom: '4px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {new Date(Number(contextMsg.sentAt.microsSinceUnixEpoch / 1000n)).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {contextMsg.senderId === user?.userId ? t('channel.by_you') : t('channel.by_user', { name: getUserName(contextMsg.senderId) })}
                </div>
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.4, wordBreak: 'break-word', padding: '0px', borderRadius: '8px' }}>
                {contextMsg.content}
              </div>
            </div>
            <button className="dropdown-item" onClick={() => handleRepeat(contextMsg)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Repeat size={16} /> {t('channel.display_again')}
            </button>
            <button className="dropdown-item danger" onClick={() => handleDelete(contextMsg)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trash2 size={16} /> {t('channel.delete_button')}
            </button>
            {isAdmin && contextMsg.senderId !== user?.userId && (
              <button className="dropdown-item danger" onClick={() => handleDeleteAndBlock(contextMsg)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserX size={16} /> {t('channel.delete_block_button')}
              </button>
            )}
            <button className="dropdown-item" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }} onClick={() => setContextMsg(null)}>
              {t('channel.close_button')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
