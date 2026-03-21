import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTable, useReducer } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings/index.ts';
import { useTranslation, Trans } from 'react-i18next';

const ROLES = ['owner', 'admin', 'moderator', 'member'];

export const ChannelSettingsScreen = () => {
  const { t } = useTranslation();
  const { venueLink, channelId } = useParams<{ venueLink: string, channelId: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn, connected } = useAuth();

  const [venues] = useTable(tables.VenueView);
  const [channels] = useTable(tables.ChannelView);
  const [channelRoles] = useTable(tables.ChannelMemberRoleView);
  const [venueMembers] = useTable(tables.VenueMemberView);

  const updateChannel = useReducer(reducers.updateChannel);
  const deleteChannel = useReducer(reducers.deleteChannel);

  const venue = venues.find((v: any) => v.link === venueLink);
  const channelIdBigInt = channelId ? BigInt(channelId) : 0n;
  const channel = channels.find((c: any) => c.channelId === channelIdBigInt);

  const myVenueRole = venueMembers.find(
    (m: any) => m.userId === user?.userId && m.venueId === venue?.venueId
  )?.role.tag;
  const myChannelRole = channelRoles.find(
    (r: any) => r.userId === user?.userId && r.channelId === channel?.channelId
  )?.role.tag;

  const isVenueOwner = myVenueRole?.toLowerCase() === 'owner';
  const isChannelOwner = myChannelRole?.toLowerCase() === 'owner';
  const isChannelAdmin = myChannelRole?.toLowerCase() === 'admin';

  const canUpdate = isVenueOwner || isChannelOwner || isChannelAdmin;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minRole, setMinRole] = useState('member');
  const [maxAgeHours, setMaxAgeHours] = useState('4');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!isLoggedIn) {
      if (venueLink) {
        navigate(`/login?redirect=/venues/${venueLink}/channels/${channelId}/settings`, { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
      return;
    }

    if (channel && name === '') {
      setName(channel.name);
      setDescription(channel.description);
      setMinRole(channel.minimumRoleToView.tag.toLowerCase());
      setMaxAgeHours(channel.messageMaxAgeHours.toString());
    }
  }, [isLoggedIn, navigate, venueLink, channelId, channel, name]);

  if (!isLoggedIn || !user || !connected) return null;
  if (!venue || !channel) return null;

  if (!canUpdate) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venue_channels.access_denied')}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{t('channel_templates.only_owners')}</p>
        <button onClick={() => navigate(-1)} style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} /> {t('common.back')}
        </button>
      </div>
    );
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setErrorText('');
    setLoading(true);

    try {
      await updateChannel({
        channelId: channel.channelId,
        name: name.trim(),
        description: description.trim(),
        minRole,
        maxAgeHours: BigInt(parseInt(maxAgeHours) || 4),
      });
      navigate(`/venues/${venue.link}/channels/${channel.channelId}`);
    } catch (err: unknown) {
      setErrorText(t(err instanceof Error ? err.message : String(err)));
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmName !== channel.name) {
      setErrorText(t('api_errors.confirmation_channel_mismatch'));
      return;
    }

    setErrorText('');
    setLoading(true);

    try {
      await deleteChannel({
        channelId: channel.channelId,
        confirmationName: deleteConfirmName,
      });
      navigate(`/venues/${venue.link}`);
    } catch (err: unknown) {
      setErrorText(t(err instanceof Error ? err.message : String(err)));
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="app-container">
      <div className="screen-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="icon-button"
            onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}`)}
            aria-label="Back to channel"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <ArrowLeft size={20} style={{ transform: 'translateY(1px)' }} />
          </button>
          <h2>{t('channel_settings.title', { name: channel.name })}</h2>
        </div>
      </div>

      <div className="content-area" style={{ flex: 1, padding: '24px 0', width: '100%' }}>
        <form onSubmit={handleUpdate} className="glass-panel flex-col" style={{ padding: '24px' }}>
          {errorText && (
            <div style={{
              color: 'var(--error-color)',
              marginBottom: '16px',
              fontSize: '0.9rem',
              padding: '10px 14px',
              background: 'rgba(255,80,80,0.1)',
              borderRadius: '8px',
              border: '1px solid var(--error-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
               <AlertTriangle size={18} style={{ flexShrink: 0 }} /> {errorText}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>{t('channel_settings.name_label')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
              placeholder={t('channel_settings.name_placeholder')}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>{t('channel_settings.desc_label')}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              placeholder={t('channel_settings.desc_placeholder')}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>{t('channel_settings.min_role_label')}</label>
            <select
              value={minRole}
              onChange={(e) => setMinRole(e.target.value)}
              disabled={loading}
              style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)', outline: 'none' }}
            >
              {ROLES.map(r => (
                <option key={r} value={r} style={{ background: '#1c1c1e' }}>
                  {t(`roles.${r.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>{t('channel_settings.max_age_label')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="number"
                min="1"
                max="8760"
                value={maxAgeHours}
                onChange={(e) => setMaxAgeHours(e.target.value)}
                required
                disabled={loading}
                style={{ width: '100px' }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>{t('channel_settings.hours')}</span>
            </div>
          </div>


          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" className="secondary" style={{ flex: 1 }} onClick={() => navigate(-1)} disabled={loading}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={loading || !name.trim()} style={{ flex: 1 }} >
              {loading ? t('common.loading') : t('channel_settings.confirm_button')}
            </button>
          </div>
        </form>

        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--surface-border)', width: '100%' }}>
          <h3 style={{ color: 'var(--error-color)' }}>{t('channel_settings.danger_zone.title')}</h3>

          {!showDeleteConfirm ? (
            <button
              className="danger"
              style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={16} /> {t('channel_settings.danger_zone.delete_button')}
            </button>
          ) : (
            <div className="glass-panel" style={{ marginTop: '16px', padding: '16px', borderColor: 'var(--error-color)' }}>
              <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                <Trans i18nKey="channel_settings.danger_zone.delete_confirm_text" values={{ name: channel.name }}>
                  This action cannot be undone. This will permanently delete the <strong>{channel.name}</strong> channel and remove all associated templates, messages, and settings.
                </Trans>
              </p>
              <p style={{ marginBottom: '8px', fontSize: '0.9rem' }}>
                <Trans i18nKey="channel_settings.danger_zone.type_confirm" values={{ name: channel.name }}>
                  Please type <strong>{channel.name}</strong> to confirm.
                </Trans>
              </p>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={channel.name}
                style={{ width: '100%', marginBottom: '12px' }}
                disabled={loading}
              />
              <div className="flex-row" style={{ gap: '8px' }}>
                <button
                  className="secondary"
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName(''); setErrorText(''); }}
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="danger"
                  onClick={handleDelete}
                  disabled={loading || deleteConfirmName !== channel.name}
                  style={{ flex: 1 }}
                >
                  {loading ? t('common.loading') : t('common.delete')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
