import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function ensureFirebaseConfig() {
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error("Missing Firebase web config. Set the Vite Firebase environment variables.");
  }
}

ensureFirebaseConfig();

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

export function onAuthChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithEmailPassword(email, password) {
  const credential = await signInWithEmailAndPassword(auth, String(email || "").trim(), password);
  return credential.user;
}

export async function registerWithEmailPassword(email, password) {
  const credential = await createUserWithEmailAndPassword(auth, String(email || "").trim(), password);
  return credential.user;
}

export async function sendFirebasePasswordReset(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Enter an email address first.");
  await sendPasswordResetEmail(auth, normalizedEmail);
}

export async function signOutFirebaseUser() {
  if (auth.currentUser) {
    await signOut(auth);
  }
}

export async function getCurrentIdToken() {
  if (!auth.currentUser) {
    throw new Error("Please sign in with your email first.");
  }

  return auth.currentUser.getIdToken();
}
