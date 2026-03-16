import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { useReadyTable } from '../hooks/useReadyTable';
import { Search, CheckCircle, Building2, AlertTriangle } from 'lucide-react';

export const JoinVenueScreen = () => {
  const { venueLink, token } = useParams<{ venueLink: string, token: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  // useReadyTable latches ready=true permanently once the first snapshot arrives,
  // preventing flicker when other clients trigger subscription re-evaluations
  const [venues, venuesReady] = useReadyTable(tables.Venue);
  const [venueMembers] = useTable(tables.VenueMember);
  const joinVenue = useReducer(reducers.joinVenue);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  // Redirect unauthenticated users — must be in useEffect to avoid "update during render"
  useEffect(() => {
    if (!isLoggedIn) {
      navigate(`/login?redirect=/join/${venueLink}/${token}`, { replace: true });
    }
  }, [isLoggedIn, navigate, venueLink, token]);

  if (!isLoggedIn || !user) {
    return null;
  }

  // Wait for the subscription to be applied before rendering data-dependent UI
  if (!venuesReady) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <h2 style={{ marginBottom: '12px' }}>Loading invite...</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Connecting to server...</p>
        </div>
      </div>
    );
  }

  const venue = venues.find(v => v.link === venueLink);

  // Check if already a member
  const isMember = venue ? venueMembers.some(
    m => m.venueId === venue.venueId && m.userId === user.userId
  ) : false;

  if (!venue) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
            <Search size={48} />
          </div>
          <h2 style={{ marginBottom: '12px' }}>Invite Not Found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            This invite link is invalid or the venue no longer exists.
          </p>
          <button onClick={() => navigate('/venues')} style={{ width: '100%' }}>
            Go to My Venues
          </button>
        </div>
      </div>
    );
  }

  if (isMember) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
          <div style={{ color: 'var(--success-color)', marginBottom: '16px' }}>
            <CheckCircle size={48} />
          </div>
          <h2 style={{ marginBottom: '12px' }}>Already a Member</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            You are already a member of <strong>{venue.name}</strong>.
          </p>
          <button onClick={() => navigate(`/venues/${venue.link}`)} style={{ width: '100%' }}>
            Open Venue
          </button>
        </div>
      </div>
    );
  }

  const handleJoin = async () => {
    setErrorText('');
    setLoading(true);
    try {
      if (!token) throw new Error("Missing invitation token from link");
      await joinVenue({ token });
      navigate(`/venues/${venue.link}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(message || 'Failed to join venue. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <div style={{ color: 'var(--accent-color)', marginBottom: '16px' }}>
          <Building2 size={48} />
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>
          You've been invited to
        </p>
        <h2 style={{ marginBottom: '8px', fontSize: '1.8rem' }}>{venue.name}</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '0.85rem' }}>
          Joining as <strong style={{ color: 'var(--text-primary)' }}>{user.name}</strong>
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
            {loading ? 'Joining...' : 'Join Venue'}
          </button>
          <button className="secondary" onClick={() => navigate('/venues')} style={{ width: '100%' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
