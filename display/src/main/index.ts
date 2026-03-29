import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, powerSaveBlocker } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setName('Canal4');

let tray: Tray | null = null;
let tickerWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let updateWindow: BrowserWindow | null = null;
let updateCheckTimer: ReturnType<typeof setInterval> | null = null;

// ─── Auto-Updater ─────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;          // We control when to download
autoUpdater.autoInstallOnAppQuit = false;  // We control when to install
autoUpdater.logger = null;                 // Suppress built-in file logging

/**
 * Trigger an update check. If an update is available it downloads and then
 * calls quitAndInstall(true, true) so the OS relaunches into the new version.
 * Always resolves (never rejects) — callers can safely await it.
 */
function createUpdateWindow(): Promise<void> {
  const url = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/#/update`
    : `file://${join(__dirname, '../renderer/index.html')}#/update`;

  if (updateWindow) {
    updateWindow.loadURL(url)
    updateWindow.focus()
    return Promise.resolve();
  }

  updateWindow = new BrowserWindow({
    width: 450,
    height: 300,
    show: false,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: !is.dev,
    }
  })

  return new Promise((resolve) => {
    updateWindow?.on('ready-to-show', () => {
      updateWindow?.show()
    })

    updateWindow?.webContents.once('dom-ready', () => {
      resolve();
    })

    updateWindow?.on('closed', () => {
      updateWindow = null;
    })

    updateWindow?.loadURL(url)
  });
}

/**
 * Trigger an update check. If an update is available it downloads and then
 * calls quitAndInstall(true, true) so the OS relaunches into the new version.
 */
async function triggerUpdateCheckAndInstall(isManual = false): Promise<void> {
  if (is.dev) {
    console.log('[Updater] Skipping update check in dev mode.');
    return;
  }

  if (!updateWindow && !isManual) {
    await createUpdateWindow();
  }

  return new Promise((resolve) => {

    let settled = false;
    const settle = () => { if (!settled) { settled = true; resolve(); } };

    const onNotAvailable = () => {
      console.log('[Updater] App is up-to-date.');
      updateWindow?.webContents.send('update-status', 'up-to-date');
      setTimeout(() => {
        cleanup();
        updateWindow?.close();
        settle();
      }, 1500);
    };

    const onAvailable = async (info: { version: string }) => {
      console.log(`[Updater] Update available: v${info.version} — downloading…`);
      if (!updateWindow) {
        await createUpdateWindow();
      }
      updateWindow?.webContents.send('update-status', 'available', info.version);
      autoUpdater.downloadUpdate().catch((e) => {
        console.error('[Updater] Download failed:', e.message);
        updateWindow?.webContents.send('update-error', e.message);
        cleanup();
        // Don't settle immediately if there's an error so user can see it
      });
    };

    const onProgress = (progressObj: any) => {
      updateWindow?.webContents.send('update-progress', progressObj.percent);
    };

    const onDownloaded = (info: { version: string }) => {
      console.log(`[Updater] Update v${info.version} downloaded — relaunching now.`);
      updateWindow?.webContents.send('update-status', 'ready');
      cleanup();
      // Wait a bit so the user can see it's ready
      setTimeout(() => {
        autoUpdater.quitAndInstall(false, true);
      }, 2000);
    };

    const onError = (err: Error) => {
      console.error('[Updater] Update check error:', err.message);
      updateWindow?.webContents.send('update-error', err.message);
      cleanup();
      // settle() is not called here to keep the window open for the user
    };

    const cleanup = () => {
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('download-progress', onProgress);
      autoUpdater.removeListener('update-downloaded', onDownloaded);
      autoUpdater.removeListener('error', onError);
    };

    autoUpdater.on('update-not-available', onNotAvailable);
    autoUpdater.on('update-available', onAvailable);
    autoUpdater.on('download-progress', onProgress);
    autoUpdater.on('update-downloaded', onDownloaded);
    autoUpdater.on('error', onError);

    autoUpdater.checkForUpdates().catch((e) => {
      console.error('[Updater] checkForUpdates failed:', e.message);
      updateWindow?.webContents.send('update-error', e.message);
      cleanup();
    });
  });
}

/**
 * Startup check — awaited before any UI is created.
 * A 20-second timeout ensures a slow/offline network never blocks the app.
 */
async function checkForUpdateBeforeLaunch(): Promise<void> {
  if (is.dev) return;

  console.log('[Updater] Checking for update before launch…');
  const timeout = new Promise<void>((resolve) =>
    setTimeout(() => {
      console.log('[Updater] Update check timed out — proceeding with launch.');
      resolve();
    }, 20_000)
  );

  await Promise.race([triggerUpdateCheckAndInstall(), timeout]);
}

/**
 * Schedule a periodic check every 12 hours.
 * If an update is found it downloads and the app relaunches automatically.
 */
function schedulePeriodicUpdateCheck(): void {
  if (is.dev) return;

  updateCheckTimer = setInterval(() => {
    console.log('[Updater] Scheduled 12-hour update check…');
    // triggerUpdateCheckAndInstall(true) means it will only open the window if an update is available
    triggerUpdateCheckAndInstall(true);
  }, 12 * 60 * 60 * 1_000);
}

// ─── Windows ──────────────────────────────────────────────────────────────────

function createTickerWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, x: startX } = primaryDisplay.bounds
  const { height, y: offsetY } = primaryDisplay.workArea

  tickerWindow = new BrowserWindow({
    width: width,
    height: 80, // Height of the ticker tape
    x: startX,
    y: offsetY + height - 80, // Position at bottom of screen
    show: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // Don't steal focus from user
    type: 'panel',
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
    title: "Canal4 Display node Settings",
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
  const menuItems: any[] = [
    { label: 'Settings', click: () => createSettingsWindow('settings') },
    { type: 'separator' }
  ];

  if (is.dev) {
    menuItems.push({ label: 'DEBUG: Simulate Update (Success)', click: () => simulateUpdateFlow() });
    menuItems.push({ label: 'DEBUG: Simulate Update (Error)', click: () => simulateUpdateErrorFlow() });
    menuItems.push({ type: 'separator' });
  }

  menuItems.push({ label: 'Quit Canal4', click: () => { app.quit() } });

  const contextMenu = Menu.buildFromTemplate(menuItems)
  tray.setToolTip('Canal4 Display node')
  tray.setContextMenu(contextMenu)
}

ipcMain.on('update-tray', (_event, { settingsLabel, quitLabel, tooltip }) => {
  if (!tray) return;

  const menuItems: any[] = [
    { label: settingsLabel, click: () => createSettingsWindow('settings') },
    { type: 'separator' }
  ];

  if (is.dev) {
    menuItems.push({ label: 'DEBUG: Simulate Update (Success)', click: () => simulateUpdateFlow() });
    menuItems.push({ label: 'DEBUG: Simulate Update (Error)', click: () => simulateUpdateErrorFlow() });
    menuItems.push({ type: 'separator' });
  }

  menuItems.push({ label: quitLabel, click: () => { app.quit() } });

  const contextMenu = Menu.buildFromTemplate(menuItems)
  tray.setToolTip(tooltip)
  tray.setContextMenu(contextMenu)
});

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('org.canal4.displaynode')

  // Hide from macOS Dock — this is a background tray-only app
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Check for update before showing any UI — relaunch automatically if one is found
  await checkForUpdateBeforeLaunch();

  createTray()
  createTickerWindow()
  schedulePeriodicUpdateCheck()

  powerSaveBlocker.start('prevent-app-suspension');

  // Persistent storage for machine ID and Auth Token
  const fs = require('fs');
  const path = require('path');
  const crypto = require('crypto');
  const dataPath = path.join(app.getPath('userData'), 'displayData.json');

  let displayData = { id: '', token: '' };
  try {
    if (fs.existsSync(dataPath)) {
      displayData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    }
  } catch (e) { console.error("Could not load displayData", e); }

  if (!displayData.id) {
    displayData.id = crypto.randomUUID();
    fs.writeFileSync(dataPath, JSON.stringify(displayData));
  }

  // Handle IPC requests
  ipcMain.handle('get-machine-id', () => displayData.id);
  ipcMain.handle('get-token', () => displayData.token);
  ipcMain.handle('get-displays', () => {
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      name: d.label
    }));
  });

  ipcMain.handle('get-fonts', async () => {
    const fontList = require('font-list');
    try {
      const fonts = await fontList.getFonts({ disableQuoting: true });
      return fonts;
    } catch (err) {
      console.error('Failed to get fonts:', err);
      return [];
    }
  });

  ipcMain.on('set-token', (event, token) => {
    // We allow empty string/null to clear the token, only skip if strictly undefined or same as current
    if (token === undefined || token === displayData.token) return;

    console.log(`[Main] Updating token (length: ${token?.length || 0})`);
    displayData.token = token || '';
    fs.writeFileSync(dataPath, JSON.stringify(displayData));

    // Broadcast to other windows
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (win.webContents !== event.sender) {
        win.webContents.send('token-updated', displayData.token);
      }
    }
  });

  ipcMain.handle('reset-identity', () => {
    if (fs.existsSync(dataPath)) fs.unlinkSync(dataPath);
    displayData = { id: crypto.randomUUID(), token: '' };
    fs.writeFileSync(dataPath, JSON.stringify(displayData));

    // Reload all windows to pick up new anonymous identity
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.reload();
    }
    return displayData.id;
  });

  ipcMain.on('show-ticker', () => {
    tickerWindow?.showInactive();
  });

  ipcMain.on('hide-ticker', () => {
    tickerWindow?.hide();
  });

  ipcMain.on('update-ticker-position', (_event, params: { position: 'top' | 'bottom', displayId?: number, height?: number }) => {
    if (!tickerWindow) return;
    const displays = screen.getAllDisplays();
    const targetDisplay = displays.find(d => d.id === params.displayId) || screen.getPrimaryDisplay();
    const { width, x: startX } = targetDisplay.bounds;
    const { height, y: offsetY } = targetDisplay.workArea;
    const windowHeight = params.height || 80;
    const y = params.position === 'top' ? offsetY : offsetY + height - windowHeight;
    tickerWindow.setBounds({ x: startX, y, width, height: windowHeight });
  });

  ipcMain.handle('get-login-item-settings', () => {
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('set-login-item-settings', (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: true, // Keep it silent in background
      path: process.execPath,
      name: 'Canal4'
    });
    return app.getLoginItemSettings().openAtLogin;
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

app.on('before-quit', () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
})

// ─── Testing / Debugging ──────────────────────────────────────────────────────

async function simulateUpdateFlow(): Promise<void> {
  await createUpdateWindow();

  const send = (channel: string, ...args: any[]) => updateWindow?.webContents.send(channel, ...args);

  send('update-status', 'checking');
  await new Promise(r => setTimeout(r, 2000));

  send('update-status', 'available', '1.2.3');
  await new Promise(r => setTimeout(r, 1500));

  for (let i = 0; i <= 100; i += 5) {
    send('update-progress', i);
    await new Promise(r => setTimeout(r, 200));
  }

  send('update-status', 'ready');
  console.log('[Updater] Simulation complete. In a real update, the app would restart now.');

  // We don't actually restart in simulation
  setTimeout(() => {
    // updateWindow?.close();
  }, 5000);
}

async function simulateUpdateErrorFlow(): Promise<void> {
  await createUpdateWindow();

  const send = (channel: string, ...args: any[]) => updateWindow?.webContents.send(channel, ...args);

  send('update-status', 'checking');
  await new Promise(r => setTimeout(r, 1000));

  send('update-error', 'Mock Error: Signature verify failed (Code: 1234)');
  console.log('[Updater] Error simulation complete. Window should stay open.');
}

ipcMain.on('simulate-update', () => {
  simulateUpdateFlow().catch(console.error);
});

ipcMain.on('simulate-update-error', () => {
  simulateUpdateErrorFlow().catch(console.error);
});
