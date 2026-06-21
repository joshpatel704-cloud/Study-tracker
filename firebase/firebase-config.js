import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "level-cortex-qdzmz",
  appId: "1:959604329402:web:1549085a9957805c42eb83",
  apiKey: "AIzaSyBWWkRV5-9eAqd7h7QBx4BY0SeoIAjRJSs",
  authDomain: "level-cortex-qdzmz.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-4e87b386-6086-40cf-ab05-9e64790e1b89",
  storageBucket: "level-cortex-qdzmz.firebasestorage.app",
  messagingSenderId: "959604329402",
};

let app;
let auth;
let db;
let isFirebaseAvailable = false;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
