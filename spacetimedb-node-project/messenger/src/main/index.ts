import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, powerSaveBlocker } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

app.commandLine.appendSwitch('disable-renderer-backgrounding');

let tray: Tray | null = null;
let tickerWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;

function createTickerWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, x: startX } = primaryDisplay.bounds
  const { height, y: offsetY } = primaryDisplay.workArea

  tickerWindow = new BrowserWindow({
    width: width,
    height: 80, // Height of the ticker tape
    x: startX,
    y: offsetY + height - 80, // Position at bottom of screen
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
      backgroundThrottling: false,
    }
  })

  // Makes it click-through so it doesn't interrupt mouse operations
  tickerWindow.setIgnoreMouseEvents(true)
  tickerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  tickerWindow.setAlwaysOnTop(true, 'screen-saver', 1)

  tickerWindow.on('ready-to-show', () => {
    // We don't show the ticker window until there's a message to display
    // tickerWindow?.showInactive()
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

  powerSaveBlocker.start('prevent-app-suspension');

  // Persistent storage for machine ID and Auth Token
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const dataPath = path.join(app.getPath('userData'), 'messengerData.json');

  let messengerData = { id: '', token: '' };
  try {
    if (fs.existsSync(dataPath)) {
      messengerData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    }
  } catch (e) { console.error("Could not load messengerData", e); }

  if (!messengerData.id) {
    messengerData.id = crypto.randomUUID();
    fs.writeFileSync(dataPath, JSON.stringify(messengerData));
  }

  // Handle IPC requests
  ipcMain.handle('get-machine-id', () => messengerData.id);
  ipcMain.handle('get-token', () => messengerData.token);

  ipcMain.on('set-token', (event, token) => {
    // We allow empty string/null to clear the token, only skip if strictly undefined or same as current
    if (token === undefined || token === messengerData.token) return;

    console.log(`[Main] Updating token (length: ${token?.length || 0})`);
    messengerData.token = token || '';
    fs.writeFileSync(dataPath, JSON.stringify(messengerData));

    // Broadcast to other windows
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (win.webContents !== event.sender) {
        win.webContents.send('token-updated', messengerData.token);
      }
    }
  });

  ipcMain.handle('reset-identity', () => {
    if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
    messengerData = { id: crypto.randomUUID(), token: '' };
    fs.writeFileSync(dataPath, JSON.stringify(messengerData));

    // Reload all windows to pick up new anonymous identity
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.reload();
    }
    return messengerData.id;
  });

  ipcMain.on('show-ticker', () => {
    tickerWindow?.showInactive();
  });

  ipcMain.on('hide-ticker', () => {
    tickerWindow?.hide();
  });

  ipcMain.on('update-ticker-position', (_event, position: 'top' | 'bottom') => {
    if (!tickerWindow) return;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, x: startX } = primaryDisplay.bounds;
    const { height, y: offsetY } = primaryDisplay.workArea;
    const windowHeight = 80;
    const y = position === 'top' ? offsetY : offsetY + height - windowHeight;
    tickerWindow.setBounds({ x: startX, y, width, height: windowHeight });
  });

  // App is fundamentally a background tray app, we only show Settings if opened directly on MacOS
  app.on('activate', function () {
    if (!settingsWindow) createSettingsWindow('pairing')
  })
})

// Keep app running in background when settings is closed
app.on('window-all-closed', () => {
  // Do nothing. The Tray keeps it alive.
})
