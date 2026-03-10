import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { reducers, tables } from '../module_bindings/index.ts';
import { useReducer, useTable } from 'spacetimedb/react';
import { useAuth } from '../hooks/useAuth';

export const LoginScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = new URLSearchParams(location.search).get('redirect') || '/venues';
  const { user, isLoggedIn, connected } = useAuth();
  const loginOrCreateUser = useReducer(reducers.loginOrCreateUser);
  
  const [users] = useTable(tables.User);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'options' | 'email' | 'name'>('options');

  useEffect(() => {
    if (isLoggedIn && user?.name) {
      navigate(redirect, { replace: true });
    }
  }, [isLoggedIn, user, navigate, redirect]);

  if (isLoggedIn && user?.name) {
    return null;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    const normalizedEmail = email.trim().toLowerCase();
    const isKnown = users.some(u => 
      u.email?.trim().toLowerCase() === normalizedEmail && 
      u.name?.trim() !== ''
    );

    if (isKnown) {
      setLoading(true);
      loginOrCreateUser({
         email: normalizedEmail,
         googleId: undefined,
         name: '' // Ignored by backend for existing users
      });
      setTimeout(() => setLoading(false), 1500);
    } else {
      setView('name');
    }
  };

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;
    
    setLoading(true);
    loginOrCreateUser({
       email: email.trim().toLowerCase(),
       googleId: undefined,
       name: name.trim()
    });
    setTimeout(() => setLoading(false), 1500);
  };

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '1.8rem' }}>Courier Notifications</h2>
        
        {view === 'options' && (
          <div className="flex-col">
            <button 
              className="secondary" 
              style={{ width: '100%' }}
              onClick={() => alert("Google Auth Mock - In Prototype use Email")}
            >
              Sign-in with Google
            </button>
            
            <button 
              style={{ width: '100%' }}
              onClick={() => setView('email')}
            >
              Sign-in via email
            </button>
          </div>
        )}

        {view === 'email' && (
          <form onSubmit={handleEmailSubmit} className="flex-col">
            <h3 style={{ marginBottom: '16px' }}>Sign-in via email</h3>
            
            <input 
              type="email" 
              placeholder="Your email address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading || !connected}
              autoFocus
            />

            <button type="submit" disabled={loading || !connected} style={{ marginTop: '8px' }}>
              {loading ? 'Connecting...' : 'Continue'}
            </button>

            <div style={{ marginTop: '16px' }}>
              <a href="#" style={{ fontSize: '0.9rem' }} onClick={(e) => { e.preventDefault(); setView('options'); }}>
                Go back
              </a>
            </div>
          </form>
        )}

        {view === 'name' && (
          <form onSubmit={handleNameSubmit} className="flex-col">
            <h3 style={{ marginBottom: '16px' }}>Welcome!</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px', marginTop: 0 }}>
              It looks like you're new here.
            </p>
            
            <input 
              type="text" 
              placeholder="What should we call you?" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading || !connected}
              autoFocus
            />

            <button type="submit" disabled={loading || !connected} style={{ marginTop: '8px' }}>
              {loading ? 'Creating account...' : 'Complete Sign-up'}
            </button>

            <div style={{ marginTop: '16px' }}>
              <a href="#" style={{ fontSize: '0.9rem' }} onClick={(e) => { e.preventDefault(); setView('email'); }}>
                Go back
              </a>
            </div>
          </form>
        )}
      </div>
      
      <div style={{ marginTop: '32px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <a href="https://github.com/leocb" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
          Copyright github.com/leocb
        </a>
      </div>
    </div>
  );
};
