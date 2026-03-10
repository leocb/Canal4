import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer, useSpacetimeDB } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';

export const ChannelScreen = () => {
  const { venueLink, channelId } = useParams<{ venueLink: string, channelId: string }>();
  const navigate = useNavigate();
  const { identity } = useSpacetimeDB();

  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [messages] = useTable(tables.Message);
  const [venueMembers] = useTable(tables.VenueMember);
  
  const sendMessage = useReducer(reducers.sendMessage);
  
  const venue = venues.find(v => v.link === venueLink);
  const channelIdBigInt = BigInt(channelId || 0);
  const channel = channels.find(c => c.channelId === channelIdBigInt && c.venueId === venue?.venueId);

  const [body, setBody] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filter messages for this channel and sort chronologically
  const channelMessages = messages
    .filter(m => m.channelId === channelIdBigInt)
    .sort((a, b) => Number(a.sentAt.microsSinceUnixEpoch - b.sentAt.microsSinceUnixEpoch));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length]);

  // Membership guard (frontend UX — backend is authoritative)
  const membership = venue ? venueMembers.find(
    m => m.venueId === venue.venueId && m.userIdentity.toHexString() === identity?.toHexString()
  ) : undefined;

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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    
    sendMessage({ channelId: channelIdBigInt, content: body.trim(), templateId: undefined });
    setBody('');
  };

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
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
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          {channelMessages.length} msgs
        </div>
      </div>

      <div className="flex-col" style={{ flex: 1, overflowY: 'auto', padding: '24px 0', gap: '16px' }}>
        {channelMessages.length === 0 ? (
          <div className="empty-state glass-panel" style={{ margin: '0 24px' }}>
            <h3 style={{ color: 'var(--text-primary)'}}>No messages yet</h3>
            <p style={{ marginTop: '8px' }}>Send a notification or broadcast to this channel.</p>
          </div>
        ) : (
          channelMessages.map(msg => {
            const isMe = msg.senderIdentity.toHexString() === identity?.toHexString();
            return (
              <div 
                key={msg.messageId} 
                className={`glass-panel flex-col ${isMe ? 'message-mine' : 'message-other'}`}
                style={{ 
                  padding: '12px 16px', 
                  margin: '0 24px', 
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  maxWidth: '75%',
                  backgroundColor: isMe ? 'rgba(78, 204, 163, 0.15)' : 'var(--glass-bg)',
                  borderColor: isMe ? 'rgba(78, 204, 163, 0.3)' : 'var(--glass-border)'
                }}
              >
                 <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                   {isMe ? 'You' : msg.senderIdentity.toHexString().slice(0, 8)} • {new Date(Number(msg.sentAt.microsSinceUnixEpoch / 1000n)).toLocaleTimeString()}
                 </div>
                 <div style={{ lineHeight: '1.4' }}>
                   {msg.content}
                 </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form 
        onSubmit={handleSend} 
        className="glass-panel" 
        style={{ 
          margin: '24px', 
          padding: '16px', 
          display: 'flex', 
          gap: '12px',
          alignItems: 'center'
        }}
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
  );
};
