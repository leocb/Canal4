
import { useParams, useNavigate } from 'react-router-dom';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { ArrowLeft, User as UserIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useReadyTable } from '../hooks/useReadyTable';

export const VenuePermissionsScreen = () => {
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [venues, venuesReady] = useReadyTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [venueMembers, membersReady] = useReadyTable(tables.VenueMember);
  const [users, usersReady] = useReadyTable(tables.User);

  const venue = venues.find((v) => v.link === venueLink);
  const venueIdBigInt = venue?.venueId;

  // Permissions check
  const venueChannels = channels.filter(c => c.venueId === venueIdBigInt);
  const isOwner = venue?.ownerId === user?.userId;
  const userRolesInVenue = channelRoles.filter(
    (r) => r.userId === user?.userId && venueChannels.some((c) => c.channelId === r.channelId)
  );
  const isAdmin = userRolesInVenue.some((r) => r.role.tag === 'Admin' || r.role.tag === 'Owner');
  
  if (!venuesReady || !membersReady || !usersReady) {
    return <div className="app-container empty-state"><h2>Loading...</h2></div>;
  }
  
  if (!venue) {
    return <div className="app-container empty-state"><h2>Venue not found</h2></div>;
  }
  
  if (!isOwner && !isAdmin) {
    return <div className="app-container empty-state"><h2>Access Denied</h2></div>;
  }

  // Get all members of the venue
  const members = venueMembers.filter((m) => m.venueId === venue.venueId);

  // Group members by highest role
  type GroupedMember = {
    userId: bigint;
    name: string;
    isBlocked: boolean;
    roleLevel: number;
    highestRole: string;
  };

  const getHighestRole = (userId: bigint): { level: number, name: string } => {
    if (venue.ownerId === userId) return { level: 4, name: 'Owner' };
    
    // get user's channel roles in this venue
    const roles = channelRoles.filter(r => r.userId === userId && venueChannels.some(c => c.channelId === r.channelId));
    
    let hasAdmin = false;
    let hasMod = false;
    
    for (const r of roles) {
      if (r.role.tag === 'Admin' || r.role.tag === 'Owner') hasAdmin = true;
      if (r.role.tag === 'Moderator') hasMod = true;
    }
    
    if (hasAdmin) return { level: 3, name: 'Admin' };
    if (hasMod)  return { level: 2, name: 'Moderator' };
    return { level: 1, name: 'Member' };
  };

  const processedMembers: GroupedMember[] = members.map(m => {
    const userRow = users.find(u => u.userId === m.userId);
    const { level, name } = getHighestRole(m.userId);
    return {
      userId: m.userId,
      name: userRow?.name || 'Unknown User',
      isBlocked: m.isBlocked,
      roleLevel: level,
      highestRole: name,
    };
  });

  // Sort by role level descending, then alphabetically by name
  processedMembers.sort((a, b) => {
    if (a.roleLevel !== b.roleLevel) return b.roleLevel - a.roleLevel;
    return a.name.localeCompare(b.name);
  });

  const getRoleBadgeColor = (role: string, isBlocked: boolean) => {
    if (isBlocked) return { bg: 'rgba(255,80,80,0.15)', text: 'var(--error-color)' };
    switch (role) {
      case 'Owner': return { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' };
      case 'Admin': return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8' };
      case 'Moderator': return { bg: 'rgba(52, 211, 153, 0.15)', text: '#34d399' };
      default: return { bg: 'var(--surface-color)', text: 'var(--text-secondary)' };
    }
  };

  return (
    <div className="app-container">
      <div className="screen-header">
        <div className="flex-col" style={{ gap: '4px' }}>
          <span 
            style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={() => navigate(`/venues/${venue.link}`)}
          >
            <ArrowLeft size={16} /> Back
          </span>
          <h2>{venue.name} Permissions</h2>
        </div>
      </div>

      <div className="flex-col" style={{ marginTop: '24px', gap: '12px' }}>
        {processedMembers.map((member) => {
          const badge = getRoleBadgeColor(member.highestRole, member.isBlocked);
          return (
            <div 
              key={member.userId.toString()}
              className="glass-panel-interactive flex-row"
              style={{ 
                padding: '16px', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                opacity: member.isBlocked ? 0.6 : 1,
              }}
              onClick={() => navigate(`/venues/${venue.link}/permissions/${member.userId}`)}
            >
              <div className="flex-row" style={{ alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--surface-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserIcon size={20} color="var(--text-secondary)" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{member.name} {member.isBlocked && '(Blocked)'}</h3>
                </div>
              </div>
              <span style={{
                background: badge.bg,
                color: badge.text,
                padding: '4px 8px',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}>
                {member.isBlocked ? 'Blocked' : member.highestRole}
              </span>
            </div>
          );
        })}
        {processedMembers.length === 0 && (
           <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>No members found.</p>
        )}
      </div>
    </div>
  );
};
