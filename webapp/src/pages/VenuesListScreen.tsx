import { useNavigate } from 'react-router-dom';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';

export const VenuesListScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  const [venues] = useTable(tables.VenueView);
  const [venueMembers] = useTable(tables.VenueMemberView);

  // Not logged in guard handled top-level or softly here
  if (!isLoggedIn || !user) {
    return (
      <div className="app-container empty-state">
        <h2>{t('venues_list.login_required')}</h2>
        <button onClick={() => navigate('/login')} style={{ marginTop: '16px' }}>{t('venues_list.go_to_login')}</button>
      </div>
    );
  }

  // Filter venues to only those where the user is a member
  const myVenueIds = new Set(
    venueMembers
      .filter(m => m.userId === user.userId)
      .map(m => m.venueId)
  );

  const myVenues = venues.filter(v => myVenueIds.has(v.venueId)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="app-container">
      <div className="screen-header">
        <h2>{t('venues_list.title')}</h2>
        <button
          className="icon-button"
          onClick={() => navigate('/venues/new')}
          title={t('venues_list.new_venue')}
        >
          <Plus size={20} />
        </button>
      </div>

      <div className="flex-col">
        {myVenues.length === 0 ? (
          <div className="empty-state glass-panel">
            <h3 style={{ color: 'var(--text-primary)' }}>{t('venues_list.no_venues')}</h3>
            <p style={{ marginTop: '8px' }}>{t('venues_list.empty_helper')}</p>
          </div>
        ) : (
          myVenues.map(venue => (
            <div
              key={venue.venueId.toString()}
              className="glass-panel-interactive"
              style={{ padding: '24px', marginBottom: '12px' }}
              onClick={() => navigate(`/venues/${venue.link}`)}
            >
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{venue.name}</h3>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
