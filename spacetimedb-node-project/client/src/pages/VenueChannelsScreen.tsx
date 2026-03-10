import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { MoreVertical, Plus, Monitor, Settings, Shield, UserPlus, Bell, LogOut, Copy, Check, X, Share } from 'lucide-react';
import { useReadyTable } from '../hooks/useReadyTable';
import { useAuth } from '../hooks/useAuth';
import QRCode from "react-qr-code";

export const VenueChannelsScreen = () => {
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();

  const { user } = useAuth();
  const [venues, venuesReady] = useReadyTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [venueMembers, membersReady] = useReadyTable(tables.VenueMember);
  const leaveVenue = useReducer(reducers.leaveVenue);

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveErrorText, setLeaveErrorText] = useState('');
  const [copied, setCopied] = useState(false);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const venue = venues.find(v => v.link === venueLink);
  const venueIdBigInt = venue ? venue.venueId : 0n;

  const venueChannels = channels.filter(c => c.venueId === venueIdBigInt);

  const isOwner = venue?.ownerId === user?.userId;
  const userRolesInVenue = channelRoles.filter(r =>
    r.userId === user?.userId &&
    venueChannels.some(c => c.channelId === r.channelId)
  );
  const isAdmin = userRolesInVenue.some(r => r.role.tag === 'Admin' || r.role.tag === 'Owner');
  const canManageDisplays = isOwner || isAdmin;

  // Membership check (frontend UX guard — backend is authoritative)
  const isMember = venue ? venueMembers.some(
    m => m.venueId === venue.venueId && m.userId === user?.userId
  ) : false;

  if (!venuesReady || !membersReady) {
    return (
      <div className="app-container empty-state">
        <h2>Loading...</h2>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="app-container empty-state">
        <h2>Venue not found</h2>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>Go back</button>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="app-container empty-state">
        <h2>Access Denied</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>You are not a member of this venue.</p>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>Go back</button>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/join/${venue.link}`;
  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if ('share' in navigator) {
      try {
        await navigator.share({
          title: `Join ${venue?.name}`,
          text: `You've been invited to join ${venue?.name} on Courier Notifications!`,
          url: joinUrl,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    }
  };

  const handleLeaveVenueClick = () => {
    setShowMenu(false);
    if (isOwner) {
      alert('You cannot leave a venue you own. Please delete the venue settings, or promote another member to owner first (not yet implemented).');
      return;
    }
    setShowLeaveConfirm(true);
  };

  const confirmLeaveVenue = async () => {
    if (!venue) return;
    setLeaveErrorText('');
    setLeaveLoading(true);
    try {
      await leaveVenue({ venueId: venue.venueId });
      navigate('/venues', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setLeaveErrorText(message || 'Failed to leave venue. Please try again.');
      setLeaveLoading(false);
    }
  };

  return (
    <>
      <div className="app-container">
        <div className="screen-header">
          <div className="flex-col" style={{ gap: '4px' }}>
            <span
              style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500 }}
              onClick={() => navigate('/venues')}
            >
              ← Back to Venues
            </span>
            <h2>{venue.name}</h2>
          </div>
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              className="icon-button"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreVertical size={20} />
            </button>
            {showMenu && (
              <div className="dropdown-menu glass-panel" style={{ position: 'absolute', right: 0, top: '48px', zIndex: 100, minWidth: '200px', display: 'flex', flexDirection: 'column' }}>
                {isOwner && (
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/channels/new`); }}>
                    <Plus size={16} /> New Channel
                  </button>
                )}
                {canManageDisplays && (
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/desktop-displays`); }}>
                    <Monitor size={16} /> Display Nodes
                  </button>
                )}
                {isOwner && (
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/settings`); }}>
                    <Settings size={16} /> Venue Settings
                  </button>
                )}
                {canManageDisplays && (
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); alert('Permissions (Not yet implemented)'); }}>
                    <Shield size={16} /> Permissions
                  </button>
                )}
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={() => { setShowMenu(false); setShowInvite(true); }}>
                  <UserPlus size={16} /> Invite
                </button>
                <button className="dropdown-item" onClick={() => { setShowMenu(false); alert('Notifications (Not yet implemented)'); }}>
                  <Bell size={16} /> Notifications
                </button>
                <div className="dropdown-divider" />
                <button className="dropdown-item danger" onClick={handleLeaveVenueClick}>
                  <LogOut size={16} /> Leave Venue
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-col" style={{ marginTop: '16px' }}>
          {venueChannels.length === 0 ? (
            <div className="empty-state glass-panel">
              <h3 style={{ color: 'var(--text-primary)'}}>No channels yet</h3>
              <p style={{ marginTop: '8px' }}>Create a channel from the menu to configure notifications.</p>
            </div>
          ) : (
            venueChannels.map(channel => (
              <div
                key={channel.channelId.toString()}
                className="glass-panel-interactive flex-row"
                style={{ padding: '16px 24px', justifyContent: 'space-between', marginBottom: '12px' }}
                onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}`)}
              >
                <div>
                  <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{channel.name}</h3>
                  <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {channel.description || 'No description provided.'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowInvite(false); }}
        >
          <div className="glass-panel" style={{ padding: '32px', width: '100%', maxWidth: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.3rem' }}>Invite to {venue.name}</h3>
              <button className="icon-button" onClick={() => setShowInvite(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
              <div style={{ background: 'white', padding: '16px', borderRadius: '12px' }}>
                <QRCode value={joinUrl} size={180} />
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px', lineHeight: 1.6, textAlign: 'center' }}>
              Scan the QR code to join this venue, or share the link below.
            </p>
            <div style={{
              display: 'flex',
              gap: '8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--surface-border)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              alignItems: 'center',
            }}>
              <span style={{
                flex: 1,
                fontSize: '0.82rem',
                color: 'var(--text-secondary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}>
                {joinUrl}
              </span>
              <button
                onClick={handleCopy}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                  background: copied ? 'rgba(16,185,129,0.15)' : 'var(--accent-color)',
                  border: copied ? '1px solid var(--success-color)' : 'none',
                  color: copied ? 'var(--success-color)' : '#fff',
                  transition: 'all 0.2s ease',
                }}
              >
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
              </button>
              {('share' in navigator) && (
                <button
                  onClick={handleShare}
                  style={{
                    padding: '6px 14px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0,
                    background: 'var(--surface-color)',
                    border: '1px solid var(--surface-border)',
                    color: 'var(--text-primary)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Share size={14} /> Share
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Leave Venue Confirm Modal */}
      {showLeaveConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !leaveLoading) setShowLeaveConfirm(false); }}
        >
          <div className="glass-panel" style={{ padding: '32px', width: '100%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.3rem', color: 'var(--error-color)' }}>Leave Venue?</h3>
              <button className="icon-button" onClick={() => setShowLeaveConfirm(false)} disabled={leaveLoading}>
                <X size={18} />
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.6 }}>
              Are you sure you want to leave <strong>{venue.name}</strong>? You will lose access to all channels and messages.
            </p>

            {leaveErrorText && (
              <div style={{
                color: 'var(--error-color)',
                marginBottom: '16px',
                fontSize: '0.9rem',
                padding: '12px',
                background: 'rgba(255,80,80,0.1)',
                borderRadius: '8px',
                border: '1px solid var(--error-color)',
              }}>
                ⚠️ {leaveErrorText}
              </div>
            )}

            <div className="flex-row" style={{ gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="secondary" 
                onClick={() => setShowLeaveConfirm(false)}
                disabled={leaveLoading}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button 
                className="danger" 
                onClick={confirmLeaveVenue}
                disabled={leaveLoading}
                style={{ flex: 1 }}
              >
                {leaveLoading ? 'Leaving...' : 'Yes, Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
