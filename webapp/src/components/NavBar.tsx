import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, LogOut, Languages, Pencil } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';

const NavBar = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [showLangMenu, setShowLangMenu] = useState(false);

  if (location.pathname === '/login') {
    return null;
  }

  const toggleLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    setShowLangMenu(false);
  };

  return (
    <nav className="nav-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        <div 
          style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Bell size={18} color="white" />
        </div>
        <span style={{ fontWeight: 600, fontSize: '1.1rem', cursor: 'pointer' }} onClick={() => navigate('/')}>
          {t('app.name')}
        </span>
      </div>
      
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <button 
            className="secondary ghost"
            style={{ padding: '8px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setShowLangMenu(!showLangMenu)}
            title={t('common.language')}
          >
            <Languages size={18} />
          </button>

          {showLangMenu && (
            <>
              <div 
                style={{ position: 'fixed', inset: 0, zIndex: 999 }} 
                onClick={() => setShowLangMenu(false)} 
              />
              <div className="glass-panel" style={{ 
                position: 'absolute', 
                top: '100%', 
                right: 0, 
                marginTop: '8px', 
                minWidth: '160px', 
                zIndex: 1000,
                padding: '4px',
                borderRadius: '10px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
              }}>
                <button 
                  className="dropdown-item" 
                  style={{ 
                    width: '100%', 
                    textAlign: 'left', 
                    padding: '8px 12px', 
                    borderRadius: '6px',
                    background: i18n.language === 'en' ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: i18n.language === 'en' ? 'var(--accent-color)' : 'inherit'
                  }}
                  onClick={() => toggleLanguage('en')}
                >
                  {t('languages.en')}
                </button>
                <button 
                  className="dropdown-item" 
                  style={{ 
                    width: '100%', 
                    textAlign: 'left', 
                    padding: '8px 12px', 
                    borderRadius: '6px',
                    background: i18n.language === 'pt-BR' ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: i18n.language === 'pt-BR' ? 'var(--accent-color)' : 'inherit'
                  }}
                  onClick={() => toggleLanguage('pt-BR')}
                >
                  {t('languages.pt-BR')}
                </button>
              </div>
            </>
          )}
        </div>

        {user && (
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '4px 8px', borderRadius: '8px' }} 
            className="hover-bg"
            onClick={() => navigate('/profile')}
            title={t('nav.profile')}
          >
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {user.name}
            </span>
            <Pencil size={14} color="var(--text-secondary)" />
          </div>
        )}
        <button className="secondary" style={{ padding: '8px 12px' }} onClick={() => {
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }}>
          <LogOut size={16} />
          <span style={{ fontSize: '0.9rem' }}>{t('nav.logout')}</span>
        </button>
      </div>
    </nav>
  );
};

export default NavBar;
