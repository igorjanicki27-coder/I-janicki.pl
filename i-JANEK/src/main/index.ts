import './env'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, Tray, nativeImage, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { BackupPolicy, CommandShell, DiagnosticBundleSummary, DiagnosticLogLevel, UpdateChannel } from '@shared/contracts'
import { collectInventory, collectTelemetry } from './services/system-probe'
import { getSystemContext } from './services/device-identity'
import { executeTerminalCommand } from './services/terminal-service'
import { decryptVaultSecret, encryptVaultSecret } from './services/vault-service'
import { enforceRustDeskPolicy, getRustDeskState, launchRustDesk, rotateRustDeskPassword } from './services/rustdesk-service'
import { listBackupFiles, removeBackupPathFromCloud, restoreBackup, syncBackup } from './services/backup-service'
import { signInWithGoogleDesktop } from './services/google-auth-service'
import { localStore } from './store'
import { createDiagnosticBundle, writeDiagnosticLog } from './services/diagnostics-service'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let forceQuit = false
let updaterEventsBound = false
const restartReminderHandles = new Set<NodeJS.Timeout>()
let rustDeskPolicyInterval: NodeJS.Timeout | null = null
let automaticUpdateInterval: NodeJS.Timeout | null = null
let updateInstallReminder: NodeJS.Timeout | null = null
let updateCheckInFlight: Promise<{ status: string; message: string }> | null = null
let updateInstallPromptOpen = false
let downloadedUpdateVersion: string | null = null
const AUTOMATIC_UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000
const UPDATE_INSTALL_REMINDER_MS = 4 * 60 * 60 * 1000
const { autoUpdater } = electronUpdater
const singleInstanceLock = app.requestSingleInstanceLock()
const startInTray = process.argv.includes('--tray')

function getPostInstallUpdateMarkerPath() {
  return path.join(app.getPath('userData'), 'post-install-update.pending')
}

function hasPendingPostInstallUpdateCheck() {
  return process.platform === 'win32' && fs.existsSync(getPostInstallUpdateMarkerPath())
}

function clearPostInstallUpdateMarker() {
  try {
    fs.unlinkSync(getPostInstallUpdateMarkerPath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[i-JANEK] Nie udało się usunąć znacznika kontroli aktualizacji:', error)
    }
  }
}

function focusMainWindow() {
  if (!mainWindow) return

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }

  mainWindow.focus()
}

if (!singleInstanceLock) {
  app.exit(0)
}

app.on('second-instance', () => {
  focusMainWindow()
})

function getIconPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'resources', 'icon.png') : path.join(app.getAppPath(), 'build', 'icon.png')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1080,
    minHeight: 760,
    show: false,
    backgroundColor: '#070b14',
    icon: getIconPath(),
    titleBarStyle: 'hiddenInset',
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      nativeWindowOpen: true
    }
  })

  mainWindow.on('minimize', (event) => {
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on('close', (event) => {
    if (!forceQuit) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[i-JANEK] Renderer load failed:', { errorCode, errorDescription, validatedURL })
    void writeDiagnosticLog('error', 'renderer_load_failed', { errorCode, errorDescription, validatedURL })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[i-JANEK] Renderer process gone:', details)
    void writeDiagnosticLog('error', 'renderer_process_gone', details as unknown as Record<string, unknown>)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }

    return { action: 'allow' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if ((url.startsWith('http://') || url.startsWith('https://')) && !url.startsWith('file://')) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    if (!startInTray) {
      focusMainWindow()
    }
  })
}

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath())
  tray = new Tray(icon)
  tray.setToolTip('i-JANEK')
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow?.show()
    }
  })

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Pokaż i-JANEK', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Zakończ',
      click: () => {
        forceQuit = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

function bindUpdaterEvents() {
  autoUpdater.autoDownload = true
  configureUpdaterChannel()
  if (updaterEventsBound) return
  updaterEventsBound = true
  autoUpdater.on('update-downloaded', (updateInfo) => {
    downloadedUpdateVersion = updateInfo.version
    void promptInstallDownloadedUpdate(updateInfo.version)
  })
  autoUpdater.on('error', (error) => {
    console.error('[i-JANEK] Auto update error:', error)
    void writeDiagnosticLog('error', 'auto_update_error', { error })
  })
}

function configureUpdaterChannel() {
  const channel = localStore.get('updateChannel') ?? 'stable'
  autoUpdater.allowPrerelease = channel !== 'stable'
  autoUpdater.channel = channel === 'stable' ? 'latest' : channel
}

function clearUpdateInstallReminder() {
  if (!updateInstallReminder) return
  clearTimeout(updateInstallReminder)
  updateInstallReminder = null
}

function scheduleUpdateInstallReminder() {
  clearUpdateInstallReminder()
  updateInstallReminder = setTimeout(() => {
    updateInstallReminder = null
    if (downloadedUpdateVersion) {
      void promptInstallDownloadedUpdate(downloadedUpdateVersion)
    }
  }, UPDATE_INSTALL_REMINDER_MS)
}

async function promptInstallDownloadedUpdate(version: string) {
  if (updateInstallPromptOpen) return
  updateInstallPromptOpen = true

  try {
    const parentWindow = mainWindow?.isVisible() ? mainWindow : undefined
    const response = await dialog.showMessageBox(parentWindow, {
      type: 'info',
      title: 'Aktualizacja i-JANEK',
      message: `Aktualizacja ${version} jest gotowa do instalacji.`,
      detail: 'Aplikacja zostanie zamknięta, zaktualizowana i uruchomiona ponownie.',
      buttons: ['Zainstaluj i uruchom ponownie', 'Później'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })

    if (response.response === 0) {
      clearUpdateInstallReminder()
      forceQuit = true
      autoUpdater.quitAndInstall(false, true)
      return
    }

    scheduleUpdateInstallReminder()
  } finally {
    updateInstallPromptOpen = false
  }
}

async function runUpdateCheck(silent: boolean) {
  if (!app.isPackaged) {
    return { status: 'skipped', message: 'Tryb developerski: aktualizacje są wyłączone.' }
  }

  try {
    bindUpdaterEvents()
    const result = await autoUpdater.checkForUpdates()
    const nextVersion = result?.updateInfo?.version
    if (nextVersion && nextVersion !== app.getVersion()) {
      return { status: 'downloading', message: `Pobieranie aktualizacji ${nextVersion}.` }
    }
    return { status: 'up_to_date', message: 'Aplikacja jest aktualna.' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Nie udało się sprawdzić aktualizacji.'
    if (!silent && Notification.isSupported()) {
      new Notification({ title: 'i-JANEK', body: message }).show()
    }
    return { status: 'error', message }
  }
}

function checkForUpdates(silent: boolean) {
  if (updateCheckInFlight) return updateCheckInFlight

  const pending = runUpdateCheck(silent)
  updateCheckInFlight = pending
  const clearPending = () => {
    if (updateCheckInFlight === pending) updateCheckInFlight = null
  }
  void pending.then(clearPending, clearPending)
  return pending
}

function startAutomaticUpdateChecks() {
  if (automaticUpdateInterval) clearInterval(automaticUpdateInterval)
  const isPostInstallCheck = hasPendingPostInstallUpdateCheck()
  void checkForUpdates(!isPostInstallCheck).then((result) => {
    if (isPostInstallCheck && result.status !== 'error') {
      clearPostInstallUpdateMarker()
    }
  })
  automaticUpdateInterval = setInterval(() => {
    void checkForUpdates(true)
  }, AUTOMATIC_UPDATE_INTERVAL_MS)
}

function requestWindowsRestart() {
  const child = spawn('shutdown.exe', ['/r', '/t', '0'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  })
  child.unref()
}

async function promptRestart(title: string, body: string, remindAfterMinutes = 30) {
  const response = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'question',
    title,
    message: title,
    detail: body,
    buttons: ['Restart teraz', `Przypomnij za ${remindAfterMinutes} min`, 'Anuluj'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })

  if (response.response === 0) {
    requestWindowsRestart()
    return { status: 'restart_now' as const, message: 'Użytkownik zaakceptował natychmiastowy restart.' }
  }

  if (response.response === 1) {
    const handle = setTimeout(() => {
      restartReminderHandles.delete(handle)
      if (Notification.isSupported()) {
        new Notification({
          title,
          body: `Przypomnienie: ${body}`
        }).show()
      }
    }, remindAfterMinutes * 60 * 1000)
    restartReminderHandles.add(handle)
    return { status: 'remind_later' as const, message: `Ustawiono przypomnienie za ${remindAfterMinutes} minut.` }
  }

  return { status: 'dismissed' as const, message: 'Użytkownik zamknął komunikat bez wyboru restartu.' }
}

async function promptRemoteConnection(title: string, message: string) {
  const response = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: 'question',
    title,
    message: title,
    detail: message,
    buttons: ['✅ Akceptuj', '❌ Odrzuć'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })

  return {
    accepted: response.response === 0
  }
}

function registerIpc() {
  ipcMain.handle('system:get-context', async () => getSystemContext())
  ipcMain.handle('system:set-auto-launch', async (_event, enabled: boolean) => {
    localStore.set('autoLaunch', enabled)
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: ['--tray']
    })
  })
  ipcMain.handle('system:notify', async (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show()
    }
  })
  ipcMain.handle('system:hide-main-window', async () => {
    mainWindow?.hide()
  })
  ipcMain.handle('system:get-consent', async () => localStore.get('consent') ?? null)
  ipcMain.handle('system:set-consent', async (_event, consent) => {
    localStore.set('consent', consent)
  })
  ipcMain.handle('system:get-master-aes-key', async () => localStore.get('masterAesKey'))
  ipcMain.handle('system:set-master-aes-key', async (_event, key: string) => {
    const nextKey = key.trim()
    if (!nextKey) return

    const currentKey = String(localStore.get('masterAesKey') ?? '').trim()
    if (currentKey && currentKey !== nextKey) {
      const history = Array.isArray(localStore.get('masterAesKeyHistory')) ? (localStore.get('masterAesKeyHistory') as string[]) : []
      const nextHistory = [currentKey, ...history.map((entry) => entry.trim()).filter(Boolean).filter((entry) => entry !== nextKey)]
      localStore.set('masterAesKeyHistory', nextHistory.slice(0, 10))
    }

    localStore.set('masterAesKey', nextKey)
  })
  ipcMain.handle('system:sign-in-with-google', async () => signInWithGoogleDesktop())
  ipcMain.handle('system:set-registered-device-id', async (_event, deviceId: string | null) => {
    const normalized = deviceId?.trim() || null
    localStore.set('registeredDeviceId', normalized)
    await enforceRustDeskPolicy()
  })
  ipcMain.handle('system:check-for-updates', async (_event, silent: boolean) => checkForUpdates(silent))
  ipcMain.handle('system:set-update-channel', async (_event, channel: UpdateChannel) => {
    if (!['test', 'beta', 'stable'].includes(channel)) {
      throw new Error('Nieobsługiwany kanał aktualizacji.')
    }
    const previousChannel = localStore.get('updateChannel') ?? 'stable'
    localStore.set('updateChannel', channel)
    bindUpdaterEvents()
    if (previousChannel !== channel) {
      void writeDiagnosticLog('info', 'update_channel_changed', { previousChannel, channel })
      void checkForUpdates(true)
    }
  })
  ipcMain.handle('system:create-diagnostic-bundle', async (_event, summary: DiagnosticBundleSummary) =>
    createDiagnosticBundle(summary, mainWindow)
  )
  ipcMain.handle(
    'system:log-event',
    async (_event, level: DiagnosticLogLevel, event: string, details?: Record<string, unknown>) =>
      writeDiagnosticLog(level, event, details)
  )
  ipcMain.handle('system:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined, {
      properties: ['openDirectory', 'createDirectory', 'dontAddToRecent']
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0] ?? null
  })
  ipcMain.handle('system:prompt-restart', async (_event, title: string, body: string, remindAfterMinutes?: number) =>
    promptRestart(title, body, remindAfterMinutes)
  )
  ipcMain.handle('system:prompt-remote-connection', async (_event, title: string, body: string) =>
    promptRemoteConnection(title, body)
  )
  ipcMain.handle('telemetry:collect', async () => collectTelemetry())
  ipcMain.handle('telemetry:inventory', async () => collectInventory())
  ipcMain.handle('terminal:execute', async (_event, shell: CommandShell, command: string, deviceId?: string, requestedBy?: string) =>
    executeTerminalCommand(shell, command, deviceId, requestedBy)
  )
  ipcMain.handle('vault:encrypt', async (_event, plainText: string) => encryptVaultSecret(plainText, localStore.get('masterAesKey')))
  ipcMain.handle('vault:decrypt', async (_event, cipherText: string) => {
    const currentKey = String(localStore.get('masterAesKey') ?? '').trim()
    const history = Array.isArray(localStore.get('masterAesKeyHistory')) ? (localStore.get('masterAesKeyHistory') as string[]) : []
    return decryptVaultSecret(cipherText, [currentKey, ...history])
  })
  ipcMain.handle('rustdesk:get-state', async (_event, deviceId?: string) => getRustDeskState(deviceId))
  ipcMain.handle('rustdesk:launch', async (_event, deviceId?: string) => launchRustDesk(deviceId))
  ipcMain.handle('rustdesk:rotate-password', async (_event, reason?: 'manual' | 'daily' | 'post_connection') =>
    rotateRustDeskPassword(reason ?? 'manual')
  )
  ipcMain.handle('backup:sync', async (event, policy: BackupPolicy, accessToken: string, deviceId: string, hostname: string) =>
    syncBackup(policy, accessToken, deviceId, hostname, (progress) => {
      event.sender.send('backup:sync-progress', progress)
    })
  )
  ipcMain.handle('backup:list-files', async (_event, policy: BackupPolicy, accessToken: string, hostname: string) =>
    listBackupFiles(policy, accessToken, hostname)
  )
  ipcMain.handle(
    'backup:remove-path-from-cloud',
    async (_event, policy: BackupPolicy, accessToken: string, deviceId: string, hostname: string, watchedPath: string) =>
      removeBackupPathFromCloud(policy, accessToken, deviceId, hostname, watchedPath)
  )
  ipcMain.handle('backup:restore', async (_event, policy: BackupPolicy, accessToken: string, hostname: string) =>
    restoreBackup(policy, accessToken, hostname)
  )
}

app.whenReady().then(() => {
  if (!singleInstanceLock) {
    return
  }

  app.setLoginItemSettings({
    openAtLogin: Boolean(localStore.get('autoLaunch')),
    path: process.execPath,
    args: ['--tray']
  })
  registerIpc()
  void writeDiagnosticLog('info', 'application_started', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch
  })
  createTray()
  createWindow()
  startAutomaticUpdateChecks()
  void enforceRustDeskPolicy()
  rustDeskPolicyInterval = setInterval(() => {
    void enforceRustDeskPolicy(undefined, { forceRotate: false, rotationReason: 'daily' })
  }, 60 * 60 * 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    focusMainWindow()
  })
})

app.on('before-quit', () => {
  forceQuit = true
  if (rustDeskPolicyInterval) {
    clearInterval(rustDeskPolicyInterval)
    rustDeskPolicyInterval = null
  }
  if (automaticUpdateInterval) {
    clearInterval(automaticUpdateInterval)
    automaticUpdateInterval = null
  }
  clearUpdateInstallReminder()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
