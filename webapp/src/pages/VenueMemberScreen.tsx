import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { ArrowLeft, HelpCircle, X, AlertTriangle, Shield } from 'lucide-react';
import { Dropdown } from '../components/Dropdown';
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

  const targetMember = venueMembers.find(m => String(m.venueId) === String(venue?.venueId) && String(m.userId) === String(memberId));
  const targetUser = users.find(u => String(u.userId) === String(memberId));

  const myMember = venueMembers.find(m => String(m.venueId) === String(venue?.venueId) && String(m.userId) === String(user?.userId));
  const isVenueOwner = myMember?.role.tag.toLowerCase() === 'owner';
  const isVenueAdmin = myMember?.role.tag.toLowerCase() === 'admin';

  // Auth check
  const getRoleRank = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner': return 4;
      case 'admin': return 3;
      case 'moderator': return 2;
      case 'member': return 1;
      default: return 0;
    }
  };

  const venueChannels = channels.filter(c => String(c.venueId) === String(venue?.venueId))
    .filter(c => {
      if (isVenueOwner) return true;
      const channelRole = channelRoles.find(r => String(r.userId) === String(user?.userId) && String(r.channelId) === String(c.channelId))?.role.tag.toLowerCase();
      return channelRole === 'owner' || channelRole === 'admin';
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const userChannelRolesFiltered = channelRoles.filter(
    (r) => String(r.userId) === String(user?.userId) && venueChannels.some((c) => String(c.channelId) === String(r.channelId))
  );

  const isOwner = isVenueOwner;
  const isAdmin = isVenueAdmin || userChannelRolesFiltered.some((r) => r.role.tag.toLowerCase() === 'admin' || r.role.tag.toLowerCase() === 'owner');

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger?: boolean;
  } | null>(null);
  const [bulkRole, setBulkRole] = useState('');

  if (!venue || !targetMember || !targetUser) {
    return <div className="app-container empty-state"><h2>{t('venue_member.not_found')}</h2></div>;
  }

  if (!isOwner && !isAdmin) {
    return <div className="app-container empty-state"><h2>{t('venue_channels.access_denied')}</h2></div>;
  }

  // Get user's last message in the venue
  const userMessages = messages
    .filter(m => String(m.senderId) === String(memberId) && venueChannels.some(c => String(c.channelId) === String(m.channelId)))
    .sort((a, b) => Number(b.sentAt.microsSinceUnixEpoch / 1000n) - Number(a.sentAt.microsSinceUnixEpoch / 1000n));
  const lastMessage = userMessages[0];

  const handleRoleChange = async (channelId: bigint, roleString: string) => {
    const roleVal = roleString.toLowerCase();
    const myChannelRoleRow = channelRoles.find(r => String(r.userId) === String(user?.userId) && String(r.channelId) === String(channelId));
    const myRole = (isVenueOwner ? 'owner' : (myChannelRoleRow?.role.tag || 'member')).toLowerCase();

    if (getRoleRank(roleVal) >= getRoleRank(myRole)) {
      setConfirmConfig({
        title: t('venue_member.warning_same_role'),
        message: t('venue_member.warning_demote_impossible', { role: t(`roles.${roleVal}`) }),
        onConfirm: () => executeRoleChange(channelId, roleVal)
      });
      setShowConfirmModal(true);
      return;
    }

    executeRoleChange(channelId, roleVal);
  };

  const executeRoleChange = async (channelId: bigint, roleVal: string) => {
    setErrorText('');
    setLoading(true);
    try {
      await setChannelRole({
        channelId: channelId,
        targetUserId: memberId,
        role: roleVal
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(t(message) || t('venue_member.error_update_role'));
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToAllChannels = async (roleString: string) => {
    const roleVal = roleString.toLowerCase();
    const myVenueRole = (isVenueOwner ? 'owner' : (isVenueAdmin ? 'admin' : 'member')).toLowerCase();

    if (getRoleRank(roleVal) >= getRoleRank(myVenueRole)) {
      setConfirmConfig({
        title: t('venue_member.warning_same_role'),
        message: t('venue_member.warning_demote_impossible', { role: t(`roles.${roleVal}`) }),
        onConfirm: () => executeApplyToAll(roleVal)
      });
      setShowConfirmModal(true);
    } else {
      setConfirmConfig({
        title: t('app.name'),
        message: t('venue_member.confirm_apply_all', { role: t(`roles.${roleVal}`) }),
        onConfirm: () => executeApplyToAll(roleVal)
      });
      setShowConfirmModal(true);
    }
  };

  const executeApplyToAll = async (roleVal: string) => {
    setErrorText('');
    setLoading(true);
    try {
      for (const channel of venueChannels) {
        await setChannelRole({
          channelId: channel.channelId,
          targetUserId: memberId,
          role: roleVal
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(t(message) || t('venue_member.error_update_roles'));
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleVenueRoleChange = async (roleString: string) => {
    const roleVal = roleString.toLowerCase();
    const myVenueRole = (isVenueOwner ? 'owner' : (isVenueAdmin ? 'admin' : 'member')).toLowerCase();

    if (getRoleRank(roleVal) >= getRoleRank(myVenueRole)) {
      setConfirmConfig({
        title: t('venue_member.warning_same_role'),
        message: t('venue_member.warning_demote_impossible', { role: t(`roles.${roleVal}`) }),
        onConfirm: () => executeVenueRoleChange(roleVal)
      });
      setShowConfirmModal(true);
      return;
    }

    executeVenueRoleChange(roleVal);
  };

  const executeVenueRoleChange = async (roleVal: string) => {
    setErrorText('');
    setLoading(true);
    try {
      await setVenueRole({
        venueId: venue.venueId,
        targetUserId: memberId,
        role: roleVal
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(t(message) || t('venue_member.error_update_venue_role'));
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const targetRole = targetMember.role.tag.toLowerCase();

  const toggleBlock = async () => {
    if (targetMember.isBlocked) {
      setConfirmConfig({
        title: t('venue_member.unblock_button'),
        message: t('venue_member.confirm_unblock', { name: targetUser.name }),
        onConfirm: executeUnblock
      });
      setShowConfirmModal(true);
    } else {
      setConfirmConfig({
        title: t('venue_member.block_button'),
        message: t('venue_member.confirm_block', { name: targetUser.name }),
        isDanger: true,
        onConfirm: executeBlock
      });
      setShowConfirmModal(true);
    }
  };

  const executeUnblock = async () => {
    setErrorText('');
    setLoading(true);
    try {
      await unblockUser({ venueId: venue.venueId, targetUserId: memberId });
    } catch (err: unknown) {
      setErrorText(t(err instanceof Error ? err.message : String(err)));
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const executeBlock = async () => {
    setErrorText('');
    setLoading(true);
    try {
      await blockUser({ venueId: venue.venueId, targetUserId: memberId });
    } catch (err: unknown) {
      setErrorText(t(err instanceof Error ? err.message : String(err)));
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const canBlock = (isVenueOwner || isVenueAdmin) && memberId !== user?.userId && targetRole !== 'owner';
  const canUnblock = (isVenueOwner || isVenueAdmin) && memberId !== user?.userId;

  const AVAILABLE_ROLES = ['Owner', 'Admin', 'Moderator', 'Member'] as const;

  const formatDate = (ts: any) => {
    if (!ts || !ts.microsSinceUnixEpoch) return t('venue_member.never');
    const date = new Date(Number(ts.microsSinceUnixEpoch / 1000n));
    return date.toLocaleString();
  };

  const HelpModal = () => (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          {['owner', 'admin', 'moderator', 'member'].map(role => {
            const color = role === 'owner' ? '#eab308' : role === 'admin' ? '#38bdf8' : role === 'moderator' ? '#34d399' : 'var(--text-secondary)';
            return (
              <div key={role}>
                <h4 style={{ margin: '0 0 4px 0', color }}>{t(`venue_member.help_${role}_title`)}</h4>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t(`venue_member.help_${role}_desc`)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const ConfirmationModal = () => {
    if (!confirmConfig) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1200,
      }} onClick={() => setShowConfirmModal(false)}>
        <div className="glass-panel" style={{ padding: '32px', maxWidth: '400px', width: '95%', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <div className="flex-col" style={{ alignItems: 'center', gap: '20px' }}>
            <div style={{
              background: confirmConfig.isDanger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(56, 189, 248, 0.1)',
              padding: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <AlertTriangle size={32} color={confirmConfig.isDanger ? 'var(--error-color)' : 'var(--accent-color)'} />
            </div>
            <div>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem' }}>{confirmConfig.title}</h2>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{confirmConfig.message}</p>
            </div>
            <div className="flex-col" style={{ width: '100%', gap: '12px' }}>
              <button
                className={confirmConfig.isDanger ? "danger" : "primary"}
                style={{ width: '100%' }}
                onClick={() => { confirmConfig.onConfirm(); setShowConfirmModal(false); }}
              >
                {t('common.continue') || 'Continue'}
              </button>
              <button className="secondary" style={{ width: '100%' }} onClick={() => setShowConfirmModal(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ErrorModal = () => (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100,
    }} onClick={() => setShowErrorModal(false)}>
      <div className="glass-panel" style={{ padding: '32px', maxWidth: '400px', width: '90%', border: '1px solid var(--error-color)' }} onClick={e => e.stopPropagation()}>
        <div className="flex-col" style={{ alignItems: 'center', textAlign: 'center', gap: '16px' }}>
          <AlertTriangle size={48} color="var(--error-color)" />
          <h2 style={{ margin: 0 }}>{t('common.error')}</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{errorText}</p>
          <button className="primary" style={{ width: '100%', marginTop: '8px' }} onClick={() => setShowErrorModal(false)}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      {showErrorModal && <ErrorModal />}
      {showHelp && <HelpModal />}
      {showConfirmModal && <ConfirmationModal />}
      <div className="content-area">
        <div className="screen-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className="icon-button" onClick={() => navigate(`/venues/${venue.link}/permissions`)} aria-label={t('aria.back')}>
              <ArrowLeft size={20} />
            </button>
            <h2>{targetUser.name}</h2>
          </div>
        </div>

        {errorText && (
          <div style={{ color: 'var(--error-color)', padding: '12px', background: 'rgba(255,80,80,0.1)', borderRadius: '8px' }}>
            {errorText}
          </div>
        )}

        {/* Channel Permissions Section */}
        <div style={{ marginTop: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>{t('venue_member.channel_permissions')}</h3>
            <HelpCircle size={18} style={{ cursor: 'pointer', color: 'var(--accent-color)' }} onClick={() => setShowHelp(true)} />
          </div>

          <div className="glass-panel" style={{ padding: '16px 10px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', border: '1px solid var(--accent-color)', background: 'rgba(56, 189, 248, 0.05)' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, flex: '1 1 auto' }}>{t('venue_member.apply_to_all_label')}</span>
            <div className="flex-row" style={{ gap: '8px', flex: '1 1 auto', justifyContent: 'flex-end', minWidth: '240px' }}>
              <Dropdown
                value={bulkRole}
                onChange={setBulkRole}
                disabled={loading || targetMember.isBlocked}
                placeholder={t('roles.select')}
                options={AVAILABLE_ROLES.map(r => {
                  const roleVal = r.toLowerCase();
                  return {
                    value: roleVal,
                    label: t(`roles.${roleVal}`),
                    color: roleVal === 'owner' ? '#eab308' : roleVal === 'admin' ? '#38bdf8' : roleVal === 'moderator' ? '#34d399' : undefined
                  };
                })}
                style={{ flex: 1 }}
              />
              <button
                className="primary"
                onClick={() => { if (bulkRole) handleApplyToAllChannels(bulkRole); }}
                disabled={!bulkRole || loading || targetMember.isBlocked}
                style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', height: '44px' }}
              >
                {t('venue_member.apply_button')}
              </button>
            </div>
          </div>

          <div className="flex-col" style={{ gap: '12px' }}>
            {venueChannels.length === 0 ? (
              <div className="empty-state glass-panel"><p>{t('venue_member.no_channels')}</p></div>
            ) : (
              venueChannels.map(channel => {
                const currentRoleRow = channelRoles.find(r => String(r.userId) === String(memberId) && String(r.channelId) === String(channel.channelId));
                const currentRole = (currentRoleRow?.role.tag || 'member').toLowerCase();
                const myChannelRoleRow = userChannelRolesFiltered.find(r => String(r.channelId) === String(channel.channelId));
                const myRole = (isVenueOwner ? 'owner' : (myChannelRoleRow?.role.tag || 'member')).toLowerCase();

                const canEditChannelRole = (() => {
                  if (isVenueOwner) {
                    if (String(memberId) !== String(user?.userId) && currentRole === 'owner') return false;
                    return true;
                  }
                  if (myRole === 'admin') return getRoleRank(currentRole) < getRoleRank('admin');
                  return myRole === 'owner';
                })();

                return (
                  <div key={channel.channelId.toString()} className="glass-panel flex-row" style={{ padding: '16px 20px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ flex: '1 1 150px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{channel.name}</h3>
                      {!canEditChannelRole && <Shield size={14} className="text-secondary" style={{ opacity: 0.6 }} />}
                    </div>
                    <div style={{ flex: '0 1 auto', minWidth: '140px' }}>
                      <Dropdown
                        value={currentRole}
                        onChange={(val) => handleRoleChange(channel.channelId, val)}
                        disabled={loading || targetMember.isBlocked || !canEditChannelRole}
                        options={AVAILABLE_ROLES.map(role => {
                          const roleVal = role.toLowerCase();
                          return {
                            value: roleVal,
                            label: t(`roles.${roleVal}`),
                            color: roleVal === 'owner' ? '#eab308' : roleVal === 'admin' ? '#38bdf8' : roleVal === 'moderator' ? '#34d399' : undefined,
                            disabled: myRole === 'admin' && !isVenueOwner && (roleVal === 'admin' || roleVal === 'owner')
                          };
                        })}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Venue Role Section */}
        <div style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>{t('venue_member.venue_role_section')}</h3>
            <HelpCircle size={18} style={{ cursor: 'pointer', color: 'var(--accent-color)' }} onClick={() => setShowHelp(true)} />
          </div>
          <div className="glass-panel" style={{ padding: '24px 12px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 500, flex: '1 1 auto' }}>{t('venue_member.venue_base_role')}</span>
            <Dropdown
              value={targetMember.role.tag.toLowerCase()}
              onChange={handleVenueRoleChange}
              disabled={loading || targetMember.isBlocked || (() => {
                const currentVenueRole = targetMember.role.tag.toLowerCase();
                if (isVenueOwner) {
                  if (String(memberId) !== String(user?.userId) && currentVenueRole === 'owner') return true;
                  return false;
                }
                return isVenueAdmin ? getRoleRank(currentVenueRole) >= getRoleRank('admin') : true;
              })()}
              style={{ flex: '1 1 200px' }}
              options={AVAILABLE_ROLES.map(r => {
                const roleVal = r.toLowerCase();
                return {
                  value: roleVal,
                  label: t(`roles.${roleVal}`),
                  color: roleVal === 'owner' ? '#eab308' : roleVal === 'admin' ? '#38bdf8' : roleVal === 'moderator' ? '#34d399' : undefined,
                  disabled: isVenueAdmin && !isVenueOwner && (roleVal === 'admin' || roleVal === 'owner')
                };
              })}
            />
          </div>
        </div>

        {/* Member Details Section */}
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ marginBottom: '16px' }}>{t('venue_member.details_section')}</h3>
          <div className="glass-panel" style={{ padding: '24px 12px', display: 'flex', flexDirection: 'column', gap: '16px', borderTop: targetMember.isBlocked ? '4px solid var(--error-color)' : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {targetMember.isBlocked && <div style={{ color: 'var(--error-color)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '8px' }}>{t('venue_member.blocked_badge')}</div>}
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('venue_member.joined', { date: formatDate(targetMember.joinDate) })}</p>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('venue_member.last_seen', { date: formatDate(targetMember.lastSeen) })}</p>
            </div>
            {lastMessage && (
              <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('venue_member.last_message', { date: formatDate(lastMessage.sentAt) })}</p>
                <p style={{ margin: 0 }}>"{lastMessage.content}"</p>
              </div>
            )}
            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-start' }}>
              <button
                className={targetMember.isBlocked ? "primary" : "secondary"}
                onClick={toggleBlock}
                disabled={loading || (targetMember.isBlocked ? !canUnblock : !canBlock)}
                style={{
                  fontSize: '0.8rem', padding: '6px 12px',
                  background: targetMember.isBlocked ? 'var(--accent-color)' : 'rgba(255,80,80,0.1)',
                  color: targetMember.isBlocked ? 'white' : 'var(--error-color)',
                  border: targetMember.isBlocked ? 'none' : '1px solid rgba(255,80,80,0.2)'
                }}
              >
                {targetMember.isBlocked ? t('venue_member.unblock_button') : t('venue_member.block_button')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
