import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';

const NAME_CONFIG = {
  dictionaries: [adjectives, animals],
  separator: '-',
  length: 2,
};

function generateRandomPassphrase(): string {
  return uniqueNamesGenerator(NAME_CONFIG);
}

function generateUniqueLink(existingLinks: Set<string>): string {
  let link = generateRandomPassphrase();
  // If the 2-word name is taken, try a 3-word name (adj-adj-noun)
  if (existingLinks.has(link)) {
    link = uniqueNamesGenerator({
      ...NAME_CONFIG,
      dictionaries: [adjectives, adjectives, animals],
      length: 3,
    });
  }
  // If still taken, keep adding adjectives until unique
  while (existingLinks.has(link)) {
    const extraAdj = uniqueNamesGenerator({ dictionaries: [adjectives], length: 1 });
    link = `${extraAdj}-${link}`;
  }
  return link;
}

export const NewVenueScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const [venues] = useTable(tables.VenueView);
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
      setErrorText(t(message) || t('new_venue.error_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'flex-start' }}>
      <div className="screen-header" style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            className="icon-button" 
            onClick={() => navigate('/venues')}
          >
            <ArrowLeft size={20} />
          </button>
          <h2>{t('new_venue.title')}</h2>
        </div>
      </div>
      <form onSubmit={handleCreateVenue} className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
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
            placeholder={t('new_venue.placeholder')}
            value={newVenueName}
            onChange={e => setNewVenueName(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
            disabled={loading}
          />
          <button type="submit" disabled={loading || !newVenueName.trim()} style={{ width: '100%' }}>
            {loading ? t('new_venue.creating') : t('new_venue.create')}
          </button>
        </div>
      </form>
      <div style={{ flex: 1 }}></div>
    </div>
  );
};
