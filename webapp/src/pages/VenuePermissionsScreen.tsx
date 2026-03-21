import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { ArrowLeft, User as UserIcon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useReadyTable } from '../hooks/useReadyTable';
import { useTranslation } from 'react-i18next';

export const VenuePermissionsScreen = () => {
  const { t } = useTranslation();
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

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Permissions check
  const venueChannels = channels.filter(c => c.venueId === venueIdBigInt);
  const userVenueMember = venueMembers.find(m => m.venueId === venueIdBigInt && m.userId === user?.userId);
  const isVenueOwner = userVenueMember?.role.tag === 'Owner';
  const isVenueAdmin = userVenueMember?.role.tag === 'Admin';
  
  // Also check channel-level admin roles
  const userChannelRoles = channelRoles.filter(
    (r) => r.userId === user?.userId && venueChannels.some((c) => c.channelId === r.channelId)
  );
  const isChannelAdmin = userChannelRoles.some((r) => r.role.tag === 'Admin' || r.role.tag === 'Owner');
  
  const hasAccess = isVenueOwner || isVenueAdmin || isChannelAdmin;
  
  if (!venuesReady || !membersReady || !usersReady) {
    return <div className="app-container empty-state"><h2>{t('login.loading')}</h2></div>;
  }
  
  if (!venue) {
    return <div className="app-container empty-state"><h2>{t('venue_channels.venue_not_found')}</h2></div>;
  }
  
  if (!hasAccess) {
    return <div className="app-container empty-state"><h2>{t('venue_channels.access_denied')}</h2></div>;
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
    const venueMember = venueMembers.find(m => m.venueId === venueIdBigInt && m.userId === userId);
    const venueRole = venueMember?.role.tag;
    if (venueRole === 'Owner') return { level: 4, name: 'Owner' };
    if (venueRole === 'Admin') return { level: 3.5, name: 'Admin (Global)' };
    
    const roles = channelRoles.filter(r => r.userId === userId && venueChannels.some(c => c.channelId === r.channelId));
    
    let hasOwner = false;
    let hasAdmin = false;
    let hasMod = false;
    
    for (const r of roles) {
      const tag = r.role.tag.toLowerCase();
      if (tag === 'owner') hasOwner = true;
      if (tag === 'admin') hasAdmin = true;
      if (tag === 'moderator') hasMod = true;
    }
    
    if (hasOwner) return { level: 4, name: 'Owner' };
    if (hasAdmin) return { level: 3, name: 'Admin' };
    if (hasMod)  return { level: 2, name: 'Moderator' };
    return { level: 1, name: 'Member' };
  };

  const processedMembers: GroupedMember[] = members.map(m => {
    const userRow = users.find(u => u.userId === m.userId);
    const { level, name } = getHighestRole(m.userId);
    return {
      userId: m.userId,
      name: userRow?.name || t('venue_permissions.unknown_user'),
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

  const filteredMembers = processedMembers.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
    const effectiveRole = m.isBlocked ? 'Blocked' : m.highestRole;
    const matchesRole = roleFilter ? effectiveRole === roleFilter : true;
    return matchesSearch && matchesRole;
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
            <ArrowLeft size={16} /> {t('common.back')}
          </span>
          <h2>{t('venue_permissions.title', { name: venue.name })}</h2>
        </div>
      </div>

      <div className="flex-row" style={{ marginTop: '16px', gap: '12px' }}>
        <input 
          type="text" 
          placeholder={t('venue_permissions.search_placeholder')}
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-color)' }}
        />
        <select 
          value={roleFilter} 
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-color)' }}
        >
          <option value="">{t('venue_permissions.filters.all_roles')}</option>
          <option value="Owner">{t('roles.owner')}</option>
          <option value="Admin">{t('roles.admin')}</option>
          <option value="Moderator">{t('roles.moderator')}</option>
          <option value="Member">{t('roles.member')}</option>
          <option value="Blocked">{t('roles.blocked')}</option>
        </select>
      </div>

      <div className="flex-col" style={{ marginTop: '24px', gap: '12px' }}>
        {filteredMembers.map((member) => {
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
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{member.name} {member.isBlocked && t('venue_permissions.blocked_suffix')}</h3>
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
                {member.isBlocked ? t('roles.blocked') : t(`roles.${member.highestRole.toLowerCase()}`)}
              </span>
            </div>
          );
        })}
        {filteredMembers.length === 0 && (
           <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>{t('venue_permissions.no_members')}</p>
        )}
      </div>
    </div>
  );
};
