import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

const ADJECTIVES = ['fast', 'happy', 'clever', 'brave', 'calm', 'eager', 'gentle', 'proud', 'witty', 'bold', 'kind', 'neat', 'wise', 'zesty', 'wild', 'super', 'lucky', 'swift', 'merry', 'light'];
const NOUNS = ['bunny', 'tiger', 'eagle', 'dolphin', 'fox', 'bear', 'lion', 'wolf', 'hawk', 'owl', 'seal', 'deer', 'swan', 'dove', 'frog', 'duck', 'goose', 'pup', 'cub', 'kit'];

function generateRandomPassphrase(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
}

function generateUniqueLink(existingLinks: Set<string>): string {
  let link = generateRandomPassphrase();
  while (existingLinks.has(link)) {
    const extraAdj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    link = `${extraAdj}-${link}`;
  }
  return link;
}

export const NewVenueScreen = () => {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const [venues] = useTable(tables.Venue);
  const createVenue = useReducer(reducers.createVenue);

  const [newVenueName, setNewVenueName] = useState('');
  const [errorText, setErrorText] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoggedIn || !user) {
    navigate('/login');
    return null;
  }

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVenueName.trim()) return;

    const existingLinks = new Set(venues.map(v => v.link));
    const venueLink = generateUniqueLink(existingLinks);

    setErrorText('');
    setLoading(true);
    try {
      await createVenue({ name: newVenueName.trim(), link: venueLink });
      navigate(`/venues/${venueLink}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(message || 'Failed to create venue. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'flex-start' }}>
      <div className="screen-header" style={{ width: '100%', maxWidth: '400px' }}>
        <button className="secondary" onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ArrowLeft size={16} style={{ transform: 'translateY(1px)' }} /> Back
        </button>
      </div>

      <form onSubmit={handleCreateVenue} className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '1.8rem' }}>Create a New Venue</h2>

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

        <div className="flex-col" style={{ gap: '16px' }}>
          <input
            type="text"
            placeholder="Venue Name (e.g. Acme Corp)"
            value={newVenueName}
            onChange={e => setNewVenueName(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
            disabled={loading}
          />
          <button type="submit" disabled={loading || !newVenueName.trim()} style={{ width: '100%' }}>
            {loading ? 'Creating...' : 'Create Venue'}
          </button>
        </div>
      </form>
      <div style={{ flex: 1 }}></div>
    </div>
  );
};
