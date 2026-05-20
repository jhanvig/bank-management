import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_HUB_API_KEY,
  authDomain: process.env.REACT_APP_HUB_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_HUB_PROJECT_ID,
  storageBucket: process.env.REACT_APP_HUB_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_HUB_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_HUB_APP_ID,
};

// SECOND firebase app
const hubApp = initializeApp(firebaseConfig, 'hub');

export const hubDb = getFirestore(hubApp);
export const hubAuth = getAuth(hubApp);