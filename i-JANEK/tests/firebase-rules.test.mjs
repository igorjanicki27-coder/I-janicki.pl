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

async function seedServiceRequest() {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'serviceRequests', 'request-1'), {
      ownerUid: owner.uid,
      ownerEmail: owner.email,
      deviceId,
      deviceLabel: 'CLIENT-PC',
      companyName: 'Client',
      title: 'Problem testowy',
      description: 'Opis problemu testowego',
      priority: 'normal',
      status: 'open',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      resolvedAt: null
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

test('czat właściciela jest prywatny, lecz dostępny dla Mastera', async () => {
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).database()
  const strangerDb = environment.authenticatedContext(stranger.uid, { email: stranger.email }).database()
  const masterDb = environment.authenticatedContext(master.uid, { email: master.email }).database()
  const messageId = 'message-1'
  const chatPath = `ownerChats/${owner.uid}/${messageId}`
  await assertSucceeds(set(ref(ownerDb, chatPath), {
    id: messageId,
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    senderRole: 'slave',
    senderEmail: owner.email,
    body: 'Proszę o kontakt.',
    createdAt: Date.now()
  }))
  await assertFails(get(ref(strangerDb, `ownerChats/${owner.uid}`)))
  await assertSucceeds(get(ref(masterDb, `ownerChats/${owner.uid}`)))
})

test('komentarze wewnętrzne może czytać i tworzyć wyłącznie Master', async () => {
  await seedServiceRequest()
  const masterDb = environment.authenticatedContext(master.uid, { email: master.email }).firestore()
  const ownerDb = environment.authenticatedContext(owner.uid, { email: owner.email }).firestore()
  const commentRef = doc(masterDb, 'serviceRequestInternalComments', 'comment-1')
  await assertSucceeds(setDoc(commentRef, {
    requestId: 'request-1',
    authorUid: master.uid,
    authorEmail: master.email,
    body: 'Notatka techniczna dla administratora.',
    createdAt: 1_700_000_000_000
  }))
  await assertSucceeds(getDoc(commentRef))
  await assertFails(getDoc(doc(ownerDb, 'serviceRequestInternalComments', 'comment-1')))
  await assertFails(setDoc(doc(ownerDb, 'serviceRequestInternalComments', 'comment-2'), {
    requestId: 'request-1',
    authorUid: owner.uid,
    authorEmail: owner.email,
    body: 'Klient nie może dodać komentarza wewnętrznego.',
    createdAt: 1_700_000_000_000
  }))
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
