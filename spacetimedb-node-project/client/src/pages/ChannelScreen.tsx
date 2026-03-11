import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useReadyTable } from '../hooks/useReadyTable';
import { useAuth } from '../hooks/useAuth';
import { MoreVertical, Settings, Send, History, LayoutTemplate, Repeat, Trash2, UserX } from 'lucide-react';

export const ChannelScreen = () => {
  const { venueLink, channelId } = useParams<{ venueLink: string, channelId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [venues, venuesReady] = useReadyTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [messages] = useTable(tables.Message);
  const [venueMembers, membersReady] = useReadyTable(tables.VenueMember);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [users] = useTable(tables.User);
  const [messengerDevices] = useTable(tables.MessengerDevice);
  const [deliveryStatuses] = useTable(tables.MessageDeliveryStatus);

  const sendMessage = useReducer(reducers.sendMessage);
  const deleteMessage = useReducer(reducers.deleteMessage);
  const repeatMessage = useReducer(reducers.repeatMessage);
  const blockUser = useReducer(reducers.blockUser);

  const venue = venues.find((v: any) => v.link === venueLink);
  const channelIdBigInt = BigInt(channelId || 0);
  const channel = channels.find((c: any) => c.channelId === channelIdBigInt && c.venueId === venue?.venueId);

  const [body, setBody] = useState('');
  const [sendError, setSendError] = useState('');
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

  // Role helpers (need this before messages filtering)
  const myVenueMembership = venueMembers.find(m => m.venueId === venue?.venueId && m.userId === user?.userId);
  const isBlocked = myVenueMembership?.isBlocked ?? false;

  const myChannelRole = (channelRoles as any[]).find(
    r => r.channelId === channelIdBigInt && r.userId === user?.userId
  );

  const roleTag: string = isBlocked ? 'member' : (myChannelRole?.role.tag ?? 'member').toLowerCase();
  const isVenueOwner = !isBlocked && venue?.ownerId === user?.userId;
  const isOwner = isVenueOwner || roleTag === 'owner';
  const isAdmin = isOwner || roleTag === 'admin';
  const isModerator = isAdmin || roleTag === 'moderator';

  // Messages: reverse chronological (newest at top per spec and notification style UX)
  const channelMessages = [...(messages as any[])]
    .filter(m => m.channelId === channelIdBigInt)
    .filter(m => {
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
    return <div className="app-container empty-state"><h2>Loading...</h2></div>;
  }
  if (!channel || !venue) {
    return (
      <div className="app-container empty-state">
        <h2>Channel not found</h2>
        <button onClick={() => navigate(-1)} style={{ marginTop: '16px' }}>Go back</button>
      </div>
    );
  }
  if (!membership) {
    return (
      <div className="app-container empty-state">
        <h2>Access Denied</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>You are not a member of this venue.</p>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>Go back</button>
      </div>
    );
  }
  if (membership.isBlocked) {
    return (
      <div className="app-container empty-state">
        <h2>Access Denied</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>You have been blocked in this venue.</p>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>Go back</button>
      </div>
    );
  }



  const getUserName = (userId: bigint) => {
    const u = (users as any[]).find(u => u.userId === userId);
    return u?.name || `[deleted user]`;
  };

  // Messenger devices connected to this venue
  const connectedDevices = (messengerDevices as any[]).filter(d => d.venueId === venue.venueId);
  const hasDevices = connectedDevices.length > 0;

  const getDeliveryStatus = (messageId: any, deviceId: any) => {
    const s = (deliveryStatuses as any[]).find(
      ds => ds.messageId === messageId && ds.messengerId === deviceId
    );
    return s?.status.tag;
  };

  const STATUS_ICON: Record<string, string> = {
    Enqueued: '🕐',
    InProgress: '▶️',
    Shown: '✅',
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSendError('');
    try {
      await sendMessage({ channelId: channelIdBigInt, content: body.trim(), templateId: undefined });
      setBody('');
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (msg: any) => {
    setContextMsg(null);
    try { await deleteMessage({ messageId: msg.messageId }); } catch { /* backend will reject if no permission */ }
  };

  const handleRepeat = async (msg: any) => {
    setContextMsg(null);
    try { await repeatMessage({ messageId: msg.messageId }); } catch { /* backend will reject if no permission */ }
  };

  const handleDeleteAndBlock = async (msg: any) => {
    if (!window.confirm('Are you sure you want to delete this message and block the user?')) return;
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
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* Header */}
        <div className="screen-header">
          <div className="flex-col" style={{ gap: '4px' }}>
            <span
              style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500 }}
              onClick={() => navigate(`/venues/${venue.link}`)}
            >
              ← {venue.name}
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
                {isOwner && (
                  <>
                    <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/channels/${channel.channelId}/settings`); }}>
                      <Settings size={16} /> Channel Settings
                    </button>
                    <button className="dropdown-item" onClick={() => { setShowMenu(false); alert('Templates configuration not yet implemented'); }}>
                      <LayoutTemplate size={16} /> Templates
                    </button>
                  </>
                )}
                {!isOwner && (
                  <div style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No actions available
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Send message — moderators and above only */}
        {isModerator && (
          <div style={{ padding: '24px 24px 0' }}>
            {sendError && (
              <div style={{
                color: 'var(--error-color)', fontSize: '0.85rem',
                padding: '10px 12px', marginBottom: '8px',
                background: 'rgba(239,68,68,0.1)', borderRadius: '8px',
                border: '1px solid var(--error-color)',
              }}>
                ⚠️ {sendError}
              </div>
            )}
            <form
              onSubmit={handleSend}
              className="glass-panel"
              style={{ padding: '8px', display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--surface-bg)' }}
            >
              <input
                type="text"
                placeholder="Compose new notification..."
                value={body}
                onChange={e => setBody(e.target.value)}
                style={{ flex: 1, marginBottom: 0, padding: '12px 16px', background: 'transparent', border: 'none', boxShadow: 'none' }}
                autoFocus
              />
              <button type="submit" disabled={!body.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px', borderRadius: '8px' }}>
                <Send size={16} /> Send
              </button>
            </form>
          </div>
        )}

        {/* Messages list — newest at top, notification panel style */}
        <div className="flex-col" style={{ flex: 1, overflowY: 'auto', padding: '24px', gap: '12px' }}>
          {channelMessages.length === 0 ? (
            <div className="empty-state glass-panel">
              <History size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
              <h3 style={{ color: 'var(--text-primary)' }}>No recent notifications</h3>
              <p style={{ marginTop: '8px' }}>
                {isModerator ? 'Use the form above to send the first broadcast.' : 'Notifications from moderators will appear here.'}
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
                    borderLeft: `3px solid ${isMe ? 'var(--accent-color)' : 'rgba(255, 255, 255, 0.15)'}`,
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
                      <span style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: '12px' }}>
                        {connectedDevices.map((d: any) => (
                          <span key={d.messengerId} title={d.name} style={{ fontSize: '0.75rem' }}>
                            {STATUS_ICON[getDeliveryStatus(msg.messageId, d.messengerId)] ?? '⏳'}
                          </span>
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
                  By: {contextMsg.senderId === user?.userId ? 'You' : getUserName(contextMsg.senderId)}
                </div>
              </div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.4, wordBreak: 'break-word', padding: '0px', borderRadius: '8px' }}>
                {contextMsg.content}
              </div>
            </div>
            <button className="dropdown-item" onClick={() => handleRepeat(contextMsg)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Repeat size={16} /> Display Again
            </button>
            <button className="dropdown-item danger" onClick={() => handleDelete(contextMsg)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trash2 size={16} /> Delete
            </button>
            {isAdmin && contextMsg.senderId !== user?.userId && (
              <button className="dropdown-item danger" onClick={() => handleDeleteAndBlock(contextMsg)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserX size={16} /> Delete & Block
              </button>
            )}
            <button className="dropdown-item" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }} onClick={() => setContextMsg(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
