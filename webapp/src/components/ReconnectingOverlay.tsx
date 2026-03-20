import React from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, RefreshCw } from 'lucide-react';

interface ReconnectingOverlayProps {
  nextRetryIn: number;
  isInitialLoad?: boolean;
  onRetryNow?: () => void;
  error?: string;
}

const ReconnectingOverlay: React.FC<ReconnectingOverlayProps> = ({ 
  nextRetryIn, 
  isInitialLoad = false,
  onRetryNow,
  error
}) => {
  const { t } = useTranslation();

  // On first load, we don't show the countdown or retry button to keep the UX clean
  const showRetryInfo = !isInitialLoad && nextRetryIn > 0;

  return (
    <div className="reconnecting-overlay">
      <div className="overlay-content">
        <div className="status-visual">
          <div className="spinner-outer">
            <div className="spinner-inner" />
          </div>
          <Wifi className="status-icon" size={32} />
        </div>
        
        <h2>
          {isInitialLoad 
            ? t('common.connecting') 
            : t('common.reconnecting_title')}
        </h2>
        
        <p className="helper-text">
          {error ? t('common.error_network') : (isInitialLoad ? t('login.loading') : t('common.reconnecting_helper'))}
        </p>

        {showRetryInfo && (
          <div className="retry-status">
            <span className="retry-text">
               {t('common.retrying_in')} {nextRetryIn}s
            </span>
          </div>
        )}

        {showRetryInfo && onRetryNow && (
          <button 
            className="retry-button"
            onClick={onRetryNow}
          >
            <RefreshCw size={14} />
            {t('common.try_now')}
          </button>
        )}
      </div>

      <style>{`
        .reconnecting-overlay {
          position: fixed;
          inset: 0;
          background-color: var(--bg-color, #0B0E14);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          backdrop-filter: blur(10px);
        }

        .overlay-content {
          text-align: center;
          padding: 2.5rem;
          max-width: 400px;
          animation: overlay-fade-in 0.4s ease-out;
        }

        .status-visual {
          position: relative;
          width: 80px;
          height: 80px;
          margin: 0 auto 2.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .status-icon {
          color: var(--accent-color, #3B82F6);
          position: relative;
          z-index: 2;
          animation: wifi-pulse 2s infinite ease-in-out;
        }

        .spinner-outer {
          position: absolute;
          inset: 0;
          border: 3px solid rgba(255, 255, 255, 0.05);
          border-top-color: var(--accent-color, #3B82F6);
          border-radius: 50%;
          animation: spin 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        .spinner-inner {
          position: absolute;
          inset: 8px;
          border: 2px solid transparent;
          border-bottom-color: var(--accent-color, #3B82F6);
          opacity: 0.3;
          border-radius: 50%;
          animation: spin 2.4s reverse linear infinite;
        }

        h2 {
          font-size: 1.25rem;
          margin-bottom: 0.75rem;
          color: var(--text-primary, #F8FAFC);
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .helper-text {
          color: var(--text-secondary, #94A3B8);
          font-size: 0.95rem;
          margin-bottom: 2rem;
          line-height: 1.5;
        }

        .retry-text {
          font-size: 0.85rem;
          color: var(--text-secondary, #64748B);
          font-weight: 500;
          letter-spacing: 0.02em;
        }

        .retry-button {
          margin-top: 2rem;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-primary, #F8FAFC);
          border: 1px solid var(--surface-border, rgba(255, 255, 255, 0.1));
          padding: 0.6rem 1.25rem;
          border-radius: 20px;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          font-size: 0.85rem;
          font-weight: 500;
        }

        .retry-button:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        @keyframes wifi-pulse {
          0% { opacity: 0.5; transform: scale(0.92); }
          50% { opacity: 1; transform: scale(1); }
          100% { opacity: 0.5; transform: scale(0.92); }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes overlay-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default ReconnectingOverlay;
