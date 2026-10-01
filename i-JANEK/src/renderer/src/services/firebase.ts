import { initializeApp, getApps } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth
} from 'firebase/auth'
import { getFirestore, initializeFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
}

export const hasFirebaseCoreConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId
].every(Boolean)
export const hasRealtimeDatabaseConfig = Boolean(firebaseConfig.databaseURL)

const app = hasFirebaseCoreConfig ? (getApps()[0] ?? initializeApp(firebaseConfig)) : null
const isElectronRenderer = typeof navigator !== 'undefined' && /\bElectron\//i.test(navigator.userAgent)

const database = app && firebaseConfig.databaseURL ? getDatabase(app, firebaseConfig.databaseURL) : null
const firestore = app
  ? isElectronRenderer
    ? initializeFirestore(app, { experimentalForceLongPolling: true })
    : getFirestore(app)
  : null
let auth = app ? null : null

if (app) {
  try {
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver
    })
  } catch {
    auth = getAuth(app)
  }
}

export const firebaseServices = app
  ? {
      app,
      auth,
      firestore: firestore!,
      database
    }
  : null
