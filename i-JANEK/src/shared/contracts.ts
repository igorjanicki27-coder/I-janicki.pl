export type UserRole = 'master' | 'slave'
export type ThemeMode = 'dark' | 'light'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type DeviceHealthState = 'healthy' | 'warning' | 'alert' | 'offline'
export type CommandShell = 'powershell' | 'cmd' | 'shell'
export type RemoteActionType = 'notify' | 'restart_prompt' | 'launch_rustdesk'
export type TelemetryMode = 'standard' | 'aggressive'
export type UpdateChannel = 'test' | 'beta' | 'stable'
export type ServiceRequestPriority = 'low' | 'normal' | 'high' | 'critical'
export type ServiceRequestStatus = 'open' | 'in_progress' | 'resolved'
export type ReadinessStatus = 'ok' | 'warning' | 'error' | 'skipped'
export type DiagnosticLogLevel = 'info' | 'warning' | 'error'

export interface ReadinessCheckResult {
  id: string
  label: string
  status: ReadinessStatus
  message: string
}

export interface DiagnosticBundleSummary {
  readiness: ReadinessCheckResult[]
  offlineQueueCount: number
  signedIn: boolean
  role?: UserRole
  deviceApproval?: ApprovalStatus | null
}

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
  remoteAccessKey?: RemoteAccessPublicKey
}

export interface RemoteAccessPublicKey {
  keyId: string
  jwk: Record<string, unknown>
  createdAt: number
}

export interface MasterSecurityConfig {
  publicKey: RemoteAccessPublicKey
  encryptedPrivateKey: string
  salt: string
  iv: string
  iterations: number
  createdAt: number
}

export interface EncryptedRemoteAccess {
  keyId: string
  algorithm: 'RSA-OAEP-256'
  ciphertext: string
  updatedAt: number
}

export interface RemoteAccessCredential {
  deviceId: string
  rustdeskId: string
  password: string
  issuedAt: number
}

export interface AppUser {
  uid: string
  email: string
  displayName: string
  photoURL?: string | null
  role: UserRole
  companyName?: string
  installationLocation?: string
  accessToken?: string
}

export interface RegistrationDetails {
  fullName: string
  companyName: string
  installationLocation?: string
}

export interface ClientProfile {
  uid: string
  email: string
  displayName: string
  photoURL?: string | null
  role: UserRole
  companyName: string
  installationLocation: string
  createdAt: number
  updatedAt: number
  lastLoginAt: number
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
  contactName?: string
  installationLocation?: string
  deviceAlias?: string
  aliasCustomizedAt?: number | null
  approvalStatus: ApprovalStatus
  updateChannel?: UpdateChannel
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
  inventoryReportId?: string
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

export interface ServiceRequest {
  id: string
  ownerUid: string
  ownerEmail: string
  deviceId: string
  deviceLabel: string
  companyName: string
  title: string
  description: string
  priority: ServiceRequestPriority
  status: ServiceRequestStatus
  createdAt: number
  updatedAt: number
  resolvedAt?: number | null
}

export interface ServiceRequestInternalComment {
  id: string
  requestId: string
  authorUid: string
  authorEmail: string
  body: string
  createdAt: number
}

export interface UsageDailyRollup {
  id: string
  ownerUid: string
  deviceId: string
  dayKey: string
  observedSeconds: number
  cpuObservedSeconds: number
  cpuOver80Seconds: number
  gpuObservedSeconds: number
  gpuOver80Seconds: number
  ramObservedSeconds: number
  ramOver80Seconds: number
  diskObservedSeconds: number
  diskOver80Seconds: number
  anyOver80Seconds: number
  restartCount: number
  sampleCount: number
  updatedAt: number
}

export type UsageRollupDelta = Omit<UsageDailyRollup, 'id' | 'ownerUid' | 'deviceId' | 'updatedAt'>

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
  remoteCommandConsent: boolean
  unattendedAccessConsent: boolean
}

export interface RustDeskState {
  binaryPath?: string
  installed: boolean
  platform?: string
  unattendedReady?: boolean
  requiresPermissions?: boolean
  permissionHint?: string
  encryptedAccess?: EncryptedRemoteAccess
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
