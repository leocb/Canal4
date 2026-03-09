import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reducers } from '../module_bindings/index.ts';
import { useReducer } from 'spacetimedb/react';
import { useAuth } from '../hooks/useAuth';

export const LoginScreen = () => {
  const navigate = useNavigate();
  const { user, isLoggedIn, connected } = useAuth();
  const loginOrCreateUser = useReducer(reducers.loginOrCreateUser);
  
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'options' | 'email'>('options');

  if (isLoggedIn && user?.name) {
    // Already fully logged in
    navigate('/venues', { replace: true });
    return null;
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    // In a real app we'd initiate email OTP here, but per specification
    // we use `loginOrCreateUser` passing the email and name to simulate the process prototype.
    // We will ask for name if it's the first time later, but we need it for the reducer schema now.
    const provisionalName = name || email.split('@')[0];
    
    loginOrCreateUser({
       email: email || undefined,
       googleId: undefined,
       name: provisionalName
    });

    // We rely on the hook to transition us when `user` populates
    setTimeout(() => {
        setLoading(false);
    }, 1500); // safety fallback
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
          <form onSubmit={handleEmailLogin} className="flex-col">
            <h3 style={{ marginBottom: '16px' }}>Sign-in via email</h3>
            
            <input 
              type="email" 
              placeholder="Your email address" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading || !connected}
            />

            {!isLoggedIn && (
               <input 
                type="text" 
                placeholder="What should we call you?" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading || !connected}
               />
            )}

            <button type="submit" disabled={loading || !connected} style={{ marginTop: '8px' }}>
              {loading ? 'Connecting...' : 'Sign-in'}
            </button>

            <div style={{ marginTop: '16px' }}>
              <a href="#" style={{ fontSize: '0.9rem' }} onClick={(e) => { e.preventDefault(); setView('options'); }}>
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
