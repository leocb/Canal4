import { AlertTriangle, UserPlus, LogIn, Loader2, Languages, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { DropdownMenu, DropdownMenuItem } from '../components/DropdownMenu';
import { useNavigate, useLocation } from 'react-router-dom';
import { reducers } from '../module_bindings/index.ts';
import { useReducer } from 'spacetimedb/react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { usePasskeys } from '../hooks/usePasskeys';
import pkg from '../../package.json';

const SUPPORTED_LANGUAGES = ['en', 'pt-BR'] as const;

export const LoginScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = new URLSearchParams(location.search).get('redirect') || '/venues';
  const { user, isLoggedIn, connected, identity } = useAuth();
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [view, setView] = useState<'selection' | 'name'>('selection');
  const [successText, setSuccessText] = useState('');


  const updateUserName = useReducer(reducers.updateUserName);
  const { createPasskey, authenticatePasskey } = usePasskeys();

  // If already logged in and has a name, navigate away
  useEffect(() => {
    if (isLoggedIn && user?.name) {
      navigate(redirect, { replace: true });
    } else if (isLoggedIn && !user?.name) {
      setView('name');
    }
  }, [isLoggedIn, user?.name, navigate, redirect]);

  // Check for WebAuthn support
  useEffect(() => {
    if (!window.PublicKeyCredential) {
      setErrorText(t('login.passkey_not_supported'));
    }
  }, [t]);

  const handleNewUser = async () => {
    setErrorText('');
    setSuccessText('');
    setView('name');
  };

  const handleHaveAccount = async () => {
    setErrorText('');
    setSuccessText('');
    setLoading(true);
    try {
      await authenticatePasskey(identity ?? undefined);
    } catch (err: any) {
      if (err.message !== 'login.passkey_cancelled') {
        setErrorText(t(err.message) || t('login.error_passkey'));
      }
    } finally {
      setLoading(false);
    }
  };


  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setErrorText('');
    setLoading(true);

    try {
      if (isLoggedIn && user) {
        // Already logged in, just updating name (legacy or fallback)
        await updateUserName({
          userId: user.userId,
          newName: fullName.trim()
        });
      } else {
        // New user: create passkey with this name
        await createPasskey(fullName.trim(), identity ?? undefined);
      }
    } catch (err: any) {
      setLoading(false);
      if (err.message !== 'login.passkey_cancelled') {
        setErrorText(t(err.message) || t('login.error_passkey') || t('login.error_update_name'));
      }
    }
  };

  return (
    <div className="app-container">
      <div className="content-area" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', width: '100%', maxWidth: '400px' }}>
          <h2 style={{ marginBottom: '24px', fontSize: '1.8rem' }}>{t('login.title')}</h2>

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
              gap: '12px',
              textAlign: 'left'
            }}>
              <AlertTriangle size={20} style={{ flexShrink: 0 }} />
              <span>{errorText}</span>
            </div>
          )}

          {successText && (
            <div style={{
              color: '#10b981',
              marginBottom: '16px',
              fontSize: '0.9rem',
              padding: '12px',
              background: 'rgba(16,185,129,0.1)',
              borderRadius: '8px',
              border: '1px solid #10b981',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              textAlign: 'left'
            }}>
              <LogIn size={20} style={{ flexShrink: 0 }} />
              <span>{successText}</span>
            </div>
          )}


          {view === 'selection' && (
            <div className="flex-col" style={{ gap: '20px' }}>
              <button
                className="primary-button"
                onClick={handleNewUser}
                disabled={loading || !connected}
                aria-label={t('login.new_here')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  padding: '18px',
                  fontSize: '1.1rem',
                  background: 'linear-gradient(135deg, var(--accent-color) 0%, #7e57c2 100%)',
                  border: 'none',
                  boxShadow: '0 4px 15px rgba(100, 100, 255, 0.2)',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(100, 100, 255, 0.3)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(100, 100, 255, 0.2)'; }}
              >
                {loading ? <Loader2 className="animate-spin" size={24} /> : <UserPlus size={24} />}
                {t('login.new_here')}
              </button>

              <button
                className="secondary-button"
                onClick={handleHaveAccount}
                disabled={loading || !connected}
                aria-label={t('login.have_account')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  padding: '18px',
                  fontSize: '1.1rem',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(10px)',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              >
                {loading ? <Loader2 className="animate-spin" size={24} /> : <LogIn size={24} />}
                {t('login.have_account')}
              </button>

              {!connected && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '8px' }}>
                  <Loader2 className="animate-spin" size={16} />
                  {t('common.connecting')}
                </div>
              )}
            </div>
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
                maxLength={64}
                disabled={loading}
                autoFocus
              />

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                {!isLoggedIn && (
                  <button
                    type="button"
                    className="secondary"
                    style={{ flex: 1 }}
                    onClick={() => setView('selection')}
                    disabled={loading}
                  >
                    {t('common.cancel')}
                  </button>
                )}
                <button type="submit" disabled={loading || !fullName.trim()} style={{ flex: 1 }}>
                  {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Loader2 className="animate-spin" size={18} /> {t('login.saving')}
                    </div>
                  ) : t('login.complete_signup')}
                </button>
              </div>

            </form>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
            <DropdownMenu
              minWidth="160px"
              trigger={
                <button
                  className="dropdown-trigger dropdown-trigger-small"
                  type="button"
                  aria-label={t('common.language')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Languages size={18} />
                    <span>{t(`languages.${i18n.resolvedLanguage}`)}</span>
                  </div>
                  <ChevronDown size={16} />
                </button>
              }
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang}
                  selected={i18n.resolvedLanguage === lang}
                  onClick={() => i18n.changeLanguage(lang)}
                >
                  {t(`languages.${lang}`)}
                </DropdownMenuItem>
              ))}
            </DropdownMenu>
          </div>

          <div style={{ marginTop: '32px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <div style={{ marginBottom: '4px', opacity: 0.6 }}>
              {t('common.version', { version: pkg.version })}
            </div>
            <a href="https://github.com/leocb" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
              {t('login.copyright')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
