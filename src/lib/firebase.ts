import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { app } from './firebaseApp';

export { app } from './firebaseApp';
export const db = getFirestore(app);
export const auth = getAuth(app);
