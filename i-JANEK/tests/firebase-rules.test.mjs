import fs from 'node:fs/promises'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { get, ref, set } from 'firebase/database'

const directory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(directory, '..', '..')
const projectId = 'demo-i-janicki'
const owner = { uid: 'owner-1', email: 'client@example.com' }
const stranger = { uid: 'owner-2', email: 'other@example.com' }
const master = { uid: 'master-1', email: 'kontakt@i-janicki.pl' }
const deviceId = 'CLIENT-PC-ABC123'
let environment

function inventoryMetadata(ownerUid = owner.uid) {
  return {
    reportId: deviceId,
    ownerUid,
    deviceId,
    capturedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_100,
    schemaVersion: 1,
    installedAppsCount: 0,
    installedAppsChunkCount: 1,
    windowsUpdatesCount: 0,
    windowsUpdatesChunkCount: 1
  }
}

async function seedApprovedDevice() {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'devices', deviceId), {
      ownerUid: owner.uid,
      ownerEmail: owner.email,
      approvalStatus: 'approved',
      updateChannel: 'stable'
    })
  })
}

before(async () => {
  const [firestoreRules, databaseRules] = await Promise.all([
    fs.readFile(path.join(projectRoot, 'firestore.rules'), 'utf8'),
    fs.readFile(path.join(projectRoot, 'database.rules.json'), 'utf8')
  ])
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules },
    database: { rules: databaseRules }
  })
})

beforeEach(async () => {
  await environment.clearFirestore()
  await environment.clearDatabase()
  await seedApprovedDevice()
})

after(async () => {
  await environment.cleanup()
})

test('właściciel zatwierdzonego urządzenia może utworzyć raport inwentaryzacji', async () => {
  const db = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  await assertSucceeds(setDoc(doc(db, 'inventoryReports', deviceId), inventoryMetadata()))
})

test('inne konto nie może odczytać ani podmienić raportu klienta', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'inventoryReports', deviceId), inventoryMetadata())
  })
  const db = environment.authenticatedContext(stranger.uid, { email: stranger.email }).firestore()
  await assertFails(getDoc(doc(db, 'inventoryReports', deviceId)))
  await assertFails(setDoc(doc(db, 'inventoryReports', deviceId), inventoryMetadata(stranger.uid)))
})

test('Master może odczytać raport klienta', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'inventoryReports', deviceId), inventoryMetadata())
  })
  const db = environment.authenticatedContext(master.uid, { email: master.email }).firestore()
  await assertSucceeds(getDoc(doc(db, 'inventoryReports', deviceId)))
})

test('stara kolekcja opinii nie jest dostępna ani zapisywalna z klienta', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'reviews', 'legacy-review'), {
      name: 'Klient',
      email: 'client@example.com',
      comment: 'Historyczna opinia',
      rating: 5,
      approved: true
    })
  })

  const publicDb = environment.unauthenticatedContext().firestore()
  const masterDb = environment.authenticatedContext(master.uid, { email: master.email }).firestore()
  await assertFails(getDoc(doc(publicDb, 'reviews', 'legacy-review')))
  await assertFails(getDoc(doc(masterDb, 'reviews', 'legacy-review')))
  await assertFails(setDoc(doc(publicDb, 'reviews', 'new-review'), {
    name: 'Spam',
    email: 'spam@example.com',
    comment: 'Nie powinno się zapisać',
    rating: 5,
    approved: false
  }))
})

test('właściciel może zapisać poprawne sekcje raportu w jednej operacji', async () => {
  const db = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  const batch = writeBatch(db)
  batch.set(doc(db, 'inventoryReports', deviceId), inventoryMetadata())
  batch.set(doc(db, 'inventoryReports', deviceId, 'sections', 'hardware'), {
    ownerUid: owner.uid,
    deviceId,
    capturedAt: 1_700_000_000_000,
    kind: 'hardware',
    chunkIndex: 0,
    chunkCount: 1,
    data: { ramSlots: [], disks: [] }
  })
  await assertSucceeds(batch.commit())
})

test('reguły odrzucają nieprawidłowy typ sekcji inwentaryzacji', async () => {
  const db = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  await setDoc(doc(db, 'inventoryReports', deviceId), inventoryMetadata())
  await assertFails(setDoc(doc(db, 'inventoryReports', deviceId, 'sections', 'hardware'), {
    ownerUid: owner.uid,
    deviceId,
    capturedAt: 1_700_000_000_000,
    kind: 'secrets',
    chunkIndex: 0,
    chunkCount: 1,
    data: {}
  }))
})

test('właściciel zapisuje obecność i telemetrię, a obce konto nie', async () => {
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).database()
  const strangerDb = environment.authenticatedContext(stranger.uid, { email: stranger.email }).database()
  const presencePath = `presence/${owner.uid}/${deviceId}`
  const telemetryPath = `telemetry/${owner.uid}/${deviceId}/latest`

  await assertSucceeds(set(ref(ownerDb, presencePath), { role: 'slave', online: true, lastSeenAt: Date.now() }))
  await assertSucceeds(set(ref(ownerDb, telemetryPath), { capturedAt: Date.now(), cpuUsagePercent: 20 }))
  await assertFails(set(ref(strangerDb, presencePath), { role: 'slave', online: true, lastSeenAt: Date.now() }))
  await assertFails(set(ref(strangerDb, telemetryPath), { capturedAt: Date.now() }))
})

test('wątki wiadomości są prywatne, a zakończone pozostają tylko do odczytu', async () => {
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).database()
  const strangerDb = environment.authenticatedContext(stranger.uid, { email: stranger.email }).database()
  const masterDb = environment.authenticatedContext(master.uid, { email: master.email }).database()
  const threadId = 'thread-1'
  const messageId = 'message-1'
  const now = Date.now()
  const metaPath = `ownerMessageThreads/${owner.uid}/${threadId}/meta`
  const messagePath = `ownerMessageThreads/${owner.uid}/${threadId}/messages/${messageId}`
  const meta = {
    id: threadId,
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    title: 'Problem z drukarką',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    createdByRole: 'slave',
    createdByEmail: owner.email
  }

  await assertSucceeds(set(ref(ownerDb, metaPath), meta))
  await assertSucceeds(set(ref(ownerDb, messagePath), {
    id: messageId,
    threadId,
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    senderRole: 'slave',
    senderEmail: owner.email,
    body: 'Proszę o kontakt.',
    createdAt: now
  }))
  await assertFails(get(ref(strangerDb, `ownerMessageThreads/${owner.uid}`)))
  await assertSucceeds(get(ref(masterDb, `ownerMessageThreads/${owner.uid}`)))

  const closedMeta = {
    ...meta,
    status: 'closed',
    updatedAt: now + 100,
    closedAt: now + 100,
    closedByRole: 'master',
    closedByEmail: master.email
  }
  await assertSucceeds(set(ref(masterDb, metaPath), closedMeta))
  await assertFails(set(ref(ownerDb, metaPath), meta))
  await assertFails(set(ref(ownerDb, `ownerMessageThreads/${owner.uid}/${threadId}/messages/message-2`), {
    id: 'message-2',
    threadId,
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    senderRole: 'slave',
    senderEmail: owner.email,
    body: 'Nie powinno się zapisać.',
    createdAt: now + 200
  }))

  const masterThreadId = 'thread-from-master'
  const masterMetaPath = `ownerMessageThreads/${owner.uid}/${masterThreadId}/meta`
  const masterMeta = {
    id: masterThreadId,
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    title: 'Wiadomość od administratora',
    status: 'open',
    createdAt: now + 300,
    updatedAt: now + 300,
    createdByRole: 'master',
    createdByEmail: master.email
  }
  await assertSucceeds(set(ref(masterDb, masterMetaPath), masterMeta))
  await assertFails(set(ref(strangerDb, masterMetaPath), { ...masterMeta, createdByEmail: stranger.email }))
  await assertSucceeds(set(ref(ownerDb, masterMetaPath), {
    ...masterMeta,
    status: 'closed',
    updatedAt: now + 400,
    closedAt: now + 400,
    closedByRole: 'slave',
    closedByEmail: owner.email
  }))
})

test('snapshot opinii Google jest publiczny do odczytu i zablokowany do zapisu', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), 'publicGoogleReviews'), {
      source: 'google_business_profile',
      averageRating: 5,
      totalReviewCount: 1,
      reviews: [{ id: 'review-1', authorName: 'Klient', rating: 5 }],
      fetchedAt: '2026-10-07T10:00:00.000Z'
    })
  })

  const publicDb = environment.unauthenticatedContext().database()
  await assertSucceeds(get(ref(publicDb, 'publicGoogleReviews')))
  await assertFails(set(ref(publicDb, 'publicGoogleReviews'), {
    source: 'spam',
    reviews: []
  }))
})

test('stan wątku może aktualizować wyłącznie właściwy uczestnik rozmowy', async () => {
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).database()
  const strangerDb = environment.authenticatedContext(stranger.uid, { email: stranger.email }).database()
  const masterDb = environment.authenticatedContext(master.uid, { email: master.email }).database()
  const slaveState = {
    role: 'slave',
    email: owner.email,
    typing: true,
    lastDeliveredAt: 1_700_000_000_000,
    lastReadAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_100
  }
  const masterState = {
    ...slaveState,
    role: 'master',
    email: master.email,
    typing: false
  }
  const threadId = 'thread-state'

  await environment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), `ownerMessageThreads/${owner.uid}/${threadId}/meta`), {
      id: threadId,
      ownerUid: owner.uid,
      ownerEmail: owner.email,
      title: 'Test stanu',
      status: 'open',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      createdByRole: 'slave',
      createdByEmail: owner.email
    })
  })

  const statePath = `ownerMessageThreads/${owner.uid}/${threadId}/states`
  await assertSucceeds(set(ref(ownerDb, `${statePath}/slave`), slaveState))
  await assertFails(set(ref(ownerDb, `${statePath}/slave`), { ...slaveState, lastReadAt: 1 }))
  await assertFails(set(ref(ownerDb, `${statePath}/master`), masterState))
  await assertSucceeds(set(ref(masterDb, `${statePath}/master`), masterState))
  await assertFails(set(ref(strangerDb, `${statePath}/slave`), { ...slaveState, email: stranger.email }))
  await assertSucceeds(get(ref(masterDb, statePath)))
  await assertFails(get(ref(strangerDb, statePath)))
})

test('właściciel zapisuje dzienny agregat obciążenia, Master go odczytuje, a obce konto nie', async () => {
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  const masterDb = environment.authenticatedContext(master.uid, { email: master.email }).firestore()
  const strangerDb = environment.authenticatedContext(stranger.uid, { email: stranger.email }).firestore()
  const rollupId = `${deviceId}_2026-09-26`
  const payload = {
    ownerUid: owner.uid,
    deviceId,
    dayKey: '2026-09-26',
    observedSeconds: 3600,
    cpuObservedSeconds: 3600,
    cpuOver80Seconds: 1200,
    gpuObservedSeconds: 3600,
    gpuOver80Seconds: 900,
    ramObservedSeconds: 3600,
    ramOver80Seconds: 1800,
    diskObservedSeconds: 3600,
    diskOver80Seconds: 0,
    anyOver80Seconds: 2100,
    restartCount: 0,
    sampleCount: 2,
    updatedAt: 1_700_000_000_000
  }
  await assertSucceeds(setDoc(doc(ownerDb, 'usageDaily', rollupId), payload))
  await assertSucceeds(updateDoc(doc(ownerDb, 'usageDaily', rollupId), {
    observedSeconds: 4200,
    cpuObservedSeconds: 4200,
    cpuOver80Seconds: 1800,
    gpuObservedSeconds: 4200,
    gpuOver80Seconds: 900,
    ramObservedSeconds: 4200,
    ramOver80Seconds: 2400,
    diskObservedSeconds: 4200,
    diskOver80Seconds: 0,
    anyOver80Seconds: 2700,
    restartCount: 1,
    sampleCount: 3,
    updatedAt: 1_700_000_000_600
  }))
  await assertSucceeds(getDoc(doc(masterDb, 'usageDaily', rollupId)))
  await assertFails(getDoc(doc(strangerDb, 'usageDaily', rollupId)))
})

test('tylko Master może zmienić kanał aktualizacji urządzenia', async () => {
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  const masterDb = environment.authenticatedContext(master.uid, { email: master.email }).firestore()
  await assertFails(updateDoc(doc(ownerDb, 'devices', deviceId), {
    updateChannel: 'test',
    updatedAt: Date.now()
  }))
  await assertSucceeds(updateDoc(doc(masterDb, 'devices', deviceId), {
    updateChannel: 'beta',
    updatedAt: Date.now()
  }))
})

test('klient może raportować stan DWService, ale nie może zmienić przypisanego kodu', async () => {
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  const masterDb = environment.authenticatedContext(master.uid, { email: master.email }).firestore()
  const configurationId = 'config-12345678'
  await assertSucceeds(updateDoc(doc(masterDb, 'devices', deviceId), {
    dwservice: {
      installationCode: '123-456-789',
      configurationId,
      status: 'pending',
      requestedAt: 1_700_000_000_000,
      requestedBy: master.email,
      updatedAt: 1_700_000_000_000,
      error: null
    },
    updatedAt: 1_700_000_000_000
  }))
  await assertSucceeds(updateDoc(doc(ownerDb, 'devices', deviceId), {
    'dwservice.status': 'ready',
    'dwservice.configurationId': configurationId,
    'dwservice.appliedCodeHash': 'hash',
    'dwservice.error': null,
    'dwservice.updatedAt': 1_700_000_000_500,
    updatedAt: 1_700_000_000_500
  }))
  await assertFails(updateDoc(doc(ownerDb, 'devices', deviceId), {
    'dwservice.installationCode': '999-999-999',
    updatedAt: 1_700_000_000_600
  }))
})

test('nowy klient może wybrać tylko domyślny kanał stable', async () => {
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  await assertSucceeds(setDoc(doc(ownerDb, 'devices', 'CLIENT-PC-STABLE'), {
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    approvalStatus: 'pending',
    updateChannel: 'stable'
  }))
  await assertFails(setDoc(doc(ownerDb, 'devices', 'CLIENT-PC-TEST'), {
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    approvalStatus: 'pending',
    updateChannel: 'test'
  }))
})

test('nowy klient może wysłać prośbę o akceptację przed zapisaniem zgód', async () => {
  const db = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  await assertSucceeds(setDoc(doc(db, 'devices', 'CLIENT-PC-PENDING'), {
    deviceId: 'CLIENT-PC-PENDING',
    machineId: 'machine-pending',
    hostname: 'CLIENT-PC',
    platform: 'win32',
    arch: 'x64',
    appVersion: '0.1.6',
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    approvalStatus: 'pending',
    updateChannel: 'stable',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastSeenAt: 1_700_000_000_000,
    consent: null,
    deviceAlias: 'CLIENT-PC',
    aliasCustomizedAt: null,
    companyName: 'Firma Testowa',
    contactName: 'Jan Kowalski',
    installationLocation: '',
    updateRequest: null,
    lastHandledUpdateRequestId: null,
    lastUpdateResult: null
  }))
})

test('klient może zapisać dane rejestracyjne swojego profilu', async () => {
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  await assertSucceeds(setDoc(doc(ownerDb, 'clients', owner.uid), {
    uid: owner.uid,
    email: owner.email,
    displayName: 'Jan Kowalski',
    photoURL: null,
    role: 'slave',
    companyName: 'Firma Testowa',
    installationLocation: 'Biuro Poznań',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastLoginAt: 1_700_000_000_000
  }))
})
