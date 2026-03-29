import { useNavigate, useLocation } from 'react-router-dom';
import { Pencil } from 'lucide-react';
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
          style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 0 18px rgba(255, 255, 255, 0.25)' }}
        >
          <img src="/assets/icon-192.png" alt="Canal4 Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <span style={{ fontWeight: 600, fontSize: '1.2rem', cursor: 'pointer', letterSpacing: '-0.02em' }} onClick={() => navigate('/')}>
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
            role="button"
            aria-label={t('nav.profile')}
          >
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {user.name}
            </span>
            <Pencil size={14} color="var(--text-secondary)" />
          </div>
        )}
      </div>

    </nav>
  );
};

export default NavBar;
