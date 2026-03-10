import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trash2, ArrowLeft, LayoutTemplate } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTable, useReducer } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings/index.ts';

const ROLES = ['owner', 'admin', 'moderator', 'member'];

export const ChannelSettingsScreen = () => {
  const { venueLink, channelId } = useParams<{ venueLink: string, channelId: string }>();
  const navigate = useNavigate();
  const { user, isLoggedIn, connected } = useAuth();
  
  const [venues] = useTable(tables.Venue);
  const [channels] = useTable(tables.Channel);
  const [channelRoles] = useTable(tables.ChannelMemberRole);
  const [venueMembers] = useTable(tables.VenueMember);

  const updateChannel = useReducer(reducers.updateChannel);
  const deleteChannel = useReducer(reducers.deleteChannel);

  const venue = venues.find((v: any) => v.link === venueLink);
  const channelIdBigInt = channelId ? BigInt(channelId) : 0n;
  const channel = channels.find((c: any) => c.channelId === channelIdBigInt);

  const myVenueRole = venueMembers.find(
    (m: any) => m.userId === user?.userId && m.venueId === venue?.venueId
  )?.role.tag;
  const myChannelRole = channelRoles.find(
    (r: any) => r.userId === user?.userId && r.channelId === channel?.channelId
  )?.role.tag;

  const isVenueOwner = venue?.ownerId === user?.userId || myVenueRole?.toLowerCase() === 'owner';
  const isChannelOwner = isVenueOwner || myChannelRole?.toLowerCase() === 'owner';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minRole, setMinRole] = useState('member');
  const [maxAgeHours, setMaxAgeHours] = useState('4');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!isLoggedIn) {
      if (venueLink) {
        navigate(`/login?redirect=/venues/${venueLink}/channels/${channelId}/settings`, { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
      return;
    }
    
    if (channel && name === '') {
      setName(channel.name);
      setDescription(channel.description);
      setMinRole(channel.minimumRoleToView.tag);
      setMaxAgeHours(channel.messageMaxAgeHours.toString());
    }
  }, [isLoggedIn, navigate, venueLink, channelId, channel, name]);

  if (!isLoggedIn || !user || !connected) return null;
  if (!venue || !channel) return null;

  if (!isChannelOwner) {
    return (
      <div className="app-container empty-state">
        <h2>Access Denied</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>Only channel owners can access these settings.</p>
        <button onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}`)} style={{ marginTop: '16px' }}>Go back</button>
      </div>
    );
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setErrorText('');
    setLoading(true);

    try {
      await updateChannel({
        channelId: channel.channelId,
        name: name.trim(),
        description: description.trim(),
        minRole,
        maxAgeHours: BigInt(parseInt(maxAgeHours) || 4),
      });
      navigate(`/venues/${venue.link}/channels/${channel.channelId}`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmName !== channel.name) {
      setErrorText("Confirmation name doesn't match");
      return;
    }

    setErrorText('');
    setLoading(true);

    try {
      await deleteChannel({
        channelId: channel.channelId,
        confirmationName: deleteConfirmName,
      });
      navigate(`/venues/${venue.link}`);
    } catch (err: unknown) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div className="screen-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            className="icon-button" 
            onClick={() => navigate(`/venues/${venue.link}/channels/${channel.channelId}`)}
            aria-label="Back to channel"
          >
            <ArrowLeft size={20} />
          </button>
          <h2>{channel.name} Settings</h2>
        </div>
        <button 
          className="icon-button danger" 
          onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
          title="Delete Channel"
        >
          <Trash2 size={20} />
        </button>
      </div>

      <div className="content-area" style={{ flex: 1, padding: '24px 16px', maxWidth: '600px', margin: '0 auto', width: '100%'} }>
        <form onSubmit={handleUpdate} className="glass-panel flex-col" style={{ padding: '24px' }}>
          {errorText && (
            <div style={{
              color: 'var(--error-color)',
              marginBottom: '16px',
              fontSize: '0.9rem',
              padding: '10px 14px',
              background: 'rgba(255,80,80,0.1)',
              borderRadius: '8px',
              border: '1px solid var(--error-color)',
            }}>
              ⚠️ {errorText}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>Channel Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
              placeholder="e.g., General Announcements"
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>Description</label>
            <input 
              type="text" 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              placeholder="e.g., Main channel for all members"
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>Minimum Role to View</label>
            <select 
              value={minRole} 
              onChange={(e) => setMinRole(e.target.value)}
              disabled={loading}
              style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)', outline: 'none' }}
            >
              {ROLES.map(r => (
                <option key={r} value={r} style={{ background: '#1c1c1e' }}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '0.9rem' }}>Message Max Age (Hours)</label>
            <input 
              type="number" 
              min="1"
              max="8760"
              value={maxAgeHours}
              onChange={(e) => setMaxAgeHours(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="flex-col" style={{ gap: '12px', marginTop: '8px' }}>
            <button 
              type="button" 
              className="secondary"
              disabled={loading}
              onClick={() => alert("Templates configuration not yet implemented")}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <LayoutTemplate size={18} /> Configure templates
            </button>
            
            <button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>

      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px'
        }}>
          <div className="glass-panel flex-col" style={{ padding: '24px', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--error-color)' }}>Delete Channel</h3>
            <p style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              This action cannot be undone. This will permanently delete the <strong>{channel.name}</strong> channel and remove all associated templates, messages, and settings.
            </p>
            <p style={{ marginBottom: '8px', fontSize: '0.9rem' }}>
              Please type <strong>{channel.name}</strong> to confirm.
            </p>
            <input 
              type="text" 
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={channel.name}
              disabled={loading}
            />
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button 
                className="secondary" 
                style={{ flex: 1 }} 
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName(''); setErrorText(''); }}
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                className="danger" 
                style={{ flex: 1 }}
                onClick={handleDelete}
                disabled={loading || deleteConfirmName !== channel.name}
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
