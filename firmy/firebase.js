import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-lite.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDnBGZh-HSHx2gqFm78S7p86coHk25u0xc',
  authDomain: 'i-janicki.firebaseapp.com',
  projectId: 'i-janicki',
  storageBucket: 'i-janicki.firebasestorage.app',
  messagingSenderId: '745361888690',
  appId: '1:745361888690:web:1af2df4ddf8fe7b4d600ab',
};

export const ADMIN_PIN = '151100';
export const DEFAULT_LOGIN_PIN_LENGTH = 4;
export const DEFAULT_MAX_ATTEMPTS = 5;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

let authReadyResolve;
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    authReadyResolve(user);
  }
});

export async function ensureAnonymousAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  return authReadyPromise;
}

export async function createSessionWithPin(pin) {
  const user = await ensureAnonymousAuth();
  const sessionRef = doc(db, 'firmy_sessions', user.uid);

  await setDoc(
    sessionRef,
    {
      uid: user.uid,
      pin,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  );

  const fresh = await getDoc(sessionRef);
  if (!fresh.exists()) {
    throw new Error('Brak sesji po logowaniu.');
  }
  const pinSnap = await getDoc(doc(db, 'firmy_pins', pin));
  const pinData = pinSnap.exists() ? pinSnap.data() : {};
  const derivedRole = pin === ADMIN_PIN ? 'admin' : (pinData.role || 'client');

  await setDoc(
    sessionRef,
    {
      clientId: pinData.clientId || null,
      clientSlug: pinData.clientSlug || null,
      role: derivedRole,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const updated = await getDoc(sessionRef);
  return { uid: user.uid, ...updated.data() };
}

export async function clearSession() {
  const user = await ensureAnonymousAuth();
  await deleteDoc(doc(db, 'firmy_sessions', user.uid));
}

export async function getCurrentSession() {
  const user = await ensureAnonymousAuth();
  const sessionSnap = await getDoc(doc(db, 'firmy_sessions', user.uid));
  if (!sessionSnap.exists()) {
    return null;
  }
  return { uid: user.uid, ...sessionSnap.data() };
}

export async function addFailedAttempt(pin, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  if (!/^\d{4,6}$/.test(pin)) {
    return { failedAttempts: 0, isLocked: false };
  }
  await ensureAnonymousAuth();
  const lockRef = doc(db, 'firmy_pin_locks', pin);
  const lockSnap = await getDoc(lockRef);

  const nextAttempts = lockSnap.exists() ? (lockSnap.data().failedAttempts || 0) + 1 : 1;
  const isLocked = nextAttempts >= maxAttempts;

  await setDoc(
    lockRef,
    {
      pin,
      failedAttempts: nextAttempts,
      isLocked,
      updatedAt: serverTimestamp(),
      createdAt: lockSnap.exists() ? lockSnap.data().createdAt || serverTimestamp() : serverTimestamp(),
    },
    { merge: true },
  );

  return { failedAttempts: nextAttempts, isLocked };
}

export async function getPinLock(pin) {
  if (!/^\d{4,6}$/.test(pin)) {
    return null;
  }
  await ensureAnonymousAuth();
  const snap = await getDoc(doc(db, 'firmy_pin_locks', pin));
  return snap.exists() ? snap.data() : null;
}

export async function listPinLocks() {
  await ensureAnonymousAuth();
  const snap = await getDocs(collection(db, 'firmy_pin_locks'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.pin || '').localeCompare(String(b.pin || ''), 'pl'));
}

export async function getFirmySettings() {
  await ensureAnonymousAuth();
  const snap = await getDoc(doc(db, 'firmy_settings', 'default'));
  if (!snap.exists()) {
    return {
      pinLength: DEFAULT_LOGIN_PIN_LENGTH,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    };
  }
  const data = snap.data();
  return {
    pinLength: Number(data.pinLength || DEFAULT_LOGIN_PIN_LENGTH),
    maxAttempts: Number(data.maxAttempts || DEFAULT_MAX_ATTEMPTS),
  };
}

export async function saveFirmySettings(payload) {
  await ensureAnonymousAuth();
  await setDoc(
    doc(db, 'firmy_settings', 'default'),
    {
      ...payload,
      updatedAt: serverTimestamp(),
      createdAt: payload.createdAt || serverTimestamp(),
    },
    { merge: true },
  );
}

export async function listClients() {
  await ensureAnonymousAuth();
  const snap = await getDocs(collection(db, 'firmy_clients'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pl'));
}

export async function getClient(clientId) {
  await ensureAnonymousAuth();
  const snap = await getDoc(doc(db, 'firmy_clients', clientId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveClient(clientId, payload) {
  await ensureAnonymousAuth();
  const ref = doc(db, 'firmy_clients', clientId);
  const now = serverTimestamp();
  await setDoc(
    ref,
    {
      ...payload,
      updatedAt: now,
      createdAt: payload.createdAt || now,
    },
    { merge: true },
  );
}

export async function listPins() {
  await ensureAnonymousAuth();
  const snap = await getDocs(collection(db, 'firmy_pins'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.pin || '').localeCompare(String(b.pin || ''), 'pl'));
}

export async function savePin(pin, payload) {
  await ensureAnonymousAuth();
  const ref = doc(db, 'firmy_pins', pin);
  const now = serverTimestamp();
  await setDoc(
    ref,
    {
      pin,
      ...payload,
      updatedAt: now,
      createdAt: payload.createdAt || now,
    },
    { merge: true },
  );
}

export async function unlockPin(pin) {
  await ensureAnonymousAuth();
  await setDoc(
    doc(db, 'firmy_pin_locks', pin),
    {
      pin,
      failedAttempts: 0,
      isLocked: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function upsertMonthlySummary(clientId, month, payload) {
  await ensureAnonymousAuth();
  await setDoc(
    doc(db, 'firmy_clients', clientId, 'months', month),
    {
      ...payload,
      updatedAt: serverTimestamp(),
      createdAt: payload.createdAt || serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getMonthlySummary(clientId, month) {
  await ensureAnonymousAuth();
  const snap = await getDoc(doc(db, 'firmy_clients', clientId, 'months', month));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function addExpense(clientId, payload) {
  await ensureAnonymousAuth();
  await addDoc(collection(db, 'firmy_clients', clientId, 'expenses'), {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteExpense(clientId, expenseId) {
  await ensureAnonymousAuth();
  await deleteDoc(doc(db, 'firmy_clients', clientId, 'expenses', expenseId));
}

export async function listExpenses(clientId, month) {
  await ensureAnonymousAuth();
  const q = query(collection(db, 'firmy_clients', clientId, 'expenses'), where('month', '==', month));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''), 'pl'));
}


export function formatMoney(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
  }).format(num);
}

export function sanitizeSlug(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
