import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User
} from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage'
import { off, onValue, query as dbQuery, ref, set } from 'firebase/database'
import type {
  AlertEvent,
  AppUser,
  ApprovalStatus,
  BackupPolicy,
  BackupSnapshot,
  CompanyChatMessage,
  ConsentRecord,
  DeviceIdentity,
  DeviceRecord,
  DeviceTelemetry,
  InventoryReport,
  RemoteMasterSettings,
  RemoteActionRequest,
  TerminalCommand
} from '@shared/contracts'
import { DEFAULT_MASTER_EMAIL, DEFAULT_SYNC_FILE_MB } from '@shared/constants'
import { firebaseServices, hasFirebaseCoreConfig, hasRealtimeDatabaseConfig } from './firebase'

type Unsubscribe = () => void

export interface BackendClient {
  isMock: boolean
  subscribeAuth: (callback: (user: AppUser | null) => void) => Unsubscribe
  signInWithGoogle: () => Promise<AppUser>
  signInDemo: (role: 'master' | 'slave') => Promise<AppUser>
  signOut: () => Promise<void>
  ensureDeviceRecord: (user: AppUser, context: DeviceIdentity, consent?: ConsentRecord) => Promise<DeviceRecord>
  subscribeDevices: (user: AppUser, callback: (devices: DeviceRecord[]) => void) => Unsubscribe
  subscribeAlerts: (user: AppUser, callback: (alerts: AlertEvent[]) => void) => Unsubscribe
  subscribeCompanyChats: (ownerUid: string, callback: (messages: CompanyChatMessage[]) => void) => Unsubscribe
  subscribeRemoteMasterSettings: (callback: (settings: Partial<RemoteMasterSettings> | null) => void) => Unsubscribe
  sendCompanyChatMessage: (ownerUid: string, message: CompanyChatMessage) => Promise<void>
  saveRemoteMasterSettings: (settings: RemoteMasterSettings) => Promise<void>
  updateApprovalStatus: (deviceId: string, approvalStatus: ApprovalStatus, actorEmail: string) => Promise<void>
  updateDeviceAlias: (deviceId: string, deviceAlias: string) => Promise<void>
  publishTelemetry: (device: DeviceRecord, telemetry: DeviceTelemetry) => Promise<void>
  publishInventory: (device: DeviceRecord, inventory: InventoryReport) => Promise<void>
  publishBackupSnapshot: (device: DeviceRecord, snapshot: BackupSnapshot) => Promise<void>
  upsertBackupPolicy: (deviceId: string, policy: BackupPolicy) => Promise<void>
  updateConsent: (deviceId: string, consent: ConsentRecord | null) => Promise<void>
  requestDeviceUpdate: (deviceId: string, requestedBy: string) => Promise<string>
  acknowledgeDeviceUpdate: (deviceId: string, requestId: string, result: string) => Promise<void>
  requestRemoteAction: (deviceId: string, request: RemoteActionRequest) => Promise<string>
  acknowledgeRemoteAction: (deviceId: string, requestId: string, result: string) => Promise<void>
  queueCommand: (device: DeviceRecord, payload: Pick<TerminalCommand, 'shell' | 'command' | 'requestedBy'>) => Promise<void>
  subscribePendingCommands: (device: DeviceRecord, callback: (commands: TerminalCommand[]) => void) => Unsubscribe
  completeCommand: (device: DeviceRecord, command: TerminalCommand) => Promise<void>
  pushAlert: (device: DeviceRecord, alert: AlertEvent) => Promise<void>
  setPresence: (device: DeviceRecord, role: AppUser['role'], online: boolean) => Promise<void>
}

function toRole(email: string) {
  return email.toLowerCase() === (import.meta.env.VITE_MASTER_EMAIL || DEFAULT_MASTER_EMAIL).toLowerCase() ? 'master' : 'slave'
}

function toAppUser(user: User, accessToken?: string): AppUser {
  return {
    uid: user.uid,
    email: user.email ?? 'unknown@example.com',
    displayName: user.displayName ?? user.email ?? 'i-JANEK User',
    photoURL: user.photoURL,
    role: toRole(user.email ?? ''),
    accessToken
  }
}

function defaultBackupPolicy(_hostname: string): BackupPolicy {
  return {
    enabled: true,
    maxFileSizeMb: 200,
    maxQuotaGb: 5,
    syncUnderMb: Number(import.meta.env.VITE_DEFAULT_SYNC_MB || DEFAULT_SYNC_FILE_MB),
    watchedPaths: ['%USERPROFILE%\\Desktop', '%USERPROFILE%\\Documents'],
    driveFolderName: 'i-JANEK_Backup',
    sharedWith: import.meta.env.VITE_MASTER_EMAIL || DEFAULT_MASTER_EMAIL
  }
}

class FirebaseBackend implements BackendClient {
  isMock = false

  subscribeAuth(callback: (user: AppUser | null) => void) {
    const auth = firebaseServices!.auth
    let unsubscribe: Unsubscribe = () => {}
    let disposed = false

    void (async () => {
      try {
        await getRedirectResult(auth)
      } catch (error) {
        console.warn('[i-JANEK] Redirect Google sign-in failed:', error)
      }
      if (disposed) return
      unsubscribe = onAuthStateChanged(auth, (user) => callback(user ? toAppUser(user) : null))
    })()

    return () => {
      disposed = true
      unsubscribe()
    }
  }

  async signInWithGoogle() {
    const provider = new GoogleAuthProvider()
    provider.addScope('https://www.googleapis.com/auth/drive.file')
    provider.addScope('profile')
    provider.addScope('email')
    provider.setCustomParameters({ prompt: 'select_account' })

    const auth = firebaseServices!.auth
    const isElectron = navigator.userAgent.toLowerCase().includes('electron')

    try {
      const result = await signInWithPopup(auth, provider)
      const credential = GoogleAuthProvider.credentialFromResult(result)
      return toAppUser(result.user, credential?.accessToken)
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : ''
      const fallbackCodes = new Set([
        'auth/popup-blocked',
        'auth/cancelled-popup-request',
        'auth/operation-not-supported-in-this-environment'
      ])

      if (!isElectron && fallbackCodes.has(code)) {
        await signInWithRedirect(auth, provider)
        return new Promise<AppUser>(() => {})
      }

      if (isElectron && fallbackCodes.has(code)) {
        throw new Error('Logowanie Google popup zostalo zablokowane. Zamknij dodatkowe okna logowania i sprobuj ponownie.')
      }

      throw error
    }
  }

  async signInDemo() {
    throw new Error('Demo sign-in is unavailable in Firebase mode.')
  }

  async signOut() {
    await firebaseSignOut(firebaseServices!.auth)
  }

  async ensureDeviceRecord(user: AppUser, context: DeviceIdentity, consent?: ConsentRecord) {
    const firestore = getFirestore(firebaseServices!.app)
    const deviceRef = doc(firestore, 'devices', context.deviceId)
    const snapshot = await getDoc(deviceRef)
    const existing = snapshot.exists() ? (snapshot.data() as DeviceRecord) : undefined

    const nextRecord: DeviceRecord = {
      ...existing,
      ...context,
      ownerUid: user.uid,
      ownerEmail: user.email,
      approvalStatus: existing?.approvalStatus ?? 'pending',
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
      consentAcceptedAt: consent?.acceptedAt ?? existing?.consentAcceptedAt,
      consent: consent ?? existing?.consent ?? null,
      deviceAlias: existing?.deviceAlias ?? context.hostname,
      aliasCustomizedAt: existing?.aliasCustomizedAt ?? null,
      backupPolicy: existing?.backupPolicy ?? defaultBackupPolicy(context.hostname),
      rustdesk: existing?.rustdesk ?? { installed: false },
      updateRequest: existing?.updateRequest ?? null,
      lastHandledUpdateRequestId: existing?.lastHandledUpdateRequestId ?? null,
      lastUpdateResult: existing?.lastUpdateResult ?? null
    }

    await setDoc(deviceRef, nextRecord, { merge: true })
    return nextRecord
  }

  subscribeDevices(user: AppUser, callback: (devices: DeviceRecord[]) => void) {
    const firestore = firebaseServices!.firestore
    const baseQuery =
      user.role === 'master'
        ? query(collection(firestore, 'devices'), orderBy('updatedAt', 'desc'))
        : query(collection(firestore, 'devices'), where('ownerUid', '==', user.uid))

    return onSnapshot(baseQuery, (snapshot) => {
      const devices = snapshot.docs
        .map((entry) => entry.data() as DeviceRecord)
        .sort((a, b) => b.updatedAt - a.updatedAt)
      callback(devices)
    })
  }

  subscribeAlerts(user: AppUser, callback: (alerts: AlertEvent[]) => void) {
    const firestore = firebaseServices!.firestore
    const alertsQuery =
      user.role === 'master'
        ? query(collection(firestore, 'events'), orderBy('createdAt', 'desc'), limit(100))
        : query(collection(firestore, 'events'), where('ownerUid', '==', user.uid))

    return onSnapshot(alertsQuery, (snapshot) => {
      const alerts = snapshot.docs
        .map((entry) => ({ id: entry.id, ...(entry.data() as Omit<AlertEvent, 'id'> & { ownerUid?: string }) }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100)
      callback(alerts)
    })
  }

  subscribeCompanyChats(ownerUid: string, callback: (messages: CompanyChatMessage[]) => void) {
    if (!firebaseServices!.database) {
      callback([])
      return () => {}
    }
    const messagesRef = ref(firebaseServices!.database, `ownerChats/${ownerUid}`)
    const listener = onValue(messagesRef, (snapshot) => {
      const value = snapshot.val() ?? {}
      const messages = Object.entries(value)
        .map(([id, entry]) => ({ id, ...(entry as Omit<CompanyChatMessage, 'id'>) }))
        .sort((a, b) => a.createdAt - b.createdAt)
      callback(messages)
    })

    return () => off(messagesRef, 'value', listener)
  }

  subscribeRemoteMasterSettings(callback: (settings: Partial<RemoteMasterSettings> | null) => void) {
    const settingsRef = doc(firebaseServices!.firestore, 'appConfig', 'masterSettings')
    return onSnapshot(settingsRef, (snapshot) => {
      callback(snapshot.exists() ? (snapshot.data() as Partial<RemoteMasterSettings>) : null)
    })
  }

  async sendCompanyChatMessage(ownerUid: string, message: CompanyChatMessage) {
    if (!firebaseServices!.database) return
    const messagesRef = ref(firebaseServices!.database, `ownerChats/${ownerUid}/${message.id}`)
    await set(messagesRef, message)
  }

  async saveRemoteMasterSettings(settings: RemoteMasterSettings) {
    await setDoc(doc(firebaseServices!.firestore, 'appConfig', 'masterSettings'), settings, { merge: true })
  }

  async updateApprovalStatus(deviceId: string, approvalStatus: ApprovalStatus, actorEmail: string) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      approvalStatus,
      updatedAt: Date.now(),
      approvedBy: actorEmail
    })
  }

  async updateDeviceAlias(deviceId: string, deviceAlias: string) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      deviceAlias: deviceAlias.trim(),
      aliasCustomizedAt: Date.now(),
      updatedAt: Date.now()
    })
  }

  async publishTelemetry(device: DeviceRecord, telemetry: DeviceTelemetry) {
    if (firebaseServices!.database) {
      await set(ref(firebaseServices!.database, `telemetry/${device.ownerUid}/${device.deviceId}/latest`), telemetry)
    }
    await updateDoc(doc(firebaseServices!.firestore, 'devices', device.deviceId), {
      telemetry,
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
      offline: false
    })
  }

  async publishInventory(device: DeviceRecord, inventory: InventoryReport) {
    const payload = JSON.stringify(inventory, null, 2)
    const reportRef = storageRef(firebaseServices!.storage, `inventory/${device.ownerUid}/${device.deviceId}/${inventory.capturedAt}.json`)
    await uploadString(reportRef, payload)
    const reportUrl = await getDownloadURL(reportRef)
    await updateDoc(doc(firebaseServices!.firestore, 'devices', device.deviceId), {
      inventoryCapturedAt: inventory.capturedAt,
      inventoryReportUrl: reportUrl,
      updatedAt: Date.now()
    })
  }

  async publishBackupSnapshot(device: DeviceRecord, snapshot: BackupSnapshot) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', device.deviceId), {
      backupSnapshot: snapshot,
      updatedAt: Date.now()
    })
  }

  async upsertBackupPolicy(deviceId: string, policy: BackupPolicy) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      backupPolicy: policy,
      updatedAt: Date.now()
    })
  }

  async updateConsent(deviceId: string, consent: ConsentRecord | null) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      consent,
      consentAcceptedAt: consent?.acceptedAt ?? null,
      monitoringEnabled: Boolean(consent?.diagnosticsConsent),
      updatedAt: Date.now()
    })
  }

  async requestDeviceUpdate(deviceId: string, requestedBy: string) {
    const requestId = crypto.randomUUID()
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      updateRequest: {
        id: requestId,
        requestedAt: Date.now(),
        requestedBy
      },
      updatedAt: Date.now()
    })
    return requestId
  }

  async acknowledgeDeviceUpdate(deviceId: string, requestId: string, result: string) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      lastHandledUpdateRequestId: requestId,
      lastUpdateResult: result,
      updatedAt: Date.now()
    })
  }

  async requestRemoteAction(deviceId: string, request: RemoteActionRequest) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      remoteActionRequest: request,
      updatedAt: Date.now()
    })
    return request.id
  }

  async acknowledgeRemoteAction(deviceId: string, requestId: string, result: string) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      lastHandledRemoteActionRequestId: requestId,
      lastRemoteActionResult: result,
      updatedAt: Date.now()
    })
  }

  async queueCommand(device: DeviceRecord, payload: Pick<TerminalCommand, 'shell' | 'command' | 'requestedBy'>) {
    if (!firebaseServices!.database) return
    const command: TerminalCommand = {
      id: crypto.randomUUID(),
      deviceId: device.deviceId,
      shell: payload.shell,
      command: payload.command,
      requestedBy: payload.requestedBy,
      requestedAt: Date.now(),
      status: 'queued'
    }
    await set(ref(firebaseServices!.database, `commands/${device.ownerUid}/${device.deviceId}/${command.id}`), command)
  }

  subscribePendingCommands(device: DeviceRecord, callback: (commands: TerminalCommand[]) => void) {
    if (!firebaseServices!.database) {
      callback([])
      return () => {}
    }
    const commandsRef = ref(firebaseServices!.database, `commands/${device.ownerUid}/${device.deviceId}`)
    const listener = onValue(dbQuery(commandsRef), (snapshot) => {
      const value = snapshot.val() ?? {}
      const commands = Object.values(value)
        .map((entry) => entry as TerminalCommand)
        .filter((command) => command.status === 'queued')
        .sort((a, b) => a.requestedAt - b.requestedAt)
      callback(commands)
    })
    return () => off(commandsRef, 'value', listener)
  }

  async completeCommand(device: DeviceRecord, command: TerminalCommand) {
    if (!firebaseServices!.database) return
    await set(ref(firebaseServices!.database, `commands/${device.ownerUid}/${device.deviceId}/${command.id}`), command)
  }

  async pushAlert(device: DeviceRecord, alert: AlertEvent) {
    await addDoc(collection(firebaseServices!.firestore, 'events'), {
      ...alert,
      id: undefined,
      ownerUid: device.ownerUid
    })
  }

  async setPresence(device: DeviceRecord, role: AppUser['role'], online: boolean) {
    if (!firebaseServices!.database) return
    await set(ref(firebaseServices!.database, `presence/${device.ownerUid}/${device.deviceId}`), {
      role,
      online,
      lastSeenAt: Date.now()
    })
  }
}

class MockBackend implements BackendClient {
  isMock = true
  private authListeners = new Set<(user: AppUser | null) => void>()
  private deviceListeners = new Set<(devices: DeviceRecord[]) => void>()
  private alertListeners = new Set<(alerts: AlertEvent[]) => void>()
  private masterSettingsListeners = new Set<(settings: Partial<RemoteMasterSettings> | null) => void>()
  private chatListeners = new Map<string, Set<(messages: CompanyChatMessage[]) => void>>()
  private commandListeners = new Map<string, Set<(commands: TerminalCommand[]) => void>>()
  private currentUser: AppUser | null = null
  private devices: DeviceRecord[] = [
    {
      ownerUid: 'mock-client',
      ownerEmail: 'klient@example.com',
      deviceId: 'STUDIO-PC-MOCK001',
      machineId: 'MOCK001',
      hostname: 'STUDIO-PC',
      platform: 'win32',
      arch: 'x64',
      appVersion: '0.1.0',
      approvalStatus: 'pending',
      createdAt: Date.now() - 86_400_000,
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
      telemetry: {
        capturedAt: Date.now(),
        cpuUsagePercent: 67,
        cpuTemperatureC: 92,
        cpuHotZones: [
          { label: 'Core 1', temperatureC: 92 },
          { label: 'Core 2', temperatureC: 89 }
        ],
        gpu: {
          model: 'NVIDIA RTX 4070',
          usagePercent: 73,
          memoryUsedPercent: 61,
          temperatureC: 78,
          driverVersion: '555.12'
        },
        memoryUsedPercent: 77,
        disks: [{ fs: 'C:', mount: 'C:', usedPercent: 81, sizeGb: 512 }],
        uptimeSeconds: 86_400,
        lastRestartAt: Date.now() - 86_400_000,
        lastShutdownAt: Date.now() - 172_800_000,
        topProcesses: [],
        state: 'alert'
      },
      backupPolicy: defaultBackupPolicy('STUDIO-PC'),
      rustdesk: { installed: true, sessionHint: 'Demo session #481516' },
      deviceAlias: 'STUDIO-PC',
      aliasCustomizedAt: Date.now() - 86_300_000,
      updateRequest: null,
      lastHandledUpdateRequestId: null,
      lastUpdateResult: null,
      remoteActionRequest: null,
      lastHandledRemoteActionRequestId: null,
      lastRemoteActionResult: null
    },
    {
      ownerUid: 'mock-client',
      ownerEmail: 'klient@example.com',
      deviceId: 'LAPTOP-MOCK002',
      machineId: 'MOCK002',
      hostname: 'LAPTOP-SERWIS',
      platform: 'win32',
      arch: 'x64',
      appVersion: '0.1.0',
      approvalStatus: 'approved',
      createdAt: Date.now() - 43_200_000,
      updatedAt: Date.now() - 240_000,
      lastSeenAt: Date.now() - 180_000,
      telemetry: {
        capturedAt: Date.now() - 180_000,
        cpuUsagePercent: 24,
        cpuTemperatureC: 58,
        cpuHotZones: [
          { label: 'Core 1', temperatureC: 58 },
          { label: 'Core 2', temperatureC: 55 }
        ],
        gpu: {
          model: 'Intel Iris Xe',
          usagePercent: 12,
          memoryUsedPercent: 28,
          temperatureC: 49,
          driverVersion: '31.0'
        },
        memoryUsedPercent: 46,
        disks: [{ fs: 'C:', mount: 'C:', usedPercent: 52, sizeGb: 1000 }],
        uptimeSeconds: 54_000,
        lastRestartAt: Date.now() - 54_000_000,
        lastShutdownAt: Date.now() - 90_000_000,
        topProcesses: [],
        state: 'healthy'
      },
      backupPolicy: defaultBackupPolicy('LAPTOP-SERWIS'),
      backupSnapshot: {
        scannedAt: Date.now() - 3_600_000,
        totalFiles: 1204,
        totalBytes: 8_200_000_000,
        uploadedFiles: 1187,
        skippedFiles: 17,
        skippedReasons: []
      },
      rustdesk: { installed: true, sessionHint: 'Demo session #A02' },
      deviceAlias: 'Laptop Serwis',
      aliasCustomizedAt: Date.now() - 40_000_000,
      updateRequest: null,
      lastHandledUpdateRequestId: null,
      lastUpdateResult: null,
      remoteActionRequest: null,
      lastHandledRemoteActionRequestId: null,
      lastRemoteActionResult: null
    },
    {
      ownerUid: 'mock-client-2',
      ownerEmail: 'biuro@firma.pl',
      deviceId: 'BIURO-MOCK003',
      machineId: 'MOCK003',
      hostname: 'BIURO-PC',
      platform: 'win32',
      arch: 'x64',
      appVersion: '0.1.0',
      approvalStatus: 'approved',
      createdAt: Date.now() - 120_000_000,
      updatedAt: Date.now() - 120_000,
      lastSeenAt: Date.now() - 120_000,
      telemetry: {
        capturedAt: Date.now() - 120_000,
        cpuUsagePercent: 82,
        cpuTemperatureC: 84,
        cpuHotZones: [
          { label: 'Core 1', temperatureC: 84 },
          { label: 'Core 2', temperatureC: 82 }
        ],
        gpu: {
          model: 'NVIDIA GTX 1660',
          usagePercent: 88,
          memoryUsedPercent: 71,
          temperatureC: 83,
          driverVersion: '552.44'
        },
        memoryUsedPercent: 88,
        disks: [{ fs: 'C:', mount: 'C:', usedPercent: 93, sizeGb: 256 }],
        uptimeSeconds: 240_000,
        lastRestartAt: Date.now() - 240_000_000,
        lastShutdownAt: Date.now() - 360_000_000,
        topProcesses: [],
        state: 'alert'
      },
      backupPolicy: defaultBackupPolicy('BIURO-PC'),
      backupSnapshot: {
        scannedAt: Date.now() - 48 * 60 * 60 * 1000,
        totalFiles: 543,
        totalBytes: 2_300_000_000,
        uploadedFiles: 521,
        skippedFiles: 22,
        skippedReasons: []
      },
      rustdesk: { installed: false },
      deviceAlias: 'Biuro-PC',
      aliasCustomizedAt: Date.now() - 118_000_000,
      updateRequest: null,
      lastHandledUpdateRequestId: null,
      lastUpdateResult: null,
      remoteActionRequest: null,
      lastHandledRemoteActionRequestId: null,
      lastRemoteActionResult: null
    }
  ]
  private alerts: AlertEvent[] = [
    {
      id: 'mock-alert-1',
      deviceId: 'STUDIO-PC-MOCK001',
      type: 'temperature',
      title: 'CPU powyżej 90°C',
      message: 'Interwał alertowy przełączony na 5 minut.',
      severity: 'critical',
      createdAt: Date.now() - 300_000
    }
  ]
  private chats = new Map<string, CompanyChatMessage[]>([
    [
      'mock-client',
      [
        {
          id: 'msg-1',
          ownerUid: 'mock-client',
          ownerEmail: 'klient@example.com',
          senderRole: 'master',
          senderEmail: DEFAULT_MASTER_EMAIL,
          body: 'Dzień dobry, widzę alert temperatury. Czy mogę uruchomić diagnostykę?',
          createdAt: Date.now() - 120_000,
          delivered: true,
          deviceId: 'STUDIO-PC-MOCK001',
          deviceLabel: 'STUDIO-PC'
        }
      ]
    ],
    [
      'mock-client-2',
      [
        {
          id: 'msg-2',
          ownerUid: 'mock-client-2',
          ownerEmail: 'biuro@firma.pl',
          senderRole: 'slave',
          senderEmail: 'biuro@firma.pl',
          body: 'Proszę o sprawdzenie backupu, ostatnio był problem z dyskiem.',
          createdAt: Date.now() - 300_000,
          delivered: true,
          deviceId: 'BIURO-MOCK003',
          deviceLabel: 'Biuro-PC'
        }
      ]
    ]
  ])
  private remoteMasterSettings: RemoteMasterSettings = {
    telemetryMode: 'standard',
    thresholds: {
      cpuUsage: { warning: 60, critical: 85 },
      gpuUsage: { warning: 65, critical: 90 },
      ramUsage: { warning: 70, critical: 90 },
      diskUsage: { warning: 75, critical: 90 },
      cpuTemp: { warning: 80, critical: 90 },
      gpuTemp: { warning: 70, critical: 85 },
      backupAgeHours: { warning: 24, critical: 72 }
    }
  }
  private commandQueue = new Map<string, TerminalCommand[]>()

  subscribeAuth(callback: (user: AppUser | null) => void) {
    this.authListeners.add(callback)
    callback(this.currentUser)
    return () => this.authListeners.delete(callback)
  }

  async signInWithGoogle() {
    return this.signInDemo('slave')
  }

  async signInDemo(role: 'master' | 'slave') {
    this.currentUser = {
      uid: role === 'master' ? 'mock-master' : 'mock-client',
      email: role === 'master' ? DEFAULT_MASTER_EMAIL : 'klient@example.com',
      displayName: role === 'master' ? 'Igor Janicki' : 'Klient Demo',
      role,
      accessToken: 'mock-drive-token'
    }
    this.authListeners.forEach((listener) => listener(this.currentUser))
    return this.currentUser
  }

  async signOut() {
    this.currentUser = null
    this.authListeners.forEach((listener) => listener(null))
  }

  async ensureDeviceRecord(user: AppUser, context: DeviceIdentity, consent?: ConsentRecord) {
    if (user.role === 'master') {
      return this.devices[0]
    }
    const existing = this.devices.find((device) => device.deviceId === context.deviceId)
    if (existing) return existing

    const device: DeviceRecord = {
      ...context,
      ownerUid: user.uid,
      ownerEmail: user.email,
      approvalStatus: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
      consentAcceptedAt: consent?.acceptedAt,
      consent: consent ?? null,
      deviceAlias: context.hostname,
      aliasCustomizedAt: null,
      backupPolicy: defaultBackupPolicy(context.hostname),
      rustdesk: { installed: false },
      updateRequest: null,
      lastHandledUpdateRequestId: null,
      lastUpdateResult: null,
      remoteActionRequest: null,
      lastHandledRemoteActionRequestId: null,
      lastRemoteActionResult: null
    }

    this.devices.unshift(device)
    this.emitDevices()
    return device
  }

  subscribeDevices(user: AppUser, callback: (devices: DeviceRecord[]) => void) {
    const wrapped = () => {
      callback(user.role === 'master' ? this.devices : this.devices.filter((device) => device.ownerUid === user.uid))
    }
    this.deviceListeners.add(wrapped)
    wrapped()
    return () => this.deviceListeners.delete(wrapped)
  }

  subscribeAlerts(_user: AppUser, callback: (alerts: AlertEvent[]) => void) {
    this.alertListeners.add(callback)
    callback(this.alerts)
    return () => this.alertListeners.delete(callback)
  }

  subscribeCompanyChats(ownerUid: string, callback: (messages: CompanyChatMessage[]) => void) {
    const key = ownerUid
    const listeners = this.chatListeners.get(key) ?? new Set()
    listeners.add(callback)
    this.chatListeners.set(key, listeners)
    callback(this.chats.get(key) ?? [])
    return () => listeners.delete(callback)
  }

  subscribeRemoteMasterSettings(callback: (settings: Partial<RemoteMasterSettings> | null) => void) {
    this.masterSettingsListeners.add(callback)
    callback(this.remoteMasterSettings)
    return () => this.masterSettingsListeners.delete(callback)
  }

  async sendCompanyChatMessage(ownerUid: string, message: CompanyChatMessage) {
    const current = this.chats.get(ownerUid) ?? []
    current.push(message)
    this.chats.set(ownerUid, current)
    this.chatListeners.get(ownerUid)?.forEach((listener) => listener(current))
  }

  async saveRemoteMasterSettings(settings: RemoteMasterSettings) {
    this.remoteMasterSettings = settings
    this.masterSettingsListeners.forEach((listener) => listener(this.remoteMasterSettings))
  }

  async updateApprovalStatus(deviceId: string, approvalStatus: ApprovalStatus) {
    this.devices = this.devices.map((device) => (device.deviceId === deviceId ? { ...device, approvalStatus, updatedAt: Date.now() } : device))
    this.emitDevices()
  }

  async updateDeviceAlias(deviceId: string, deviceAlias: string) {
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? { ...device, deviceAlias: deviceAlias.trim(), aliasCustomizedAt: Date.now(), updatedAt: Date.now() }
        : device
    )
    this.emitDevices()
  }

  async publishTelemetry(device: DeviceRecord, telemetry: DeviceTelemetry) {
    this.devices = this.devices.map((entry) =>
      entry.deviceId === device.deviceId ? { ...entry, telemetry, lastSeenAt: Date.now(), updatedAt: Date.now() } : entry
    )
    this.emitDevices()
  }

  async publishInventory() {}

  async publishBackupSnapshot(device: DeviceRecord, snapshot: BackupSnapshot) {
    this.devices = this.devices.map((entry) =>
      entry.deviceId === device.deviceId ? { ...entry, backupSnapshot: snapshot, updatedAt: Date.now() } : entry
    ) as DeviceRecord[]
    this.emitDevices()
  }

  async upsertBackupPolicy(deviceId: string, policy: BackupPolicy) {
    this.devices = this.devices.map((device) => (device.deviceId === deviceId ? { ...device, backupPolicy: policy } : device))
    this.emitDevices()
  }

  async updateConsent(deviceId: string, consent: ConsentRecord | null) {
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? { ...device, consent, consentAcceptedAt: consent?.acceptedAt, updatedAt: Date.now() }
        : device
    )
    this.emitDevices()
  }

  async requestDeviceUpdate(deviceId: string, requestedBy: string) {
    const requestId = crypto.randomUUID()
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? {
            ...device,
            updateRequest: {
              id: requestId,
              requestedAt: Date.now(),
              requestedBy
            },
            updatedAt: Date.now()
          }
        : device
    )
    this.emitDevices()
    return requestId
  }

  async acknowledgeDeviceUpdate(deviceId: string, requestId: string, result: string) {
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? { ...device, lastHandledUpdateRequestId: requestId, lastUpdateResult: result, updatedAt: Date.now() }
        : device
    )
    this.emitDevices()
  }

  async requestRemoteAction(deviceId: string, request: RemoteActionRequest) {
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? {
            ...device,
            remoteActionRequest: request,
            updatedAt: Date.now()
          }
        : device
    )
    this.emitDevices()
    return request.id
  }

  async acknowledgeRemoteAction(deviceId: string, requestId: string, result: string) {
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? {
            ...device,
            lastHandledRemoteActionRequestId: requestId,
            lastRemoteActionResult: result,
            updatedAt: Date.now()
          }
        : device
    )
    this.emitDevices()
  }

  async queueCommand(device: DeviceRecord, payload: Pick<TerminalCommand, 'shell' | 'command' | 'requestedBy'>) {
    const queue = this.commandQueue.get(device.deviceId) ?? []
    queue.push({
      id: crypto.randomUUID(),
      deviceId: device.deviceId,
      shell: payload.shell,
      command: payload.command,
      requestedBy: payload.requestedBy,
      requestedAt: Date.now(),
      status: 'queued'
    })
    this.commandQueue.set(device.deviceId, queue)
    this.commandListeners.get(device.deviceId)?.forEach((listener) => listener(queue.filter((entry) => entry.status === 'queued')))
  }

  subscribePendingCommands(device: DeviceRecord, callback: (commands: TerminalCommand[]) => void) {
    const key = device.deviceId
    const listeners = this.commandListeners.get(key) ?? new Set()
    listeners.add(callback)
    this.commandListeners.set(key, listeners)
    callback((this.commandQueue.get(key) ?? []).filter((entry) => entry.status === 'queued'))
    return () => listeners.delete(callback)
  }

  async completeCommand(device: DeviceRecord, command: TerminalCommand) {
    const queue = this.commandQueue.get(device.deviceId) ?? []
    const next = queue.map((entry) => (entry.id === command.id ? command : entry))
    this.commandQueue.set(device.deviceId, next)
    this.commandListeners.get(device.deviceId)?.forEach((listener) => listener(next.filter((entry) => entry.status === 'queued')))
  }

  async pushAlert(device: DeviceRecord, alert: AlertEvent) {
    this.alerts.unshift({ ...alert, deviceId: device.deviceId })
    this.alertListeners.forEach((listener) => listener(this.alerts))
  }

  async setPresence() {}

  private emitDevices() {
    this.deviceListeners.forEach((listener) => listener(this.devices))
  }
}

export function createBackendClient(forceMock = false): BackendClient {
  if (!forceMock && hasFirebaseCoreConfig && import.meta.env.VITE_ENABLE_MOCK_BACKEND !== 'true') {
    if (!hasRealtimeDatabaseConfig) {
      console.warn('[i-JANEK] Realtime Database URL missing. Running Firebase without RTDB-backed live channels.')
    }
    return new FirebaseBackend()
  }
  return new MockBackend()
}
