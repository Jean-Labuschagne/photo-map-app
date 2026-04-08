import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyC7U-hbp-xGUMU3afHWi96nIqCrnEsm9II',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'photoglobe-382ff.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'photoglobe-382ff',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'photoglobe-382ff.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '29009475704',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:29009475704:web:df367b83d8aafdc509558d',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-8S21YHXBP2',
};

const app = initializeApp(firebaseConfig);
const configuredBucket = (firebaseConfig.storageBucket || '').trim();
const appspotBucket = `${firebaseConfig.projectId}.appspot.com`;
const firebasestorageBucket = `${firebaseConfig.projectId}.firebasestorage.app`;

const rawCandidates = [
  appspotBucket,
  firebasestorageBucket,
  configuredBucket,
].filter((value) => Boolean(value));

const STORAGE_BUCKET_CANDIDATES = [...new Set(rawCandidates)];

const primaryBucket = STORAGE_BUCKET_CANDIDATES[0];
const secondaryBucket = STORAGE_BUCKET_CANDIDATES.length > 1 ? STORAGE_BUCKET_CANDIDATES[1] : null;

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
export const storage = getStorage(app, `gs://${primaryBucket}`);
export const storageFallback = secondaryBucket ? getStorage(app, `gs://${secondaryBucket}`) : null;
export { STORAGE_BUCKET_CANDIDATES };
