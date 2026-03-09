import { app, BrowserWindow, Tray, Menu, screen, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let tray: Tray | null = null;
let tickerWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

function createTickerWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  tickerWindow = new BrowserWindow({
    width: width,
    height: 80, // Height of the ticker tape
    x: 0,
    y: height - 80, // Position at bottom of screen
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // Don't steal focus from user
    type: 'toolbar', // Helps with alwaysOnTop on OS X
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Makes it click-through so it doesn't interrupt mouse operations
  tickerWindow.setIgnoreMouseEvents(true)
  tickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  tickerWindow.setAlwaysOnTop(true, 'screen-saver', 1)

  tickerWindow.on('ready-to-show', () => {
    tickerWindow?.showInactive()
  })

  const url = is.dev && process.env['ELECTRON_RENDERER_URL'] 
    ? `${process.env['ELECTRON_RENDERER_URL']}/#/ticker`
    : `file://${join(__dirname, '../renderer/index.html')}#/ticker`;
    
  tickerWindow.loadURL(url)
}

function createSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus()
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 800,
    show: false,
    title: "Courier Node Settings",
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  })

  const url = is.dev && process.env['ELECTRON_RENDERER_URL'] 
    ? `${process.env['ELECTRON_RENDERER_URL']}/#/settings`
    : `file://${join(__dirname, '../renderer/index.html')}#/settings`;

  settingsWindow.loadURL(url)
}

function createTray() {
  // TODO: Add a proper tray icon png into resources
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Settings & Logs', click: createSettingsWindow },
    { type: 'separator' },
    { label: 'Quit Courier', click: () => { app.quit() } }
  ])
  tray.setToolTip('Courier Notifications')
  tray.setContextMenu(contextMenu)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.courier.messenger')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createTray()
  createTickerWindow()

  // Handle IPC requests
  ipcMain.handle('get-machine-id', async () => {
    // We would normally establish an electron-store or similar persistent file. For rapid proto, we use electron's app.getPath
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    
    const storePath = path.join(app.getPath('userData'), 'machineId.json');
    if (fs.existsSync(storePath)) {
        return JSON.parse(fs.readFileSync(storePath, 'utf-8')).id;
    } else {
        const id = crypto.randomUUID();
        fs.writeFileSync(storePath, JSON.stringify({ id }));
        return id;
    }
  })

  // App is fundamentally a background tray app, we only show Settings if opened directly on MacOS
  app.on('activate', function () {
    if (!settingsWindow) createSettingsWindow()
  })
})

// Keep app running in background when settings is closed
app.on('window-all-closed', () => {
  // Do nothing. The Tray keeps it alive.
})
