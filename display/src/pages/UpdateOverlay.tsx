import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UpdateStatus = 'checking' | 'available' | 'downloading' | 'ready' | 'up-to-date' | 'error' | 'macos-manual' | null;

export function UpdateOverlay() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatus>(null);
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.api) return;

    const onStatus = (newStatus: string, newVersion?: string) => {
      const s = newStatus as UpdateStatus;
      setStatus(s);
      if (newVersion) setVersion(newVersion);
      if (s === 'downloading' || s === 'checking' || s === 'ready' || s === 'up-to-date' || s === 'available') {
        setError(null);
      }
    };

    const onProgress = (percent: number) => {
      setStatus('downloading');
      setProgress(percent);
    };

    const onError = (err: string) => {
      setStatus('error');
      setError(err);
    };

    window.api.onUpdateStatus(onStatus);
    window.api.onUpdateProgress(onProgress);
    window.api.onUpdateError(onError);

    return () => {
      // No cleanup needed — listeners are on the ipcRenderer, not global
    };
  }, []);

  // Auto-dismiss overlays for transient states
  useEffect(() => {
    if (status === 'up-to-date') {
      const t = setTimeout(() => { setStatus(null); }, 3000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status]);

  const dismiss = () => setStatus(null);

  if (!status) return null;

  const handleGithub = () => {
    if (window.api?.openExternal) {
      window.api.openExternal('https://github.com/leocb/Canal4/releases');
    }
  };

  const statusText = () => {
    switch (status) {
      case 'checking': return t('updater.checking');
      case 'downloading': return t('updater.downloading');
      case 'available': return t('updater.available', { version });
      case 'ready': return t('updater.ready');
      case 'up-to-date': return t('updater.up_to_date');
      case 'error': return t('updater.error');
      case 'macos-manual': return t('updater.macos_notice');
      default: return '';
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 16px',
      fontSize: '0.82rem',
      fontWeight: 500,
      background: status === 'error'
        ? 'rgba(239,68,68,0.15)'
        : status === 'up-to-date'
          ? 'rgba(16,185,129,0.12)'
          : status === 'ready'
            ? 'rgba(59,130,246,0.15)'
            : 'rgba(30,41,59,0.95)',
      borderBottom: '1px solid ' + (
        status === 'error' ? 'rgba(239,68,68,0.3)' :
        status === 'ready' ? 'rgba(59,130,246,0.3)' :
        status === 'up-to-date' ? 'rgba(16,185,129,0.3)' :
        'rgba(255,255,255,0.08)'
      ),
      color: status === 'error' ? '#FCA5A5' : status === 'up-to-date' ? '#6EE7B7' : '#E2E8F0',
    }}>
      {/* Status indicator */}
      {status === 'downloading' && (
        <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'update-spin 0.8s linear infinite', flexShrink: 0 }} />
      )}
      {status === 'checking' && (
        <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#fff', animation: 'update-spin 0.8s linear infinite', flexShrink: 0 }} />
      )}
      {status === 'ready' && (
        <span style={{ flexShrink: 0 }}>&#x2713;</span>
      )}
      {status === 'up-to-date' && (
        <span style={{ flexShrink: 0 }}>&#x2713;</span>
      )}
      {status === 'error' && (
        <span style={{ flexShrink: 0, color: '#EF4444' }}>&#x26A0;</span>
      )}
      {status === 'macos-manual' && (
        <span style={{ flexShrink: 0 }}>&#x2197;</span>
      )}

      {/* Status text */}
      <span style={{ flex: 1 }}>{statusText()}</span>

      {/* Progress bar for downloading */}
      {status === 'downloading' && (
        <div style={{
          width: '100px',
          height: '4px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          <div style={{
            height: '100%',
            width: Math.round(progress) + '%',
            background: '#3B82F6',
            borderRadius: '2px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      )}

      {/* macOS manual download button */}
      {status === 'macos-manual' && (
        <button
          onClick={handleGithub}
          style={{
            padding: '4px 12px',
            background: '#3B82F6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {t('updater.github_button')}
        </button>
      )}

      {/* Error message */}
      {status === 'error' && error && (
        <span style={{ fontSize: '0.75rem', color: '#EF4444', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {error.includes('updater.') ? t(error) : error}
        </span>
      )}

      {/* Dismiss button */}
      {(status === 'error' || status === 'up-to-date' || status === 'macos-manual') && (
        <button
          onClick={dismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: '4px',
            opacity: 0.6,
            fontSize: '1rem',
            flexShrink: 0,
          }}
        >
          &times;
        </button>
      )}

      <style>{`@keyframes update-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
