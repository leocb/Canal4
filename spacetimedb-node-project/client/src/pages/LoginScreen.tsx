import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { reducers, tables } from '../module_bindings/index.ts';
import { useReducer, useTable } from 'spacetimedb/react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';

export const LoginScreen = () => {
  const { t, i18n } = useTranslation();
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
      setErrorText(t(err.message) || t('login.error_request_pin', { defaultValue: 'Error requesting PIN' }));
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
        setErrorText(t('login.error_lockout'));
        return;
      }

      // 3. Check for remaining attempts
      const currentPin = pins.find(p => p.email === normalizedEmail);
      if (currentPin) {
        const remaining = 10 - currentPin.attempts;
        setLoading(false);
        setErrorText(t('login.error_invalid_pin', { remaining }));
      } else {
        // PIN might have been deleted but no lockout found (rare sync issue)
        setLoading(false);
        setErrorText(t('login.error_pin_generic'));
      }
    } catch (err: any) {
      setLoading(false);
      setErrorText(t(err.message) || t('login.error_login'));
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
      setErrorText(t(err.message) || t('login.error_update_name'));
    }
  };

  return (
    <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
        <h2 style={{ marginBottom: '24px', fontSize: '1.8rem' }}>{t('login.title')}</h2>

        {errorText && view !== 'email' && (
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


        {view === 'email' && (
          <form onSubmit={handleEmailSubmit} className="flex-col">
            <h3 style={{ marginBottom: '16px' }}>{t('login.signin_email')}</h3>

            <input
              type="email"
              placeholder={t('login.email_placeholder')}
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
              {loading ? t('login.connecting') : t('login.continue')}
            </button>
          </form>
        )}

        {view === 'pin' && (
          <form onSubmit={handlePinSubmit} className="flex-col">
            <h3 style={{ marginBottom: '8px' }}>{t('login.enter_pin')}</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {t('login.pin_sent', { email: email })}
            </p>


            <input
              type="text"
              placeholder={t('login.pin_placeholder')}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              disabled={loading || !connected}
              autoFocus
              style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '4px' }}
            />

            <button type="submit" disabled={loading || !connected || pin.length < 6} style={{ marginTop: '16px' }}>
              {loading ? t('login.verifying') : t('login.verify_login')}
            </button>

            <div style={{ marginTop: '16px' }}>
              <a href="#" style={{ fontSize: '0.9rem' }} onClick={(e) => { 
                e.preventDefault(); 
                setView('email'); 
                setPin(''); 
                setErrorText('');
              }}>
                {t('login.use_different_email')}
              </a>
            </div>
          </form>
        )}

        {view === 'name' && (
          <form onSubmit={handleNameSubmit} className="flex-col">
            <h3 style={{ marginBottom: '16px' }}>{t('login.name_prompt')}</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {t('login.name_helper')}
            </p>

            <input
              type="text"
              placeholder={t('login.name_placeholder')}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={loading}
              autoFocus
            />

            <button type="submit" disabled={loading || !fullName.trim()} style={{ marginTop: '16px' }}>
              {loading ? t('login.saving') : t('login.complete_signup')}
            </button>
          </form>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
        <button 
          className="secondary" 
          onClick={() => i18n.changeLanguage('en')}
          style={{ padding: '4px 8px', fontSize: '0.8rem', opacity: i18n.language === 'en' ? 1 : 0.5 }}
        >
          EN
        </button>
        <button 
          className="secondary" 
          onClick={() => i18n.changeLanguage('pt-BR')}
          style={{ padding: '4px 8px', fontSize: '0.8rem', opacity: i18n.language === 'pt-BR' ? 1 : 0.5 }}
        >
          PT-BR
        </button>
      </div>

      <div style={{ marginTop: '32px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <a href="https://github.com/leocb" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
          Copyright github.com/leocb
        </a>
      </div>
    </div>
  );
};
