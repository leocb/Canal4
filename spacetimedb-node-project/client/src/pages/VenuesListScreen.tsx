import { useNavigate } from 'react-router-dom';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';

export const VenuesListScreen = () => {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  const [venues] = useTable(tables.Venue);
  const [venueMembers] = useTable(tables.VenueMember);

  // Not logged in guard handled top-level or softly here
  if (!isLoggedIn || !user) {
    return (
      <div className="app-container empty-state">
        <h2>Please log in to view venues.</h2>
        <button onClick={() => navigate('/login')} style={{ marginTop: '16px' }}>Go to Login</button>
      </div>
    );
  }

  // Filter venues to only those where the user is a member
  const myVenueIds = new Set(
    venueMembers
      .filter(m => m.userIdentity.toHexString() === user.identity.toHexString())
      .map(m => m.venueId)
  );

  const myVenues = venues.filter(v => myVenueIds.has(v.venueId));

  return (
    <div className="app-container">
      <div className="screen-header">
        <h2>Your Venues</h2>
        <button onClick={() => navigate('/venues/new')}>
          New Venue
        </button>
      </div>

      <div className="flex-col">
        {myVenues.length === 0 ? (
          <div className="empty-state glass-panel">
            <h3 style={{ color: 'var(--text-primary)'}}>No venues found</h3>
            <p style={{ marginTop: '8px' }}>Create a new venue or ask for an invite code.</p>
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
