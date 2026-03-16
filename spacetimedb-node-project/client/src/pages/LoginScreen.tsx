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
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [view, setView] = useState<'options' | 'email' | 'pin'>('options');

  const loginWithEmailPin = useReducer(reducers.loginWithEmailPin);
  const [pins] = useTable(tables.EmailLoginPin);
  const [lockouts] = useTable(tables.LoginLockout);

  // If already logging in (loading=true), keep spinner until auth resolves
  useEffect(() => {
    if (isLoggedIn && user?.name) {
      setLoading(false);
      navigate(redirect, { replace: true });
    }
  }, [isLoggedIn, user, navigate, redirect]);

  if (isLoggedIn && user?.name) {
    return null;
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setErrorText('');
    setLoading(true);

    try {
      const response = await fetch('/api/request-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to send PIN');
      }

      setView('pin');
    } catch (err: any) {
      setErrorText(err.message || 'Error requesting PIN');
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    setErrorText('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      await loginWithEmailPin({
        email: normalizedEmail,
        pin: pin.trim()
      });

      // Wait for SpacetimeDB to sync the state changes back to us
      await new Promise(resolve => setTimeout(resolve, 800));

      // 1. Are we logged in now?
      if (isLoggedIn) return;

      // 2. Check for Lockout
      const lockout = lockouts.find(l => l.email === normalizedEmail);
      if (lockout) {
        setLoading(false);
        setErrorText("Too many failed attempts.\nAccount locked for 10 minutes.");
        return;
      }

      // 3. Check for remaining attempts
      const currentPin = pins.find(p => p.email === normalizedEmail);
      if (currentPin) {
        const remaining = 10 - currentPin.attempts;
        setLoading(false);
        setErrorText(`Invalid PIN. ${remaining} attempts remaining.`);
      } else {
        // PIN might have been deleted but no lockout found (rare sync issue)
        setLoading(false);
        setErrorText("Invalid PIN. Please try requesting a new one.");
      }
    } catch (err: any) {
      setLoading(false);
      setErrorText(err.message || 'Error during login');
    }
  };

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '1.8rem' }}>Courier Notifications</h2>

        {errorText && (
          <div style={{
            color: 'var(--error-color)',
            marginBottom: '16px',
            fontSize: '0.9rem',
            padding: '10px 14px',
            background: 'rgba(255,80,80,0.1)',
            borderRadius: '8px',
            border: '1px solid var(--error-color)',
            textAlign: 'left',
          }}>
            ⚠️ {errorText}
          </div>
        )}

        {view === 'options' && (
          <div className="flex-col">
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

        {view === 'pin' && (
          <form onSubmit={handlePinSubmit} className="flex-col">
            <h3 style={{ marginBottom: '8px' }}>Enter PIN</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              We've sent a 6-digit code to <strong>{email}</strong>
            </p>

            <input
              type="text"
              placeholder="000000"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              disabled={loading || !connected}
              autoFocus
              style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '4px' }}
            />

            <button type="submit" disabled={loading || !connected || pin.length < 6} style={{ marginTop: '16px' }}>
              {loading ? 'Verifying...' : 'Login'}
            </button>

            <div style={{ marginTop: '16px' }}>
              <a href="#" style={{ fontSize: '0.9rem' }} onClick={(e) => { e.preventDefault(); setView('email'); setPin(''); }}>
                Use a different email
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
