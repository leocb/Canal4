import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings/index.ts';
import { ArrowLeft, Trash2, Languages, LogOut } from 'lucide-react';
import { Dropdown } from '../components/Dropdown';
import { useTranslation, Trans } from 'react-i18next';

export const ProfileScreen = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();

  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState('');
  // Language selection options
  const languageOptions = [
    { value: 'en', label: t('languages.en') },
    { value: 'pt-BR', label: t('languages.pt-BR') }
  ];

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
      setErrorText(t('profile.error_confirm_mismatch'));
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
      setErrorText(t(msg));
      setIsSaving(false);
    }
  };

  return (
    <div className="app-container">
      <div className="content-area">
        <div className="screen-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              className="icon-button" 
              onClick={() => navigate(-1)}
              aria-label={t('aria.back')}
            >
              <ArrowLeft size={20} />
            </button>
            <h2>{t('profile.title')}</h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '24px', width: '100%' }}>
          <div className="flex-col" style={{ gap: '16px', textAlign: 'left' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontWeight: 500 }}>{t('profile.name_label')}</span>
              <input
                type="text"
                placeholder={t('profile.name_placeholder')}
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
                {t('common.cancel')}
              </button>
              <button type="submit" style={{ flex: 1 }} disabled={isSaving || !name.trim() || name.trim() === user?.name}>
                {isSaving ? t('profile.saving') : t('profile.save')}
              </button>
            </div>
          </div>
        </form>
        <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            gap: '12px',
            padding: '24px',
            background: 'var(--surface-color)',
            border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <Languages size={18} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('common.language')}</span>
            </div>
            
            <Dropdown
              value={i18n.resolvedLanguage || 'en'}
              onChange={(val: string) => i18n.changeLanguage(val)}
              options={languageOptions}
              disabled={isSaving}
            />
          </div>

          <button
            className="secondary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
            onClick={() => {
              localStorage.removeItem('auth_token');
              window.location.href = '/login';
            }}
          >
            <LogOut size={18} />
            {t('nav.logout')}
          </button>
        </div>

        <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--surface-border)', width: '100%' }}>
          <h3 style={{ color: 'var(--error-color)' }}>{t('profile.danger_zone.title')}</h3>

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
              <Trash2 size={16} /> {t('profile.danger_zone.delete_button')}
            </button>
          ) : (
            <div className="glass-panel" style={{ marginTop: '16px', padding: '16px', borderColor: 'var(--error-color)' }}>
              <p style={{ marginBottom: '12px', fontSize: '0.9rem' }}>
                {t('profile.danger_zone.delete_confirm_text')}
                <br />
                <Trans i18nKey="profile.danger_zone.delete_type_confirm" values={{ name: user?.name }}>
                  To confirm deletion, type your name (<strong>{user?.name}</strong>) below:
                </Trans>
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
                  {t('common.cancel')}
                </button>
                <button
                  className="danger"
                  onClick={handleDeleteAccount}
                  disabled={isSaving || deleteConfirmationName !== user?.name}
                  style={{ flex: 1 }}
                >
                  {t('profile.danger_zone.confirm_delete_button')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
