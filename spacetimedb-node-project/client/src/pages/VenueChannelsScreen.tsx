import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTable, useReducer } from 'spacetimedb/react';
import { tables, reducers } from '../module_bindings/index.ts';

export const VenueChannelsScreen = () => {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  
  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  
  const createChannel = useReducer(reducers.createChannel);
  const registerMessenger = useReducer(reducers.registerMessengerToVenue);
  const [isCreating, setIsCreating] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [newMessengerName, setNewMessengerName] = useState('');

  const venueIdBigInt = BigInt(venueId || 0);
  const venue = venues.find(v => v.venueId === venueIdBigInt);
  
  const venueChannels = channels.filter(c => c.venueId === venueIdBigInt);

  if (!venue) {
    return (
      <div className="app-container empty-state">
        <h2>Venue not found</h2>
        <button onClick={() => navigate('/venues')} style={{ marginTop: '16px' }}>Go back</button>
      </div>
    );
  }

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    
    createChannel({ venueId: venueIdBigInt, name: newChannelName.trim(), minRole: 'Member', maxAgeHours: BigInt(24) });
    setNewChannelName('');
    setIsCreating(false);
  };

  const handleRegisterPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.length !== 6 || !newMessengerName.trim()) return;
    registerMessenger({ venueId: venueIdBigInt, name: newMessengerName.trim(), pin: pinInput });
    setPinInput('');
    setNewMessengerName('');
  };

  return (
    <div className="app-container">
      <div className="screen-header">
        <div className="flex-col" style={{ gap: '4px' }}>
          <span 
            style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500 }}
            onClick={() => navigate('/venues')}
          >
            ← Back to Venues
          </span>
          <h2>{venue.name}</h2>
        </div>
        <button onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? 'Cancel' : 'New Channel'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreateChannel} className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>Create a New Channel</h3>
          <div className="flex-row">
            <input 
              type="text" 
              placeholder="Channel Name (e.g. alerts-prod)" 
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              style={{ flex: 1 }}
              autoFocus
            />
            <button type="submit">Create</button>
          </div>
        </form>
      )}

      {/* Messenger App Pairing Display */}
      <form onSubmit={handleRegisterPin} className="glass-panel" style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ margin: '0 0 4px', color: 'var(--text-primary)' }}>Desktop Messenger Sync</h4>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Enter the 6-digit PIN from the Electron app to pair it to this venue.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
             type="text"
             placeholder="Node name"
             value={newMessengerName}
             onChange={e => setNewMessengerName(e.target.value)}
             style={{ margin: 0 }}
             required
          />
          <input 
            type="text" 
            placeholder="000000" 
            maxLength={6}
            value={pinInput}
            onChange={e => setPinInput(e.target.value.toUpperCase())}
            style={{ width: '100px', textAlign: 'center', letterSpacing: '4px', margin: 0 }}
            required
          />
          <button type="submit" className="secondary" disabled={pinInput.length !== 6 || !newMessengerName.trim()}>Pair</button>
        </div>
      </form>

      <div className="flex-col">
        {venueChannels.length === 0 && !isCreating ? (
          <div className="empty-state glass-panel">
            <h3 style={{ color: 'var(--text-primary)'}}>No channels yet</h3>
            <p style={{ marginTop: '8px' }}>Create a channel to start configuring notifications.</p>
          </div>
        ) : (
          venueChannels.map(channel => (
            <div 
              key={channel.channelId} 
              className="glass-panel-interactive flex-row" 
              style={{ padding: '20px 24px', justifyContent: 'space-between' }}
              onClick={() => navigate(`/venues/${venue.venueId}/channels/${channel.channelId}`)}
            >
              <div>
                <h3 style={{ fontSize: '1.1rem', margin: 0 }}># {channel.name}</h3>
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                →
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
