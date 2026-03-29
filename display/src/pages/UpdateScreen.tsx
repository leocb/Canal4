import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UpdateStatus = 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error';

export function UpdateScreen() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatus>('checking');
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  const handleClose = () => {
    window.close();
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

      {status === 'error' && (
        <div style={{ textAlign: 'center', maxWidth: '100%' }}>
          <p style={{ fontSize: '12px', color: '#ff4444', marginBottom: '20px', wordBreak: 'break-all' }}>
            {error && error.includes('updater.') ? t(error) : error || t('updater.error_helper')}
          </p>
          <button
            onClick={handleClose}
            style={{
              padding: '8px 24px',
              backgroundColor: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
              WebkitAppRegion: 'no-drag'
            } as any}
          >
            {t('updater.close')}
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
