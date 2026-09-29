import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  type User
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  getFirestore,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  where
} from 'firebase/firestore'
import { off, onValue, query as dbQuery, ref, set } from 'firebase/database'
import type {
  AlertEvent,
  AppUser,
  ApprovalStatus,
  BackupPolicy,
  BackupSnapshot,
  CompanyChatMessage,
  ConsentRecord,
  ClientProfile,
  DeviceIdentity,
  DeviceRecord,
  DeviceTelemetry,
  InventoryReport,
  MasterSecurityConfig,
  RemoteMasterSettings,
  RemoteActionRequest,
  RegistrationDetails,
  ServiceRequest,
  ServiceRequestInternalComment,
  ServiceRequestPriority,
  ServiceRequestStatus,
  TerminalCommand,
  UsageDailyRollup,
  UsageRollupDelta,
  UpdateChannel
} from '@shared/contracts'
import { DEFAULT_MASTER_EMAIL, DEFAULT_SYNC_FILE_MB } from '@shared/constants'
import { firebaseServices, hasFirebaseCoreConfig, hasRealtimeDatabaseConfig } from './firebase'

type Unsubscribe = () => void

export interface BackendClient {
  isMock: boolean
  subscribeAuth: (callback: (user: AppUser | null) => void) => Unsubscribe
  signInWithGoogle: () => Promise<AppUser>
  signInWithEmail: (email: string, password: string) => Promise<AppUser>
  registerWithEmail: (email: string, password: string, details: RegistrationDetails) => Promise<AppUser>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
  healthCheck: () => Promise<void>
  ensureUserProfile: (user: AppUser) => Promise<ClientProfile>
  isDeviceIdAvailable: (deviceId: string) => Promise<boolean>
  ensureDeviceRecord: (user: AppUser, context: DeviceIdentity, consent?: ConsentRecord) => Promise<DeviceRecord>
  migrateDeviceRecord: (
    user: AppUser,
    sourceDevice: DeviceRecord,
    nextIdentity: DeviceIdentity,
    nextDeviceAlias: string,
    nextCompanyName: string
  ) => Promise<DeviceRecord>
  deleteDeviceRecord: (deviceId: string) => Promise<void>
  subscribeDevices: (user: AppUser, callback: (devices: DeviceRecord[], isAuthoritative: boolean) => void) => Unsubscribe
  subscribeAlerts: (user: AppUser, callback: (alerts: AlertEvent[]) => void) => Unsubscribe
  subscribeServiceRequests: (user: AppUser, callback: (requests: ServiceRequest[]) => void) => Unsubscribe
  subscribeServiceRequestComments: (callback: (comments: ServiceRequestInternalComment[]) => void) => Unsubscribe
  subscribeCompanyChats: (ownerUid: string, callback: (messages: CompanyChatMessage[]) => void) => Unsubscribe
  subscribeRemoteMasterSettings: (callback: (settings: Partial<RemoteMasterSettings> | null) => void) => Unsubscribe
  sendCompanyChatMessage: (ownerUid: string, message: CompanyChatMessage) => Promise<void>
  saveRemoteMasterSettings: (settings: RemoteMasterSettings) => Promise<void>
  getMasterSecurity: () => Promise<MasterSecurityConfig | null>
  saveMasterSecurity: (config: MasterSecurityConfig) => Promise<void>
  updateApprovalStatus: (deviceId: string, approvalStatus: ApprovalStatus, actorEmail: string) => Promise<void>
  updateDeviceAlias: (deviceId: string, deviceAlias: string) => Promise<void>
  updateDeviceCompanyName: (deviceId: string, companyName: string) => Promise<void>
  updateDeviceRegistrationDetails: (
    deviceId: string,
    details: { deviceAlias?: string; contactName: string; companyName: string; installationLocation: string }
  ) => Promise<void>
  updateDeviceUpdateChannel: (deviceId: string, updateChannel: UpdateChannel) => Promise<void>
  publishTelemetry: (device: DeviceRecord, telemetry: DeviceTelemetry) => Promise<void>
  publishInventory: (device: DeviceRecord, inventory: InventoryReport) => Promise<void>
  getInventory: (device: DeviceRecord) => Promise<InventoryReport | null>
  publishBackupSnapshot: (device: DeviceRecord, snapshot: BackupSnapshot) => Promise<void>
  publishBackupProgress: (
    device: DeviceRecord,
    progress: { totalFiles: number; processedFiles: number; uploadedFiles: number; updatedAt: number }
  ) => Promise<void>
  upsertBackupPolicy: (deviceId: string, policy: BackupPolicy) => Promise<void>
  updateConsent: (deviceId: string, consent: ConsentRecord | null) => Promise<void>
  updateRustDeskState: (deviceId: string, state: DeviceRecord['rustdesk']) => Promise<void>
  requestDeviceUpdate: (deviceId: string, requestedBy: string) => Promise<string>
  acknowledgeDeviceUpdate: (deviceId: string, requestId: string, result: string) => Promise<void>
  requestRemoteAction: (deviceId: string, request: RemoteActionRequest) => Promise<string>
  acknowledgeRemoteAction: (deviceId: string, requestId: string, result: string) => Promise<void>
  queueCommand: (device: DeviceRecord, payload: Pick<TerminalCommand, 'shell' | 'command' | 'requestedBy'>) => Promise<void>
  subscribePendingCommands: (device: DeviceRecord, callback: (commands: TerminalCommand[]) => void) => Unsubscribe
  subscribeCommandHistory: (device: DeviceRecord, callback: (commands: TerminalCommand[]) => void) => Unsubscribe
  completeCommand: (device: DeviceRecord, command: TerminalCommand) => Promise<void>
  pushAlert: (device: DeviceRecord, alert: AlertEvent) => Promise<void>
  removeAlert: (alertId: string) => Promise<void>
  removeActiveAlerts: (deviceId: string, types: AlertEvent['type'][]) => Promise<void>
  createServiceRequest: (
    device: DeviceRecord,
    payload: { title: string; description: string; priority: ServiceRequestPriority }
  ) => Promise<void>
  updateServiceRequestStatus: (requestId: string, status: ServiceRequestStatus) => Promise<void>
  addServiceRequestComment: (requestId: string, body: string, author: AppUser) => Promise<void>
  recordUsageRollup: (device: DeviceRecord, delta: UsageRollupDelta) => Promise<void>
  getUsageRollups: (deviceId: string, fromDayKey: string) => Promise<UsageDailyRollup[]>
  setPresence: (device: DeviceRecord, role: AppUser['role'], online: boolean) => Promise<void>
}

function toRole(email: string) {
  return email.toLowerCase() === (import.meta.env.VITE_MASTER_EMAIL || DEFAULT_MASTER_EMAIL).toLowerCase() ? 'master' : 'slave'
}

function isDeviceOwnedByUser(device: DeviceRecord, user: AppUser) {
  return device.ownerUid === user.uid
    || device.ownerEmail.trim().toLowerCase() === user.email.trim().toLowerCase()
}

function visibleDevicesForUser(devices: DeviceRecord[], user: AppUser) {
  if (user.role === 'master') {
    return devices.filter((device) => !isDeviceOwnedByUser(device, user))
  }
  return devices.filter((device) => device.ownerUid === user.uid)
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
    maxFileSizeMb: 100,
    maxQuotaGb: 10,
    syncUnderMb: Number(import.meta.env.VITE_DEFAULT_SYNC_MB || DEFAULT_SYNC_FILE_MB),
    watchedPaths: ['%USERPROFILE%\\Desktop', '%USERPROFILE%\\Documents'],
    driveFolderName: 'i-JANEK_Backup',
    sharedWith: import.meta.env.VITE_MASTER_EMAIL || DEFAULT_MASTER_EMAIL
  }
}

const INVENTORY_CHUNK_MAX_BYTES = 700 * 1024
const INVENTORY_MAX_BATCH_WRITES = 450

function sanitizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function chunkInventoryItems<T>(items: T[]) {
  const encoder = new TextEncoder()
  const chunks: T[][] = []
  let current: T[] = []
  let currentBytes = 2

  for (const rawItem of items) {
    const item = sanitizeForFirestore(rawItem)
    const itemBytes = encoder.encode(JSON.stringify(item)).byteLength + (current.length ? 1 : 0)
    if (itemBytes > INVENTORY_CHUNK_MAX_BYTES) {
      throw new Error('Pojedynczy element raportu inwentaryzacji przekracza bezpieczny limit Firestore.')
    }
    if (current.length && currentBytes + itemBytes > INVENTORY_CHUNK_MAX_BYTES) {
      chunks.push(current)
      current = []
      currentBytes = 2
    }
    current.push(item)
    currentBytes += itemBytes
  }

  if (current.length || chunks.length === 0) chunks.push(current)
  return chunks
}

function inventoryChunkId(kind: 'installedApps' | 'windowsUpdates', index: number) {
  return `${kind}-${String(index).padStart(3, '0')}`
}

class FirebaseBackend implements BackendClient {
  isMock = false
  private providerAccessToken?: string
  private providerAccessTokenUid: string | null = null
  private pendingRegistrationDetails: RegistrationDetails | null = null
  private activeRegistrationDetails: { uid: string; details: RegistrationDetails } | null = null

  private async writeAuditLog(
    action: string,
    payload: { deviceId?: string; ownerUid?: string; details?: Record<string, string | number | boolean | null> } = {}
  ) {
    const currentUser = firebaseServices!.auth.currentUser
    if (!currentUser) return

    const deviceId = payload.deviceId ?? 'global'
    let ownerUid = payload.ownerUid
    if (!ownerUid && deviceId !== 'global') {
      const deviceSnapshot = await getDoc(doc(firebaseServices!.firestore, 'devices', deviceId))
      ownerUid = deviceSnapshot.exists() ? (deviceSnapshot.data() as DeviceRecord).ownerUid : undefined
    }

    await addDoc(collection(firebaseServices!.firestore, 'auditLogs'), {
      ownerUid: ownerUid ?? currentUser.uid,
      deviceId,
      action,
      actorUid: currentUser.uid,
      actorEmail: currentUser.email ?? 'unknown@example.com',
      details: payload.details ?? {},
      createdAt: Date.now()
    })
  }

  private queueAuditLog(
    action: string,
    payload: { deviceId?: string; ownerUid?: string; details?: Record<string, string | number | boolean | null> } = {}
  ) {
    void this.writeAuditLog(action, payload).catch((error) => {
      console.warn(`[i-JANEK] Nie udało się zapisać audytu (${action}):`, error)
    })
  }

  private clearProviderAccessToken() {
    this.providerAccessToken = undefined
    this.providerAccessTokenUid = null
  }

  private rememberProviderAccessToken(user: User, accessToken?: string | null) {
    if (!accessToken) {
      this.clearProviderAccessToken()
      return
    }

    this.providerAccessToken = accessToken
    this.providerAccessTokenUid = user.uid
  }

  private getProviderAccessToken(user: User) {
    return this.providerAccessTokenUid === user.uid ? this.providerAccessToken : undefined
  }

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
      unsubscribe = onAuthStateChanged(auth, (user) => {
        if (!user) {
          this.clearProviderAccessToken()
          callback(null)
          return
        }

        if (user.isAnonymous) {
          this.clearProviderAccessToken()
          callback(null)
          void firebaseSignOut(auth)
          return
        }

        const registrationDetails = this.activeRegistrationDetails?.uid === user.uid
          ? this.activeRegistrationDetails.details
          : this.pendingRegistrationDetails
        callback({
          ...toAppUser(user, this.getProviderAccessToken(user)),
          ...(registrationDetails
            ? {
                displayName: registrationDetails.fullName,
                companyName: registrationDetails.companyName,
                installationLocation: registrationDetails.installationLocation ?? ''
              }
            : {})
        })
      })
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
    const canUseDesktopOAuth = isElectron && typeof window.janek?.system.signInWithGoogle === 'function'

    if (canUseDesktopOAuth) {
      const desktopTokens = await window.janek.system.signInWithGoogle()
      const credential = GoogleAuthProvider.credential(desktopTokens.idToken, desktopTokens.accessToken)
      const result = await signInWithCredential(auth, credential)
      this.rememberProviderAccessToken(result.user, desktopTokens.accessToken)
      return toAppUser(result.user, desktopTokens.accessToken)
    }

    try {
      const result = await signInWithPopup(auth, provider)
      const credential = GoogleAuthProvider.credentialFromResult(result)
      this.rememberProviderAccessToken(result.user, credential?.accessToken)
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

      if (isElectron && (fallbackCodes.has(code) || code === 'auth/unauthorized-domain')) {
        throw new Error(
          'Desktopowe logowanie Google nie jest jeszcze skonfigurowane. Dodaj plik resources/google-oauth-desktop.local.json albo ustaw GOOGLE_DESKTOP_CLIENT_ID i GOOGLE_DESKTOP_CLIENT_SECRET w aplikacji i spróbuj ponownie.'
        )
      }

      throw error
    }
  }

  async signInWithEmail(email: string, password: string) {
    this.clearProviderAccessToken()
    const result = await signInWithEmailAndPassword(firebaseServices!.auth, email.trim(), password)
    return toAppUser(result.user)
  }

  async registerWithEmail(email: string, password: string, details: RegistrationDetails) {
    this.clearProviderAccessToken()
    const normalizedDetails: RegistrationDetails = {
      fullName: details.fullName.trim(),
      companyName: details.companyName.trim(),
      installationLocation: details.installationLocation?.trim() ?? ''
    }
    this.pendingRegistrationDetails = normalizedDetails
    try {
      const result = await createUserWithEmailAndPassword(firebaseServices!.auth, email.trim(), password)
      this.activeRegistrationDetails = { uid: result.user.uid, details: normalizedDetails }
      await updateProfile(result.user, { displayName: normalizedDetails.fullName })
      const registeredUser: AppUser = {
        ...toAppUser(result.user),
        displayName: normalizedDetails.fullName,
        companyName: normalizedDetails.companyName,
        installationLocation: normalizedDetails.installationLocation
      }
      await this.ensureUserProfile(registeredUser)
      return registeredUser
    } finally {
      this.pendingRegistrationDetails = null
    }
  }

  async sendPasswordReset(email: string) {
    await sendPasswordResetEmail(firebaseServices!.auth, email.trim())
  }

  async signOut() {
    this.clearProviderAccessToken()
    this.activeRegistrationDetails = null
    await firebaseSignOut(firebaseServices!.auth)
  }

  async healthCheck() {
    const currentUser = firebaseServices!.auth.currentUser
    if (!currentUser) throw new Error('Brak aktywnej sesji Firebase.')
    await getDoc(doc(firebaseServices!.firestore, 'clients', currentUser.uid))
  }

  async ensureUserProfile(user: AppUser) {
    const firestore = getFirestore(firebaseServices!.app)
    const profileRef = doc(firestore, 'clients', user.uid)
    const snapshot = await getDoc(profileRef)
    const existing = snapshot.exists() ? (snapshot.data() as ClientProfile) : undefined
    const now = Date.now()
    const profile: ClientProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL ?? null,
      role: user.role,
      companyName: user.companyName ?? existing?.companyName ?? '',
      installationLocation: user.installationLocation ?? existing?.installationLocation ?? '',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastLoginAt: now
    }

    await setDoc(profileRef, profile, { merge: true })
    return profile
  }

  async isDeviceIdAvailable(deviceId: string) {
    const snapshot = await getDoc(doc(firebaseServices!.firestore, 'devices', deviceId))
    return !snapshot.exists()
  }

  async ensureDeviceRecord(user: AppUser, context: DeviceIdentity, consent?: ConsentRecord) {
    const firestore = getFirestore(firebaseServices!.app)
    const deviceRef = doc(firestore, 'devices', context.deviceId)
    const snapshot = await getDoc(deviceRef)
    const existing = snapshot.exists() ? (snapshot.data() as DeviceRecord) : undefined

    const consentAcceptedAt = consent?.acceptedAt ?? existing?.consentAcceptedAt
    const nextRecord: DeviceRecord = {
      ...existing,
      ...context,
      ownerUid: user.uid,
      ownerEmail: user.email,
      approvalStatus: existing?.approvalStatus ?? 'pending',
      updateChannel: existing?.updateChannel ?? 'stable',
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      lastSeenAt: Date.now(),
      ...(consentAcceptedAt == null ? {} : { consentAcceptedAt }),
      consent: consent ?? existing?.consent ?? null,
      deviceAlias: existing?.deviceAlias ?? context.hostname,
      aliasCustomizedAt: existing?.aliasCustomizedAt ?? null,
      backupPolicy: existing?.backupPolicy ?? defaultBackupPolicy(context.hostname),
      companyName: existing?.companyName ?? user.companyName ?? '',
      contactName: existing?.contactName ?? user.displayName,
      installationLocation: existing?.installationLocation ?? user.installationLocation ?? '',
      rustdesk: existing?.rustdesk ?? { installed: false },
      updateRequest: existing?.updateRequest ?? null,
      lastHandledUpdateRequestId: existing?.lastHandledUpdateRequestId ?? null,
      lastUpdateResult: existing?.lastUpdateResult ?? null
    }

    await setDoc(deviceRef, nextRecord, { merge: true })
    return nextRecord
  }

  async migrateDeviceRecord(
    user: AppUser,
    sourceDevice: DeviceRecord,
    nextIdentity: DeviceIdentity,
    nextDeviceAlias: string,
    nextCompanyName: string
  ) {
    if (sourceDevice.deviceId === nextIdentity.deviceId) {
      await this.updateDeviceAlias(sourceDevice.deviceId, nextDeviceAlias)
      await this.updateDeviceCompanyName(sourceDevice.deviceId, nextCompanyName)
      const updatedSnapshot = await getDoc(doc(firebaseServices!.firestore, 'devices', sourceDevice.deviceId))
      return (updatedSnapshot.data() as DeviceRecord) ?? { ...sourceDevice, ...nextIdentity }
    }

    const targetRef = doc(firebaseServices!.firestore, 'devices', nextIdentity.deviceId)
    const targetSnapshot = await getDoc(targetRef)
    if (targetSnapshot.exists()) {
      throw new Error('Urządzenie o takim ID już istnieje. Zmień nazwę urządzenia.')
    }

    const sourceRef = doc(firebaseServices!.firestore, 'devices', sourceDevice.deviceId)
    const payload: DeviceRecord = {
      ...sourceDevice,
      ...nextIdentity,
      ownerUid: user.uid,
      ownerEmail: user.email,
      approvalStatus: 'pending',
      approvedBy: null,
      deviceAlias: nextDeviceAlias,
      companyName: nextCompanyName,
      updatedAt: Date.now(),
      lastSeenAt: Date.now()
    }
    await setDoc(targetRef, payload, { merge: false })
    await deleteDoc(sourceRef)
    return payload
  }

  async deleteDeviceRecord(deviceId: string) {
    await deleteDoc(doc(firebaseServices!.firestore, 'devices', deviceId))
  }

  subscribeDevices(user: AppUser, callback: (devices: DeviceRecord[]) => void) {
    const firestore = firebaseServices!.firestore
    const baseQuery =
      user.role === 'master'
        ? query(collection(firestore, 'devices'), orderBy('updatedAt', 'desc'))
        : query(collection(firestore, 'devices'), where('ownerUid', '==', user.uid))

    return onSnapshot(baseQuery, (snapshot) => {
      const devices = visibleDevicesForUser(
        snapshot.docs.map((entry) => entry.data() as DeviceRecord),
        user
      )
        .sort((a, b) => b.updatedAt - a.updatedAt)
      callback(devices, !snapshot.metadata.fromCache)
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

  subscribeServiceRequests(user: AppUser, callback: (requests: ServiceRequest[]) => void) {
    const requestsQuery =
      user.role === 'master'
        ? query(collection(firebaseServices!.firestore, 'serviceRequests'), orderBy('createdAt', 'desc'), limit(250))
        : query(collection(firebaseServices!.firestore, 'serviceRequests'), where('ownerUid', '==', user.uid))

    return onSnapshot(requestsQuery, (snapshot) => {
      const requests = snapshot.docs
        .map((entry) => ({ id: entry.id, ...(entry.data() as Omit<ServiceRequest, 'id'>) }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 250)
      callback(requests)
    })
  }

  subscribeServiceRequestComments(callback: (comments: ServiceRequestInternalComment[]) => void) {
    const commentsQuery = query(
      collection(firebaseServices!.firestore, 'serviceRequestInternalComments'),
      orderBy('createdAt', 'asc'),
      limit(1000)
    )
    return onSnapshot(commentsQuery, (snapshot) => {
      callback(snapshot.docs.map((entry) => ({
        id: entry.id,
        ...(entry.data() as Omit<ServiceRequestInternalComment, 'id'>)
      })))
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
    this.queueAuditLog('master_settings_updated')
  }

  async getMasterSecurity() {
    const snapshot = await getDoc(doc(firebaseServices!.firestore, 'appConfig', 'masterSecurity'))
    return snapshot.exists() ? (snapshot.data() as MasterSecurityConfig) : null
  }

  async saveMasterSecurity(config: MasterSecurityConfig) {
    await setDoc(doc(firebaseServices!.firestore, 'appConfig', 'masterSecurity'), config, { merge: false })
    this.queueAuditLog('master_security_updated', { details: { keyId: config.publicKey.keyId } })
  }

  async updateApprovalStatus(deviceId: string, approvalStatus: ApprovalStatus, actorEmail: string) {
    const payload: Record<string, unknown> = {
      approvalStatus,
      updatedAt: Date.now(),
      approvedBy: approvalStatus === 'pending' ? null : actorEmail
    }

    if (approvalStatus === 'rejected') {
      payload.consent = null
      payload.consentAcceptedAt = null
      payload.monitoringEnabled = false
    }

    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), payload)
    this.queueAuditLog('device_approval_changed', { deviceId, details: { approvalStatus } })
  }

  async updateDeviceAlias(deviceId: string, deviceAlias: string) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      deviceAlias: deviceAlias.trim(),
      aliasCustomizedAt: Date.now(),
      updatedAt: Date.now()
    })
  }

  async updateDeviceCompanyName(deviceId: string, companyName: string) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      companyName: companyName.trim(),
      updatedAt: Date.now()
    })
  }

  async updateDeviceRegistrationDetails(
    deviceId: string,
    details: { deviceAlias?: string; contactName: string; companyName: string; installationLocation: string }
  ) {
    const payload: Record<string, unknown> = {
      contactName: details.contactName.trim(),
      companyName: details.companyName.trim(),
      installationLocation: details.installationLocation.trim(),
      updatedAt: Date.now()
    }
    if (details.deviceAlias !== undefined) {
      payload.deviceAlias = details.deviceAlias.trim()
      payload.aliasCustomizedAt = Date.now()
    }
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), payload)
    this.queueAuditLog('device_details_updated', { deviceId })
  }

  async updateDeviceUpdateChannel(deviceId: string, updateChannel: UpdateChannel) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      updateChannel,
      updatedAt: Date.now()
    })
    this.queueAuditLog('device_update_channel_changed', { deviceId, details: { updateChannel } })
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
    const firestore = firebaseServices!.firestore
    const reportId = device.deviceId
    const reportRef = doc(firestore, 'inventoryReports', reportId)
    const sectionsRef = collection(reportRef, 'sections')
    const previousSnapshot = await getDoc(reportRef)
    const previousData = previousSnapshot.exists() ? previousSnapshot.data() : null
    const installedAppsChunks = chunkInventoryItems(inventory.installedApps)
    const windowsUpdatesChunks = chunkInventoryItems(inventory.windowsUpdates)
    const previousInstalledAppsChunks = Number(previousData?.installedAppsChunkCount ?? 0)
    const previousWindowsUpdatesChunks = Number(previousData?.windowsUpdatesChunkCount ?? 0)
    const now = Date.now()
    const batch = writeBatch(firestore)

    batch.set(reportRef, {
      reportId,
      ownerUid: device.ownerUid,
      deviceId: device.deviceId,
      capturedAt: inventory.capturedAt,
      updatedAt: now,
      schemaVersion: 1,
      installedAppsCount: inventory.installedApps.length,
      installedAppsChunkCount: installedAppsChunks.length,
      windowsUpdatesCount: inventory.windowsUpdates.length,
      windowsUpdatesChunkCount: windowsUpdatesChunks.length
    })
    batch.set(doc(sectionsRef, 'hardware'), {
      ownerUid: device.ownerUid,
      deviceId: device.deviceId,
      capturedAt: inventory.capturedAt,
      kind: 'hardware',
      chunkIndex: 0,
      chunkCount: 1,
      data: sanitizeForFirestore(inventory.hardware)
    })
    batch.set(doc(sectionsRef, 'defender'), {
      ownerUid: device.ownerUid,
      deviceId: device.deviceId,
      capturedAt: inventory.capturedAt,
      kind: 'defender',
      chunkIndex: 0,
      chunkCount: 1,
      data: sanitizeForFirestore(inventory.defender)
    })

    installedAppsChunks.forEach((data, index) => {
      batch.set(doc(sectionsRef, inventoryChunkId('installedApps', index)), {
        ownerUid: device.ownerUid,
        deviceId: device.deviceId,
        capturedAt: inventory.capturedAt,
        kind: 'installedApps',
        chunkIndex: index,
        chunkCount: installedAppsChunks.length,
        data
      })
    })
    windowsUpdatesChunks.forEach((data, index) => {
      batch.set(doc(sectionsRef, inventoryChunkId('windowsUpdates', index)), {
        ownerUid: device.ownerUid,
        deviceId: device.deviceId,
        capturedAt: inventory.capturedAt,
        kind: 'windowsUpdates',
        chunkIndex: index,
        chunkCount: windowsUpdatesChunks.length,
        data
      })
    })

    for (let index = installedAppsChunks.length; index < previousInstalledAppsChunks; index += 1) {
      batch.delete(doc(sectionsRef, inventoryChunkId('installedApps', index)))
    }
    for (let index = windowsUpdatesChunks.length; index < previousWindowsUpdatesChunks; index += 1) {
      batch.delete(doc(sectionsRef, inventoryChunkId('windowsUpdates', index)))
    }

    batch.update(doc(firestore, 'devices', device.deviceId), {
      inventoryCapturedAt: inventory.capturedAt,
      inventoryReportId: reportId,
      updatedAt: now
    })
    const writeCount = 4
      + installedAppsChunks.length
      + windowsUpdatesChunks.length
      + Math.max(0, previousInstalledAppsChunks - installedAppsChunks.length)
      + Math.max(0, previousWindowsUpdatesChunks - windowsUpdatesChunks.length)
    if (writeCount > INVENTORY_MAX_BATCH_WRITES) {
      throw new Error('Raport inwentaryzacji wymaga zbyt wielu fragmentów Firestore.')
    }
    await batch.commit()
  }

  async getInventory(device: DeviceRecord) {
    const reportId = device.inventoryReportId || device.deviceId
    const reportRef = doc(firebaseServices!.firestore, 'inventoryReports', reportId)
    const [reportSnapshot, sectionsSnapshot] = await Promise.all([
      getDoc(reportRef),
      getDocs(query(collection(reportRef, 'sections'), where('ownerUid', '==', device.ownerUid)))
    ])
    if (!reportSnapshot.exists()) return null

    const reportData = reportSnapshot.data()
    let hardware: InventoryReport['hardware'] = { ramSlots: [], disks: [] }
    let defender: InventoryReport['defender'] = {}
    const installedAppsChunks: Array<{ index: number; data: InventoryReport['installedApps'] }> = []
    const windowsUpdatesChunks: Array<{ index: number; data: InventoryReport['windowsUpdates'] }> = []

    sectionsSnapshot.docs.forEach((sectionSnapshot) => {
      const section = sectionSnapshot.data()
      if (section.kind === 'hardware' && section.data && typeof section.data === 'object') {
        hardware = section.data as InventoryReport['hardware']
      } else if (section.kind === 'defender' && section.data && typeof section.data === 'object') {
        defender = section.data as InventoryReport['defender']
      } else if (section.kind === 'installedApps' && Array.isArray(section.data)) {
        installedAppsChunks.push({ index: Number(section.chunkIndex ?? 0), data: section.data as InventoryReport['installedApps'] })
      } else if (section.kind === 'windowsUpdates' && Array.isArray(section.data)) {
        windowsUpdatesChunks.push({ index: Number(section.chunkIndex ?? 0), data: section.data as InventoryReport['windowsUpdates'] })
      }
    })

    installedAppsChunks.sort((left, right) => left.index - right.index)
    windowsUpdatesChunks.sort((left, right) => left.index - right.index)
    return {
      capturedAt: Number(reportData.capturedAt),
      hardware,
      installedApps: installedAppsChunks.flatMap((chunk) => chunk.data),
      windowsUpdates: windowsUpdatesChunks.flatMap((chunk) => chunk.data),
      defender
    }
  }

  async publishBackupSnapshot(device: DeviceRecord, snapshot: BackupSnapshot) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', device.deviceId), {
      backupSnapshot: snapshot,
      updatedAt: Date.now()
    })
  }

  async publishBackupProgress(
    device: DeviceRecord,
    progress: { totalFiles: number; processedFiles: number; uploadedFiles: number; updatedAt: number }
  ) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', device.deviceId), {
      backupSyncProgress: progress,
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
    this.queueAuditLog('device_consent_updated', {
      deviceId,
      details: {
        diagnosticsConsent: Boolean(consent?.diagnosticsConsent),
        remoteCommandConsent: Boolean(consent?.remoteCommandConsent),
        unattendedAccessConsent: Boolean(consent?.unattendedAccessConsent)
      }
    })
  }

  async updateRustDeskState(deviceId: string, state: DeviceRecord['rustdesk']) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      rustdesk: state ?? { installed: false },
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
    this.queueAuditLog('device_update_requested', { deviceId, details: { requestId, requestedBy } })
    return requestId
  }

  async acknowledgeDeviceUpdate(deviceId: string, requestId: string, result: string) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      lastHandledUpdateRequestId: requestId,
      lastUpdateResult: result,
      updatedAt: Date.now()
    })
    this.queueAuditLog('device_update_completed', { deviceId, details: { requestId, result } })
  }

  async requestRemoteAction(deviceId: string, request: RemoteActionRequest) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      remoteActionRequest: request,
      updatedAt: Date.now()
    })
    this.queueAuditLog('remote_action_requested', {
      deviceId,
      details: { requestId: request.id, type: request.type, requestedBy: request.requestedBy }
    })
    return request.id
  }

  async acknowledgeRemoteAction(deviceId: string, requestId: string, result: string) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      lastHandledRemoteActionRequestId: requestId,
      lastRemoteActionResult: result,
      updatedAt: Date.now()
    })
    this.queueAuditLog('remote_action_completed', { deviceId, details: { requestId, result } })
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
    this.queueAuditLog('terminal_command_queued', {
      deviceId: device.deviceId,
      ownerUid: device.ownerUid,
      details: { commandId: command.id, shell: command.shell, requestedBy: command.requestedBy }
    })
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

  subscribeCommandHistory(device: DeviceRecord, callback: (commands: TerminalCommand[]) => void) {
    if (!firebaseServices!.database) {
      callback([])
      return () => {}
    }
    const commandsRef = ref(firebaseServices!.database, `commands/${device.ownerUid}/${device.deviceId}`)
    const listener = onValue(dbQuery(commandsRef), (snapshot) => {
      const value = snapshot.val() ?? {}
      const commands = Object.values(value)
        .map((entry) => entry as TerminalCommand)
        .sort((a, b) => (b.finishedAt ?? b.requestedAt) - (a.finishedAt ?? a.requestedAt))
        .slice(0, 50)
      callback(commands)
    })
    return () => off(commandsRef, 'value', listener)
  }

  async completeCommand(device: DeviceRecord, command: TerminalCommand) {
    if (!firebaseServices!.database) return
    await set(ref(firebaseServices!.database, `commands/${device.ownerUid}/${device.deviceId}/${command.id}`), command)
    this.queueAuditLog('terminal_command_completed', {
      deviceId: device.deviceId,
      ownerUid: device.ownerUid,
      details: { commandId: command.id, status: command.status }
    })
  }

  async pushAlert(device: DeviceRecord, alert: AlertEvent) {
    await addDoc(collection(firebaseServices!.firestore, 'events'), {
      ...alert,
      id: undefined,
      ownerUid: device.ownerUid
    })
  }

  async removeAlert(alertId: string) {
    await deleteDoc(doc(firebaseServices!.firestore, 'events', alertId))
  }

  async removeActiveAlerts(deviceId: string, types: AlertEvent['type'][]) {
    if (!types.length) return
    const snapshot = await getDocs(query(collection(firebaseServices!.firestore, 'events'), where('deviceId', '==', deviceId)))
    const tasks: Array<Promise<void>> = []
    for (const entry of snapshot.docs) {
      const payload = entry.data() as AlertEvent
      if (payload.severity !== 'critical') continue
      if (!types.includes(payload.type)) continue
      tasks.push(deleteDoc(entry.ref))
    }
    await Promise.all(tasks)
  }

  async createServiceRequest(
    device: DeviceRecord,
    payload: { title: string; description: string; priority: ServiceRequestPriority }
  ) {
    const now = Date.now()
    await addDoc(collection(firebaseServices!.firestore, 'serviceRequests'), {
      ownerUid: device.ownerUid,
      ownerEmail: device.ownerEmail,
      deviceId: device.deviceId,
      deviceLabel: device.deviceAlias?.trim() || device.hostname,
      companyName: device.companyName?.trim() || device.ownerEmail,
      title: payload.title.trim(),
      description: payload.description.trim(),
      priority: payload.priority,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null
    } satisfies Omit<ServiceRequest, 'id'>)
    this.queueAuditLog('service_request_created', {
      deviceId: device.deviceId,
      ownerUid: device.ownerUid,
      details: { priority: payload.priority, title: payload.title.trim() }
    })
  }

  async updateServiceRequestStatus(requestId: string, status: ServiceRequestStatus) {
    await updateDoc(doc(firebaseServices!.firestore, 'serviceRequests', requestId), {
      status,
      updatedAt: Date.now(),
      resolvedAt: status === 'resolved' ? Date.now() : null
    })
    this.queueAuditLog('service_request_status_changed', { details: { requestId, status } })
  }

  async addServiceRequestComment(requestId: string, body: string, author: AppUser) {
    const normalizedBody = body.trim()
    if (!normalizedBody) return
    await addDoc(collection(firebaseServices!.firestore, 'serviceRequestInternalComments'), {
      requestId,
      authorUid: author.uid,
      authorEmail: author.email,
      body: normalizedBody,
      createdAt: Date.now()
    } satisfies Omit<ServiceRequestInternalComment, 'id'>)
    this.queueAuditLog('service_request_internal_comment_created', {
      details: { requestId, commentLength: normalizedBody.length }
    })
  }

  async recordUsageRollup(device: DeviceRecord, delta: UsageRollupDelta) {
    const rollupId = `${device.deviceId}_${delta.dayKey}`
    await setDoc(doc(firebaseServices!.firestore, 'usageDaily', rollupId), {
      ownerUid: device.ownerUid,
      deviceId: device.deviceId,
      dayKey: delta.dayKey,
      observedSeconds: increment(delta.observedSeconds),
      cpuObservedSeconds: increment(delta.cpuObservedSeconds),
      cpuOver80Seconds: increment(delta.cpuOver80Seconds),
      gpuObservedSeconds: increment(delta.gpuObservedSeconds),
      gpuOver80Seconds: increment(delta.gpuOver80Seconds),
      ramObservedSeconds: increment(delta.ramObservedSeconds),
      ramOver80Seconds: increment(delta.ramOver80Seconds),
      diskObservedSeconds: increment(delta.diskObservedSeconds),
      diskOver80Seconds: increment(delta.diskOver80Seconds),
      anyOver80Seconds: increment(delta.anyOver80Seconds),
      restartCount: increment(delta.restartCount),
      sampleCount: increment(delta.sampleCount),
      updatedAt: Date.now()
    }, { merge: true })
  }

  async getUsageRollups(deviceId: string, fromDayKey: string) {
    const snapshot = await getDocs(query(
      collection(firebaseServices!.firestore, 'usageDaily'),
      where(documentId(), '>=', `${deviceId}_${fromDayKey}`),
      where(documentId(), '<=', `${deviceId}_\uf8ff`),
      orderBy(documentId(), 'asc')
    ))
    return snapshot.docs
      .map((entry) => ({ id: entry.id, ...(entry.data() as Omit<UsageDailyRollup, 'id'>) }))
      .filter((entry) => entry.deviceId === deviceId && entry.dayKey >= fromDayKey)
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
  private serviceRequestListeners = new Set<() => void>()
  private serviceRequestCommentListeners = new Set<(comments: ServiceRequestInternalComment[]) => void>()
  private masterSettingsListeners = new Set<(settings: Partial<RemoteMasterSettings> | null) => void>()
  private chatListeners = new Map<string, Set<(messages: CompanyChatMessage[]) => void>>()
  private commandListeners = new Map<string, Set<(commands: TerminalCommand[]) => void>>()
  private clientProfiles = new Map<string, ClientProfile>()
  private inventories = new Map<string, InventoryReport>()
  private serviceRequestComments: ServiceRequestInternalComment[] = []
  private usageRollups = new Map<string, UsageDailyRollup>()
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
      updateChannel: 'stable',
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
      companyName: 'i-JANEK Demo',
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
      companyName: 'i-JANEK Demo',
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
      companyName: 'Firma Klienta',
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
    },
    {
      id: 'mock-alert-2',
      deviceId: 'STUDIO-PC-MOCK001',
      type: 'usage',
      title: 'Wysokie zużycie RAM',
      message: 'Użycie pamięci przekroczyło próg krytyczny.',
      severity: 'critical',
      createdAt: Date.now() - 220_000
    },
    {
      id: 'mock-alert-3',
      deviceId: 'STUDIO-PC-MOCK001',
      type: 'disk',
      title: 'Dysk blisko zapełnienia',
      message: 'Wolna przestrzeń na dysku C: spadła poniżej poziomu bezpieczeństwa.',
      severity: 'warning',
      createdAt: Date.now() - 140_000
    }
  ]
  private serviceRequests: ServiceRequest[] = [
    {
      id: 'mock-request-1',
      ownerUid: 'mock-client-2',
      ownerEmail: 'biuro@firma.pl',
      deviceId: 'BIURO-MOCK003',
      deviceLabel: 'Biuro-PC',
      companyName: 'Firma Klienta',
      title: 'Komputer bardzo wolno się uruchamia',
      description: 'Od dzisiaj start systemu trwa około dziesięciu minut, a po zalogowaniu aplikacje przestają odpowiadać.',
      priority: 'high',
      status: 'open',
      createdAt: Date.now() - 95_000,
      updatedAt: Date.now() - 95_000,
      resolvedAt: null
    },
    {
      id: 'mock-request-2',
      ownerUid: 'mock-client',
      ownerEmail: 'klient@example.com',
      deviceId: 'LAPTOP-MOCK002',
      deviceLabel: 'Laptop Serwis',
      companyName: 'i-JANEK Demo',
      title: 'Brak dostępu do drukarki',
      description: 'Drukarka sieciowa jest widoczna, ale każde zadanie kończy się błędem połączenia.',
      priority: 'normal',
      status: 'in_progress',
      createdAt: Date.now() - 3_600_000,
      updatedAt: Date.now() - 1_800_000,
      resolvedAt: null
    }
  ]
  private chats = new Map<string, CompanyChatMessage[]>()
  private remoteMasterSettings: RemoteMasterSettings = {
    telemetryMode: 'standard',
    companyOptions: ['i-JANEK Demo', 'Firma Klienta', 'Biuro Janicki'],
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
  private masterSecurity: MasterSecurityConfig | null = null
  private commandQueue = new Map<string, TerminalCommand[]>()

  subscribeAuth(callback: (user: AppUser | null) => void) {
    this.authListeners.add(callback)
    callback(this.currentUser)
    return () => this.authListeners.delete(callback)
  }

  async signInWithGoogle() {
    return this.signInDemo('slave')
  }

  async signInWithEmail(email: string, _password: string) {
    const role = toRole(email)
    const user: AppUser = {
      uid: role === 'master' ? 'mock-master' : 'mock-client',
      email: email.trim(),
      displayName: email.split('@')[0] || 'i-JANEK User',
      role
    }
    this.currentUser = user
    this.authListeners.forEach((listener) => listener(user))
    return user
  }

  async registerWithEmail(email: string, password: string, details: RegistrationDetails) {
    const user = await this.signInWithEmail(email, password)
    user.displayName = details.fullName.trim()
    user.companyName = details.companyName.trim()
    user.installationLocation = details.installationLocation?.trim() ?? ''
    return user
  }

  async sendPasswordReset(_email: string) {}

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

  async healthCheck() {
    return
  }

  async ensureUserProfile(user: AppUser) {
    const now = Date.now()
    const profile = this.clientProfiles.get(user.uid) ?? {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL ?? null,
      role: user.role,
      companyName: user.companyName ?? '',
      installationLocation: user.installationLocation ?? '',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    }

    const nextProfile: ClientProfile = {
      ...profile,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL ?? null,
      role: user.role,
      companyName: user.companyName ?? profile.companyName,
      installationLocation: user.installationLocation ?? profile.installationLocation,
      updatedAt: now,
      lastLoginAt: now
    }

    this.clientProfiles.set(user.uid, nextProfile)
    return nextProfile
  }

  async isDeviceIdAvailable(deviceId: string) {
    return !this.devices.some((device) => device.deviceId === deviceId)
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
      companyName: user.companyName ?? '',
      contactName: user.displayName,
      installationLocation: user.installationLocation ?? '',
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

  async migrateDeviceRecord(
    user: AppUser,
    sourceDevice: DeviceRecord,
    nextIdentity: DeviceIdentity,
    nextDeviceAlias: string,
    nextCompanyName: string
  ) {
    if (sourceDevice.deviceId !== nextIdentity.deviceId && this.devices.some((device) => device.deviceId === nextIdentity.deviceId)) {
      throw new Error('Urządzenie o takim ID już istnieje. Zmień nazwę urządzenia.')
    }

    const payload: DeviceRecord = {
      ...sourceDevice,
      ...nextIdentity,
      ownerUid: user.uid,
      ownerEmail: user.email,
      approvalStatus: 'pending',
      approvedBy: null,
      deviceAlias: nextDeviceAlias,
      companyName: nextCompanyName,
      updatedAt: Date.now(),
      lastSeenAt: Date.now()
    }

    this.devices = this.devices
      .filter((device) => device.deviceId !== sourceDevice.deviceId)
      .concat(payload)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    this.emitDevices()
    return payload
  }

  async deleteDeviceRecord(deviceId: string) {
    this.devices = this.devices.filter((device) => device.deviceId !== deviceId)
    this.emitDevices()
  }

  subscribeDevices(user: AppUser, callback: (devices: DeviceRecord[], isAuthoritative: boolean) => void) {
    const wrapped = () => {
      callback(visibleDevicesForUser(this.devices, user), true)
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

  subscribeServiceRequests(user: AppUser, callback: (requests: ServiceRequest[]) => void) {
    const emit = () => {
      const visible = user.role === 'master'
        ? this.serviceRequests
        : this.serviceRequests.filter((request) => request.ownerUid === user.uid)
      callback([...visible].sort((left, right) => right.createdAt - left.createdAt))
    }
    this.serviceRequestListeners.add(emit)
    emit()
    return () => this.serviceRequestListeners.delete(emit)
  }

  subscribeServiceRequestComments(callback: (comments: ServiceRequestInternalComment[]) => void) {
    this.serviceRequestCommentListeners.add(callback)
    callback([...this.serviceRequestComments])
    return () => this.serviceRequestCommentListeners.delete(callback)
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

  async getMasterSecurity() {
    return this.masterSecurity
  }

  async saveMasterSecurity(config: MasterSecurityConfig) {
    this.masterSecurity = config
  }

  async updateApprovalStatus(deviceId: string, approvalStatus: ApprovalStatus) {
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? {
            ...device,
            approvalStatus,
            consent: approvalStatus === 'rejected' ? null : device.consent,
            consentAcceptedAt: approvalStatus === 'rejected' ? undefined : device.consentAcceptedAt,
            updatedAt: Date.now()
          }
        : device
    )
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

  async updateDeviceCompanyName(deviceId: string, companyName: string) {
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? { ...device, companyName: companyName.trim(), updatedAt: Date.now() }
        : device
    )
    this.emitDevices()
  }

  async updateDeviceRegistrationDetails(
    deviceId: string,
    details: { deviceAlias?: string; contactName: string; companyName: string; installationLocation: string }
  ) {
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? {
            ...device,
            ...(details.deviceAlias === undefined
              ? {}
              : { deviceAlias: details.deviceAlias.trim(), aliasCustomizedAt: Date.now() }),
            contactName: details.contactName.trim(),
            companyName: details.companyName.trim(),
            installationLocation: details.installationLocation.trim(),
            updatedAt: Date.now()
          }
        : device
    )
    this.emitDevices()
  }

  async updateDeviceUpdateChannel(deviceId: string, updateChannel: UpdateChannel) {
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId ? { ...device, updateChannel, updatedAt: Date.now() } : device
    )
    this.emitDevices()
  }

  async publishTelemetry(device: DeviceRecord, telemetry: DeviceTelemetry) {
    this.devices = this.devices.map((entry) =>
      entry.deviceId === device.deviceId ? { ...entry, telemetry, lastSeenAt: Date.now(), updatedAt: Date.now() } : entry
    )
    this.emitDevices()
  }

  async publishInventory(device: DeviceRecord, inventory: InventoryReport) {
    this.inventories.set(device.deviceId, inventory)
    this.devices = this.devices.map((entry) =>
      entry.deviceId === device.deviceId
        ? {
            ...entry,
            inventoryCapturedAt: inventory.capturedAt,
            updatedAt: Date.now()
          }
        : entry
    )
    this.emitDevices()
  }

  async getInventory(device: DeviceRecord) {
    return this.inventories.get(device.deviceId) ?? null
  }

  async publishBackupSnapshot(device: DeviceRecord, snapshot: BackupSnapshot) {
    this.devices = this.devices.map((entry) =>
      entry.deviceId === device.deviceId ? { ...entry, backupSnapshot: snapshot, updatedAt: Date.now() } : entry
    ) as DeviceRecord[]
    this.emitDevices()
  }

  async publishBackupProgress(
    device: DeviceRecord,
    progress: { totalFiles: number; processedFiles: number; uploadedFiles: number; updatedAt: number }
  ) {
    this.devices = this.devices.map((entry) =>
      entry.deviceId === device.deviceId ? { ...entry, backupSyncProgress: progress, updatedAt: Date.now() } : entry
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

  async updateRustDeskState(deviceId: string, state: DeviceRecord['rustdesk']) {
    this.devices = this.devices.map((device) => (device.deviceId === deviceId ? { ...device, rustdesk: state } : device))
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

  subscribeCommandHistory(device: DeviceRecord, callback: (commands: TerminalCommand[]) => void) {
    const key = device.deviceId
    callback([...(this.commandQueue.get(key) ?? [])].sort((a, b) => (b.finishedAt ?? b.requestedAt) - (a.finishedAt ?? a.requestedAt)))
    return () => {}
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

  async removeAlert(alertId: string) {
    this.alerts = this.alerts.filter((entry) => entry.id !== alertId)
    this.alertListeners.forEach((listener) => listener(this.alerts))
  }

  async removeActiveAlerts(deviceId: string, types: AlertEvent['type'][]) {
    if (!types.length) return
    this.alerts = this.alerts.filter((entry) => !(entry.deviceId === deviceId && entry.severity === 'critical' && types.includes(entry.type)))
    this.alertListeners.forEach((listener) => listener(this.alerts))
  }

  async createServiceRequest(
    device: DeviceRecord,
    payload: { title: string; description: string; priority: ServiceRequestPriority }
  ) {
    const now = Date.now()
    this.serviceRequests.unshift({
      id: crypto.randomUUID(),
      ownerUid: device.ownerUid,
      ownerEmail: device.ownerEmail,
      deviceId: device.deviceId,
      deviceLabel: device.deviceAlias?.trim() || device.hostname,
      companyName: device.companyName?.trim() || device.ownerEmail,
      title: payload.title.trim(),
      description: payload.description.trim(),
      priority: payload.priority,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      resolvedAt: null
    })
    this.serviceRequestListeners.forEach((listener) => listener())
  }

  async updateServiceRequestStatus(requestId: string, status: ServiceRequestStatus) {
    const now = Date.now()
    this.serviceRequests = this.serviceRequests.map((request) =>
      request.id === requestId
        ? { ...request, status, updatedAt: now, resolvedAt: status === 'resolved' ? now : null }
        : request
    )
    this.serviceRequestListeners.forEach((listener) => listener())
  }

  async addServiceRequestComment(requestId: string, body: string, author: AppUser) {
    this.serviceRequestComments.push({
      id: crypto.randomUUID(),
      requestId,
      authorUid: author.uid,
      authorEmail: author.email,
      body: body.trim(),
      createdAt: Date.now()
    })
    this.serviceRequestCommentListeners.forEach((listener) => listener([...this.serviceRequestComments]))
  }

  async recordUsageRollup(device: DeviceRecord, delta: UsageRollupDelta) {
    const id = `${device.deviceId}_${delta.dayKey}`
    const current = this.usageRollups.get(id)
    const base: UsageDailyRollup = current ?? {
      id,
      ownerUid: device.ownerUid,
      deviceId: device.deviceId,
      dayKey: delta.dayKey,
      observedSeconds: 0,
      cpuObservedSeconds: 0,
      cpuOver80Seconds: 0,
      gpuObservedSeconds: 0,
      gpuOver80Seconds: 0,
      ramObservedSeconds: 0,
      ramOver80Seconds: 0,
      diskObservedSeconds: 0,
      diskOver80Seconds: 0,
      anyOver80Seconds: 0,
      restartCount: 0,
      sampleCount: 0,
      updatedAt: Date.now()
    }
    this.usageRollups.set(id, {
      ...base,
      observedSeconds: base.observedSeconds + delta.observedSeconds,
      cpuObservedSeconds: base.cpuObservedSeconds + delta.cpuObservedSeconds,
      cpuOver80Seconds: base.cpuOver80Seconds + delta.cpuOver80Seconds,
      gpuObservedSeconds: base.gpuObservedSeconds + delta.gpuObservedSeconds,
      gpuOver80Seconds: base.gpuOver80Seconds + delta.gpuOver80Seconds,
      ramObservedSeconds: base.ramObservedSeconds + delta.ramObservedSeconds,
      ramOver80Seconds: base.ramOver80Seconds + delta.ramOver80Seconds,
      diskObservedSeconds: base.diskObservedSeconds + delta.diskObservedSeconds,
      diskOver80Seconds: base.diskOver80Seconds + delta.diskOver80Seconds,
      anyOver80Seconds: base.anyOver80Seconds + delta.anyOver80Seconds,
      restartCount: base.restartCount + delta.restartCount,
      sampleCount: base.sampleCount + delta.sampleCount,
      updatedAt: Date.now()
    })
  }

  async getUsageRollups(deviceId: string, fromDayKey: string) {
    return [...this.usageRollups.values()]
      .filter((entry) => entry.deviceId === deviceId && entry.dayKey >= fromDayKey)
      .sort((left, right) => left.dayKey.localeCompare(right.dayKey))
  }

  async setPresence(device: DeviceRecord, _role: AppUser['role'], online: boolean) {
    this.devices = this.devices.map((entry) =>
      entry.deviceId === device.deviceId
        ? {
            ...entry,
            offline: !online,
            lastSeenAt: online ? Date.now() : entry.lastSeenAt,
            updatedAt: Date.now()
          }
        : entry
    )
    this.emitDevices()
  }

  private emitDevices() {
    this.deviceListeners.forEach((listener) => listener(this.devices))
  }
}

export function createBackendClient(): BackendClient {
  if (!hasFirebaseCoreConfig) {
    throw new Error('Brak kompletnej konfiguracji Firebase. Uzupełnij zmienne VITE_FIREBASE_* w środowisku.')
  }
  if (!hasRealtimeDatabaseConfig) {
    console.warn('[i-JANEK] Realtime Database URL missing. Running Firebase without RTDB-backed live channels.')
  }
  return new FirebaseBackend()
}
