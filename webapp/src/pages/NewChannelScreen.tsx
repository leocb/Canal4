import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const NewChannelScreen = () => {
  const { t } = useTranslation();
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const [venues] = useTable(tables.VenueView);
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
        <h2>{t('venue_channels.venue_not_found')}</h2>
        <button onClick={() => navigate('/venues')}>{t('common.back')}</button>
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
      setErrorText(t(message) || t('new_channel.error_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <div className="content-area" style={{ alignItems: 'center' }}>
        <div className="screen-header" style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="icon-button" 
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={20} />
            </button>
            <h2>{t('new_channel.title')}</h2>
          </div>
        </div>

        <form onSubmit={handleCreateChannel} className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>


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
              placeholder={t('new_channel.name_placeholder')}
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%' }}
              autoFocus
              disabled={loading}
            />
            <input
              type="text"
              placeholder={t('new_channel.description_placeholder')}
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ width: '100%' }}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !name.trim()} style={{ width: '100%' }}>
              {loading ? t('new_channel.creating') : t('new_channel.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
