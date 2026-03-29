import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Download } from 'lucide-react';

export const PWAInstallPrompt: React.FC = () => {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const isDismissed = sessionStorage.getItem('pwa-prompt-dismissed');
      if (!isDismissed) {
        setIsVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-32px)] max-w-md animate-in slide-in-from-bottom-8 duration-500">
      <div className="glass-panel p-5 shadow-2xl flex flex-col gap-4 border-accent-color/20 bg-gradient-to-br from-bg-color/90 to-surface-color/90" style={{ backdropFilter: 'blur(20px)', borderRadius: '24px' }}>
        <div className="flex justify-between items-start">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-color flex items-center justify-center p-0.5 shadow-lg shadow-accent-color/20 overflow-hidden">
               <img src="/assets/icon-192.png" alt="App Icon" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary tracking-tight">{t('pwa.install_title')}</h3>
              <p className="text-sm text-text-secondary leading-relaxed mt-0.5">{t('pwa.install_helper')}</p>
            </div>
          </div>
          <button 
            onClick={handleDismiss} 
            className="text-text-secondary hover:text-text-primary p-1 -mt-1 -mr-1 transition-colors"
            aria-label={t('pwa.dismiss_button')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex gap-3 mt-1">
          <button 
            onClick={handleInstall}
            className="flex-1 bg-accent-color hover:bg-accent-hover text-white py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-accent-color/25 active:scale-95 transition-all"
          >
            <Download size={18} />
            {t('pwa.install_button')}
          </button>
          <button 
            onClick={handleDismiss}
            className="px-4 py-3 rounded-xl border border-surface-border bg-surface-color/50 text-text-primary text-sm font-medium hover:bg-surface-hover transition-all"
          >
             {t('pwa.dismiss_button')}
          </button>
        </div>
      </div>
    </div>
  );
};
