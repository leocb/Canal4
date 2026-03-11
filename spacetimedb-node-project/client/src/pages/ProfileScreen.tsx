import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings/index.ts';
import { ArrowLeft, Trash2 } from 'lucide-react';

export const ProfileScreen = () => {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');

  const updateUserName = useReducer(reducers.updateUserName);
  const deleteUserAccount = useReducer(reducers.deleteUserAccount);

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user]);

  if (!isLoggedIn) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim() === user?.name) {
      navigate(-1);
      return;
    }

    setIsSaving(true);
    updateUserName({
      userId: user.userId,
      newName: name.trim()
    });

    // Simplistic approach for demo: Optimistically wait a bit, then return
    setTimeout(() => {
      setIsSaving(false);
      navigate(-1);
    }, 500);
  };

  const handleDeleteAccount = async () => {
    setErrorText('');
    if (deleteConfirmationName !== user?.name) {
      setErrorText('Confirmation name does not match');
      return;
    }
    setIsSaving(true);
    try {
      await deleteUserAccount({
        userId: user.userId,
        confirmationName: deleteConfirmationName
      });
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorText(msg);
      setIsSaving(false);
    }
  };

  return (
    <div className="app-container">
      <div className="screen-header">
        <div className="flex-col" style={{ gap: '4px' }}>
          <span
            style={{ fontSize: '0.9rem', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={16} /> Cancel
          </span>
          <h2>Your Profile</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '24px', width: '100%' }}>
        <div className="flex-col" style={{ gap: '16px', textAlign: 'left' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 500 }}>Name</span>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSaving}
              autoFocus
              style={{ width: '100%' }}
            />
          </label>

          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="button" className="secondary" style={{ flex: 1 }} onClick={() => navigate(-1)} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" style={{ flex: 1 }} disabled={isSaving || !name.trim() || name.trim() === user?.name}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </form>

      <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--surface-border)', width: '100%' }}>
        <h3 style={{ color: 'var(--error-color)' }}>Danger Zone</h3>

        {errorText && (
          <div style={{ color: 'var(--error-color)', marginTop: '16px', padding: '12px', background: 'rgba(255,80,80,0.1)', borderRadius: '8px' }}>
            {errorText}
          </div>
        )}

        {!showDeleteConfirm ? (
          <button
            className="danger"
            style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={16} /> Delete Account
          </button>
        ) : (
          <div className="glass-panel" style={{ marginTop: '16px', padding: '16px', borderColor: 'var(--error-color)' }}>
            <p style={{ marginBottom: '12px', fontSize: '0.9rem' }}>
              Are you sure you want to delete your account? This action is irreversible!
              <br />
              To confirm deletion, type your name (<strong>{user?.name}</strong>) below:
            </p>
            <input
              type="text"
              value={deleteConfirmationName}
              onChange={(e) => setDeleteConfirmationName(e.target.value)}
              placeholder={user?.name ?? ''}
              style={{ width: '100%', marginBottom: '12px' }}
            />
            <div className="flex-row" style={{ gap: '8px' }}>
              <button
                className="secondary"
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmationName(''); }}
                disabled={isSaving}
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button
                className="danger"
                onClick={handleDeleteAccount}
                disabled={isSaving || deleteConfirmationName !== user?.name}
                style={{ flex: 1 }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
