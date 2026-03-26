import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { MoreVertical, Plus, Monitor, Settings, Shield, UserPlus, Bell, LogOut, Copy, Check, X, Share, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useReadyTable } from '../hooks/useReadyTable';
import { useAuth } from '../hooks/useAuth';
import QRCode from "react-qr-code";
import { useTranslation, Trans } from 'react-i18next';

export const VenueChannelsScreen = () => {
  const { t } = useTranslation();
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();

  const { user } = useAuth();
  const [venues, venuesReady] = useReadyTable(tables.VenueView);
  const [channels] = useTable(tables.ChannelView);
  const [channelRoles] = useTable(tables.ChannelMemberRoleView);
  const [venueMembers, membersReady] = useReadyTable(tables.VenueMemberView);
  const leaveVenue = useReducer(reducers.leaveVenue);
  const createInviteToken = useReducer(reducers.createInviteToken);

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteToken, setInviteToken] = useState<string>('');
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

  // Membership check (frontend UX guard — backend is authoritative)
  const myMember = venue ? venueMembers.find(
    m => m.venueId === venue.venueId && m.userId === user?.userId
  ) : undefined;
  const isMember = !!myMember;
  const isBlocked = myMember?.isBlocked ?? false;

  const isOwner = !isBlocked && myMember?.role.tag === 'Owner';
  const isVenueAdmin = !isBlocked && myMember?.role.tag === 'Admin';

  const getRoleLevel = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner': return 4;
      case 'admin': return 3;
      case 'moderator': return 2;
      default: return 1;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'owner': return { bg: 'rgba(234, 179, 8, 0.15)', text: '#eab308' };
      case 'admin': return { bg: 'rgba(56, 189, 248, 0.15)', text: '#38bdf8' };
      case 'moderator': return { bg: 'rgba(52, 211, 153, 0.15)', text: '#34d399' };
      default: return { bg: 'var(--surface-color)', text: 'var(--text-secondary)' };
    }
  };

  const visibleChannels = venueChannels.filter(c => {
    const minRoleLevel = getRoleLevel(c.minimumRoleToView.tag);
    if (minRoleLevel <= 1) return true; // Anyone can see
    if (isOwner) return true;
    
    const userChannelRole = channelRoles.find(r => r.userId === user?.userId && r.channelId === c.channelId)?.role.tag;
    const userRoleLevel = userChannelRole ? getRoleLevel(userChannelRole) : 1;
    
    return userRoleLevel >= minRoleLevel;
  }).sort((a, b) => a.name.localeCompare(b.name));
  const userRolesInVenue = channelRoles.filter(r =>
    r.userId === user?.userId &&
    venueChannels.some(c => c.channelId === r.channelId)
  );
  const isChannelAdmin = !isBlocked && userRolesInVenue.some(r => r.role.tag.toLowerCase() === 'admin' || r.role.tag.toLowerCase() === 'owner');
  const canManageDisplays = isOwner || isVenueAdmin || isChannelAdmin;

  if (!venuesReady || !membersReady) {
    return (
      <div className="app-container empty-state">
        <h2>{t('common.loading')}</h2>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.venue_not_found')}</h2>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>{t('common.back')}</button>
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.access_denied')}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{t('venue_channels.not_member')}</p>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>{t('common.back')}</button>
      </div>
    );
  }

  const joinUrl = inviteToken ? `${window.location.origin}/join/${venue?.link}/${inviteToken}` : '';
  const handleCopy = () => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(joinUrl);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = joinUrl;
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); } catch (err) { console.error('fallback copy failed', err) }
      document.body.removeChild(textArea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInvite = () => {
    setShowMenu(false);
    if (!venue) return;
    const newToken = Math.random().toString(36).substring(2, 10);
    setInviteToken(newToken);
    createInviteToken({ venueId: venue.venueId, token: newToken }).catch(() => {});
    setShowInvite(true);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: t('venue.invite_title', { name: venue?.name }),
          text: t('venue.invite_text', { name: venue?.name }),
          url: joinUrl,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      alert(t('venue_channels.share_error'));
    }
  };

  const handleLeaveVenueClick = () => {
    setShowMenu(false);
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
      setLeaveErrorText(t(message) || t('venue_channels.leave_failed'));
      setLeaveLoading(false);
    }
  };

  return (
    <>
      <div className="app-container">
        <div className="screen-header">
          <div className="flex-col" style={{ gap: '4px' }}>
            <span
              style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              onClick={() => navigate('/venues')}
            >
              <ArrowLeft size={16} /> {t('venue_channels.back_to_venues')}
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
                    <Plus size={16} /> {t('venue_channels.menu.new_channel')}
                  </button>
                )}
                {canManageDisplays && (
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/desktop-displays`); }}>
                    <Monitor size={16} /> {t('venue_channels.menu.display_nodes')}
                  </button>
                )}
                {isOwner && (
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/settings`); }}>
                    <Settings size={16} /> {t('venue_channels.menu.venue_settings')}
                  </button>
                )}
                {canManageDisplays && (
                  <button className="dropdown-item" onClick={() => { setShowMenu(false); navigate(`/venues/${venue.link}/permissions`); }}>
                    <Shield size={16} /> {t('venue_channels.menu.permissions')}
                  </button>
                )}
                <div className="dropdown-divider" />
                <button className="dropdown-item" onClick={handleOpenInvite}>
                  <UserPlus size={16} /> {t('venue_channels.menu.invite')}
                </button>
                <button className="dropdown-item" onClick={() => { setShowMenu(false); alert(t('venue_channels.menu.notifications_not_impl')); }}>
                  <Bell size={16} /> {t('venue_channels.menu.notifications')}
                </button>
                <div className="dropdown-divider" />
                <button className="dropdown-item danger" onClick={handleLeaveVenueClick}>
                  <LogOut size={16} /> {t('venue_channels.menu.leave_venue')}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-col" style={{ marginTop: '16px' }}>
          {visibleChannels.length === 0 ? (
            <div className="empty-state glass-panel">
              <h3 style={{ color: 'var(--text-primary)'}}>{t('venue_channels.no_channels')}</h3>
              <p style={{ marginTop: '8px' }}>{t('venue_channels.create_channel_helper')}</p>
            </div>
          ) : (
            visibleChannels.map(channel => {
              const minRole = channel.minimumRoleToView.tag.toLowerCase();
              const badge = getRoleBadgeColor(minRole);
              return (
                <div
                  key={channel.channelId.toString()}
                  className="glass-panel-interactive flex-row"
                  style={{ padding: '16px 24px', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}
                  onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}`)}
                >
                  <div>
                    <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {channel.name}
                      {minRole !== 'member' && (
                        <span style={{
                          background: badge.bg,
                          color: badge.text,
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}>
                          {t(`roles.${minRole}`)}
                        </span>
                      )}
                    </h3>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {channel.description || t('venue_channels.no_description')}
                    </p>
                  </div>
                </div>
              );
            })
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
              <h3 style={{ fontSize: '1.3rem' }}>{t('venue_channels.invite_title', { name: venue.name })}</h3>
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
              {t('venue_channels.invite_helper')}
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
                {copied ? <><Check size={14} /> {t('venue_channels.copied')}</> : <><Copy size={14} /> {t('venue_channels.copy')}</>}
              </button>
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
                <Share size={14} /> {t('venue_channels.share')}
              </button>
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
              <h3 style={{ fontSize: '1.3rem', color: 'var(--error-color)' }}>{t('venue_channels.leave_modal.title')}</h3>
              <button className="icon-button" onClick={() => setShowLeaveConfirm(false)} disabled={leaveLoading}>
                <X size={18} />
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.6 }}>
              <Trans i18nKey="venue_channels.leave_modal.confirm_text" values={{ name: venue.name }}>
                Are you sure you want to leave <strong>{venue.name}</strong>? You will lose access to all channels and messages.
              </Trans>
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
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} /> {leaveErrorText}
              </div>
            )}

            <div className="flex-row" style={{ gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                className="secondary" 
                onClick={() => setShowLeaveConfirm(false)}
                disabled={leaveLoading}
                style={{ flex: 1 }}
              >
                {t('common.cancel')}
              </button>
              <button 
                className="danger" 
                onClick={confirmLeaveVenue}
                disabled={leaveLoading}
                style={{ flex: 1 }}
              >
                {leaveLoading ? t('venue_channels.leave_modal.leaving') : t('venue_channels.leave_modal.yes_leave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
