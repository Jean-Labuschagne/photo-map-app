import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBp0ls-DBZBDtGGz_CY4y0yRWOFbZukyZc',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'photoglobe-2e39d.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'photoglobe-2e39d',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'photoglobe-2e39d.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '287205293926',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:287205293926:web:fc8176f99723dc362dd2a7',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-7TESQ4EDKL',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
