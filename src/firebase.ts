import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const metaEnv = (import.meta as any).env || {};
const apiKey = metaEnv.VITE_FIREBASE_API_KEY || "AIzaSyBPXnaVF22ihqNvU_Fk7JnUN-uHVDVKhF0";
const authDomain = metaEnv.VITE_FIREBASE_AUTH_DOMAIN || "parking-project-39e77.firebaseapp.com";
const projectId = metaEnv.VITE_FIREBASE_PROJECT_ID || "parking-project-39e77";

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET || "parking-project-39e77.firebasestorage.app",
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "978887546029",
  appId: metaEnv.VITE_FIREBASE_APP_ID || "1:978887546029:web:e03e4831f56b2dd965e224",
  measurementId: metaEnv.VITE_FIREBASE_MEASUREMENT_ID || "G-VNLNLTXHDF"
};

export const isFirebaseEnabled = !!(apiKey && projectId);

let app;
let db: any = null;
let auth: any = null;

if (isFirebaseEnabled) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
  auth = getAuth(app);
}

export { db, auth };

