import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { app, clientAuth } from './firebaseApp';

export { app } from './firebaseApp';
// Auth first: Firestore would otherwise create a default auth instance without persistence.
export const auth = clientAuth();
export const db = getFirestore(app);

if (process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === 'true') {
  const globals = globalThis as typeof globalThis & { pplaleEmulatedFirestore?: WeakSet<object> };
  globals.pplaleEmulatedFirestore ??= new WeakSet();
  if (!globals.pplaleEmulatedFirestore.has(db)) { connectFirestoreEmulator(db, '127.0.0.1', 18082); globals.pplaleEmulatedFirestore.add(db); }
}
