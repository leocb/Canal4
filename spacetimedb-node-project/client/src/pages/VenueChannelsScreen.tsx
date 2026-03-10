import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useSpacetimeDB } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { MoreVertical } from 'lucide-react';

export const VenueChannelsScreen = () => {
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();

  const { identity } = useSpacetimeDB();
  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [venueMembers] = useTable(tables.VenueMember);
  
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const isOwner = venue?.ownerIdentity.toHexString() === identity?.toHexString();
  const userRolesInVenue = channelRoles.filter(r =>
    r.userIdentity.toHexString() === identity?.toHexString() &&
    venueChannels.some(c => c.channelId === r.channelId)
  );
  const isAdmin = userRolesInVenue.some(r => r.role.tag === 'Admin');
  const canManageDisplays = isOwner || isAdmin;

  // Membership check (frontend UX guard — backend is authoritative)
  const isMember = venue ? venueMembers.some(
    m => m.venueId === venue.venueId && m.userIdentity.toHexString() === identity?.toHexString()
  ) : false;

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

  return (
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
            style={{ padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
          >
            <MoreVertical size={24} />
          </button>
          {showMenu && (
            <div className="dropdown-menu glass-panel" style={{ position: 'absolute', right: 0, top: '40px', zIndex: 100, minWidth: '180px', display: 'flex', flexDirection: 'column' }}>
              <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/channels/new`); }}>New Channel</button>
              {canManageDisplays && (
                <button className="dropdown-item" onClick={() => navigate(`/venues/${venue.link}/desktop-displays`)}>Display Nodes</button>
              )}
              {isOwner && (
                <button className="dropdown-item" onClick={() => alert('Venue Settings (Not yet implemented)')}>Venue Settings</button>
              )}
              {canManageDisplays && (
                <button className="dropdown-item" onClick={() => alert('Permissions (Not yet implemented)')}>Permissions</button>
              )}
              <button className="dropdown-item" onClick={() => alert('Invite (Not yet implemented)')}>Invite</button>
              <button className="dropdown-item" onClick={() => alert('Notifications (Not yet implemented)')}>Notifications</button>
              <button className="dropdown-item" style={{ color: 'var(--error-color)' }} onClick={() => alert('Leave Venue (Not yet implemented)')}>Leave Venue</button>
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
  );
};
