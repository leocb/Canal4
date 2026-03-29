import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UpdateStatus = 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error' | 'macos-manual';

export function UpdateScreen() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatus>('checking');
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  useEffect(() => {
    if (!window.api) return;

    window.api.onUpdateStatus((newStatus, newVersion) => {
      setStatus(newStatus as UpdateStatus);
      if (newVersion) setVersion(newVersion);
      if (newStatus === 'available') setStatus('downloading');
    });

    window.api.onUpdateProgress((percent) => {
      setStatus('downloading');
      setProgress(percent);
    });

    window.api.onUpdateError((err) => {
      setStatus('error');
      setError(err);
    });

    // Show cancel button if things take too long
    const timer = setTimeout(() => {
      setShowCancel(true);
    }, 8000);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    if (window.api?.closeUpdateWindow) {
      window.api.closeUpdateWindow();
    } else {
      window.close();
    }
  };

  const handleGithub = () => {
    if (window.api?.openExternal) {
      window.api.openExternal('https://github.com/leocb/Canal4/releases');
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '40px',
      boxSizing: 'border-box',
      border: '1px solid #333',
      borderRadius: '8px',
      userSelect: 'none',
      WebkitAppRegion: 'drag'
    } as any}>
      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 8px 0', opacity: 0.9 }}>
          {t('updater.title')}
        </h1>
        <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>
          {status === 'checking' && t('updater.checking')}
          {status === 'downloading' && t('updater.downloading')}
          {status === 'available' && t('updater.available', { version })}
          {status === 'ready' && t('updater.ready')}
          {status === 'up-to-date' && t('updater.up_to_date')}
          {status === 'error' && t('updater.error')}
          {status === 'macos-manual' && t('updater.macos_notice')}
        </p>
      </div>

      {(status === 'downloading' || status === 'ready') && (
        <div style={{ width: '100%', maxWidth: '300px' }}>
          <div style={{
            height: '4px',
            width: '100%',
            backgroundColor: '#222',
            borderRadius: '2px',
            overflow: 'hidden',
            marginBottom: '8px'
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              backgroundColor: '#fff',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '11px', color: '#666', textAlign: 'right' }}>
            {Math.round(progress)}%
          </div>
        </div>
      )}

      {status === 'macos-manual' && (
        <div style={{ display: 'flex', gap: '12px', WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={handleGithub}
            style={{
              padding: '10px 24px',
              backgroundColor: '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            } as any}
          >
            {t('updater.github_button')}
          </button>
          <button
            onClick={handleClose}
            style={{
              padding: '10px 24px',
              backgroundColor: 'transparent',
              color: '#999',
              border: '1px solid #444',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
            } as any}
          >
            {t('updater.skip_button')}
          </button>
        </div>
      )}

      {(status === 'error' || (showCancel && status !== 'ready' && status !== 'up-to-date')) && status !== 'macos-manual' && (
        <div style={{ textAlign: 'center', maxWidth: '100%', WebkitAppRegion: 'no-drag' } as any}>
          {status === 'error' && (
            <p style={{ fontSize: '12px', color: '#ff4444', marginBottom: '20px', wordBreak: 'break-all' }}>
              {error && error.includes('updater.') ? t(error) : error || t('updater.error_helper')}
            </p>
          )}
          <button
            onClick={handleClose}
            style={{
              padding: '8px 24px',
              backgroundColor: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            } as any}
          >
            {status === 'error' ? t('updater.close') : t('common.cancel')}
          </button>
        </div>
      )}

      {status === 'up-to-date' && (
        <div style={{ marginTop: '16px' }}>
           <div style={{ color: '#44ff44', fontSize: '24px' }}>✓</div>
        </div>
      )}
    </div>
  );
}
