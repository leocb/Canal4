import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useReadyTable } from '../hooks/useReadyTable';
import { MoreVertical, Settings } from 'lucide-react';

export const ChannelScreen = () => {
  const { venueLink, channelId } = useParams<{ venueLink: string, channelId: string }>();
  const navigate = useNavigate();
  const { identity } = useSpacetimeDB();

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

  const venue = venues.find((v: any) => v.link === venueLink);
  const channelIdBigInt = BigInt(channelId || 0);
  const channel = channels.find((c: any) => c.channelId === channelIdBigInt && c.venueId === venue?.venueId);

  const [body, setBody] = useState('');
  const [sendError, setSendError] = useState('');
  const [contextMsg, setContextMsg] = useState<any | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Messages: reverse chronological (newest at bottom means we scroll to bottom; spec says reverse chron but typical chat UX keeps newest at bottom)
  // Spec says "reverse chronological" but also "scroll to bottom", so newest at bottom (ascending by sent_at) is correct UX
  const channelMessages = [...(messages as any[])]
    .filter(m => m.channelId === channelIdBigInt)
    .sort((a, b) => Number(a.sentAt.microsSinceUnixEpoch - b.sentAt.microsSinceUnixEpoch));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length]);

  // Membership + role resolution
  const membership = venue ? (venueMembers as any[]).find(
    m => m.venueId === venue.venueId && m.userIdentity.toHexString() === identity?.toHexString()
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

  // Role helpers
  const myChannelRole = (channelRoles as any[]).find(
    r => r.channelId === channelIdBigInt && r.userIdentity.toHexString() === identity?.toHexString()
  );
  const roleTag: string = myChannelRole?.role.tag ?? 'member';
  const isVenueOwner = venue.ownerIdentity.toHexString() === identity?.toHexString();
  const isOwner = isVenueOwner || roleTag === 'owner';
  const isAdmin = isOwner || roleTag === 'admin';
  const isModerator = isAdmin || roleTag === 'moderator';

  const getUserName = (identityHex: string) => {
    const u = (users as any[]).find(u => u.identity.toHexString() === identityHex);
    return u?.name || identityHex.slice(0, 10) + '…';
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
    Enqueued:   '🕐',
    InProgress: '▶️',
    Shown:      '✅',
  };

  // Long-press handling for touch + right-click for desktop
  const startLongPress = (msg: any) => {
    longPressTimer.current = setTimeout(() => setContextMsg(msg), 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
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
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); alert('Channel Settings (Not yet implemented)'); }}>
                    <Settings size={16} /> Channel Settings
                  </button>
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

        {/* Messages list — newest at bottom, scroll to bottom */}
        <div className="flex-col" style={{ flex: 1, overflowY: 'auto', padding: '24px 0', gap: '12px' }}>
          {channelMessages.length === 0 ? (
            <div className="empty-state glass-panel" style={{ margin: '0 24px' }}>
              <h3 style={{ color: 'var(--text-primary)' }}>No new messages</h3>
              <p style={{ marginTop: '8px' }}>
                {isModerator ? 'Send a message using the form below.' : 'Messages from moderators will appear here.'}
              </p>
            </div>
          ) : (
            channelMessages.map((msg: any) => {
              const isMe = msg.senderIdentity.toHexString() === identity?.toHexString();
              return (
                <div
                  key={msg.messageId}
                  className={`glass-panel flex-col`}
                  style={{
                    padding: '12px 16px',
                    margin: '0 24px',
                    alignSelf: isMe ? 'flex-end' : 'flex-start',
                    maxWidth: '75%',
                    backgroundColor: isMe ? 'rgba(78, 204, 163, 0.15)' : 'var(--glass-bg)',
                    borderColor: isMe ? 'rgba(78, 204, 163, 0.3)' : 'var(--glass-border)',
                    cursor: isModerator ? 'context-menu' : 'default',
                    userSelect: 'none',
                  }}
                  onContextMenu={e => { e.preventDefault(); if (isModerator) setContextMsg(msg); }}
                  onTouchStart={() => { if (isModerator) startLongPress(msg); }}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                >
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>{isMe ? 'You' : getUserName(msg.senderIdentity.toHexString())} • {new Date(Number(msg.sentAt.microsSinceUnixEpoch / 1000n)).toLocaleTimeString()}</span>
                    {/* Delivery status icons — moderators and above only */}
                    {isModerator && hasDevices && (
                      <span style={{ display: 'flex', gap: '4px' }}>
                        {connectedDevices.map((d: any) => (
                          <span key={d.messengerId} title={d.name} style={{ fontSize: '0.75rem' }}>
                            {STATUS_ICON[getDeliveryStatus(msg.messageId, d.messengerId)] ?? '⏳'}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div style={{ lineHeight: '1.4' }}>{msg.content}</div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Send message — moderators and above only */}
        {isModerator && (
          <div style={{ margin: '0 24px 24px' }}>
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
              style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}
            >
              <input
                type="text"
                placeholder="Send a message to this channel..."
                value={body}
                onChange={e => setBody(e.target.value)}
                style={{ flex: 1, marginBottom: 0 }}
                autoFocus
              />
              <button type="submit" disabled={!body.trim()}>Send</button>
            </form>
          </div>
        )}
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
          <div className="glass-panel" style={{ padding: '8px', minWidth: '220px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--surface-border)', marginBottom: '4px' }}>
              {contextMsg.content.length > 40 ? contextMsg.content.slice(0, 40) + '…' : contextMsg.content}
            </div>
            <button className="dropdown-item" onClick={() => handleRepeat(contextMsg)}>
              🔁 Display Again
            </button>
            {isAdmin && (
              <button className="dropdown-item danger" onClick={() => handleDelete(contextMsg)}>
                🗑️ Delete
              </button>
            )}
            <button className="dropdown-item" style={{ color: 'var(--text-secondary)' }} onClick={() => setContextMsg(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
};
