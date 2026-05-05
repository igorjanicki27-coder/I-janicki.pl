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
    promptRestart: (title, body, remindAfterMinutes) => ipcRenderer.invoke('system:prompt-restart', title, body, remindAfterMinutes)
  },
  telemetry: {
    collect: () => ipcRenderer.invoke('telemetry:collect'),
    inventory: () => ipcRenderer.invoke('telemetry:inventory')
  },
  terminal: {
    execute: (shell: CommandShell, command: string) => ipcRenderer.invoke('terminal:execute', shell, command)
  },
  vault: {
    encrypt: (plainText: string) => ipcRenderer.invoke('vault:encrypt', plainText)
  },
  backup: {
    sync: (policy: BackupPolicy, accessToken: string, deviceId: string, hostname: string) =>
      ipcRenderer.invoke('backup:sync', policy, accessToken, deviceId, hostname),
    listFiles: (policy: BackupPolicy, accessToken: string, hostname: string) =>
      ipcRenderer.invoke('backup:list-files', policy, accessToken, hostname),
    restore: (policy: BackupPolicy, accessToken: string, hostname: string) =>
      ipcRenderer.invoke('backup:restore', policy, accessToken, hostname)
  },
  rustdesk: {
    getState: () => ipcRenderer.invoke('rustdesk:get-state'),
    launch: () => ipcRenderer.invoke('rustdesk:launch')
  }
}

contextBridge.exposeInMainWorld('janek', api)
