import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const VenueSettingsScreen = () => {
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [venues] = useTable(tables.Venue);
  const updateVenue = useReducer(reducers.updateVenue);
  const deleteVenue = useReducer(reducers.deleteVenue);

  const venue = venues.find(v => v.link === venueLink);
  const isOwner = venue?.ownerId === user?.userId;

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
     return <div className="app-container empty-state"><h2>Venue not found</h2></div>;
  }
  if (!isOwner) {
     return <div className="app-container empty-state"><h2>Access Denied</h2></div>;
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!name.trim()) {
      setErrorMsg('Name is required');
      return;
    }
    setLoading(true);
    try {
      await updateVenue({ venueId: venue.venueId, newName: name.trim() });
      navigate(`/venues/${venue.link}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setErrorMsg('');
    if (deleteConfirmationName !== venue.name) {
      setErrorMsg('Confirmation name does not match');
      return;
    }
    setLoading(true);
    try {
      await deleteVenue({ venueId: venue.venueId, confirmationName: deleteConfirmationName });
      navigate('/venues', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
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
            <ArrowLeft size={16} /> Back
          </span>
          <h2>{venue.name} Settings</h2>
        </div>
      </div>

      {errorMsg && (
        <div style={{ color: 'var(--error-color)', marginTop: '16px', padding: '12px', background: 'rgba(255,80,80,0.1)', borderRadius: '8px' }}>
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleUpdate} className="flex-col" style={{ gap: '16px', marginTop: '24px' }}>
        <div className="form-group">
          <label htmlFor="venueName">Venue Name</label>
          <input
            id="venueName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="E.g. Engineering Team"
            disabled={loading}
          />
        </div>
        
        <button type="submit" disabled={loading || !name.trim()}>
          {loading ? 'Saving...' : 'Confirm'}
        </button>
      </form>

      <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--surface-border)' }}>
         <h3 style={{ color: 'var(--error-color)' }}>Danger Zone</h3>
         
         {!showDeleteConfirm ? (
           <button 
             className="danger" 
             style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
             onClick={() => setShowDeleteConfirm(true)}
           >
             <Trash2 size={16} /> Delete Venue
           </button>
         ) : (
           <div className="glass-panel" style={{ marginTop: '16px', padding: '16px', borderColor: 'var(--error-color)' }}>
              <p style={{ marginBottom: '12px', fontSize: '0.9rem' }}>
                To confirm deletion, type <strong>{venue.name}</strong> below:
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
                  className="danger" 
                  onClick={handleDelete} 
                  disabled={loading || deleteConfirmationName !== venue.name}
                  style={{ flex: 1 }}
                >
                  Confirm Delete
                </button>
                <button 
                  className="secondary" 
                  onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmationName(''); }}
                  disabled={loading}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
           </div>
         )}
      </div>
    </div>
  );
};
