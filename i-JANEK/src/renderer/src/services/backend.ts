import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth'
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
  updateDoc
} from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage'
import { off, onValue, query as dbQuery, ref, set } from 'firebase/database'
import type {
  AlertEvent,
  AppUser,
  ApprovalStatus,
  BackupPolicy,
  BackupSnapshot,
  ChatMessage,
  ConsentRecord,
  DeviceIdentity,
  DeviceRecord,
  DeviceTelemetry,
  InventoryReport,
  TerminalCommand
} from '@shared/contracts'
import { DEFAULT_MASTER_EMAIL, DEFAULT_SYNC_FILE_MB } from '@shared/constants'
import { firebaseServices, hasFirebaseConfig } from './firebase'

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
  subscribeChats: (device: DeviceRecord, callback: (messages: ChatMessage[]) => void) => Unsubscribe
  sendChatMessage: (device: DeviceRecord, message: ChatMessage) => Promise<void>
  updateApprovalStatus: (deviceId: string, approvalStatus: ApprovalStatus, actorEmail: string) => Promise<void>
  publishTelemetry: (device: DeviceRecord, telemetry: DeviceTelemetry) => Promise<void>
  publishInventory: (device: DeviceRecord, inventory: InventoryReport) => Promise<void>
  publishBackupSnapshot: (device: DeviceRecord, snapshot: BackupSnapshot) => Promise<void>
  upsertBackupPolicy: (deviceId: string, policy: BackupPolicy) => Promise<void>
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

function defaultBackupPolicy(hostname: string): BackupPolicy {
  return {
    enabled: true,
    maxFileSizeMb: 200,
    maxQuotaGb: 5,
    syncUnderMb: Number(import.meta.env.VITE_DEFAULT_SYNC_MB || DEFAULT_SYNC_FILE_MB),
    watchedPaths: ['C:\\Users\\Public\\Documents', 'C:\\Users\\Public\\Desktop'],
    driveFolderName: `i-JANEK_Backup/${hostname}`,
    sharedWith: import.meta.env.VITE_MASTER_EMAIL || DEFAULT_MASTER_EMAIL
  }
}

class FirebaseBackend implements BackendClient {
  isMock = false

  subscribeAuth(callback: (user: AppUser | null) => void) {
    const auth = firebaseServices!.auth
    return onAuthStateChanged(auth, (user) => callback(user ? toAppUser(user) : null))
  }

  async signInWithGoogle() {
    const provider = new GoogleAuthProvider()
    provider.addScope('https://www.googleapis.com/auth/drive.file')
    provider.addScope('profile')
    provider.addScope('email')
    const result = await signInWithPopup(firebaseServices!.auth, provider)
    const credential = GoogleAuthProvider.credentialFromResult(result)
    return toAppUser(result.user, credential?.accessToken)
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
      backupPolicy: existing?.backupPolicy ?? defaultBackupPolicy(context.hostname),
      rustdesk: existing?.rustdesk ?? { installed: false }
    }

    await setDoc(deviceRef, nextRecord, { merge: true })
    return nextRecord
  }

  subscribeDevices(user: AppUser, callback: (devices: DeviceRecord[]) => void) {
    const firestore = firebaseServices!.firestore
    const baseQuery =
      user.role === 'master'
        ? query(collection(firestore, 'devices'), orderBy('updatedAt', 'desc'))
        : query(collection(firestore, 'devices'), orderBy('updatedAt', 'desc'))

    return onSnapshot(baseQuery, (snapshot) => {
      const devices = snapshot.docs
        .map((entry) => entry.data() as DeviceRecord)
        .filter((device) => user.role === 'master' || device.ownerUid === user.uid)
      callback(devices)
    })
  }

  subscribeAlerts(user: AppUser, callback: (alerts: AlertEvent[]) => void) {
    const firestore = firebaseServices!.firestore
    const alertsQuery = query(collection(firestore, 'events'), orderBy('createdAt', 'desc'), limit(100))
    return onSnapshot(alertsQuery, (snapshot) => {
      const alerts = snapshot.docs
        .map((entry) => ({ id: entry.id, ...(entry.data() as Omit<AlertEvent, 'id'> & { ownerUid?: string }) }))
        .filter((alert) => user.role === 'master' || alert.ownerUid === user.uid)
      callback(alerts)
    })
  }

  subscribeChats(device: DeviceRecord, callback: (messages: ChatMessage[]) => void) {
    const messagesRef = ref(firebaseServices!.database, `chats/${device.ownerUid}/${device.deviceId}`)
    const listener = onValue(messagesRef, (snapshot) => {
      const value = snapshot.val() ?? {}
      const messages = Object.entries(value)
        .map(([id, entry]) => ({ id, ...(entry as Omit<ChatMessage, 'id'>) }))
        .sort((a, b) => a.createdAt - b.createdAt)
      callback(messages)
    })

    return () => off(messagesRef, 'value', listener)
  }

  async sendChatMessage(device: DeviceRecord, message: ChatMessage) {
    const messagesRef = ref(firebaseServices!.database, `chats/${device.ownerUid}/${device.deviceId}/${message.id}`)
    await set(messagesRef, message)
  }

  async updateApprovalStatus(deviceId: string, approvalStatus: ApprovalStatus, actorEmail: string) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      approvalStatus,
      updatedAt: Date.now(),
      approvedBy: actorEmail
    })
  }

  async publishTelemetry(device: DeviceRecord, telemetry: DeviceTelemetry) {
    await set(ref(firebaseServices!.database, `telemetry/${device.ownerUid}/${device.deviceId}/latest`), telemetry)
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

  async queueCommand(device: DeviceRecord, payload: Pick<TerminalCommand, 'shell' | 'command' | 'requestedBy'>) {
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
  private chatListeners = new Map<string, Set<(messages: ChatMessage[]) => void>>()
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
        cpuTemperatureC: 92,
        cpuHotZones: [
          { label: 'Core 1', temperatureC: 92 },
          { label: 'Core 2', temperatureC: 89 }
        ],
        memoryUsedPercent: 77,
        disks: [{ fs: 'C:', mount: 'C:', usedPercent: 81, sizeGb: 512 }],
        uptimeSeconds: 86_400,
        lastRestartAt: Date.now() - 86_400_000,
        lastShutdownAt: Date.now() - 172_800_000,
        topProcesses: [],
        state: 'alert'
      },
      backupPolicy: defaultBackupPolicy('STUDIO-PC'),
      rustdesk: { installed: true, sessionHint: 'Demo session #481516' }
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
  private chats = new Map<string, ChatMessage[]>([
    [
      'STUDIO-PC-MOCK001',
      [
        {
          id: 'msg-1',
          deviceId: 'STUDIO-PC-MOCK001',
          senderRole: 'master',
          senderEmail: DEFAULT_MASTER_EMAIL,
          body: 'Dzień dobry, widzę alert temperatury. Czy mogę uruchomić diagnostykę?',
          createdAt: Date.now() - 120_000,
          delivered: true
        }
      ]
    ]
  ])
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
      backupPolicy: defaultBackupPolicy(context.hostname),
      rustdesk: { installed: false }
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

  subscribeChats(device: DeviceRecord, callback: (messages: ChatMessage[]) => void) {
    const key = device.deviceId
    const listeners = this.chatListeners.get(key) ?? new Set()
    listeners.add(callback)
    this.chatListeners.set(key, listeners)
    callback(this.chats.get(key) ?? [])
    return () => listeners.delete(callback)
  }

  async sendChatMessage(device: DeviceRecord, message: ChatMessage) {
    const current = this.chats.get(device.deviceId) ?? []
    current.push(message)
    this.chats.set(device.deviceId, current)
    this.chatListeners.get(device.deviceId)?.forEach((listener) => listener(current))
  }

  async updateApprovalStatus(deviceId: string, approvalStatus: ApprovalStatus) {
    this.devices = this.devices.map((device) => (device.deviceId === deviceId ? { ...device, approvalStatus, updatedAt: Date.now() } : device))
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

export function createBackendClient(): BackendClient {
  if (hasFirebaseConfig && import.meta.env.VITE_ENABLE_MOCK_BACKEND !== 'true') {
    return new FirebaseBackend()
  }
  return new MockBackend()
}
