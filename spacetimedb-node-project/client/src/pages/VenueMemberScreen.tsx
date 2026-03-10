import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { ArrowLeft, User as UserIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const VenueMemberScreen = () => {
  const { venueLink, memberIdStr } = useParams<{ venueLink: string; memberIdStr: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [venueMembers] = useTable(tables.VenueMember);
  const [users] = useTable(tables.User);
  const [messages] = useTable(tables.Message);

  const setChannelRole = useReducer(reducers.setChannelRole);
  const setVenueRole = useReducer(reducers.setVenueRole);
  const blockUser = useReducer(reducers.blockUser);
  const unblockUser = useReducer(reducers.unblockUser);

  const venue = venues.find(v => v.link === venueLink);
  const memberId = BigInt(memberIdStr || '0');

  const targetMember = venueMembers.find(m => m.venueId === venue?.venueId && m.userId === memberId);
  const targetUser = users.find(u => u.userId === memberId);

  // Auth check
  const venueChannels = channels.filter(c => c.venueId === venue?.venueId);
  const isOwner = venue?.ownerId === user?.userId;
  const userRolesInVenue = channelRoles.filter(
    (r) => r.userId === user?.userId && venueChannels.some((c) => c.channelId === r.channelId)
  );
  const isAdmin = userRolesInVenue.some((r) => r.role.tag === 'Admin' || r.role.tag === 'Owner');

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  if (!venue || !targetMember || !targetUser) {
    return <div className="app-container empty-state"><h2>Member not found</h2></div>;
  }

  if (!isOwner && !isAdmin) {
    return <div className="app-container empty-state"><h2>Access Denied</h2></div>;
  }



  // Get user's last message in the venue
  const userMessages = messages
    .filter(m => m.senderId === memberId && venueChannels.some(c => c.channelId === m.channelId))
    .sort((a, b) => Number(b.sentAt.microsSinceUnixEpoch / 1000n) - Number(a.sentAt.microsSinceUnixEpoch / 1000n));
  const lastMessage = userMessages[0];

  const handleRoleChange = async (channelId: bigint, roleString: string) => {
    setErrorText('');
    setLoading(true);
    try {
      await setChannelRole({
        channelId: channelId,
        targetUserId: memberId,
        role: roleString.toLowerCase()
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(message || 'Failed to update role. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToAllChannels = async (roleString: string) => {
    if (!window.confirm(`Apply role ${roleString} to all channels in the venue?`)) return;
    setErrorText('');
    setLoading(true);
    try {
      for (const channel of venueChannels) {
        await setChannelRole({
          channelId: channel.channelId,
          targetUserId: memberId,
          role: roleString.toLowerCase()
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(message || 'Failed to update roles. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVenueRoleChange = async (roleString: string) => {
    setErrorText('');
    setLoading(true);
    try {
      await setVenueRole({
        venueId: venue.venueId,
        targetUserId: memberId,
        role: roleString.toLowerCase()
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(message || 'Failed to update venue role. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleBlock = async () => {
    if (targetMember.isBlocked) {
      if (!window.confirm(`Are you sure you want to unblock ${targetUser.name}?`)) return;
      setErrorText('');
      setLoading(true);
      try {
        await unblockUser({ venueId: venue.venueId, targetUserId: memberId });
      } catch (err: unknown) {
        setErrorText(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    } else {
      if (!window.confirm(`Are you sure you want to block ${targetUser.name}?`)) return;
      setErrorText('');
      setLoading(true);
      try {
        await blockUser({ venueId: venue.venueId, targetUserId: memberId });
      } catch (err: unknown) {
        setErrorText(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
  };

  const availableRoles = ['Owner', 'Admin', 'Moderator', 'Member'];

  // A helper to format dates from spacetime timestamp
  const formatDate = (ts: any) => {
    if (!ts || !ts.microsSinceUnixEpoch) return 'Never';
    const date = new Date(Number(ts.microsSinceUnixEpoch / 1000n));
    return date.toLocaleString();
  };

  return (
    <div className="app-container">
      <div className="screen-header">
        <div className="flex-col" style={{ gap: '4px' }}>
          <span
            style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={() => navigate(`/venues/${venue.link}/permissions`)}
          >
            <ArrowLeft size={16} /> Permissions
          </span>
          <h2>{targetUser.name}</h2>
        </div>
      </div>

      {errorText && (
        <div style={{ color: 'var(--error-color)', marginTop: '16px', padding: '12px', background: 'rgba(255,80,80,0.1)', borderRadius: '8px' }}>
          {errorText}
        </div>
      )}

      {/* Profile Section */}
      <div className="glass-panel" style={{ marginTop: '24px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderTop: targetMember.isBlocked ? '4px solid var(--error-color)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--surface-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserIcon size={32} color="var(--text-secondary)" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: '1.4rem' }}>{targetUser.name}</h3>
            {targetMember.isBlocked && <span style={{ color: 'var(--error-color)', fontWeight: 600, fontSize: '0.9rem' }}>BLOCKED</span>}
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Joined: {formatDate(targetMember.joinDate)}
            </p>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Last Seen: {formatDate(targetMember.lastSeen)}
            </p>
            
            <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Venue Base Role:</span>
              <select 
                value={targetMember.role.tag.toLowerCase()}
                onChange={(e) => {
                  if (e.target.value) handleVenueRoleChange(e.target.value);
                }}
                disabled={loading || targetMember.isBlocked}
                style={{ padding: '6px 12px', fontSize: '0.9rem', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-color)', textTransform: 'capitalize' }}
              >
                {availableRoles.map(r => <option key={r.toLowerCase()} value={r.toLowerCase()}>{r}</option>)}
              </select>

              <button 
                className="secondary" 
                onClick={() => {
                   const role = prompt("Enter role to apply to all channels (Owner, Admin, Moderator, Member):");
                   if (role) {
                      const normalized = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
                      if (availableRoles.includes(normalized)) handleApplyToAllChannels(normalized);
                      else alert("Invalid role entered.");
                   }
                }} 
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                disabled={loading || targetMember.isBlocked}
              >
                Apply to all channels
              </button>
            </div>
          </div>
          <div>
            <button className={targetMember.isBlocked ? "primary" : "danger"} onClick={toggleBlock} disabled={loading}>
              {targetMember.isBlocked ? 'Unblock User' : 'Block User'}
            </button>
          </div>
        </div>

        {lastMessage && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Last Message ({formatDate(lastMessage.sentAt)}):</p>
            <p style={{ margin: 0 }}>"{lastMessage.content}"</p>
          </div>
        )}
      </div>

      <div style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3>Channel Permissions</h3>
        </div>

        <div className="flex-col" style={{ gap: '12px' }}>
          {venueChannels.length === 0 ? (
            <div className="empty-state glass-panel">
              <p>No channels in this venue.</p>
            </div>
          ) : (
            venueChannels.map(channel => {
              const currentRoleRow = channelRoles.find(r => r.userId === memberId && r.channelId === channel.channelId);
              const tag = currentRoleRow?.role.tag || 'member';
              const currentRole = tag.charAt(0).toUpperCase() + tag.slice(1);

              return (
                <div key={channel.channelId.toString()} className="glass-panel flex-row" style={{ padding: '16px 20px', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{channel.name}</h3>
                  </div>
                  <div>
                    <select
                      value={currentRole}
                      onChange={(e) => handleRoleChange(channel.channelId, e.target.value)}
                      disabled={loading || targetMember.isBlocked}
                    >
                      {availableRoles.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
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
