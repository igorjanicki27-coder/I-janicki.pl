export type UserRole = 'master' | 'slave'
export type ThemeMode = 'dark' | 'light'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type DeviceHealthState = 'healthy' | 'warning' | 'alert' | 'offline'
export type CommandShell = 'powershell' | 'cmd'
export type RemoteActionType = 'notify' | 'restart_prompt' | 'launch_rustdesk'
export type TelemetryMode = 'standard' | 'aggressive'

export interface MetricThreshold {
  warning: number
  critical: number
}

export interface MetricThresholds {
  cpuUsage: MetricThreshold
  gpuUsage: MetricThreshold
  ramUsage: MetricThreshold
  diskUsage: MetricThreshold
  cpuTemp: MetricThreshold
  gpuTemp: MetricThreshold
  backupAgeHours: MetricThreshold
}

export interface RemoteMasterSettings {
  thresholds: MetricThresholds
  telemetryMode: TelemetryMode
  companyOptions: string[]
}

export interface AppUser {
  uid: string
  email: string
  displayName: string
  photoURL?: string | null
  role: UserRole
  accessToken?: string
}

export interface GoogleOAuthTokens {
  idToken: string
  accessToken: string
  refreshToken?: string | null
  expiresAt?: number | null
}

export interface DeviceIdentity {
  deviceId: string
  machineId: string
  hostname: string
  platform: string
  arch: string
  appVersion: string
}

export interface DeviceRecord extends DeviceIdentity {
  ownerUid: string
  ownerEmail: string
  companyName?: string
  deviceAlias?: string
  aliasCustomizedAt?: number | null
  approvalStatus: ApprovalStatus
  lastSeenAt: number
  createdAt: number
  updatedAt: number
  consentAcceptedAt?: number
  consent?: ConsentRecord | null
  offline?: boolean
  telemetry?: DeviceTelemetry
  backupPolicy?: BackupPolicy
  backupSnapshot?: BackupSnapshot
  backupSyncProgress?: {
    totalFiles: number
    processedFiles: number
    uploadedFiles: number
    updatedAt: number
  }
  inventoryCapturedAt?: number
  inventoryReportUrl?: string
  approvedBy?: string
  rustdesk?: RustDeskState
  updateRequest?: UpdateRequest | null
  lastHandledUpdateRequestId?: string | null
  lastUpdateResult?: string | null
  remoteActionRequest?: RemoteActionRequest | null
  lastHandledRemoteActionRequestId?: string | null
  lastRemoteActionResult?: string | null
}

export interface UpdateRequest {
  id: string
  requestedAt: number
  requestedBy: string
}

export interface DeviceTelemetry {
  capturedAt: number
  cpuUsagePercent: number
  cpuTemperatureC: number | null
  cpuHotZones: Array<{ label: string; temperatureC: number | null }>
  gpu?: GpuTelemetry | null
  memoryUsedPercent: number
  disks: Array<{ fs: string; mount: string; usedPercent: number; sizeGb: number }>
  uptimeSeconds: number
  lastRestartAt?: number | null
  lastShutdownAt?: number | null
  topProcesses: ProcessUsage[]
  state: DeviceHealthState
}

export interface GpuTelemetry {
  model: string | null
  usagePercent: number | null
  memoryUsedPercent: number | null
  temperatureC: number | null
  driverVersion?: string | null
}

export interface ProcessUsage {
  pid: number
  name: string
  cpuPercent: number
  memoryPercent: number
  path?: string
}

export interface InventoryReport {
  capturedAt: number
  hardware: {
    manufacturer?: string
    model?: string
    serial?: string
    baseboard?: string
    biosVersion?: string
    ramSlots: Array<{ bank?: string; sizeGb: number; type?: string; serial?: string }>
    disks: Array<{ name: string; serial?: string; sizeGb: number; type?: string }>
  }
  installedApps: Array<{ name: string; version?: string; publisher?: string }>
  windowsUpdates: Array<{ id: string; installedOn?: string; description?: string }>
  defender: Record<string, string | number | boolean | null>
}

export interface BackupPolicy {
  enabled: boolean
  maxFileSizeMb: number
  maxQuotaGb: number
  syncUnderMb: number
  watchedPaths: string[]
  driveFolderName: string
  sharedWith: string
}

export interface BackupSnapshot {
  scannedAt: number
  totalFiles: number
  totalBytes: number
  uploadedFiles: number
  skippedFiles: number
  skippedReasons: Array<{ path: string; reason: string }>
}

export interface BackupRemoteFile {
  path: string
  sizeBytes: number
  modifiedAt: number | null
}

export interface ChatMessage {
  id: string
  deviceId: string
  senderRole: UserRole
  senderEmail: string
  body: string
  createdAt: number
  delivered: boolean
  muted?: boolean
}

export interface CompanyChatMessage {
  id: string
  ownerUid: string
  ownerEmail: string
  senderRole: UserRole
  senderEmail: string
  body: string
  createdAt: number
  delivered: boolean
  deviceId?: string
  deviceLabel?: string
}

export interface TerminalCommand {
  id: string
  deviceId: string
  shell: CommandShell
  command: string
  requestedBy: string
  requestedAt: number
  status: 'queued' | 'running' | 'completed' | 'failed'
  output?: string
  error?: string
  finishedAt?: number
}

export interface AlertEvent {
  id: string
  deviceId: string
  type: 'temperature' | 'usage' | 'disk' | 'approval' | 'backup' | 'system'
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  createdAt: number
  acknowledgedBy?: string
}

export interface RemoteActionRequest {
  id: string
  type: RemoteActionType
  requestedAt: number
  requestedBy: string
  title?: string
  message: string
  remindAfterMinutes?: number
}

export interface ConsentRecord {
  acceptedAt: number
  policyVersion: string
  diagnosticsConsent: boolean
}

export interface RustDeskState {
  binaryPath?: string
  installed: boolean
  lastLaunchAt?: number
  sessionHint?: string
  accessCode?: string
  accessIdentity?: string
  passwordLastRotatedAt?: number
  publicKeyConfigured?: boolean
  policyReady?: boolean
  configEnforced?: boolean
  configLocked?: boolean
}

export interface SystemContext extends DeviceIdentity {
  isPackaged: boolean
}
