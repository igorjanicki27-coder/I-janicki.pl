import type {
  BackupRemoteFile,
  BackupPolicy,
  BackupSnapshot,
  CommandShell,
  ConsentRecord,
  DeviceTelemetry,
  InventoryReport,
  RustDeskState,
  SystemContext,
  TerminalCommand
} from './contracts'

export interface JanekApi {
  system: {
    getContext: () => Promise<SystemContext>
    setAutoLaunch: (enabled: boolean) => Promise<void>
    notify: (title: string, body: string) => Promise<void>
    getConsent: () => Promise<ConsentRecord | null>
    setConsent: (consent: ConsentRecord | null) => Promise<void>
    getMasterAesKey: () => Promise<string>
    setMasterAesKey: (key: string) => Promise<void>
    checkForUpdates: (silent: boolean) => Promise<{ status: string; message: string }>
    selectFolder: () => Promise<string | null>
    setRegisteredDeviceId: (deviceId: string | null) => Promise<void>
    promptRestart: (
      title: string,
      body: string,
      remindAfterMinutes?: number
    ) => Promise<{ status: 'restart_now' | 'remind_later' | 'dismissed'; message: string }>
    promptRemoteConnection: (title: string, body: string) => Promise<{ accepted: boolean }>
  }
  telemetry: {
    collect: () => Promise<DeviceTelemetry>
    inventory: () => Promise<InventoryReport>
  }
  terminal: {
    execute: (shell: CommandShell, command: string, deviceId?: string, requestedBy?: string) => Promise<TerminalCommand>
  }
  vault: {
    encrypt: (plainText: string) => Promise<string>
  }
  backup: {
    sync: (policy: BackupPolicy, accessToken: string, deviceId: string, hostname: string) => Promise<BackupSnapshot>
    listFiles: (policy: BackupPolicy, accessToken: string, hostname: string) => Promise<BackupRemoteFile[]>
    removePathFromCloud: (
      policy: BackupPolicy,
      accessToken: string,
      deviceId: string,
      hostname: string,
      watchedPath: string
    ) => Promise<{ deletedFiles: number }>
    restore: (
      policy: BackupPolicy,
      accessToken: string,
      hostname: string
    ) => Promise<{ restoredFiles: number; restoredBytes: number; destinationPath: string }>
    onSyncProgress: (
      callback: (payload: {
        deviceId: string
        totalFiles: number
        processedFiles: number
        uploadedFiles: number
      }) => void
    ) => () => void
  }
  rustdesk: {
    getState: (deviceId?: string) => Promise<RustDeskState>
    launch: (deviceId?: string) => Promise<RustDeskState>
    rotatePassword: (reason?: 'manual' | 'daily' | 'post_connection') => Promise<RustDeskState>
  }
}
