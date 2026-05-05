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
    promptRestart: (
      title: string,
      body: string,
      remindAfterMinutes?: number
    ) => Promise<{ status: 'restart_now' | 'remind_later' | 'dismissed'; message: string }>
  }
  telemetry: {
    collect: () => Promise<DeviceTelemetry>
    inventory: () => Promise<InventoryReport>
  }
  terminal: {
    execute: (shell: CommandShell, command: string) => Promise<TerminalCommand>
  }
  vault: {
    encrypt: (plainText: string) => Promise<string>
  }
  backup: {
    sync: (policy: BackupPolicy, accessToken: string, deviceId: string, hostname: string) => Promise<BackupSnapshot>
    listFiles: (policy: BackupPolicy, accessToken: string, hostname: string) => Promise<BackupRemoteFile[]>
    restore: (
      policy: BackupPolicy,
      accessToken: string,
      hostname: string
    ) => Promise<{ restoredFiles: number; restoredBytes: number; destinationPath: string }>
  }
  rustdesk: {
    getState: () => Promise<RustDeskState>
    launch: () => Promise<RustDeskState>
  }
}
