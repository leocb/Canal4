/// <reference types="vite/client" />

interface Window {
  electron: import('@electron-toolkit/preload').ElectronAPI
  api: {
    getMachineId: () => Promise<string>,
    getToken: () => Promise<string>,
    getDisplays: () => Promise<{ id: number; name: string }[]>,
    getFonts: () => Promise<string[]>,
    setToken: (token: string) => void,
    resetIdentity: () => Promise<string>,
    onTokenUpdated: (callback: (token: string) => void) => void,
    showTicker: () => void,
    hideTicker: () => void,
    updateTickerPosition: (position: 'top' | 'bottom', displayId?: number, height?: number) => void,
    updateTray: (params: { settingsLabel: string; quitLabel: string; tooltip: string }) => void,
    getLoginItemSettings: () => Promise<boolean>,
    setLoginItemSettings: (openAtLogin: boolean) => Promise<boolean>,
    onUpdateStatus: (callback: (status: string, version?: string) => void) => void,
    onUpdateProgress: (callback: (percent: number) => void) => void,
    onUpdateError: (callback: (error: string) => void) => void,
    openExternal: (url: string) => void,
    closeUpdateWindow: () => void,
    flushStorage: () => void,
  }
}
declare module '*?asset' {
  const content: string
  export default content
}
