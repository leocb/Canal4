import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { ArrowLeft, User as UserIcon, HelpCircle, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';

export const VenueMemberScreen = () => {
  const { t } = useTranslation();
  const { venueLink, memberIdStr } = useParams<{ venueLink: string; memberIdStr: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [venues] = useTable(tables.VenueView);
  const [channels] = useTable(tables.ChannelView);
  const [channelRoles] = useTable(tables.ChannelMemberRoleView);
  const [venueMembers] = useTable(tables.VenueMemberView);
  const [users] = useTable(tables.UserView);
  const [messages] = useTable(tables.MessageView);

  const setChannelRole = useReducer(reducers.setChannelRole);
  const setVenueRole = useReducer(reducers.setVenueRole);
  const blockUser = useReducer(reducers.blockUser);
  const unblockUser = useReducer(reducers.unblockUser);

  const venue = venues.find(v => v.link === venueLink);
  const memberId = BigInt(memberIdStr || '0');

  const targetMember = venueMembers.find(m => m.venueId === venue?.venueId && m.userId === memberId);
  const targetUser = users.find(u => u.userId === memberId);

  const myMember = venueMembers.find(m => m.venueId === venue?.venueId && m.userId === user?.userId);
  const isVenueOwner = myMember?.role.tag === 'Owner';
  const isVenueAdmin = myMember?.role.tag === 'Admin';
 
  // Auth check
  const venueChannels = channels.filter(c => c.venueId === venue?.venueId);
  const userChannelRoles = channelRoles.filter(
    (r) => r.userId === user?.userId && venueChannels.some((c) => c.channelId === r.channelId)
  );
  const isOwner = isVenueOwner;
  const isAdmin = isVenueAdmin || userChannelRoles.some((r) => r.role.tag === 'Admin' || r.role.tag === 'Owner');

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [bulkRole, setBulkRole] = useState('');

  if (!venue || !targetMember || !targetUser) {
    return <div className="app-container empty-state"><h2>{t('venue_member.not_found')}</h2></div>;
  }

  if (!isOwner && !isAdmin) {
    return <div className="app-container empty-state"><h2>{t('venue_channels.access_denied')}</h2></div>;
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
      setErrorText(t(message) || t('venue_member.error_update_role'));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToAllChannels = async (roleString: string) => {
    if (!window.confirm(t('venue_member.confirm_apply_all', { role: roleString }))) return;
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
      setErrorText(t(message) || t('venue_member.error_update_roles'));
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
      setErrorText(t(message) || t('venue_member.error_update_venue_role'));
    } finally {
      setLoading(false);
    }
  };

  const targetRole = targetMember.role.tag.toLowerCase();

  const toggleBlock = async () => {
    if (targetMember.isBlocked) {
      if (!window.confirm(t('venue_member.confirm_unblock', { name: targetUser.name }))) return;
      setErrorText('');
      setLoading(true);
      try {
        await unblockUser({ venueId: venue.venueId, targetUserId: memberId });
      } catch (err: unknown) {
        setErrorText(t(err instanceof Error ? err.message : String(err)));
      } finally {
        setLoading(false);
      }
    } else {
      if (!window.confirm(t('venue_member.confirm_block', { name: targetUser.name }))) return;
      setErrorText('');
      setLoading(true);
      try {
        await blockUser({ venueId: venue.venueId, targetUserId: memberId });
      } catch (err: unknown) {
        setErrorText(t(err instanceof Error ? err.message : String(err)));
      } finally {
        setLoading(false);
      }
    }
  };

  const canBlock = (isVenueOwner || isVenueAdmin) && memberId !== user?.userId && targetRole !== 'owner';
  const canUnblock = (isVenueOwner || isVenueAdmin) && memberId !== user?.userId;

  const availableRoles = ['Owner', 'Admin', 'Moderator', 'Member'];

  // A helper to format dates from spacetime timestamp
  const formatDate = (ts: any) => {
    if (!ts || !ts.microsSinceUnixEpoch) return t('venue_member.never');
    const date = new Date(Number(ts.microsSinceUnixEpoch / 1000n));
    return date.toLocaleString();
  };

  const HelpModal = () => (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={() => setShowHelp(false)}>
      <div className="glass-panel" style={{ padding: '32px', maxWidth: '500px', width: '90%', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <X 
          size={24} 
          style={{ position: 'absolute', top: '16px', right: '16px', cursor: 'pointer', color: 'var(--text-secondary)' }} 
          onClick={() => setShowHelp(false)}
        />
        <h2 style={{ marginTop: 0 }}>{t('venue_member.help_title')}</h2>
        
        <div className="flex-col" style={{ gap: '20px', marginTop: '24px' }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', color: '#eab308' }}>{t('venue_member.help_owner_title')}</h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('venue_member.help_owner_desc')}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', color: '#38bdf8' }}>{t('venue_member.help_admin_title')}</h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('venue_member.help_admin_desc')}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', color: '#34d399' }}>{t('venue_member.help_moderator_title')}</h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('venue_member.help_moderator_desc')}</p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--text-secondary)' }}>{t('venue_member.help_member_title')}</h4>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('venue_member.help_member_desc')}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {showHelp && <HelpModal />}
      <div className="screen-header">
        <div className="flex-col" style={{ gap: '4px' }}>
          <span
            style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={() => navigate(`/venues/${venue.link}/permissions`)}
          >
            <ArrowLeft size={16} /> {t('venue_permissions.filters.all_roles')}
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
            {targetMember.isBlocked && <span style={{ color: 'var(--error-color)', fontWeight: 600, fontSize: '0.9rem' }}>{t('venue_member.blocked_badge')}</span>}
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {t('venue_member.joined', { date: formatDate(targetMember.joinDate) })}
            </p>
            <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {t('venue_member.last_seen', { date: formatDate(targetMember.lastSeen) })}
            </p>
          </div>
        </div>

        {lastMessage && (
          <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('venue_member.last_message', { date: formatDate(lastMessage.sentAt) })}</p>
            <p style={{ margin: 0 }}>"{lastMessage.content}"</p>
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className={targetMember.isBlocked ? "primary" : "secondary"} 
                onClick={toggleBlock} 
                disabled={loading || (targetMember.isBlocked ? !canUnblock : !canBlock)}
                style={{ 
                  fontSize: '0.8rem', 
                  padding: '6px 12px',
                  background: targetMember.isBlocked ? 'var(--accent-color)' : 'rgba(255,80,80,0.1)',
                  color: targetMember.isBlocked ? 'white' : 'var(--error-color)',
                  border: targetMember.isBlocked ? 'none' : '1px solid rgba(255,80,80,0.2)'
                }}
              >
                {targetMember.isBlocked ? t('venue_member.unblock_button') : t('venue_member.block_button')}
              </button>
            </div>
          </div>
        )}

        {!lastMessage && (
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button 
              className={targetMember.isBlocked ? "primary" : "secondary"} 
              onClick={toggleBlock} 
              disabled={loading || (targetMember.isBlocked ? !canUnblock : !canBlock)}
              style={{ 
                fontSize: '0.8rem', 
                padding: '6px 12px',
                background: targetMember.isBlocked ? 'var(--accent-color)' : 'rgba(255,80,80,0.1)',
                color: targetMember.isBlocked ? 'white' : 'var(--error-color)',
                border: targetMember.isBlocked ? 'none' : '1px solid rgba(255,80,80,0.2)'
              }}
            >
              {targetMember.isBlocked ? t('venue_member.unblock_button') : t('venue_member.block_button')}
            </button>
          </div>
        )}
      </div>

      {/* Venue Role Section */}
      <div style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>{t('venue_member.venue_role_section')}</h3>
          <HelpCircle 
            size={18} 
            style={{ cursor: 'pointer', color: 'var(--accent-color)' }} 
            onClick={() => setShowHelp(true)}
          />
        </div>
        
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{t('venue_member.venue_base_role')}</span>
          <select 
            value={targetMember.role.tag.toLowerCase()}
            onChange={(e) => {
              if (e.target.value) handleVenueRoleChange(e.target.value);
            }}
            disabled={loading || targetMember.isBlocked}
            style={{ padding: '10px 16px', flex: 1, fontSize: '1rem', borderRadius: '8px', border: '1px solid var(--surface-border)', background: 'var(--surface-color)', textTransform: 'capitalize' }}
          >
            {availableRoles.map(r => <option key={r.toLowerCase()} value={r.toLowerCase()}>{t(`roles.${r.toLowerCase()}`)}</option>)}
          </select>
        </div>
      </div>

      <div style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>{t('venue_member.channel_permissions')}</h3>
          <HelpCircle 
            size={18} 
            style={{ cursor: 'pointer', color: 'var(--accent-color)' }} 
            onClick={() => setShowHelp(true)}
          />
        </div>

        {/* Bulk action */}
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', border: '1px solid var(--accent-color)', background: 'rgba(56, 189, 248, 0.05)' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{t('venue_member.apply_to_all_label')}</span>
          <div className="flex-row" style={{ gap: '8px' }}>
            <select 
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value)}
              disabled={loading || targetMember.isBlocked}
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--surface-border)', background: 'var(--surface-color)' }}
            >
              <option value="">{t('roles.select') || 'Select...'}</option>
              {availableRoles.map(r => <option key={r} value={r}>{t(`roles.${r.toLowerCase()}`)}</option>)}
            </select>
            <button 
              className="primary" 
              onClick={() => {
                if (bulkRole) handleApplyToAllChannels(bulkRole);
              }}
              disabled={!bulkRole || loading || targetMember.isBlocked}
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              {t('venue_member.apply_button')}
            </button>
          </div>
        </div>

        <div className="flex-col" style={{ gap: '12px' }}>
          {venueChannels.length === 0 ? (
            <div className="empty-state glass-panel">
              <p>{t('venue_member.no_channels')}</p>
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
                        <option key={role} value={role}>{t(`roles.${role.toLowerCase()}`)}</option>
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
