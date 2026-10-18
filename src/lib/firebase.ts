import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { app } from './firebaseApp';

export { app } from './firebaseApp';
export const db = getFirestore(app);
export const auth = getAuth(app);

if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true') {
  const globals = globalThis as typeof globalThis & { pplaleEmulatedFirestore?: WeakSet<object> };
  globals.pplaleEmulatedFirestore ??= new WeakSet();
  if (!globals.pplaleEmulatedFirestore.has(db)) { connectFirestoreEmulator(db, '127.0.0.1', 18082); globals.pplaleEmulatedFirestore.add(db); }
}
