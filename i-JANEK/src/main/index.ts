import path from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, Notification, Tray, nativeImage } from 'electron'
import type { BackupPolicy, CommandShell } from '@shared/contracts'
import { collectInventory, collectTelemetry } from './services/system-probe'
import { getSystemContext } from './services/device-identity'
import { executeTerminalCommand } from './services/terminal-service'
import { encryptVaultSecret } from './services/vault-service'
import { getRustDeskState, launchRustDesk } from './services/rustdesk-service'
import { syncBackup } from './services/backup-service'
import { localStore } from './store'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let forceQuit = false

function getIconPath() {
  return app.isPackaged ? path.join(process.resourcesPath, 'resources', 'icon.png') : path.join(app.getAppPath(), 'build', 'icon.png')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1080,
    minHeight: 760,
    backgroundColor: '#070b14',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('close', (event) => {
    if (!forceQuit) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
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
  ipcMain.handle('telemetry:collect', async () => collectTelemetry())
  ipcMain.handle('telemetry:inventory', async () => collectInventory())
  ipcMain.handle('terminal:execute', async (_event, shell: CommandShell, command: string) => executeTerminalCommand(shell, command))
  ipcMain.handle('vault:encrypt', async (_event, plainText: string) => encryptVaultSecret(plainText))
  ipcMain.handle('rustdesk:get-state', async () => getRustDeskState())
  ipcMain.handle('rustdesk:launch', async () => launchRustDesk())
  ipcMain.handle('backup:sync', async (_event, policy: BackupPolicy, accessToken: string, deviceId: string) =>
    syncBackup(policy, accessToken, deviceId)
  )
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    mainWindow?.show()
  })
})

app.on('before-quit', () => {
  forceQuit = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
