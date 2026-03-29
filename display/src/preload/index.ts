import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  getToken: () => ipcRenderer.invoke('get-token'),
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getFonts: () => ipcRenderer.invoke('get-fonts'),
  setToken: (token: string) => ipcRenderer.send('set-token', token),
  resetIdentity: () => ipcRenderer.invoke('reset-identity'),
  onTokenUpdated: (callback: (token: string) => void) => {
    ipcRenderer.on('token-updated', (_event, token) => callback(token))
  },
  showTicker: () => ipcRenderer.send('show-ticker'),
  hideTicker: () => ipcRenderer.send('hide-ticker'),
  updateTickerPosition: (position: 'top' | 'bottom', displayId?: number, height?: number) => ipcRenderer.send('update-ticker-position', { position, displayId, height }),
  updateTray: (params: { settingsLabel: string; quitLabel: string; tooltip: string }) => ipcRenderer.send('update-tray', params),
  getLoginItemSettings: () => ipcRenderer.invoke('get-login-item-settings'),
  setLoginItemSettings: (openAtLogin: boolean) => ipcRenderer.invoke('set-login-item-settings', openAtLogin),
  onUpdateStatus: (callback: (status: string, version?: string) => void) => {
    ipcRenderer.on('update-status', (_event, status, version) => callback(status, version))
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on('update-progress', (_event, percent) => callback(percent))
  },
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.on('update-error', (_event, error) => callback(error))
  },
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  closeUpdateWindow: () => ipcRenderer.send('close-update-window'),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
