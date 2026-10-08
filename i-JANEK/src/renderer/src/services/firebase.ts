import { initializeApp, getApps } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth
} from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore'
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
    ? initializeFirestore(app, {
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
      })
    : initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
      })
  : null
let auth: Auth | null = null

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

export const firebaseServices = app && auth
  ? {
      app,
      auth,
      firestore: firestore!,
      database
    }
  : null
