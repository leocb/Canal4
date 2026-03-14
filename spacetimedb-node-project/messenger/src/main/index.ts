import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } from 'electron'
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
      sandbox: false,
      webSecurity: !is.dev,
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

function createSettingsWindow(tab: 'logs' | 'settings' | 'pairing' = 'pairing'): void {
  const url = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/#/settings/${tab}`
    : `file://${join(__dirname, '../renderer/index.html')}#/settings/${tab}`;

  if (settingsWindow) {
    settingsWindow.loadURL(url)
    settingsWindow.focus()
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 800,
    height: 800,
    show: false,
    title: "Courier Node Settings",
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: !is.dev,
    }
  })

  settingsWindow.on('ready-to-show', () => {
    settingsWindow?.show()
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  })

  settingsWindow.loadURL(url)
}

function createTray() {
  // On macOS, tray icons must be small template images (16x16 or 22x22)
  let trayIcon = nativeImage.createFromPath(icon)
  if (process.platform === 'darwin') {
    trayIcon = trayIcon.resize({ width: 16, height: 16 })
    trayIcon.setTemplateImage(true)
  }

  tray = new Tray(trayIcon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Log', click: () => createSettingsWindow('logs') },
    { label: 'Settings', click: () => createSettingsWindow('settings') },
    { type: 'separator' },
    { label: 'Quit Courier', click: () => { app.quit() } }
  ])
  tray.setToolTip('Courier Notifications')
  tray.setContextMenu(contextMenu)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.courier.messenger')

  // Hide from macOS Dock — this is a background tray-only app
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

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
    if (!settingsWindow) createSettingsWindow('pairing')
  })
})

// Keep app running in background when settings is closed
app.on('window-all-closed', () => {
  // Do nothing. The Tray keeps it alive.
})
