/// <reference types="vite/client" />

interface Window {
  electron: import('@electron-toolkit/preload').ElectronAPI
  api: {
    getMachineId: () => Promise<string>,
    getToken: () => Promise<string>,
    getDisplays: () => Promise<{ id: number; name: string }[]>,
    setToken: (token: string) => void,
    resetIdentity: () => Promise<string>,
    onTokenUpdated: (callback: (token: string) => void) => void,
    showTicker: () => void,
    hideTicker: () => void,
    updateTickerPosition: (position: 'top' | 'bottom', displayId?: number) => void,
    updateTray: (params: { settingsLabel: string; quitLabel: string; tooltip: string }) => void,
  }
}
declare module '*?asset' {
  const content: string
  export default content
}
