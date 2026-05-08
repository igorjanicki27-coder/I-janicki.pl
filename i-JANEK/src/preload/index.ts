import { contextBridge, ipcRenderer } from 'electron'
import type { BackupPolicy, CommandShell } from '@shared/contracts'
import type { JanekApi } from '@shared/ipc'

const api: JanekApi = {
  system: {
    getContext: () => ipcRenderer.invoke('system:get-context'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('system:set-auto-launch', enabled),
    notify: (title, body) => ipcRenderer.invoke('system:notify', title, body),
    getConsent: () => ipcRenderer.invoke('system:get-consent'),
    setConsent: (consent) => ipcRenderer.invoke('system:set-consent', consent),
    getMasterAesKey: () => ipcRenderer.invoke('system:get-master-aes-key'),
    setMasterAesKey: (key) => ipcRenderer.invoke('system:set-master-aes-key', key),
    checkForUpdates: (silent) => ipcRenderer.invoke('system:check-for-updates', silent),
    signInWithGoogle: () => ipcRenderer.invoke('system:sign-in-with-google'),
    selectFolder: () => ipcRenderer.invoke('system:select-folder'),
    setRegisteredDeviceId: (deviceId) => ipcRenderer.invoke('system:set-registered-device-id', deviceId),
    promptRestart: (title, body, remindAfterMinutes) => ipcRenderer.invoke('system:prompt-restart', title, body, remindAfterMinutes),
    promptRemoteConnection: (title, body) => ipcRenderer.invoke('system:prompt-remote-connection', title, body)
  },
  telemetry: {
    collect: () => ipcRenderer.invoke('telemetry:collect'),
    inventory: () => ipcRenderer.invoke('telemetry:inventory')
  },
  terminal: {
    execute: (shell: CommandShell, command: string, deviceId?: string, requestedBy?: string) =>
      ipcRenderer.invoke('terminal:execute', shell, command, deviceId, requestedBy)
  },
  vault: {
    encrypt: (plainText: string) => ipcRenderer.invoke('vault:encrypt', plainText),
    decrypt: (cipherText: string) => ipcRenderer.invoke('vault:decrypt', cipherText)
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
  },
  rustdesk: {
    getState: (deviceId?: string) => ipcRenderer.invoke('rustdesk:get-state', deviceId),
    launch: (deviceId?: string) => ipcRenderer.invoke('rustdesk:launch', deviceId),
    rotatePassword: (reason?: 'manual' | 'daily' | 'post_connection') => ipcRenderer.invoke('rustdesk:rotate-password', reason)
  }
}

contextBridge.exposeInMainWorld('janek', api)
