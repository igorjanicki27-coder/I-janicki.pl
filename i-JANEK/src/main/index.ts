import './env'
import fs from 'node:fs'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, Tray, nativeImage, shell } from 'electron'
import type { MessageBoxOptions } from 'electron'
import { closeDwServicePoc, closeDwServicePocPopup, goBackDwServicePoc, openDwServicePoc, setDwServicePocBounds } from './dwservice-poc'
import electronUpdater from 'electron-updater'
import type { CommandShell, DiagnosticBundleSummary, DiagnosticLogLevel, UpdateChannel } from '@shared/contracts'
import type { PostUpdateNotice, UpdateStatusPayload } from '@shared/ipc'
import { collectInventory, collectTelemetry } from './services/system-probe'
import { getSystemContext } from './services/device-identity'
import { executeTerminalCommand } from './services/terminal-service'
import { applyDwServiceInstallationCode, getDwServiceAgentState } from './services/dwservice-agent-service'
import { localStore } from './store'
import { createDiagnosticBundle, writeDiagnosticLog } from './services/diagnostics-service'
import { canExitForWindowsUpdate, getWindowsRestartRequestId, type WindowsAgentUpdateStatus } from './services/windows-update-protocol'
import { advanceUpdateNoticeState, readPostUpdateNotice } from './services/post-update-notice'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let forceQuit = false
let updaterEventsBound = false
const restartReminderHandles = new Set<NodeJS.Timeout>()
let automaticUpdateInterval: NodeJS.Timeout | null = null
let updateInstallReminder: NodeJS.Timeout | null = null
let windowsAgentStatusInterval: NodeJS.Timeout | null = null
let updateCheckInFlight: Promise<{ status: string; message: string }> | null = null
let updateInstallPromptOpen = false
let windowsUpdateExitStarted = false
let windowsRestartAcknowledged = false
let pendingWindowsUpdateVersion: string | null = null
let pendingWindowsUpdateRequestId: string | null = null
let windowsAgentRequestStartedAt = 0
let windowsAgentLastProgressAt = 0
let windowsAgentLastStatusTimestamp: string | null = null
let windowsAgentTimeoutReported = false
let windowsAgentLastPollAt = 0
let lastWindowsUpdateCheckAt = 0
let downloadedUpdateVersion: string | null = null
let latestUpdateStatus: UpdateStatusPayload = {
  status: 'idle',
  message: 'Sprawdzanie aktualizacji jeszcze się nie rozpoczęło.'
}

function cleanupLegacyRemoteIntegrationData() {
  for (const key of ['rustdeskBinaryPath', 'rustdeskPassword', 'rustdeskPasswordRotatedAt']) {
    localStore.delete(key as keyof import('./store').LocalSchema)
  }
  for (const target of [
    path.join(app.getPath('userData'), 'rustdesk-config.local.txt'),
    path.join(app.getPath('userData'), 'google-oauth-desktop.local.json'),
    path.join(app.getPath('userData'), 'Partitions', 'action1')
  ]) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
    } catch (error) {
      console.warn('[i-JANEK] Nie udało się usunąć danych starej integracji:', error)
    }
  }
}
let lastPublishedDownloadPercent = -1
const AUTOMATIC_UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000
const UPDATE_INSTALL_REMINDER_MS = 4 * 60 * 60 * 1000
const WINDOWS_AGENT_RESPONSE_TIMEOUT_MS = 2 * 60 * 1000
const WINDOWS_AGENT_PROGRESS_TIMEOUT_MS = 35 * 60 * 1000
const WINDOWS_UPDATE_ON_OPEN_INTERVAL_MS = 5 * 60 * 1000
const APP_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/u
const { autoUpdater } = electronUpdater
const singleInstanceLock = app.requestSingleInstanceLock()
const isUpdateRestart = process.argv.includes('--updated')
  || localStore.get('pendingUpdateRestartVersion') === app.getVersion()
const startHidden = process.argv.includes('--tray') || isUpdateRestart
let postUpdateNotice: PostUpdateNotice | null = null
let windowStartupComplete = false

function preparePostUpdateNotice() {
  if (!app.isPackaged) return
  const state = advanceUpdateNoticeState(
    app.getVersion(), localStore.get('updateNoticeState') ?? {}, isUpdateRestart,
    Boolean(localStore.get('registeredDeviceId') || localStore.get('consent'))
  )
  localStore.set('updateNoticeState', state)
  localStore.delete('pendingUpdateRestartVersion')
  if (!state.pendingVersion) return
  let metadata: unknown = null
  try {
    metadata = JSON.parse(fs.readFileSync(path.join(process.resourcesPath, 'resources', 'release-notes.json'), 'utf8'))
  } catch (error) {
    void writeDiagnosticLog('warning', 'post_update_notes_unavailable', { error })
  }
  postUpdateNotice = readPostUpdateNotice(app.getVersion(), metadata)
}

function isNewerAppVersion(candidate: string, current: string) {
  const candidateMatch = APP_VERSION_PATTERN.exec(candidate)
  const currentMatch = APP_VERSION_PATTERN.exec(current)
  if (!candidateMatch || !currentMatch) return false

  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(candidateMatch[index]) - Number(currentMatch[index])
    if (difference !== 0) return difference > 0
  }

  const stageRank = { alpha: 0, beta: 1, stable: 2 } as const
  const candidateStage = (candidateMatch[4] as 'alpha' | 'beta' | undefined) ?? 'stable'
  const currentStage = (currentMatch[4] as 'alpha' | 'beta' | undefined) ?? 'stable'
  if (candidateStage !== currentStage) return stageRank[candidateStage] > stageRank[currentStage]
  if (candidateStage === 'stable') return false
  return Number(candidateMatch[5]) > Number(currentMatch[5])
}

function getWindowsAgentRoot() {
  return path.join(process.env.ProgramData || 'C:\\ProgramData', 'i-JANEK')
}

function hasWindowsUpdateAgent() {
  return process.platform === 'win32' && fs.existsSync(path.join(getWindowsAgentRoot(), 'agent-config.json'))
}

function hasWindowsAgentRestartProtocol() {
  try {
    const raw = fs.readFileSync(path.join(getWindowsAgentRoot(), 'agent-config.json'), 'utf8').replace(/^\uFEFF/u, '')
    return JSON.parse(raw).restartProtocol === 2
  } catch { return false }
}

function acknowledgeWindowsUpdateRestart() {
  if (process.platform !== 'win32' || !app.isPackaged || windowsRestartAcknowledged) return
  const requestId = getWindowsRestartRequestId(process.argv)
  if (!requestId) return
  try {
    const ackPath = path.join(getWindowsAgentRoot(), 'requests', `restart-ack-${requestId}.json`)
    const temporary = `${ackPath}.tmp`
    fs.writeFileSync(temporary, JSON.stringify({
      requestId, version: app.getVersion(), processId: process.pid
    }), { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temporary, ackPath)
    windowsRestartAcknowledged = true
    void writeDiagnosticLog('info', 'windows_update_restart_acknowledged', { requestId, version: app.getVersion() })
  } catch (error) {
    void writeDiagnosticLog('error', 'windows_update_restart_ack_failed', { requestId, error })
  }
}

function pollWindowsAgentStatus() {
  if (!pendingWindowsUpdateVersion) return
  const now = Date.now()
  if (!windowsAgentTimeoutReported && windowsAgentLastPollAt && now - windowsAgentLastPollAt > 60_000) {
    // After sleep, allow Task Scheduler time to resume before reporting a timeout.
    windowsAgentRequestStartedAt = now
    if (windowsAgentLastProgressAt) windowsAgentLastProgressAt = now
  }
  windowsAgentLastPollAt = now
  try {
    const raw = fs.readFileSync(path.join(getWindowsAgentRoot(), 'update-status.json'), 'utf8').replace(/^\uFEFF/u, '')
    const status = JSON.parse(raw) as WindowsAgentUpdateStatus
    const matchesPendingRequest = status.requestId === pendingWindowsUpdateRequestId
    if (status.state === 'error' && (matchesPendingRequest || !status.requestId)) {
      publishUpdateStatus({ status: 'error', message: status.message || 'Agent aktualizacji zgłosił błąd.' })
      pendingWindowsUpdateVersion = null
      pendingWindowsUpdateRequestId = null
      return
    }
    if (!matchesPendingRequest) return
    if (status.updatedAt && status.updatedAt !== windowsAgentLastStatusTimestamp) {
      windowsAgentLastStatusTimestamp = status.updatedAt
      windowsAgentLastProgressAt = Date.now()
      windowsAgentTimeoutReported = false
    }
    if (status.state === 'ready') {
      if (!windowsUpdateExitStarted && canExitForWindowsUpdate(status, pendingWindowsUpdateRequestId, pendingWindowsUpdateVersion)) {
        windowsUpdateExitStarted = true
        forceQuit = true
        // The SYSTEM agent already holds the normal user's session token and
        // environment. It owns both installation and relaunch, independently
        // of Electron and its window-close handlers.
        app.exit(0)
      }
    } else if (status.state === 'installed') {
      publishUpdateStatus({ status: 'up_to_date', version: status.version, message: status.message || 'Aktualizacja została zainstalowana.' })
      pendingWindowsUpdateVersion = null
      pendingWindowsUpdateRequestId = null
    } else if (status.state === 'verifying' || status.state === 'installing' || status.state === 'restarting') {
      publishUpdateStatus({ status: 'available', version: status.version, message: status.message || 'Przygotowuję aktualizację.' })
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      console.warn('[i-JANEK] Nie udało się odczytać statusu agenta aktualizacji:', error)
    }
  } finally {
    if (!pendingWindowsUpdateVersion || windowsUpdateExitStarted) return
    const lastProgressAt = windowsAgentLastProgressAt || windowsAgentRequestStartedAt
    const timeout = windowsAgentLastProgressAt ? WINDOWS_AGENT_PROGRESS_TIMEOUT_MS : WINDOWS_AGENT_RESPONSE_TIMEOUT_MS
    if (windowsAgentTimeoutReported || Date.now() - lastProgressAt < timeout) return
    const version = pendingWindowsUpdateVersion
    const requestId = pendingWindowsUpdateRequestId
    const requestPresent = Boolean(requestId && fs.existsSync(path.join(getWindowsAgentRoot(), 'requests', `request-${requestId}.json`)))
    const message = windowsAgentLastProgressAt
      ? 'Agent aktualizacji Windows przestał odpowiadać. Sprawdź stan zadania „i-JANEK Update Agent” i plik C:\\ProgramData\\i-JANEK\\update-status.json.'
      : requestPresent
        ? 'Agent aktualizacji Windows nie odebrał zgłoszenia. Sprawdź, czy zadanie „i-JANEK Update Agent” jest włączone.'
        : 'Zgłoszenie aktualizacji zniknęło bez potwierdzenia instalacji. Sprawdź stan zadania „i-JANEK Update Agent” i plik C:\\ProgramData\\i-JANEK\\update-status.json.'
    publishUpdateStatus({ status: 'error', version, message })
    void writeDiagnosticLog('error', 'windows_agent_response_timeout', { version, requestId, requestPresent, agentAcknowledged: Boolean(windowsAgentLastProgressAt) })
    windowsAgentTimeoutReported = true
  }
}

function handOffWindowsUpdate(version: string, installerPath: string) {
  if (pendingWindowsUpdateVersion === version) return
  if (!hasWindowsAgentRestartProtocol()) {
    publishUpdateStatus({ status: 'error', version, message: 'Agent Windows wymaga jednorazowej naprawy. Uruchom najnowszy instalator i-JANEK; następne aktualizacje będą automatyczne bez UAC.' })
    return
  }
  const channel = localStore.get('updateChannel') ?? 'stable'
  if (!/^\d+\.\d+\.\d+(?:-(?:alpha|beta)\.\d+)?$/u.test(version) || !['stable', 'beta', 'test'].includes(channel)) {
    throw new Error('Nieprawidłowe metadane aktualizacji Windows.')
  }
  const requestDir = path.join(getWindowsAgentRoot(), 'requests')
  const requestId = `${process.pid}-${Date.now()}`
  const requestName = `request-${requestId}.json`
  const requestPath = path.join(requestDir, requestName)
  const temporaryRequestPath = `${requestPath}.tmp`
  fs.writeFileSync(temporaryRequestPath, JSON.stringify({
    version,
    requestId,
    channel: channel === 'stable' ? 'latest' : channel,
    installerPath,
    restartProtocol: 2,
    processId: process.pid,
    startHidden: !mainWindow || !mainWindow.isVisible() || mainWindow.isMinimized() || !mainWindow.isFocused()
  }), { encoding: 'utf8', flag: 'wx' })
  fs.renameSync(temporaryRequestPath, requestPath)
  pendingWindowsUpdateVersion = version
  pendingWindowsUpdateRequestId = requestId
  windowsUpdateExitStarted = false
  windowsAgentRequestStartedAt = Date.now()
  windowsAgentLastProgressAt = 0
  windowsAgentLastStatusTimestamp = null
  windowsAgentTimeoutReported = false
  windowsAgentLastPollAt = Date.now()
  publishUpdateStatus({ status: 'downloaded', version, message: 'Aktualizacja jest pobrana. Uruchamiam instalację.' })
  if (!windowsAgentStatusInterval) {
    windowsAgentStatusInterval = setInterval(pollWindowsAgentStatus, 2_000)
  }
  const schtasksPath = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'schtasks.exe')
  execFile(schtasksPath, ['/Run', '/TN', 'i-JANEK Update Agent'], { windowsHide: true, timeout: 10_000 }, (error) => {
    if (!error || pendingWindowsUpdateRequestId !== requestId) return
    publishUpdateStatus({
      status: 'error',
      version,
      message: 'Nie udało się uruchomić agenta aktualizacji Windows. Sprawdź zadanie „i-JANEK Update Agent”.'
    })
    void writeDiagnosticLog('error', 'windows_agent_start_failed', { version, requestId, error })
  })
}

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

app.on('second-instance', (_event, argv) => {
  if (argv.includes('--updated')) return
  focusMainWindow()
  checkForUpdatesOnOpen()
})

function checkForUpdatesOnOpen() {
  if (process.platform !== 'win32' || !app.isReady()) return
  if (pendingWindowsUpdateVersion) {
    pollWindowsAgentStatus()
    return
  }
  if (Date.now() - lastWindowsUpdateCheckAt < WINDOWS_UPDATE_ON_OPEN_INTERVAL_MS) return
  void checkForUpdates(true)
}

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
      webviewTag: false
    }
  })

  mainWindow.on('minimize', () => {
    mainWindow?.hide()
  })

  mainWindow.on('close', (event) => {
    if (!forceQuit) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.on('closed', () => { void closeDwServicePoc() })
  mainWindow.on('show', checkForUpdatesOnOpen)

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[i-JANEK] Renderer load failed:', { errorCode, errorDescription, validatedURL })
    void writeDiagnosticLog('error', 'renderer_load_failed', { errorCode, errorDescription, validatedURL })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[i-JANEK] Renderer process gone:', details)
    void writeDiagnosticLog('error', 'renderer_process_gone', details as unknown as Record<string, unknown>)
  })

  if (process.platform !== 'win32') {
    mainWindow.webContents.once('did-finish-load', () => {
      startAutomaticUpdateChecks()
    })
  }

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
    windowStartupComplete = true
    if (!startHidden) {
      if (postUpdateNotice) mainWindow?.showInactive()
      else focusMainWindow()
    }
  })
}

function publishUpdateStatus(status: UpdateStatusPayload) {
  latestUpdateStatus = status
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('system:update-status', status)
  }
}

function friendlyUpdateError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '')
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|offline/i.test(rawMessage)) {
    return 'Nie udało się połączyć z serwerem aktualizacji. Sprawdź internet — aplikacja spróbuje ponownie później.'
  }
  if (/No published versions/i.test(rawMessage)) {
    return 'Na serwerze nie ma jeszcze opublikowanej wersji dla tego kanału aktualizacji.'
  }
  if (/app-update\.yml|ENOENT/i.test(rawMessage)) {
    return 'Ta kopia aplikacji nie zawiera konfiguracji aktualizatora. Zainstaluj i-JANEK z oficjalnego instalatora.'
  }
  return 'Nie udało się sprawdzić aktualizacji. Aplikacja spróbuje ponownie później.'
}

function createTray() {
  const icon = nativeImage.createFromPath(getIconPath())
  tray = new Tray(icon)
  tray.setToolTip('i-JANEK')
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      focusMainWindow()
    }
  })

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Pokaż i-JANEK', click: focusMainWindow },
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
  autoUpdater.autoDownload = process.platform !== 'win32'
  if (process.platform === 'win32') {
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowDowngrade = false
  }
  configureUpdaterChannel()
  if (updaterEventsBound) return
  updaterEventsBound = true
  autoUpdater.on('checking-for-update', () => {
    lastPublishedDownloadPercent = -1
    publishUpdateStatus({
      status: 'checking',
      message: 'Sprawdzam, czy jest dostępna nowa wersja i-JANEK.'
    })
    void writeDiagnosticLog('info', 'auto_update_check_started', {
      currentVersion: app.getVersion(),
      channel: localStore.get('updateChannel') ?? 'stable'
    })
  })
  autoUpdater.on('update-available', (updateInfo) => {
    if (!isNewerAppVersion(updateInfo.version, app.getVersion())) return
    publishUpdateStatus({
      status: 'available',
      version: updateInfo.version,
      message: `Dostępna jest wersja ${updateInfo.version}. Rozpoczynam pobieranie.`
    })
    void writeDiagnosticLog('info', 'auto_update_available', {
      currentVersion: app.getVersion(),
      nextVersion: updateInfo.version
    })
  })
  autoUpdater.on('update-not-available', (updateInfo) => {
    publishUpdateStatus({
      status: 'up_to_date',
      version: updateInfo.version,
      message: `Masz najnowszą wersję i-JANEK (${app.getVersion()}).`
    })
    void writeDiagnosticLog('info', 'auto_update_not_available', {
      currentVersion: app.getVersion(),
      serverVersion: updateInfo.version
    })
  })
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent)))
    if (percent !== 100 && percent < lastPublishedDownloadPercent + 5) return
    lastPublishedDownloadPercent = percent
    publishUpdateStatus({
      status: 'downloading',
      version: latestUpdateStatus.version,
      percent,
      message: `Pobieranie aktualizacji: ${percent}%.`
    })
  })
  autoUpdater.on('update-downloaded', (updateInfo) => {
    if (!isNewerAppVersion(updateInfo.version, app.getVersion())) {
      publishUpdateStatus({
        status: 'up_to_date',
        version: app.getVersion(),
        message: `Masz najnowszą wersję i-JANEK (${app.getVersion()}).`
      })
      return
    }
    downloadedUpdateVersion = updateInfo.version
    publishUpdateStatus({
      status: 'downloaded',
      version: updateInfo.version,
      percent: 100,
      message: `Aktualizacja ${updateInfo.version} jest gotowa do instalacji.`
    })
    void writeDiagnosticLog('info', 'auto_update_downloaded', { version: updateInfo.version })
    if (process.platform === 'win32') {
      if (!hasWindowsUpdateAgent()) {
        publishUpdateStatus({
          status: 'downloaded',
          version: updateInfo.version,
          message: 'Jednorazowa migracja instalacji systemowej. Windows poprosi teraz o zgodę administratora.'
        })
        forceQuit = true
        localStore.set('pendingUpdateRestartVersion', updateInfo.version)
        autoUpdater.quitAndInstall(true, true)
      }
    } else {
      void promptInstallDownloadedUpdate(updateInfo.version)
    }
  })
  autoUpdater.on('error', (error) => {
    console.error('[i-JANEK] Auto update error:', error)
    publishUpdateStatus({
      status: 'error',
      message: friendlyUpdateError(error)
    })
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
    const options: MessageBoxOptions = {
      type: 'info',
      title: 'Aktualizacja i-JANEK',
      message: `Aktualizacja ${version} jest gotowa do instalacji.`,
      detail: 'Aplikacja zostanie zamknięta, zaktualizowana i uruchomiona ponownie.',
      buttons: ['Zainstaluj i uruchom ponownie', 'Później'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    }
    const response = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options)

    if (response.response === 0) {
      clearUpdateInstallReminder()
      forceQuit = true
      localStore.set('pendingUpdateRestartVersion', version)
      autoUpdater.quitAndInstall(false, true)
      return
    }

    scheduleUpdateInstallReminder()
  } finally {
    updateInstallPromptOpen = false
  }
}

async function runUpdateCheck(silent: boolean) {
  if (process.platform === 'win32' && pendingWindowsUpdateVersion) {
    if (windowsAgentTimeoutReported) return { status: 'error', message: latestUpdateStatus.message }
    return { status: 'downloading', message: `Aktualizacja ${pendingWindowsUpdateVersion} jest obsługiwana przez agenta systemowego.` }
  }
  if (!app.isPackaged) {
    return { status: 'skipped', message: 'Tryb developerski: aktualizacje są wyłączone.' }
  }

  try {
    bindUpdaterEvents()
    if (process.platform === 'win32') lastWindowsUpdateCheckAt = Date.now()
    const result = await autoUpdater.checkForUpdates()
    const nextVersion = result?.updateInfo?.version
    if (nextVersion && isNewerAppVersion(nextVersion, app.getVersion())) {
      if (process.platform === 'win32' && hasWindowsUpdateAgent()) {
        void autoUpdater.downloadUpdate().then((files) => {
          const installerPath = files.find((filePath) => filePath.toLowerCase().endsWith('.exe'))
          if (!installerPath) throw new Error('Nie znaleziono pobranego instalatora Windows.')
          handOffWindowsUpdate(nextVersion, installerPath)
        }).catch((error) => {
          publishUpdateStatus({ status: 'error', message: friendlyUpdateError(error) })
          void writeDiagnosticLog('error', 'windows_agent_handoff_failed', { error })
        })
      }
      return { status: 'downloading', message: `Pobieranie aktualizacji ${nextVersion}.` }
    }
    return { status: 'up_to_date', message: 'Aplikacja jest aktualna.' }
  } catch (error) {
    const message = friendlyUpdateError(error)
    if (!silent && localStore.get('notificationsEnabled') && Notification.isSupported()) {
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
  void checkForUpdates(true).then((result) => {
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
  const options: MessageBoxOptions = {
    type: 'question',
    title,
    message: title,
    detail: body,
    buttons: ['Restart teraz', `Przypomnij za ${remindAfterMinutes} min`, 'Anuluj'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  }
  const response = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options)

  if (response.response === 0) {
    requestWindowsRestart()
    return { status: 'restart_now' as const, message: 'Użytkownik zaakceptował natychmiastowy restart.' }
  }

  if (response.response === 1) {
    const handle = setTimeout(() => {
      restartReminderHandles.delete(handle)
      if (localStore.get('notificationsEnabled') && Notification.isSupported()) {
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

function registerIpc() {
  const requireMainRenderer = (event: Electron.IpcMainInvokeEvent) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Nieautoryzowane żądanie widoku DWService.')
    return mainWindow
  }
  ipcMain.handle('dwservice:poc-open', async (event) => openDwServicePoc(requireMainRenderer(event)))
  ipcMain.handle('dwservice:poc-close', async (event) => { requireMainRenderer(event); await closeDwServicePoc() })
  ipcMain.handle('dwservice:poc-set-bounds', async (event, rect) => { requireMainRenderer(event); setDwServicePocBounds(rect) })
  ipcMain.handle('dwservice:poc-close-popup', async (event) => { requireMainRenderer(event); closeDwServicePocPopup() })
  ipcMain.handle('dwservice:poc-go-back', async (event) => { requireMainRenderer(event); goBackDwServicePoc() })
  ipcMain.handle('dwservice:agent-get-state', async (event) => { requireMainRenderer(event); return getDwServiceAgentState() })
  ipcMain.handle('dwservice:agent-apply-code', async (
    event,
    installationCode: string,
    configurationId: string,
    proof: { deviceId: string; firebaseIdToken: string; firebaseProjectId: string }
  ) => {
    requireMainRenderer(event)
    return applyDwServiceInstallationCode(installationCode, configurationId, proof)
  })
  ipcMain.handle('system:get-context', async () => getSystemContext())
  ipcMain.handle('system:set-auto-launch', async (_event, enabled: boolean) => {
    localStore.set('autoLaunch', enabled)
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: ['--tray']
    })
  })
  ipcMain.handle('system:set-notifications-enabled', async (_event, enabled: boolean) => {
    localStore.set('notificationsEnabled', enabled)
  })
  ipcMain.handle('system:notify', async (_event, title: string, body: string) => {
    if (localStore.get('notificationsEnabled') && Notification.isSupported()) {
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
  ipcMain.handle('system:set-registered-device-id', async (_event, deviceId: string | null) => {
    const normalized = deviceId?.trim() || null
    localStore.set('registeredDeviceId', normalized)
  })
  ipcMain.handle('system:check-for-updates', async (_event, silent: boolean) => checkForUpdates(silent))
  ipcMain.handle('system:get-update-status', async () => latestUpdateStatus)
  ipcMain.handle('system:get-post-update-notice', async (event) => {
    requireMainRenderer(event)
    return postUpdateNotice
  })
  ipcMain.handle('system:acknowledge-post-update-notice', async (event, version: string) => {
    requireMainRenderer(event)
    if (!postUpdateNotice || postUpdateNotice.version !== version) throw new Error('Nieprawidłowa wersja opisu aktualizacji.')
    localStore.set('updateNoticeState', { lastVersion: version, acknowledgedVersion: version })
    postUpdateNotice = null
  })
  ipcMain.handle('system:acknowledge-update-start', async (event) => {
    if (event.sender !== mainWindow?.webContents) return
    acknowledgeWindowsUpdateRestart()
  })
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
  ipcMain.handle('system:prompt-restart', async (_event, title: string, body: string, remindAfterMinutes?: number) =>
    promptRestart(title, body, remindAfterMinutes)
  )
  ipcMain.handle('telemetry:collect', async () => collectTelemetry())
  ipcMain.handle('telemetry:inventory', async () => collectInventory())
  ipcMain.handle('terminal:execute', async (_event, shell: CommandShell, command: string, deviceId?: string, requestedBy?: string) =>
    executeTerminalCommand(shell, command, deviceId, requestedBy)
  )
}

app.whenReady().then(() => {
  if (!singleInstanceLock) {
    return
  }

  cleanupLegacyRemoteIntegrationData()
  preparePostUpdateNotice()

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
  if (process.platform === 'win32') startAutomaticUpdateChecks()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    if (isUpdateRestart && !windowStartupComplete) return
    focusMainWindow()
  })
})

app.on('before-quit', () => {
  forceQuit = true
  if (downloadedUpdateVersion && autoUpdater.autoInstallOnAppQuit) {
    localStore.set('pendingUpdateRestartVersion', downloadedUpdateVersion)
  }
  if (automaticUpdateInterval) {
    clearInterval(automaticUpdateInterval)
    automaticUpdateInterval = null
  }
  if (windowsAgentStatusInterval) {
    clearInterval(windowsAgentStatusInterval)
    windowsAgentStatusInterval = null
  }
  clearUpdateInstallReminder()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
