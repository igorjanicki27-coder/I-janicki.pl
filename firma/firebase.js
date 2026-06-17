/**
 * firebase.js – Firebase + Anonymous Auth dla /firma
 * 
 * Używa anonimowego logowania (signInAnonymously) żeby spełnić
 * reguły Firestore (isAuthenticated). Nie przechowuje żadnych
 * danych użytkownika po stronie Firebase – sama autoryzacja PIN.
 */

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ── Firebase config ─────────────────────────────────────────── */
const firebaseConfig = {
  apiKey: 'AIzaSyDnBGZh-HSHx2gqFm78S7p86coHk25u0xc',
  authDomain: 'i-janicki.firebaseapp.com',
  projectId: 'i-janicki',
  storageBucket: 'i-janicki.firebasestorage.app',
  messagingSenderId: '745361888690',
  appId: '1:745361888690:web:1af2df4ddf8fe7b4d600ab'
};

/* ── Singleton ───────────────────────────────────────────────── */
const app = getApps()[0] ?? initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ── Auth helpers ──────────────────────────────────────────── */

/** Zwraca Promise rozwiązywany gdy anonimowy użytkownik jest gotowy. */
export function ensureAuth() {
  return new Promise((resolve, reject) => {
    // już zalogowany?
    if (auth.currentUser) return resolve(auth.currentUser);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (user) return resolve(user);
      // nie ma usera → zaloguj anonimowo
      signInAnonymously(auth)
        .then((cred) => resolve(cred.user))
        .catch(reject);
    });
  });
}

/** Pobiera dokument z Firestore. */
export async function getSetting(docPath) {
  const snap = await getDoc(doc(db, docPath));
  return snap.exists() ? snap.data() : null;
}

/** Zapisuje dokument w Firestore. */
export async function setSetting(docPath, data) {
  await setDoc(doc(db, docPath), data);
}

/** Pobiera surowy snapshot (do sprawdzenia exists/metadata). */
export async function getDocSnapshot(docPath) {
  return getDoc(doc(db, docPath));
}

export { app, auth, db, serverTimestamp, doc, collection, setDoc, getDoc, getDocs, deleteDoc, writeBatch };
