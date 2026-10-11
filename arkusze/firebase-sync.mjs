import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { initializeAuth, browserSessionPersistence, signInAnonymously, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, doc, getDocFromServer, writeBatch, runTransaction, onSnapshot, serverTimestamp, Timestamp, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { decodeRemote, nextRemote, encodeWorkbook } from './sync-model.mjs?v=9';

const config = {
  apiKey: 'AIzaSyDnBGZh-HSHx2gqFm78S7p86coHk25u0xc',
  authDomain: 'i-janicki.firebaseapp.com', projectId: 'i-janicki',
  appId: '1:745361888690:web:1af2df4ddf8fe7b4d600ab',
};
const app = getApps().find(app => app.name === 'arkusze') || initializeApp(config, 'arkusze');
const auth = initializeAuth(app, { persistence: browserSessionPersistence });
const db = initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false });
const shared = doc(db, 'arkusze_workbooks', 'shared');
let unsubscribe;

async function ready() { await auth.authStateReady(); }
export async function unlock(pin) {
  await ready();
  if (!auth.currentUser) await signInAnonymously(auth);
  const uid = auth.currentUser.uid;
  const attempts = doc(db, 'arkusze_pin_attempts', uid), session = doc(db, 'arkusze_sessions', uid);
  const previous = await getDocFromServer(attempts);
  const until = previous.data()?.lockUntil?.toMillis() || 0;
  if (until > Date.now()) return { ok: false, until, attemptsLeft: 0 };
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`arkusze:${pin}`));
  const pinHash = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  const unlockUntil = Date.now() + 12 * 60 * 60 * 1000;
  const batch = writeBatch(db);
  batch.set(attempts, { uid, pinHash, failedAttempts: 0, lockUntil: Timestamp.fromMillis(0), updatedAt: serverTimestamp() });
  batch.set(session, { uid, unlockUntil: Timestamp.fromMillis(unlockUntil), updatedAt: serverTimestamp() });
  try { await batch.commit(); return { ok: true, unlockUntil }; }
  catch (error) {
    if (error.code !== 'permission-denied') throw error;
    return runTransaction(db, async transaction => {
      const current = await transaction.get(attempts);
      const lockedUntil = current.data()?.lockUntil?.toMillis() || 0;
      if (lockedUntil > Date.now()) return { ok: false, until: lockedUntil, attemptsLeft: 0 };
      const oldCount = current.data()?.failedAttempts || 0;
      const count = oldCount >= 5 ? 1 : oldCount + 1;
      const lockUntil = count === 5 ? Date.now() + 5 * 60 * 1000 : 0;
      transaction.set(attempts, { uid, pinHash, failedAttempts: count, lockUntil: Timestamp.fromMillis(lockUntil), updatedAt: serverTimestamp() });
      return { ok: false, until: lockUntil, attemptsLeft: 5 - count };
    });
  }
}
export async function read() {
  await ready();
  const snapshot = await getDocFromServer(shared);
  return snapshot.exists() ? decodeRemote(snapshot.data()) : null;
}
export async function initialize(book) {
  const payload = encodeWorkbook(book);
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(shared);
    if (snapshot.exists()) return decodeRemote(snapshot.data());
    const data = { payload, revision: 1 };
    transaction.set(shared, { ...data, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid });
    return decodeRemote(data);
  });
}
export async function write(book, expectedRevision) {
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(shared);
    if (!snapshot.exists()) throw new Error('Wspólny arkusz nie istnieje. Odśwież stronę.');
    const data = nextRemote(book, expectedRevision, snapshot.data().revision);
    transaction.set(shared, { ...data, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid });
    return decodeRemote(data);
  });
}
export function watch(receive, fail) {
  unsubscribe?.();
  unsubscribe = onSnapshot(shared, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    try {
      if (!snapshot.exists()) throw new Error('Wspólny arkusz został usunięty.');
      receive(decodeRemote(snapshot.data()));
    } catch (error) { fail(error); }
  }, fail);
}
export async function close() {
  unsubscribe?.(); unsubscribe = null;
  if (auth.currentUser) {
    try { await deleteDoc(doc(db, 'arkusze_sessions', auth.currentUser.uid)); } catch {}
    await signOut(auth);
  }
}
