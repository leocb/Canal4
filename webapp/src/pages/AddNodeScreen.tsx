import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';

export const AddNodeScreen = () => {
  const { t } = useTranslation();
  const { venueLink } = useParams<{ venueLink: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const [venues] = useTable(tables.VenueView);
  const registerDisplay = useReducer(reducers.registerDisplayToVenue);

  const [nodeName, setNodeName] = useState('');
  const [pin, setPin] = useState('');
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

  const handlePairing = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');

    if (pin.length !== 6 || !/^\d+$/.test(pin)) {
      setErrorText(t('add_node.error_pin_digits'));
      return;
    }
    if (!nodeName.trim()) {
      setErrorText(t('add_node.error_name_required'));
      return;
    }

    setLoading(true);
    try {
      // useReducer returns a Promise<void> that rejects on backend error
      await registerDisplay({
        venueId: venue.venueId,
        name: nodeName.trim(),
        pin: pin,
      });
      navigate(`/venues/${venue.link}/desktop-displays`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrorText(t(message) || t('add_node.error_pairing_failed'));
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
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={20} />
          </button>
          <h2>{t('add_node.title')}</h2>
        </div>
      </div>

      <form onSubmit={handlePairing} className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
        <p style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>{t('add_node.helper_text')}</p>

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
            placeholder={t('add_node.name_placeholder')}
            value={nodeName}
            onChange={e => setNodeName(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
            disabled={loading}
          />
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="000000"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            maxLength={6}
            style={{ width: '100%', letterSpacing: '4px', textAlign: 'center', fontSize: '1.2rem' }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !nodeName.trim() || pin.length !== 6}
            style={{ width: '100%' }}
          >
            {loading ? t('add_node.pairing') : t('add_node.pair_button')}
          </button>
        </div>
      </form>
    </div>
  );
};
