import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';

export const VenuesListScreen = () => {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  const [venues] = useTable(tables.Venue);
  const [venueMembers] = useTable(tables.VenueMember);
  
  const createVenue = useReducer(reducers.createVenue);
  const [isCreating, setIsCreating] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');

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

  const handleCreateVenue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVenueName.trim()) return;
    
    createVenue({ name: newVenueName.trim() });
    setNewVenueName('');
    setIsCreating(false);
  };

  return (
    <div className="app-container">
      <div className="screen-header">
        <h2>Your Venues</h2>
        <button onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? 'Cancel' : 'New Venue'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreateVenue} className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>Create a New Venue</h3>
          <div className="flex-row">
            <input 
              type="text" 
              placeholder="Venue Name (e.g. Acme Corp)" 
              value={newVenueName}
              onChange={e => setNewVenueName(e.target.value)}
              style={{ flex: 1 }}
              autoFocus
            />
            <button type="submit">Create</button>
          </div>
        </form>
      )}

      <div className="flex-col">
        {myVenues.length === 0 && !isCreating ? (
          <div className="empty-state glass-panel">
            <h3 style={{ color: 'var(--text-primary)'}}>No venues found</h3>
            <p style={{ marginTop: '8px' }}>Create a new venue or ask for an invite code.</p>
          </div>
        ) : (
          myVenues.map(venue => (
            <div 
              key={venue.venueId} 
              className="glass-panel-interactive" 
              style={{ padding: '24px' }}
              onClick={() => navigate(`/venues/${venue.venueId}`)}
            >
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{venue.name}</h3>
              <p style={{ margin: '8px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                ID: {venue.venueId}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
