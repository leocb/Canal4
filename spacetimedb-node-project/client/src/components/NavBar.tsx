import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, LogOut, Pencil } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from 'react-i18next';

const NavBar = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  if (location.pathname === '/login') {
    return null;
  }

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
