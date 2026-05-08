import './env'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, Tray, nativeImage, shell } from 'electron'
import electronUpdater from 'electron-updater'
import type { BackupPolicy, CommandShell } from '@shared/contracts'
import { collectInventory, collectTelemetry } from './services/system-probe'
import { getSystemContext } from './services/device-identity'
import { executeTerminalCommand } from './services/terminal-service'
import { decryptVaultSecret, encryptVaultSecret } from './services/vault-service'
import { enforceRustDeskPolicy, getRustDeskState, launchRustDesk, rotateRustDeskPassword } from './services/rustdesk-service'
import { listBackupFiles, removeBackupPathFromCloud, restoreBackup, syncBackup } from './services/backup-service'
import { signInWithGoogleDesktop } from './services/google-auth-service'
import { localStore } from './store'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let forceQuit = false
let updaterEventsBound = false
const restartReminderHandles = new Set<NodeJS.Timeout>()
let rustDeskPolicyInterval: NodeJS.Timeout | null = null
const { autoUpdater } = electronUpdater

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
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[i-JANEK] Renderer process gone:', details)
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
  if (updaterEventsBound) return
  updaterEventsBound = true
  autoUpdater.autoDownload = true
  autoUpdater.on('update-downloaded', () => {
    if (Notification.isSupported()) {
      new Notification({
        title: 'i-JANEK',
        body: 'Aktualizacja została pobrana. Uruchom aplikację ponownie, aby ją zastosować.'
      }).show()
    }
  })
  autoUpdater.on('error', (error) => {
    console.error('[i-JANEK] Auto update error:', error)
  })
}

async function checkForUpdates(silent: boolean) {
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
  app.setLoginItemSettings({
    openAtLogin: Boolean(localStore.get('autoLaunch')),
    path: process.execPath,
    args: ['--tray']
  })
  registerIpc()
  createTray()
  createWindow()
  void checkForUpdates(true)
  void enforceRustDeskPolicy()
  rustDeskPolicyInterval = setInterval(() => {
    void enforceRustDeskPolicy(undefined, { forceRotate: false, rotationReason: 'daily' })
  }, 60 * 60 * 1000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    mainWindow?.show()
  })
})

app.on('before-quit', () => {
  forceQuit = true
  if (rustDeskPolicyInterval) {
    clearInterval(rustDeskPolicyInterval)
    rustDeskPolicyInterval = null
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
