import { getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDnBGZh-HSHx2gqFm78S7p86coHk25u0xc',
  authDomain: 'i-janicki.firebaseapp.com',
  projectId: 'i-janicki',
  storageBucket: 'i-janicki.firebasestorage.app',
  messagingSenderId: '745361888690',
  appId: '1:745361888690:web:1af2df4ddf8fe7b4d600ab',
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

export const firebaseApp = hasFirebaseConfig
  ? (getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig))
  : null;

export const firestore = firebaseApp ? getFirestore(firebaseApp) : null;
export const calculatorOrdersCollection = 'calculator_orders';
export const isFirebaseReady = Boolean(firestore);
