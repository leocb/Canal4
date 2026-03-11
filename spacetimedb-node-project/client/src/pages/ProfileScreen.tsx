import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings/index.ts';
import { ArrowLeft } from 'lucide-react';

export const ProfileScreen = () => {
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const updateUserName = useReducer(reducers.updateUserName);
  
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

      <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '24px', maxWidth: '500px', width: '100%' }}>
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
            <button type="submit" style={{ flex: 1 }} disabled={isSaving || !name.trim() || name.trim() === user?.name}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" className="secondary" style={{ flex: 1 }} onClick={() => navigate(-1)} disabled={isSaving}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
