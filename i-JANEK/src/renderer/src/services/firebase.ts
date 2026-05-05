import { initializeApp, getApps } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
}

export const hasFirebaseCoreConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.storageBucket,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId
].every(Boolean)
export const hasRealtimeDatabaseConfig = Boolean(firebaseConfig.databaseURL)

const app = hasFirebaseCoreConfig ? (getApps()[0] ?? initializeApp(firebaseConfig)) : null

const database = app && firebaseConfig.databaseURL ? getDatabase(app, firebaseConfig.databaseURL) : null
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
      firestore: getFirestore(app),
      database,
      storage: getStorage(app)
    }
  : null
