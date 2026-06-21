import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "study-tracker-282e2",
  appId: "1:1091617050976:web:14e7ef02a48af411478e05",
  apiKey: "AIzaSyDUC5TO-u-XvKtj25gUzmF-A4U3C3_rFVw",
  authDomain: "study-tracker-282e2.firebaseapp.com",
  storageBucket: "study-tracker-282e2.firebasestorage.app",
  messagingSenderId: "1091617050976",
  measurementId: "G-EV1BVBYQE7"
};

let app;
let auth;
let db;
let isFirebaseAvailable = false;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  if (firebaseConfig.firestoreDatabaseId) {
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    db = getFirestore(app);
  }
  isFirebaseAvailable = true;
} catch (error) {
  console.error("Firebase initializing failed, falling back to LocalStorage:", error);
}

export { app, auth, db, isFirebaseAvailable, firebaseConfig };

// Error types as per Firebase Skill guidelines
export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

// Global error handler for diagnostic rules audits
export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
