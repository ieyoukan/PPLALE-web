import { cert, getApps, initializeApp } from 'firebase-admin/app';

/** The server's Firebase Admin app: the service account in production, the demo project when testing against emulators. */
export function adminApp() {
  if (getApps().length) return getApps()[0];
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true') return initializeApp({ projectId: 'demo-pplale-social' });
  return initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }) });
}
