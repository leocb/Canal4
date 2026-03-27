import { useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { useReadyTable } from '../hooks/useReadyTable';
import { CheckCircle, Building2, AlertTriangle } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

export const JoinVenueScreen = () => {
  const { t } = useTranslation();
  const { venueLink, token } = useParams<{ venueLink: string, token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn } = useAuth();

  const queryName = useMemo(() => new URLSearchParams(location.search).get('name'), [location.search]);
  // Subscription ready state
  const [venues, venuesReady] = useReadyTable(tables.VenueView);
  const [venueMembers] = useTable(tables.VenueMemberView);
  const joinVenue = useReducer(reducers.joinVenue);

  const venue = venues.find(v => v.link === venueLink);
  const venueName = venue?.name || queryName || venueLink || '';

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  if (!isLoggedIn || !user) {
    return null;
  }

  // Wait for the subscription to be applied before rendering data-dependent UI
  if (!venuesReady) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <h2 style={{ marginBottom: '12px' }}>{venueName}</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{t('join_venue.connecting')}</p>
        </div>
      </div>
    );
  }

  // Check if already a member
  const isMember = venue ? venueMembers.some(
    m => m.venueId === venue.venueId && m.userId === user.userId
  ) : false;

  if (isMember) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <div style={{ color: 'var(--success-color)', marginBottom: '16px' }}>
            <CheckCircle size={48} />
          </div>
          <h2 style={{ marginBottom: '12px' }}>{t('join_venue.already_member_title')}</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            <Trans i18nKey="join_venue.already_member_text" values={{ name: venueName }}>
              You are already a member of <strong>{venueName}</strong>.
            </Trans>
          </p>
          <button onClick={() => navigate(`/venues/${venue.link}`)} style={{ width: '100%' }}>
            {t('join_venue.open_venue')}
          </button>
        </div>
      </div>
    );
  }

  const handleJoin = async () => {
    setErrorText('');
    setLoading(true);
    try {
      if (!token) throw new Error(t('join_venue.error_missing_token'));
      await joinVenue({ token });
      navigate(`/venues/${venue?.link || venueLink}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(t(message) || t('join_venue.error_failed'));
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="content-area" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <div style={{ color: 'var(--accent-color)', marginBottom: '16px' }}>
            <Building2 size={48} />
          </div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>
            {t('join_venue.invited_to')}
          </p>
          <h2 style={{ marginBottom: '8px', fontSize: '1.8rem' }}>{venueName}</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '0.85rem' }}>
            <Trans i18nKey="join_venue.joining_as" values={{ name: user.name }}>
              Joining as <strong style={{ color: 'var(--text-primary)' }}>{user.name}</strong>
            </Trans>
          </p>

          {errorText && (
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
              gap: '8px',
              textAlign: 'left'
            }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} /> {errorText}
            </div>
          )}

          <div className="flex-col" style={{ gap: '12px' }}>
            <button onClick={handleJoin} disabled={loading} style={{ width: '100%' }}>
              {loading ? t('join_venue.joining') : t('join_venue.join_button')}
            </button>
            <button className="secondary" onClick={() => navigate('/venues')} style={{ width: '100%' }}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
