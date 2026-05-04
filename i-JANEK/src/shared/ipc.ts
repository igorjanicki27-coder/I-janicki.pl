import type {
  BackupPolicy,
  BackupSnapshot,
  CommandShell,
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
    sync: (policy: BackupPolicy, accessToken: string, deviceId: string) => Promise<BackupSnapshot>
  }
  rustdesk: {
    getState: () => Promise<RustDeskState>
    launch: () => Promise<RustDeskState>
  }
}
