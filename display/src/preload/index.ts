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
