import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, powerSaveBlocker, shell, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import iconWin from '../../resources/icon.ico?asset'
import trayIconAsset from '../../resources/tray-icon.png?asset'

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.setName('Canal4');

let tray: Tray | null = null;
let tickerWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let updateWindow: BrowserWindow | null = null;
let updateCheckTimer: ReturnType<typeof setInterval> | null = null;
let powerSaveBlockerId: number = -1;

// ─── Auto-Updater ─────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;          // We control when to download
autoUpdater.autoInstallOnAppQuit = true;   // Allow it to install on quit if triggered
autoUpdater.logger = console;              // Log to console for debugging in dev

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
      // settle() first so createTray() runs before the window closes —
      // prevents a brief no-windows/no-tray state that can exit the process on Windows.
      setTimeout(() => {
        cleanup();
        settle();
        setTimeout(() => updateWindow?.close(), 300);
      }, 1500);
    };

    const onAvailable = async (info: { version: string }) => {
      console.log(`[Updater] Update available: v${info.version}`);
      if (!updateWindow) {
        await createUpdateWindow();
      }

      // macOS specific change: point user to GitHub release page instead of auto-downloading
      if (process.platform === 'darwin') {
        console.log('[Updater] System is macOS — requiring manual download.');
        updateWindow?.webContents.send('update-status', 'macos-manual', info.version);
        cleanup();
        return;
      }

      updateWindow?.webContents.send('update-status', 'available', info.version);
      autoUpdater.downloadUpdate().catch((e) => {
        console.error('[Updater] Download failed:', e.message);
        updateWindow?.webContents.send('update-error', e.message);
        cleanup();
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
        console.log('[Updater] Finalizing update... Closing windows and stopping background tasks.');

        // STOP power save blockers
        try {
          powerSaveBlocker.stop(powerSaveBlockerId);
        } catch (e) { /* ignore */ }

        // Close all windows except the update window
        BrowserWindow.getAllWindows().forEach(win => {
          if (win !== updateWindow) win.destroy();
        });

        // Some macOS versions need the app to be visible to quit & install correctly
        if (process.platform === 'darwin') {
          app.dock?.show();
        }

        console.log('[Updater] Calling quitAndInstall(isSilent=true)...');
        autoUpdater.quitAndInstall(true, true);
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
    icon: process.platform === 'win32' ? iconWin : icon,
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
  // Use the pre-resized tray icon (32x32); on macOS resize further to 16x16 template
  let trayIconImage = nativeImage.createFromPath(trayIconAsset)
  if (process.platform === 'darwin') {
    trayIconImage = trayIconImage.resize({ width: 16, height: 16 })
    trayIconImage.setTemplateImage(true)
  }

  tray = new Tray(trayIconImage)
  const menuItems: any[] = [
    { label: 'Settings', click: () => createSettingsWindow('settings') },
    { type: 'separator' }
  ];

  if (is.dev) {
    menuItems.push({ label: 'DEBUG: Simulate Update (Success)', click: () => simulateUpdateFlow() });
    menuItems.push({ label: 'DEBUG: Simulate Update (Translocation)', click: () => simulateUpdateTranslocationErrorFlow() });
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
    menuItems.push({ label: 'DEBUG: Simulate Update (Translocation)', click: () => simulateUpdateTranslocationErrorFlow() });
    menuItems.push({ label: 'DEBUG: Simulate Update (Error)', click: () => simulateUpdateErrorFlow() });
    menuItems.push({ type: 'separator' });
  }

  menuItems.push({ label: quitLabel, click: () => { app.quit() } });

  const contextMenu = Menu.buildFromTemplate(menuItems)
  tray.setToolTip(tooltip)
  tray.setContextMenu(contextMenu)
});

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('org.canal4.display')

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

  powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');

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
  ipcMain.on('open-external', (_event, url) => shell.openExternal(url));
  ipcMain.on('close-update-window', () => updateWindow?.close());
  ipcMain.on('flush-storage', () => session.defaultSession.flushStorageData());
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

  let currentTickerConfig: { position: 'top' | 'bottom', displayId?: number, height?: number } | null = null;

  const updateTickerPosition = () => {
    if (!tickerWindow || !currentTickerConfig) return;
    const displays = screen.getAllDisplays();
    // Default to primary if the target didn't wake up yet or is disconnected
    const targetDisplay = displays.find(d => d.id === currentTickerConfig!.displayId) || screen.getPrimaryDisplay();
    const { width, x: startX } = targetDisplay.bounds;
    const { height, y: offsetY } = targetDisplay.workArea;
    const windowHeight = currentTickerConfig.height || 80;
    const y = currentTickerConfig.position === 'top' ? offsetY : offsetY + height - windowHeight;
    tickerWindow.setBounds({ x: startX, y, width, height: windowHeight });
  };

  screen.on('display-added', updateTickerPosition);
  screen.on('display-removed', updateTickerPosition);
  screen.on('display-metrics-changed', updateTickerPosition);

  ipcMain.on('update-ticker-position', (_event, params: { position: 'top' | 'bottom', displayId?: number, height?: number }) => {
    currentTickerConfig = params;
    updateTickerPosition();
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
  console.log('[Updater Simulation] In a real update, the app would restart now.');

  // No relaunch in simulation
  setTimeout(() => {
    updateWindow?.close();
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

async function simulateUpdateTranslocationErrorFlow(): Promise<void> {
  await createUpdateWindow();

  const send = (channel: string, ...args: any[]) => updateWindow?.webContents.send(channel, ...args);

  send('update-status', 'checking');
  await new Promise(r => setTimeout(r, 1000));

  send('update-error', 'updater.error_translocation');
  console.log('[Updater Simulation] Translocation error simulation complete. Window should stay open.');
}

ipcMain.on('simulate-update', () => {
  simulateUpdateFlow().catch(console.error);
});

ipcMain.on('simulate-update-error', () => {
  simulateUpdateErrorFlow().catch(console.error);
});

ipcMain.on('simulate-update-translocation', () => {
  simulateUpdateTranslocationErrorFlow().catch(console.error);
});

ipcMain.on('simulate-macos-update', async () => {
  await createUpdateWindow();
  updateWindow?.webContents.send('update-status', 'macos-manual', '1.2.3');
});
