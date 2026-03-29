import { AlertTriangle, UserPlus, LogIn, Loader2, Languages, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { reducers } from '../module_bindings/index.ts';
import { useReducer } from 'spacetimedb/react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { usePasskeys } from '../hooks/usePasskeys';

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
  const { createPasskey, authenticatePasskey, upgradePasskey, lastCredentialId } = usePasskeys();
  const [isGrandfathered, setIsGrandfathered] = useState(false);
  const [grandfatheredName, setGrandfatheredName] = useState<string>('');
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      if (err.message.startsWith('api_errors.grandfathered_passkey')) {
        const parts = err.message.split(':');
        const name = parts.length > 1 ? parts[1] : '';
        setGrandfatheredName(name);
        setIsGrandfathered(true);
        setErrorText(t('api_errors.grandfathered_passkey', { name }));
      } else if (err.message !== 'login.passkey_cancelled') {
        setErrorText(t(err.message) || t('login.error_passkey'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    if (!lastCredentialId) return;
    setErrorText('');
    setSuccessText('');
    setLoading(true);
    try {
      await upgradePasskey(lastCredentialId, grandfatheredName);
      
      // Decoupled: Show Success and reset state
      setIsGrandfathered(false);
      setSuccessText(t('login.upgrade_success'));
      // No automatic login
    } catch (err: any) {
      if (err.message !== 'login.passkey_cancelled') {
        setErrorText(t(err.message) || t('login.error_upgrade'));
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

               {isGrandfathered ? (
                 <button 
                   className="primary-button"
                   onClick={handleUpgrade}
                   disabled={loading || !connected || !lastCredentialId}
                   aria-label={t('login.upgrade_button')}
                   style={{ 
                       display: 'flex', 
                       alignItems: 'center', 
                       justifyContent: 'center', 
                       gap: '12px', 
                       padding: '18px',
                       fontSize: '1.1rem',
                       background: 'var(--success-color)', // Green for success/upgrade
                       border: 'none',
                       boxShadow: '0 4px 15px rgba(20, 200, 20, 0.2)',
                       transition: 'transform 0.2s, box-shadow 0.2s'
                   }}
                 >
                   {loading ? <Loader2 className="animate-spin" size={24} /> : <LogIn size={24} />}
                   {t('login.upgrade_button')}
                 </button>
               ) : (
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
               )}

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
            <div style={{ position: 'relative', minWidth: '160px' }} ref={menuRef}>
              <button
                className="secondary"
                style={{ 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '10px 16px',
                  fontSize: '0.9rem' 
                }}
                onClick={() => setShowMenu(!showMenu)}
                type="button"
                aria-label={t('common.language')}
                aria-expanded={showMenu}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Languages size={18} />
                  <span>{i18n.resolvedLanguage === 'en' ? t('languages.en') : t('languages.pt-BR')}</span>
                </div>
                <ChevronDown size={16} style={{ 
                  transform: showMenu ? 'rotate(180deg)' : 'none', 
                  transition: 'transform 0.2s',
                  opacity: 0.7 
                }} />
              </button>
              
              {showMenu && (
                <div className="dropdown-menu glass-panel" style={{ 
                  position: 'absolute', 
                  bottom: 'calc(100% + 8px)', 
                  left: 0,
                  right: 0,
                  zIndex: 100, 
                  display: 'flex', 
                  flexDirection: 'column' 
                }}>
                  <button
                    className="dropdown-item"
                    style={{
                      color: i18n.resolvedLanguage === 'en' ? 'var(--accent-color)' : 'inherit',
                      fontWeight: i18n.resolvedLanguage === 'en' ? 600 : 400
                    }}
                    onClick={() => { i18n.changeLanguage('en'); setShowMenu(false); }}
                  >
                    {t('languages.en')}
                  </button>
                  <button
                    className="dropdown-item"
                    style={{
                      color: i18n.resolvedLanguage === 'pt-BR' ? 'var(--accent-color)' : 'inherit',
                      fontWeight: i18n.resolvedLanguage === 'pt-BR' ? 600 : 400
                    }}
                    onClick={() => { i18n.changeLanguage('pt-BR'); setShowMenu(false); }}
                  >
                    {t('languages.pt-BR')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: '32px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <a href="https://github.com/leocb" target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
              {t('login.copyright')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
