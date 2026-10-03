import { contextBridge, ipcRenderer } from 'electron'
import type { BackupPolicy, CommandShell } from '@shared/contracts'
import type { DwServicePocStatus, JanekApi, UpdateStatusPayload } from '@shared/ipc'

const api: JanekApi = {
  dwServicePoc: {
    open: () => ipcRenderer.invoke('dwservice:poc-open'),
    close: () => ipcRenderer.invoke('dwservice:poc-close'),
    setBounds: (rect) => ipcRenderer.invoke('dwservice:poc-set-bounds', rect),
    closePopup: () => ipcRenderer.invoke('dwservice:poc-close-popup'),
    goBack: () => ipcRenderer.invoke('dwservice:poc-go-back'),
    onStatus: (callback) => {
      const listener = (_event: unknown, status: DwServicePocStatus) => callback(status)
      ipcRenderer.on('dwservice:poc-status', listener)
      return () => ipcRenderer.removeListener('dwservice:poc-status', listener)
    }
  },
  dwServiceAgent: {
    getState: () => ipcRenderer.invoke('dwservice:agent-get-state'),
    applyCode: (installationCode, configurationId, proof) =>
      ipcRenderer.invoke('dwservice:agent-apply-code', installationCode, configurationId, proof)
  },
  system: {
    getContext: () => ipcRenderer.invoke('system:get-context'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('system:set-auto-launch', enabled),
    setNotificationsEnabled: (enabled) => ipcRenderer.invoke('system:set-notifications-enabled', enabled),
    notify: (title, body) => ipcRenderer.invoke('system:notify', title, body),
    hideMainWindow: () => ipcRenderer.invoke('system:hide-main-window'),
    getConsent: () => ipcRenderer.invoke('system:get-consent'),
    setConsent: (consent) => ipcRenderer.invoke('system:set-consent', consent),
    checkForUpdates: (silent) => ipcRenderer.invoke('system:check-for-updates', silent),
    getUpdateStatus: () => ipcRenderer.invoke('system:get-update-status'),
    onUpdateStatus: (callback) => {
      const listener = (_event: unknown, status: UpdateStatusPayload) => callback(status)
      ipcRenderer.on('system:update-status', listener)
      return () => ipcRenderer.removeListener('system:update-status', listener)
    },
    setUpdateChannel: (channel) => ipcRenderer.invoke('system:set-update-channel', channel),
    createDiagnosticBundle: (summary) => ipcRenderer.invoke('system:create-diagnostic-bundle', summary),
    logEvent: (level, event, details) => ipcRenderer.invoke('system:log-event', level, event, details),
    signInWithGoogle: () => ipcRenderer.invoke('system:sign-in-with-google'),
    selectFolder: () => ipcRenderer.invoke('system:select-folder'),
    setRegisteredDeviceId: (deviceId) => ipcRenderer.invoke('system:set-registered-device-id', deviceId),
    promptRestart: (title, body, remindAfterMinutes) => ipcRenderer.invoke('system:prompt-restart', title, body, remindAfterMinutes)
  },
  telemetry: {
    collect: () => ipcRenderer.invoke('telemetry:collect'),
    inventory: () => ipcRenderer.invoke('telemetry:inventory')
  },
  terminal: {
    execute: (shell: CommandShell, command: string, deviceId?: string, requestedBy?: string) =>
      ipcRenderer.invoke('terminal:execute', shell, command, deviceId, requestedBy)
  },
  backup: {
    sync: (policy: BackupPolicy, accessToken: string, deviceId: string, hostname: string) =>
      ipcRenderer.invoke('backup:sync', policy, accessToken, deviceId, hostname),
    listFiles: (policy: BackupPolicy, accessToken: string, hostname: string) =>
      ipcRenderer.invoke('backup:list-files', policy, accessToken, hostname),
    removePathFromCloud: (policy: BackupPolicy, accessToken: string, deviceId: string, hostname: string, watchedPath: string) =>
      ipcRenderer.invoke('backup:remove-path-from-cloud', policy, accessToken, deviceId, hostname, watchedPath),
    restore: (policy: BackupPolicy, accessToken: string, hostname: string) =>
      ipcRenderer.invoke('backup:restore', policy, accessToken, hostname),
    onSyncProgress: (callback) => {
      const listener = (_event: unknown, payload: { deviceId: string; totalFiles: number; processedFiles: number; uploadedFiles: number }) =>
        callback(payload)
      ipcRenderer.on('backup:sync-progress', listener)
      return () => ipcRenderer.removeListener('backup:sync-progress', listener)
    }
  }
}

contextBridge.exposeInMainWorld('janek', api)
