import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation, Trans } from 'react-i18next';

export const VenueSettingsScreen = () => {
  const { t } = useTranslation();
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [venues] = useTable(tables.Venue);
  const [venueMembers] = useTable(tables.VenueMember);
  const updateVenue = useReducer(reducers.updateVenue);
  const deleteVenue = useReducer(reducers.deleteVenue);

  const venue = venues.find(v => v.link === venueLink);
  const member = venueMembers.find(m => m.venueId === venue?.venueId && m.userId === user?.userId);
  const isOwner = member?.role.tag === 'Owner';
  const isAdmin = member?.role.tag === 'Admin';
  const hasAccess = isOwner || isAdmin;

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');

  // Initialize name once venue loads
  useEffect(() => {
    if (venue && !name) {
      setName(venue.name);
    }
  }, [venue]);

  // Return if not found or not owner
  if (!venue) {
    return <div className="app-container empty-state"><h2>{t('venue_channels.venue_not_found')}</h2></div>;
  }
  if (!hasAccess) {
    return <div className="app-container empty-state"><h2>{t('venue_channels.access_denied')}</h2></div>;
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!name.trim()) {
      setErrorMsg(t('venue_settings.error_name_required'));
      return;
    }
    setLoading(true);
    try {
      await updateVenue({ venueId: venue.venueId, newName: name.trim() });
      navigate(`/venues/${venue.link}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(t(msg));
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setErrorMsg('');
    if (deleteConfirmationName !== venue.name) {
      setErrorMsg(t('venue_settings.error_confirm_mismatch'));
      return;
    }
    setLoading(true);
    try {
      await deleteVenue({ venueId: venue.venueId, confirmationName: deleteConfirmationName });
      navigate('/venues', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(t(msg));
      setLoading(false);
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
          <h2>{t('venue_settings.title', { name: venue.name })}</h2>
        </div>
      </div>

      {errorMsg && (
        <div style={{ color: 'var(--error-color)', marginTop: '16px', padding: '12px', background: 'rgba(255,80,80,0.1)', borderRadius: '8px' }}>
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleUpdate} className="glass-panel" style={{ padding: '24px', width: '100%', marginTop: '24px' }}>
        <div className="flex-col" style={{ gap: '16px', textAlign: 'left' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 500 }}>{t('venue_settings.venue_name_label')}</span>
            <input
              id="venueName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('venue_settings.venue_name_placeholder')}
              disabled={loading}
              style={{ width: '100%' }}
            />
          </label>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" className="secondary" onClick={() => navigate(-1)} disabled={loading} style={{ flex: 1 }}>
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={loading || !name.trim()} style={{ flex: 1 }}>
              {loading ? t('login.saving') : t('venue_settings.confirm_button')}
            </button>
          </div>
        </div>
      </form>

      <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--surface-border)', width: '100%' }}>
        <h3 style={{ color: 'var(--error-color)' }}>{t('venue_settings.danger_zone.title')}</h3>

        {!showDeleteConfirm ? (
          <button
            className="danger"
            style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={16} /> {t('venue_settings.danger_zone.delete_button')}
          </button>
        ) : (
          <div className="glass-panel" style={{ marginTop: '16px', padding: '16px', borderColor: 'var(--error-color)' }}>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              <Trans i18nKey="venue_settings.danger_zone.delete_confirm_text" values={{ name: venue.name }}>
                This action cannot be undone. This will permanently delete the <strong>{venue.name}</strong> venue, disconnecting all members and deleting all channels and messages within it.
              </Trans>
            </p>
            <p style={{ marginBottom: '8px', fontSize: '0.9rem' }}>
              <Trans i18nKey="venue_settings.danger_zone.delete_type_confirm" values={{ name: venue.name }}>
                Please type <strong>{venue.name}</strong> to confirm.
              </Trans>
            </p>
            <input
              type="text"
              value={deleteConfirmationName}
              onChange={(e) => setDeleteConfirmationName(e.target.value)}
              placeholder={venue.name}
              style={{ width: '100%', marginBottom: '12px' }}
            />
            <div className="flex-row" style={{ gap: '8px' }}>
              <button
                className="secondary"
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmationName(''); }}
                disabled={loading}
                style={{ flex: 1 }}
              >
                {t('common.cancel')}
              </button>
              <button
                className="danger"
                onClick={handleDelete}
                disabled={loading || deleteConfirmationName !== venue.name || !isOwner}
                style={{ flex: 1, opacity: isOwner ? 1 : 0.5 }}
                title={!isOwner ? t('venue_settings.danger_zone.owner_only') : ''}
              >
                {t('venue_settings.danger_zone.confirm_delete_button')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
