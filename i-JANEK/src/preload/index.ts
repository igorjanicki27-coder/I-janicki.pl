import { contextBridge, ipcRenderer } from 'electron'
import type { BackupPolicy, CommandShell } from '@shared/contracts'
import type { JanekApi } from '@shared/ipc'

const api: JanekApi = {
  system: {
    getContext: () => ipcRenderer.invoke('system:get-context'),
    setAutoLaunch: (enabled) => ipcRenderer.invoke('system:set-auto-launch', enabled),
    notify: (title, body) => ipcRenderer.invoke('system:notify', title, body)
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
    sync: (policy: BackupPolicy, accessToken: string, deviceId: string) =>
      ipcRenderer.invoke('backup:sync', policy, accessToken, deviceId)
  },
  rustdesk: {
    getState: () => ipcRenderer.invoke('rustdesk:get-state'),
    launch: () => ipcRenderer.invoke('rustdesk:launch')
  }
}

contextBridge.exposeInMainWorld('janek', api)
