import type {
  CommandShell,
  ConsentRecord,
  DeviceTelemetry,
  DiagnosticBundleSummary,
  DiagnosticLogLevel,
  DwServiceAgentState,
  InventoryReport,
  SystemContext,
  TerminalCommand,
  UpdateChannel
} from './contracts'

export type UpdateStatusKind =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up_to_date'
  | 'error'

export interface UpdateStatusPayload {
  status: UpdateStatusKind
  message: string
  version?: string
  percent?: number
}

export interface DwServicePocStatus {
  state: 'loading' | 'ready' | 'popup' | 'error' | 'closed'
  url?: string
  error?: string
  popupCount: number
}

export interface JanekApi {
  dwServicePoc: {
    open: () => Promise<void>
    close: () => Promise<void>
    setBounds: (rect: { x: number; y: number; width: number; height: number }) => Promise<void>
    closePopup: () => Promise<void>
    goBack: () => Promise<void>
    onStatus: (callback: (status: DwServicePocStatus) => void) => () => void
  }
  dwServiceAgent: {
    getState: () => Promise<DwServiceAgentState>
    applyCode: (
      installationCode: string,
      configurationId: string,
      proof: { deviceId: string; firebaseIdToken: string; firebaseProjectId: string }
    ) => Promise<DwServiceAgentState>
  }
  system: {
    getContext: () => Promise<SystemContext>
    setAutoLaunch: (enabled: boolean) => Promise<void>
    setNotificationsEnabled: (enabled: boolean) => Promise<void>
    notify: (title: string, body: string) => Promise<void>
    hideMainWindow: () => Promise<void>
    getConsent: () => Promise<ConsentRecord | null>
    setConsent: (consent: ConsentRecord | null) => Promise<void>
    checkForUpdates: (silent: boolean) => Promise<{ status: string; message: string }>
    getUpdateStatus: () => Promise<UpdateStatusPayload>
    onUpdateStatus: (callback: (status: UpdateStatusPayload) => void) => () => void
    setUpdateChannel: (channel: UpdateChannel) => Promise<void>
    createDiagnosticBundle: (summary: DiagnosticBundleSummary) => Promise<{ saved: boolean; path?: string }>
    logEvent: (level: DiagnosticLogLevel, event: string, details?: Record<string, unknown>) => Promise<void>
    setRegisteredDeviceId: (deviceId: string | null) => Promise<void>
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
    execute: (shell: CommandShell, command: string, deviceId?: string, requestedBy?: string) => Promise<TerminalCommand>
  }
}
