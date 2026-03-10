import { useNavigate, useLocation } from 'react-router-dom';
import { Bell, LogOut } from 'lucide-react';

const NavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();

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
          Courier
        </span>
      </div>
      
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <button className="secondary" style={{ padding: '8px 12px' }} onClick={() => {
          localStorage.removeItem('auth_token');
          window.location.href = '/login';
        }}>
          <LogOut size={16} />
          <span style={{ fontSize: '0.9rem' }}>Logout</span>
        </button>
      </div>
    </nav>
  );
};

export default NavBar;
