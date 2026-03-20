import React from 'react';
import type { ConnectivityStatus } from '../hooks/useConnectivity';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StatusBadgeProps {
  status: ConnectivityStatus;
}

const ConnectivityStatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const { t } = useTranslation();

  const getStatusColor = () => {
    switch (status) {
      case 'online':
        return '#10B981'; // Green
      case 'unstable':
        return '#F59E0B'; // Yellow
      case 'offline':
        return '#EF4444'; // Red
      default:
        return '#64748B'; // Gray
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'online':
        return <Wifi size={14} />;
      case 'unstable':
        return <AlertCircle size={14} />;
      case 'offline':
        return <WifiOff size={14} />;
      default:
        return <WifiOff size={14} />;
    }
  };

  const statusLabel: Record<string, string> = {
      online: t('common.status_online'),
      unstable: t('common.status_unstable'),
      offline: t('common.status_offline')
  };

  return (
    <div 
      className="connectivity-badge"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '0.75rem',
        fontWeight: 600,
        backgroundColor: `${getStatusColor()}20`, // 12% opacity
        color: getStatusColor(),
        border: `1px solid ${getStatusColor()}40`,
        transition: 'all 0.3s ease',
        cursor: 'default',
        userSelect: 'none'
      }}
    >
      <span style={{ display: 'flex' }}>
          {getStatusIcon()}
      </span>
      <span>{statusLabel[status]}</span>
    </div>
  );
};

export default ConnectivityStatusBadge;
