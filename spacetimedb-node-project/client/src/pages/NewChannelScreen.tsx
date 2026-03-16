import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export const NewChannelScreen = () => {
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const [venues] = useTable(tables.Venue);
  const createChannel = useReducer(reducers.createChannel);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errorText, setErrorText] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoggedIn || !user) {
    navigate('/login');
    return null;
  }

  const venue = venues.find(v => v.link === venueLink);
  if (!venue) {
    return (
      <div className="app-container empty-state">
        <h2>Venue not found</h2>
        <button onClick={() => navigate('/venues')}>Go back</button>
      </div>
    );
  }

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setErrorText('');
    setLoading(true);
    try {
      await createChannel({
        venueId: venue.venueId,
        name: name.trim(),
        description: description.trim(),
        minRole: 'member',
        maxAgeHours: BigInt(24),
      });
      navigate(`/venues/${venue.link}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(message || 'Failed to create channel. Please try again.');
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

      <form onSubmit={handleCreateChannel} className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '1.8rem' }}>Create a New Channel</h2>

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
            placeholder="Channel Name (e.g. alerts-prod)"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
            disabled={loading}
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ width: '100%' }}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !name.trim()} style={{ width: '100%' }}>
            {loading ? 'Creating...' : 'Create Channel'}
          </button>
        </div>
      </form>
      <div style={{ flex: 1 }}></div>
    </div>
  );
};
