import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
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
  getDocFromServer,
  getDocs,
  getDocsFromServer,
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
  CompanyChatMessage,
  CompanyChatParticipant,
  CompanyChatParticipantState,
  CompanyChatState,
  ConsentRecord,
  ClientProfile,
  DeviceIdentity,
  DeviceRecord,
  DeviceTelemetry,
  DwServiceConfiguration,
  DwServiceProvisioningStatus,
  InventoryReport,
  RemoteMasterSettings,
  RemoteActionRequest,
  RegistrationDetails,
  TerminalCommand,
  UsageDailyRollup,
  UsageRollupDelta,
  UpdateChannel
} from '@shared/contracts'
import { DEFAULT_MASTER_EMAIL } from '@shared/constants'
import { firebaseServices, hasFirebaseCoreConfig, hasRealtimeDatabaseConfig } from './firebase'

type Unsubscribe = () => void

export interface BackendClient {
  isMock: boolean
  subscribeAuth: (callback: (user: AppUser | null) => void) => Unsubscribe
  signInWithEmail: (email: string, password: string) => Promise<AppUser>
  registerWithEmail: (email: string, password: string, details: RegistrationDetails) => Promise<AppUser>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
  getFirebaseIdToken: () => Promise<string>
  healthCheck: () => Promise<void>
  ensureUserProfile: (user: AppUser) => Promise<ClientProfile>
  ensureDeviceRecord: (user: AppUser, context: DeviceIdentity, consent?: ConsentRecord) => Promise<DeviceRecord>
  migrateDeviceRecord: (
    user: AppUser,
    sourceDevice: DeviceRecord,
    nextIdentity: DeviceIdentity,
    nextDeviceAlias: string,
    nextCompanyName: string
  ) => Promise<DeviceRecord>
  archiveDeviceRecord: (deviceId: string, actorEmail: string) => Promise<void>
  deleteDeviceRecord: (deviceId: string) => Promise<void>
  getOwnedDeviceCount: (ownerUid: string) => Promise<number>
  prepareAccountDeletion: (password?: string) => Promise<void>
  deleteCurrentAccount: () => Promise<void>
  subscribeDevices: (
    user: AppUser,
    callback: (devices: DeviceRecord[], isAuthoritative: boolean) => void,
    onError?: (error: unknown) => void
  ) => Unsubscribe
  subscribeAlerts: (user: AppUser, callback: (alerts: AlertEvent[]) => void) => Unsubscribe
  subscribeCompanyChats: (ownerUid: string, callback: (messages: CompanyChatMessage[]) => void) => Unsubscribe
  subscribeCompanyChatState: (ownerUid: string, callback: (state: CompanyChatState) => void) => Unsubscribe
  subscribeRemoteMasterSettings: (callback: (settings: Partial<RemoteMasterSettings> | null) => void) => Unsubscribe
  sendCompanyChatMessage: (ownerUid: string, message: CompanyChatMessage) => Promise<void>
  updateCompanyChatParticipantState: (
    ownerUid: string,
    participant: CompanyChatParticipant,
    state: CompanyChatParticipantState
  ) => Promise<void>
  saveRemoteMasterSettings: (settings: RemoteMasterSettings) => Promise<void>
  updateApprovalStatus: (deviceId: string, approvalStatus: ApprovalStatus, actorEmail: string) => Promise<void>
  updateDeviceAlias: (deviceId: string, deviceAlias: string) => Promise<void>
  updateDeviceCompanyName: (deviceId: string, companyName: string) => Promise<void>
  updateDeviceRegistrationDetails: (
    deviceId: string,
    details: { deviceAlias?: string; contactName: string; companyName: string; installationLocation: string }
  ) => Promise<void>
  updateDeviceUpdateChannel: (deviceId: string, updateChannel: UpdateChannel) => Promise<void>
  configureDwService: (deviceId: string, installationCode: string, requestedBy: string) => Promise<DwServiceConfiguration>
  updateDwServiceProvisioningState: (
    deviceId: string,
    configurationId: string,
    status: DwServiceProvisioningStatus,
    appliedCodeHash?: string,
    error?: string | null
  ) => Promise<void>
  publishTelemetry: (device: DeviceRecord, telemetry: DeviceTelemetry) => Promise<void>
  publishHeartbeat: (device: DeviceRecord) => Promise<void>
  publishInventory: (device: DeviceRecord, inventory: InventoryReport) => Promise<void>
  getInventory: (device: DeviceRecord) => Promise<InventoryReport | null>
  updateConsent: (deviceId: string, consent: ConsentRecord | null) => Promise<void>
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

function toAppUser(user: User): AppUser {
  return {
    uid: user.uid,
    email: user.email ?? 'unknown@example.com',
    displayName: user.displayName ?? user.email ?? 'i-JANEK User',
    photoURL: user.photoURL,
    role: toRole(user.email ?? '')
  }
}

function isFirestorePermissionDenied(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false
  const code = String((error as { code?: unknown }).code)
  return code === 'permission-denied' || code === 'firestore/permission-denied'
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

  subscribeAuth(callback: (user: AppUser | null) => void) {
    const auth = firebaseServices!.auth
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        callback(null)
        return
      }

      if (user.isAnonymous) {
        callback(null)
        void firebaseSignOut(auth)
        return
      }

      const registrationDetails = this.activeRegistrationDetails?.uid === user.uid
        ? this.activeRegistrationDetails.details
        : this.pendingRegistrationDetails
      callback({
        ...toAppUser(user),
        ...(registrationDetails
          ? {
              displayName: registrationDetails.fullName,
              companyName: registrationDetails.companyName,
              installationLocation: registrationDetails.installationLocation ?? ''
            }
          : {})
      })
    })
  }

  async signInWithEmail(email: string, password: string) {
    const result = await signInWithEmailAndPassword(firebaseServices!.auth, email.trim(), password)
    return toAppUser(result.user)
  }

  async registerWithEmail(email: string, password: string, details: RegistrationDetails) {
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
    this.activeRegistrationDetails = null
    await firebaseSignOut(firebaseServices!.auth)
  }

  async getFirebaseIdToken() {
    const currentUser = firebaseServices!.auth.currentUser
    if (!currentUser) throw new Error('Brak aktywnej sesji Firebase.')
    return currentUser.getIdToken()
  }

  async healthCheck() {
    const currentUser = firebaseServices!.auth.currentUser
    if (!currentUser) throw new Error('Brak aktywnej sesji Firebase.')
    await getDocFromServer(doc(firebaseServices!.firestore, 'clients', currentUser.uid))
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

  async ensureDeviceRecord(user: AppUser, context: DeviceIdentity, consent?: ConsentRecord) {
    const firestore = getFirestore(firebaseServices!.app)
    const deviceRef = doc(firestore, 'devices', context.deviceId)
    let existing: DeviceRecord | undefined
    try {
      const snapshot = await getDoc(deviceRef)
      existing = snapshot.exists() ? (snapshot.data() as DeviceRecord) : undefined
    } catch (error) {
      // Reguły celowo nie pozwalają klientom sprawdzać dowolnych ID urządzeń.
      // Dla nowego dokumentu próbujemy bezpośrednio wykonać bezpieczne create;
      // Firestore nadal odrzuci kolizję z urządzeniem innego właściciela.
      if (!isFirestorePermissionDenied(error)) throw error
    }

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
      companyName: existing?.companyName ?? user.companyName ?? '',
      contactName: existing?.contactName ?? user.displayName,
      installationLocation: existing?.installationLocation ?? user.installationLocation ?? '',
      ...(existing?.dwservice ? { dwservice: existing.dwservice } : {}),
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
    try {
      const targetSnapshot = await getDoc(targetRef)
      if (targetSnapshot.exists()) {
        throw new Error('Urządzenie o takim ID już istnieje. Zmień nazwę urządzenia.')
      }
    } catch (error) {
      if (!isFirestorePermissionDenied(error)) throw error
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
    try {
      await setDoc(targetRef, payload, { merge: false })
    } catch (error) {
      if (isFirestorePermissionDenied(error)) {
        throw new Error('Nie można użyć tego ID urządzenia. Zmień nazwę komputera i spróbuj ponownie.')
      }
      throw error
    }
    await deleteDoc(sourceRef)
    return payload
  }

  async deleteDeviceRecord(deviceId: string) {
    await deleteDoc(doc(firebaseServices!.firestore, 'devices', deviceId))
  }

  async getOwnedDeviceCount(ownerUid: string) {
    const snapshot = await getDocsFromServer(query(collection(firebaseServices!.firestore, 'devices'), where('ownerUid', '==', ownerUid)))
    return snapshot.size
  }

  async prepareAccountDeletion(password?: string) {
    const currentUser = firebaseServices!.auth.currentUser
    if (!currentUser || toRole(currentUser.email ?? '') !== 'slave') throw new Error('Brak konta klienta do usunięcia.')
    if (currentUser.providerData.some((provider) => provider.providerId === 'password') && !password) {
      throw new Error('Wpisz hasło konta, aby potwierdzić jego usunięcie.')
    }
    if (password) {
      if (!currentUser.email) throw new Error('Konto nie ma adresu e-mail do potwierdzenia hasłem.')
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, password))
    } else if (!currentUser.metadata.lastSignInTime || Date.now() - Date.parse(currentUser.metadata.lastSignInTime) > 4 * 60_000) {
      throw new Error('Zaloguj się ponownie i ponów wyrejestrowanie ostatniego urządzenia.')
    }
  }

  async deleteCurrentAccount() {
    const currentUser = firebaseServices!.auth.currentUser
    if (!currentUser || toRole(currentUser.email ?? '') !== 'slave') throw new Error('Brak konta klienta do usunięcia.')
    const remainingDevices = await this.getOwnedDeviceCount(currentUser.uid)
    if (remainingDevices > 0) throw new Error('Konto ma jeszcze zarejestrowane urządzenia.')
    await deleteDoc(doc(firebaseServices!.firestore, 'clients', currentUser.uid))
    try {
      await deleteUser(currentUser)
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : ''
      if (code === 'auth/requires-recent-login') throw new Error('Zaloguj się ponownie i ponów usunięcie konta.')
      throw error
    }
    this.activeRegistrationDetails = null
  }

  async archiveDeviceRecord(deviceId: string, actorEmail: string) {
    const archivedAt = Date.now()
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      archivedAt,
      archivedBy: actorEmail,
      offline: true,
      updatedAt: archivedAt
    })
    this.queueAuditLog('device_archived', {
      deviceId,
      details: { archivedBy: actorEmail }
    })
  }

  subscribeDevices(user: AppUser, callback: (devices: DeviceRecord[], isAuthoritative: boolean) => void, onError?: (error: unknown) => void) {
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
    }, onError)
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

  subscribeCompanyChatState(ownerUid: string, callback: (state: CompanyChatState) => void) {
    if (!firebaseServices!.database) {
      callback({})
      return () => {}
    }
    const stateRef = ref(firebaseServices!.database, `ownerChatStates/${ownerUid}`)
    const listener = onValue(stateRef, (snapshot) => callback((snapshot.val() ?? {}) as CompanyChatState))
    return () => off(stateRef, 'value', listener)
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

  async updateCompanyChatParticipantState(
    ownerUid: string,
    participant: CompanyChatParticipant,
    state: CompanyChatParticipantState
  ) {
    if (!firebaseServices!.database) return
    await set(ref(firebaseServices!.database, `ownerChatStates/${ownerUid}/${participant}`), state)
  }

  async saveRemoteMasterSettings(settings: RemoteMasterSettings) {
    await setDoc(doc(firebaseServices!.firestore, 'appConfig', 'masterSettings'), settings, { merge: true })
    this.queueAuditLog('master_settings_updated')
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

  async configureDwService(deviceId: string, installationCode: string, requestedBy: string) {
    const normalizedCode = installationCode.trim()
    if (!/^\d{3}-\d{3}-\d{3}$/u.test(normalizedCode)) {
      throw new Error('Kod DWService musi mieć format 123-456-789.')
    }
    const now = Date.now()
    const configuration: DwServiceConfiguration = {
      installationCode: normalizedCode,
      configurationId: crypto.randomUUID(),
      status: 'pending',
      requestedAt: now,
      requestedBy,
      updatedAt: now,
      error: null
    }
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), {
      dwservice: configuration,
      updatedAt: now
    })
    this.queueAuditLog('dwservice_configuration_requested', {
      deviceId,
      details: { configurationId: configuration.configurationId, requestedBy }
    })
    return configuration
  }

  async updateDwServiceProvisioningState(
    deviceId: string,
    configurationId: string,
    status: DwServiceProvisioningStatus,
    appliedCodeHash?: string,
    error?: string | null
  ) {
    const payload: Record<string, unknown> = {
      'dwservice.status': status,
      'dwservice.configurationId': configurationId,
      'dwservice.updatedAt': Date.now(),
      'dwservice.error': error ?? null,
      updatedAt: Date.now()
    }
    if (appliedCodeHash) payload['dwservice.appliedCodeHash'] = appliedCodeHash
    await updateDoc(doc(firebaseServices!.firestore, 'devices', deviceId), payload)
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

  async publishHeartbeat(device: DeviceRecord) {
    await updateDoc(doc(firebaseServices!.firestore, 'devices', device.deviceId), {
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
        dwServiceConsent: Boolean(consent?.dwServiceConsent)
      }
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
  private masterSettingsListeners = new Set<(settings: Partial<RemoteMasterSettings> | null) => void>()
  private chatListeners = new Map<string, Set<(messages: CompanyChatMessage[]) => void>>()
  private chatStateListeners = new Map<string, Set<(state: CompanyChatState) => void>>()
  private commandListeners = new Map<string, Set<(commands: TerminalCommand[]) => void>>()
  private clientProfiles = new Map<string, ClientProfile>()
  private inventories = new Map<string, InventoryReport>()
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
        disks: [{ fs: 'C:', mount: 'C:', usedPercent: 81, sizeGb: 512, isLocal: true }],
        uptimeSeconds: 86_400,
        lastRestartAt: Date.now() - 86_400_000,
        lastShutdownAt: Date.now() - 172_800_000,
        topProcesses: [],
        state: 'alert'
      },
      dwservice: undefined,
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
        disks: [{ fs: 'C:', mount: 'C:', usedPercent: 52, sizeGb: 1000, isLocal: true }],
        uptimeSeconds: 54_000,
        lastRestartAt: Date.now() - 54_000_000,
        lastShutdownAt: Date.now() - 90_000_000,
        topProcesses: [],
        state: 'healthy'
      },
      dwservice: {
        installationCode: '123-456-789',
        configurationId: 'mock-ready-agent',
        status: 'ready',
        requestedAt: Date.now() - 42_000_000,
        requestedBy: DEFAULT_MASTER_EMAIL,
        updatedAt: Date.now() - 41_000_000,
        appliedCodeHash: 'mock'
      },
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
        disks: [{ fs: 'C:', mount: 'C:', usedPercent: 93, sizeGb: 256, isLocal: true }],
        uptimeSeconds: 240_000,
        lastRestartAt: Date.now() - 240_000_000,
        lastShutdownAt: Date.now() - 360_000_000,
        topProcesses: [],
        state: 'alert'
      },
      dwservice: undefined,
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
  private chats = new Map<string, CompanyChatMessage[]>()
  private chatStates = new Map<string, CompanyChatState>()
  private remoteMasterSettings: RemoteMasterSettings = {
    telemetryMode: 'standard',
    companyOptions: ['i-JANEK Demo', 'Firma Klienta', 'Biuro Janicki'],
    thresholds: {
      cpuUsage: { warning: 60, critical: 85 },
      gpuUsage: { warning: 65, critical: 90 },
      ramUsage: { warning: 70, critical: 90 },
      diskUsage: { warning: 75, critical: 90 },
      cpuTemp: { warning: 80, critical: 90 },
      gpuTemp: { warning: 70, critical: 85 }
    }
  }
  private commandQueue = new Map<string, TerminalCommand[]>()

  subscribeAuth(callback: (user: AppUser | null) => void) {
    this.authListeners.add(callback)
    callback(this.currentUser)
    return () => this.authListeners.delete(callback)
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
      role
    }
    this.authListeners.forEach((listener) => listener(this.currentUser))
    return this.currentUser
  }

  async signOut() {
    this.currentUser = null
    this.authListeners.forEach((listener) => listener(null))
  }

  async getFirebaseIdToken() {
    return 'mock-firebase-id-token'
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
      dwservice: undefined,
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

  async getOwnedDeviceCount(ownerUid: string) {
    return this.devices.filter((device) => device.ownerUid === ownerUid).length
  }

  async prepareAccountDeletion(_password?: string) {}

  async deleteCurrentAccount() {
    if (!this.currentUser || this.currentUser.role !== 'slave') throw new Error('Brak konta klienta do usunięcia.')
    if (await this.getOwnedDeviceCount(this.currentUser.uid)) throw new Error('Konto ma jeszcze zarejestrowane urządzenia.')
    this.clientProfiles.delete(this.currentUser.uid)
    await this.signOut()
  }

  async archiveDeviceRecord(deviceId: string, actorEmail: string) {
    const archivedAt = Date.now()
    this.devices = this.devices.map((device) =>
      device.deviceId === deviceId
        ? { ...device, archivedAt, archivedBy: actorEmail, offline: true, updatedAt: archivedAt }
        : device
    )
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

  subscribeCompanyChats(ownerUid: string, callback: (messages: CompanyChatMessage[]) => void) {
    const key = ownerUid
    const listeners = this.chatListeners.get(key) ?? new Set()
    listeners.add(callback)
    this.chatListeners.set(key, listeners)
    callback(this.chats.get(key) ?? [])
    return () => listeners.delete(callback)
  }

  subscribeCompanyChatState(ownerUid: string, callback: (state: CompanyChatState) => void) {
    const listeners = this.chatStateListeners.get(ownerUid) ?? new Set()
    listeners.add(callback)
    this.chatStateListeners.set(ownerUid, listeners)
    callback(this.chatStates.get(ownerUid) ?? {})
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

  async updateCompanyChatParticipantState(
    ownerUid: string,
    participant: CompanyChatParticipant,
    state: CompanyChatParticipantState
  ) {
    const nextState = { ...(this.chatStates.get(ownerUid) ?? {}), [participant]: state }
    this.chatStates.set(ownerUid, nextState)
    this.chatStateListeners.get(ownerUid)?.forEach((listener) => listener(nextState))
  }

  async saveRemoteMasterSettings(settings: RemoteMasterSettings) {
    this.remoteMasterSettings = settings
    this.masterSettingsListeners.forEach((listener) => listener(this.remoteMasterSettings))
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

  async configureDwService(deviceId: string, installationCode: string, requestedBy: string) {
    const normalizedCode = installationCode.trim()
    if (!/^\d{3}-\d{3}-\d{3}$/u.test(normalizedCode)) throw new Error('Kod DWService musi mieć format 123-456-789.')
    const now = Date.now()
    const configuration: DwServiceConfiguration = {
      installationCode: normalizedCode,
      configurationId: crypto.randomUUID(),
      status: 'pending',
      requestedAt: now,
      requestedBy,
      updatedAt: now,
      error: null
    }
    this.devices = this.devices.map((device) => device.deviceId === deviceId ? { ...device, dwservice: configuration, updatedAt: now } : device)
    this.emitDevices()
    return configuration
  }

  async updateDwServiceProvisioningState(
    deviceId: string,
    configurationId: string,
    status: DwServiceProvisioningStatus,
    appliedCodeHash?: string,
    error?: string | null
  ) {
    this.devices = this.devices.map((device) => device.deviceId === deviceId && device.dwservice?.configurationId === configurationId
      ? {
          ...device,
          dwservice: { ...device.dwservice, status, appliedCodeHash, error: error ?? null, updatedAt: Date.now() },
          updatedAt: Date.now()
        }
      : device)
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

  async publishHeartbeat(device: DeviceRecord) {
    this.devices = this.devices.map((entry) =>
      entry.deviceId === device.deviceId ? { ...entry, lastSeenAt: Date.now(), offline: false } : entry
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
