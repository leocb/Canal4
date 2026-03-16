import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getMachineId: () => Promise<string>,
      getToken: () => Promise<string>,
      setToken: (token: string) => void,
      resetIdentity: () => Promise<string>,
      onTokenUpdated: (callback: (token: string) => void) => void,
      showTicker: () => void,
      hideTicker: () => void,
    }
  }
}
