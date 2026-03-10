import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { MoreVertical, Plus, Monitor, Settings, Shield, UserPlus, Bell, LogOut, Copy, Check, X } from 'lucide-react';
import { useReadyTable } from '../hooks/useReadyTable';
import { useAuth } from '../hooks/useAuth';

export const VenueChannelsScreen = () => {
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();

  const { user } = useAuth();
  const [venues, venuesReady] = useReadyTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [venueMembers, membersReady] = useReadyTable(tables.VenueMember);

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showInvite, setShowInvite] = useState(false);
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
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); alert('Venue Settings (Not yet implemented)'); }}>
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
                <button className="dropdown-item danger" onClick={() => { setShowMenu(false); alert('Leave Venue (Not yet implemented)'); }}>
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
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px', lineHeight: 1.6 }}>
              Share this link with anyone you want to invite. They'll be taken to a join page where they can join this venue.
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
            </div>
          </div>
        </div>
      )}
    </>
  );
};
