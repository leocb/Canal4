import { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, powerSaveBlocker, shell, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import iconWin from '../../resources/icon.ico?asset'
import trayIconAsset from '../../resources/tray-icon.png?asset'

app.commandLine.appendSwitch('disable-renderer-backgrounding');

// ─── GPU / Crash-Safe Startup ───────────────────────────────────────────────
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
}

const fs_gpu = require('fs');
const path_gpu = require('path');
const crashCountPath = path_gpu.join(app.getPath('userData'), 'crash_count');
let crashCount = 0;
try {
  crashCount = parseInt(fs_gpu.readFileSync(crashCountPath, 'utf-8'), 10) || 0;
} catch { /* ignore */ }
crashCount++;
try {
  fs_gpu.writeFileSync(crashCountPath, String(crashCount));
} catch { /* ignore */ }

const gpuFlagPath = path_gpu.join(app.getPath('userData'), 'disable-gpu');
let gpuDisabledManually = false;
try {
  if (fs_gpu.existsSync(gpuFlagPath)) {
    gpuDisabledManually = true;
  }
} catch { /* ignore */ }

if (gpuDisabledManually || crashCount >= 3) {
  console.warn('[Startup] Disabling hardware acceleration (manual=' + gpuDisabledManually + ', crashCount=' + crashCount + ').');
  app.disableHardwareAcceleration();
}

app.setName('Canal4');

// Prevent duplicate instances — the Task Scheduler can relaunch on crash, and the
// registry Run key is no longer used, so a stale entry could open a second window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (settingsWindow) {
      settingsWindow.show();
      settingsWindow.focus();
    } else {
      createSettingsWindow('logs');
    }
  });
}

// ─── Global Error Handlers ──────────────────────────────────────────────────
// Prevents process crashes and logs diagnostics for Windows Event Viewer crashes
process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  console.error('[FATAL] Stack:', error.stack);
  try {
    const fs = require('fs');
    const crashLog = join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(crashLog, `[${new Date().toISOString()}] UNCAUGHT EXCEPTION: ${error.message}\n${error.stack}\n\n`);
  } catch { /* ignore */ }
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
  try {
    const fs = require('fs');
    const crashLog = join(app.getPath('userData'), 'crash.log');
    fs.appendFileSync(crashLog, `[${new Date().toISOString()}] UNHANDLED REJECTION: ${String(reason)}\n\n`);
  } catch { /* ignore */ }
});

let tray: Tray | null = null;
let tickerWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let updateCheckTimer: ReturnType<typeof setInterval> | null = null;
let powerSaveBlockerId: number = -1;
let isQuitting = false;

// ─── Auto-Updater ─────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = console;

/**
 * Broadcast a message to all BrowserWindows.
 */
function broadcastUpdateStatus(channel: string, ...args: any[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send(channel, ...args); } catch { /* ignore */ }
  }
}

/**
 * Trigger an update check. If an update is available it downloads and then
 * calls quitAndInstall(true, true) so the OS relaunches into the new version.
 */
async function triggerUpdateCheckAndInstall(): Promise<void> {
  if (is.dev) {
    console.log('[Updater] Skipping update check in dev mode.');
    return;
  }

  return new Promise((resolve) => {

    let settled = false;
    const settle = () => { if (!settled) { settled = true; resolve(); } };

    const onNotAvailable = () => {
      console.log('[Updater] App is up-to-date.');
      broadcastUpdateStatus('update-status', 'up-to-date');
      setTimeout(() => { cleanup(); settle(); }, 2000);
    };

    const onAvailable = async (info: { version: string }) => {
      console.log('[Updater] Update available: v' + info.version);

      if (process.platform === 'darwin') {
        console.log('[Updater] System is macOS -- requiring manual download.');
        broadcastUpdateStatus('update-status', 'macos-manual', info.version);
        cleanup();
        settle();
        return;
      }

      broadcastUpdateStatus('update-status', 'available', info.version);
      autoUpdater.downloadUpdate().catch((e) => {
        console.error('[Updater] Download failed:', e.message);
        broadcastUpdateStatus('update-error', e.message);
        cleanup();
        settle();
      });
    };

    const onProgress = (progressObj: any) => {
      broadcastUpdateStatus('update-progress', progressObj.percent);
    };

    const onDownloaded = (info: { version: string }) => {
      console.log('[Updater] Update v' + info.version + ' downloaded -- relaunching now.');
      broadcastUpdateStatus('update-status', 'ready');
      cleanup();
      setTimeout(() => {
        console.log('[Updater] Finalizing update... Closing windows and stopping background tasks.');
        try { powerSaveBlocker.stop(powerSaveBlockerId); } catch (e) { /* ignore */ }
        BrowserWindow.getAllWindows().forEach(win => win.destroy());
        if (process.platform === 'darwin') app.dock?.show();
        console.log('[Updater] Calling quitAndInstall(isSilent=true)...');
        autoUpdater.quitAndInstall(true, true);
      }, 2000);
    };

    const onError = (err: Error) => {
      console.error('[Updater] Update check error:', err.message);
      broadcastUpdateStatus('update-error', err.message);
      cleanup();
      settle();
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
      broadcastUpdateStatus('update-error', e.message);
      cleanup();
    });
  });
}

/**
 * Startup check -- broadcasts status to the settings window overlay.
 * A 20-second timeout ensures a slow/offline network never blocks the app.
 */
async function checkForUpdateBeforeLaunch(): Promise<void> {
  if (is.dev) return;
  console.log('[Updater] Checking for update before launch...');
  broadcastUpdateStatus('update-status', 'checking');
  const timeout = new Promise<void>((resolve) =>
    setTimeout(() => {
      console.log('[Updater] Update check timed out -- proceeding with launch.');
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
    console.log('[Updater] Scheduled 12-hour update check...');
    triggerUpdateCheckAndInstall();
  }, 12 * 60 * 60 * 1_000);
}


// ─── Windows Task Scheduler (for crash-resilient startup) ─────────────────────

const TASK_NAME = '\\leocb\\Canal4';

/**
 * Create the Windows Scheduled Task via XML. Uses UTF-16LE with BOM which is
 * what schtasks.exe expects on Windows for proper encoding detection.
 */
async function createScheduledTask(): Promise<boolean> {
  const exePath = process.execPath;
  const escapedPath = exePath.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const taskXml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Canal4 Display node - auto-starts and restarts on failure</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT30S</Delay>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <Enabled>true</Enabled>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
    <ExecutionTimeLimit>PT24H</ExecutionTimeLimit>
    <Priority>7</Priority>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escapedPath}</Command>
    </Exec>
  </Actions>
</Task>`;

  try {
    const fs = require('fs');
    const path = require('path');
    const { execFile } = require('child_process');
    const util = require('util');
    const execFileAsync = util.promisify(execFile);

    const xmlPath = path.join(app.getPath('userData'), 'schtask-canal4.xml');

    // Delete stale file first (e.g. from a previous failed write with wrong encoding)
    try { fs.unlinkSync(xmlPath); } catch { /* ignore */ }

    // Write as UTF-16LE with BOM so schtasks detects encoding correctly
    fs.writeFileSync(xmlPath, '﻿' + taskXml, 'utf-16le');

    await execFileAsync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process -Verb RunAs -FilePath schtasks -ArgumentList '/create /tn "${TASK_NAME}" /xml "${xmlPath}" /f' -Wait`
    ], { timeout: 120000 });

    try { fs.unlinkSync(xmlPath); } catch { /* ignore */ }

    console.log('[TaskScheduler] Task created successfully:', TASK_NAME);
    return true;
  } catch (err: any) {
    console.error('[TaskScheduler] Failed to create task:', err.message);
    return false;
  }
}

/**
 * Remove the Windows Scheduled Task for Canal4.
 */
async function removeScheduledTask(): Promise<boolean> {
  try {
    const { execFile } = require('child_process');
    const util = require('util');
    const execFileAsync = util.promisify(execFile);

    // Elevate via PowerShell Start-Process -Verb RunAs (triggers UAC prompt)
    await execFileAsync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Start-Process -Verb RunAs -FilePath schtasks -ArgumentList '/delete /tn "${TASK_NAME}" /f' -Wait`
    ], { timeout: 120000 });

    console.log('[TaskScheduler] Task removed successfully.');
    return true;
  } catch (err: any) {
    console.error('[TaskScheduler] Failed to remove task:', err.message);
    return false;
  }
}

// ─── Windows ──────────────────────────────────────────────────────────────────

function createTickerWindow(): void {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height, x: startX, y: startY } = primaryDisplay.bounds

  tickerWindow = new BrowserWindow({
    width: width,
    height: 1, // Minimum 1px to avoid Windows GPU/driver crashes with zero-height transparent windows
    x: startX,
    y: startY + height, // Position off-screen until renderer provides height
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false, // Don't steal focus from user
    type: process.platform === 'darwin' ? 'panel' : undefined, // 'panel' is macOS-only
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

function createSettingsWindow(tab: 'logs' | 'settings' | 'pairing' = 'logs'): void {
  const url = is.dev && process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}/#/settings/${tab}`
    : `file://${join(__dirname, '../renderer/index.html')}#/settings/${tab}`;

  if (settingsWindow) {
    settingsWindow.show()
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

  settingsWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      settingsWindow?.hide();
    }
  })

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  })

  settingsWindow.loadURL(url)
}

function showSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show();
    settingsWindow.focus();
  } else {
    createSettingsWindow('logs');
  }
}

function createTray() {
  try {
    // Use the pre-resized tray icon (32x32); on macOS resize further to 16x16 template
    let trayIconImage = nativeImage.createFromPath(trayIconAsset)
    if (trayIconImage.isEmpty()) {
      console.error('[Tray] Icon image is empty -- creating a 32x32 transparent placeholder');
      trayIconImage = nativeImage.createEmpty();
    }
    if (process.platform === 'darwin') {
      trayIconImage = trayIconImage.resize({ width: 16, height: 16 })
      trayIconImage.setTemplateImage(true)
    }

    tray = new Tray(trayIconImage)
    tray.on('click', () => showSettingsWindow());
  } catch (err) {
    console.error('[Tray] Failed to create tray icon:', err);
    return; // Non-fatal -- app can run without tray
  }

  const menuItems: any[] = [
    { label: 'Settings', click: () => showSettingsWindow() },
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
    { label: settingsLabel, click: () => showSettingsWindow() },
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

  // Hide from macOS Dock -- this is a background tray-only app
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Open settings window first, then check for updates (shows overlay)
  createSettingsWindow('logs')
  checkForUpdateBeforeLaunch().catch(err => console.error('[Updater] Update check failed:', err));

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

    console.log('[Main] Updating token (length: ' + (token?.length || 0) + ')');
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
    const { width, height, x: startX, y: startY } = targetDisplay.bounds;
    const windowHeight = currentTickerConfig.height || 0;
    const y = currentTickerConfig.position === 'top' ? startY : startY + height - windowHeight;
    tickerWindow.setBounds({ x: startX, y, width, height: windowHeight });
  };

  screen.on('display-added', updateTickerPosition);
  screen.on('display-removed', updateTickerPosition);
  screen.on('display-metrics-changed', updateTickerPosition);

  ipcMain.on('update-ticker-position', (_event, params: { position: 'top' | 'bottom', displayId?: number, height?: number }) => {
    currentTickerConfig = params;
    updateTickerPosition();
  });

  ipcMain.handle('get-login-item-settings', async () => {
    if (process.platform === 'win32') {
      // Check Task Scheduler existence — this is the only startup mechanism now
      try {
        const { execFile } = require('child_process');
        const util = require('util');
        const execFileAsync = util.promisify(execFile);
        await execFileAsync('schtasks', [
          '/query',
          '/tn', TASK_NAME,
          '/fo', 'CSV',
          '/nh'
        ], { timeout: 10000 });
        return true;
      } catch {
        return false;
      }
    }
    const settings = app.getLoginItemSettings({ path: process.execPath });
    return settings.openAtLogin || settings.executableWillLaunchAtLogin;
  });

  ipcMain.handle('set-login-item-settings', async (_event, openAtLogin: boolean) => {
    if (process.platform === 'win32') {
      if (openAtLogin) {
        return await createScheduledTask();
      } else {
        return !(await removeScheduledTask());
      }
    }
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden: true,
      path: process.execPath,
      name: 'Canal4'
    });
    const settings = app.getLoginItemSettings({ path: process.execPath });
    return settings.openAtLogin || settings.executableWillLaunchAtLogin;
  });

  ipcMain.handle('get-platform', () => {
    return process.platform;
  });

  // App is fundamentally a background tray app, we only show Settings if opened directly on MacOS
  app.on('activate', function () {
    if (!settingsWindow) createSettingsWindow('logs')
  })
})

// Keep app running in background when settings is closed
app.on('window-all-closed', () => {
  // Do nothing. The Tray keeps it alive.
})

app.on('before-quit', () => {
  isQuitting = true;
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  try { fs_gpu.writeFileSync(crashCountPath, '0'); } catch { /* ignore */ }
})

// ─── Testing / Debugging ──────────────────────────────────────────────────────

async function simulateUpdateFlow(): Promise<void> {
  broadcastUpdateStatus('update-status', 'checking');
  await new Promise(r => setTimeout(r, 2000));
  broadcastUpdateStatus('update-status', 'available', '1.2.3');
  await new Promise(r => setTimeout(r, 1500));
  for (let i = 0; i <= 100; i += 5) {
    broadcastUpdateStatus('update-progress', i);
    await new Promise(r => setTimeout(r, 200));
  }
  broadcastUpdateStatus('update-status', 'ready');
  console.log('[Updater Simulation] Complete.');
}

async function simulateUpdateErrorFlow(): Promise<void> {
  broadcastUpdateStatus('update-status', 'checking');
  await new Promise(r => setTimeout(r, 1000));
  broadcastUpdateStatus('update-error', 'Mock Error: Signature verify failed (Code: 1234)');
}

async function simulateUpdateTranslocationErrorFlow(): Promise<void> {
  broadcastUpdateStatus('update-status', 'checking');
  await new Promise(r => setTimeout(r, 1000));
  broadcastUpdateStatus('update-error', 'updater.error_translocation');
}

ipcMain.on('simulate-update', () => simulateUpdateFlow().catch(console.error));
ipcMain.on('simulate-update-error', () => simulateUpdateErrorFlow().catch(console.error));
ipcMain.on('simulate-update-translocation', () => simulateUpdateTranslocationErrorFlow().catch(console.error));
ipcMain.on('simulate-macos-update', () => {
  broadcastUpdateStatus('update-status', 'macos-manual', '1.2.3');
});
