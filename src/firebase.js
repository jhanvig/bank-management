// firebase.js — Your private bank Firebase project
// This is your bank's own private database. No other bank sees this.

import { initializeApp, getApps } from 'firebase/app';
import { getAuth }                from 'firebase/auth';
import { getFirestore }           from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIRESTORE_API_KEY,
  authDomain:        process.env.REACT_APP_AUTH_DOMAIN        || 'bank-system-357c5.firebaseapp.com',
  projectId:         process.env.REACT_APP_FIRESTORE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_STORAGE_BUCKET     || 'bank-system-357c5.firebasestorage.app',
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID || '60299009949',
  appId:             process.env.REACT_APP_APP_ID              || '1:60299009949:web:b6d872114ee43290a95974',
};

// Named 'private' so it doesn't collide with hubApp
const privateApp =
  getApps().find(a => a.name === 'private') ??
  initializeApp(firebaseConfig, 'private');

// Also register as default app for backward compat with any code
// that calls getApps()[0] or the default app
export const auth = getAuth(privateApp);
export const db   = getFirestore(privateApp);

// Named exports for hub integration code
export const privateDb   = db;
export const privateAuth = auth;