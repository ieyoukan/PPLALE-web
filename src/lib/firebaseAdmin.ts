import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { firebaseApiKey } from './firebaseApp';

/** The server's Firebase Admin app: the service account in production, the demo project when testing against emulators. */
export function adminApp() {
  if (getApps().length) return getApps()[0];
  if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true') {
    // The same local Firestore emulator the browser uses (firebase.json).
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:18082';
    return initializeApp({ projectId: 'demo-pplale-social' });
  }
  return initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }) });
}

/**
 * The account an ID token belongs to, or null if Firebase Auth does not accept it. Asks Auth itself
 * (`accounts:lookup`) instead of firebase-admin/auth, whose key fetcher requires the ESM-only `jose`
 * and fails to load on Vercel's runtime.
 */
export async function verifiedUid(idToken: string): Promise<string | null> {
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true' ? 'http://127.0.0.1:19099/identitytoolkit.googleapis.com' : 'https://identitytoolkit.googleapis.com';
  const response = await fetch(`${host}/v1/accounts:lookup?key=${firebaseApiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), signal: AbortSignal.timeout(5000) });
  if (response.status === 400) return null;
  if (!response.ok) throw new Error(`accounts:lookup ${response.status}`);
  const uid = ((await response.json()) as { users?: { localId?: unknown }[] }).users?.[0]?.localId;
  return typeof uid === 'string' && uid ? uid : null;
}
