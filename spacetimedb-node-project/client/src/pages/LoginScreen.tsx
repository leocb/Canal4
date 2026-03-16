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
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [view, setView] = useState<'email' | 'pin' | 'name'>('email');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  const loginWithEmailPin = useReducer(reducers.loginWithEmailPin);
  const updateUserName = useReducer(reducers.updateUserName);
  const [pins] = useTable(tables.EmailLoginPin);
  const [lockouts] = useTable(tables.LoginLockout);
  const [users] = useTable(tables.User);

  const validateEmail = (emailStr: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);
  };

  // If already logging in (loading=true), keep spinner until auth resolves
  useEffect(() => {
    if (isLoggedIn && user?.name && !isCreatingAccount) {
      setLoading(false);
      navigate(redirect, { replace: true });
    }
  }, [isLoggedIn, user, navigate, redirect, isCreatingAccount]);

  if (isLoggedIn && user?.name && !isCreatingAccount) {
    return null;
  }
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email.trim())) return;
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
      // Check if this is a brand new account BEFORE we call the login reducer
      const accountExists = users.some(u => u.email?.trim().toLowerCase() === normalizedEmail);
      if (!accountExists) {
        setIsCreatingAccount(true);
      }
      
      await loginWithEmailPin({
        email: normalizedEmail,
        pin: pin.trim()
      });

      // Wait for SpacetimeDB to sync the state changes back to us
      await new Promise(resolve => setTimeout(resolve, 800));

      // 1. If the account didn't exist before, it's a signup - go to name screen
      if (!accountExists) {
        setView('name');
        setLoading(false);
        return;
      }

      // If we are logged in now, the useEffect will handle navigation
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

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !user) return;
    setErrorText('');
    setLoading(true);

    try {
      await updateUserName({
        userId: user.userId,
        newName: fullName.trim()
      });
      
      setIsCreatingAccount(false); 
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      setErrorText(err.message || 'Error updating name');
    }
  };

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '1.8rem' }}>Courier Notifications</h2>

        {errorText && view !== 'email' && (
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


        {view === 'email' && (
          <form onSubmit={handleEmailSubmit} className="flex-col">
            <h3 style={{ marginBottom: '16px' }}>Sign-in via email</h3>

            <input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorText) setErrorText('');
              }}
              required
              disabled={loading || !connected}
              autoFocus
            />

            <button 
              type="submit" 
              disabled={loading || !connected || !validateEmail(email)} 
              style={{ marginTop: '16px' }}
            >
              {loading ? 'Connecting...' : 'Continue'}
            </button>
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
              <a href="#" style={{ fontSize: '0.9rem' }} onClick={(e) => { 
                e.preventDefault(); 
                setView('email'); 
                setPin(''); 
                setErrorText('');
              }}>
                Use a different email
              </a>
            </div>
          </form>
        )}

        {view === 'name' && (
          <form onSubmit={handleNameSubmit} className="flex-col">
            <h3 style={{ marginBottom: '16px' }}>What should we call you?</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              We'll use this name for your profile and notifications.
            </p>

            <input
              type="text"
              placeholder="Your Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={loading}
              autoFocus
            />

            <button type="submit" disabled={loading || !fullName.trim()} style={{ marginTop: '16px' }}>
              {loading ? 'Saving...' : 'Complete Sign-up'}
            </button>
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
