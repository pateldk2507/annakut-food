import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

function getServiceAccountCredential() {
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    });
  }

  return applicationDefault();
}

function ensureFirebaseServerConfig() {
  if (!process.env.FIREBASE_DATABASE_URL) {
    throw new Error("Missing FIREBASE_DATABASE_URL for Firebase Admin initialization.");
  }
}

export function getFirebaseAdmin() {
  ensureFirebaseServerConfig();

  if (!getApps().length) {
    initializeApp({
      credential: getServiceAccountCredential(),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
  }

  return {
    auth: getAuth(),
    db: getDatabase(),
  };
}
