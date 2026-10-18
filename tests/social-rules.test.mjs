// Real SDK clients against the isolated demo emulator; no production project or billing calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, collection, query, where, limit, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
const enabled = process.env.PPLALE_FIREBASE_RULES_TEST === '1';
async function client(t, signedIn = true) {
  const app = initializeApp({ projectId: 'demo-pplale-social', apiKey: 'test-only' }, randomUUID());
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:19099', { disableWarnings: true });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 18082);
  const uid = signedIn ? (await signInAnonymously(auth)).user.uid : null;
  t.after(() => deleteApp(app));
  return { db, uid };
}
const denied = promise => assert.rejects(promise, error => error.code === 'permission-denied');
const profile = () => ({ displayName: 'なまえ', comment: 'よろしくお願いします！', iconCardId: 'p_1', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });

test('social rules: profiles contain only public allowed fields and only their owner can edit them', { skip: !enabled }, async t => {
  const a = await client(t), b = await client(t), guest = await client(t, false);
  const ref = doc(a.db, 'profiles', a.uid);
  await setDoc(ref, profile());
  assert.equal((await getDoc(doc(guest.db, 'profiles', a.uid))).data().comment, 'よろしくお願いします！');
  await denied(updateDoc(doc(b.db, 'profiles', a.uid), { comment: 'hijack', updatedAt: serverTimestamp() }));
  await denied(updateDoc(ref, { email: 'must not be public', updatedAt: serverTimestamp() }));
  await denied(updateDoc(ref, { comment: 'a'.repeat(81), updatedAt: serverTimestamp() }));
  await denied(updateDoc(ref, { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await denied(getDocs(collection(a.db, 'profiles')));
  await denied(updateDoc(ref, { decks: ['a', 'b', 'c', 'd'], updatedAt: serverTimestamp() }));
  await denied(updateDoc(ref, { decks: 'a', updatedAt: serverTimestamp() }));
  await updateDoc(ref, { displayName: '変更', comment: 'また遊ぼう！', iconCardId: 'y_1', decks: ['a', 'b', 'c'], updatedAt: serverTimestamp() });
  assert.equal((await getDoc(ref)).data().displayName, '変更');
});

test('social rules: only the recipient can accept; friend lists, recruitments and watching are private and revoked on removal', { skip: !enabled }, async t => {
  const a = await client(t), b = await client(t), c = await client(t), shared = ['recruitments', 'watching'];
  for (const user of [a, b, c]) await setDoc(doc(user.db, 'profiles', user.uid), profile());
  const members = [a.uid, b.uid].sort(), id = members.join('~');
  const request = { members, requestedBy: a.uid, status: 'pending', createdAt: serverTimestamp() };
  const ref = doc(a.db, 'friendships', id);
  assert.equal((await getDoc(ref)).exists(), false);
  await setDoc(ref, request);
  await denied(updateDoc(ref, { status: 'accepted', acceptedAt: serverTimestamp() }));
  await denied(getDoc(doc(c.db, 'friendships', id)));
  await denied(setDoc(doc(a.db, 'friendships', 'different-id'), request));
  for (const kind of shared) await setDoc(doc(a.db, kind, a.uid), { roomId: '123456', updatedAt: serverTimestamp() });
  for (const kind of shared) await denied(getDoc(doc(b.db, kind, a.uid)));
  await updateDoc(doc(b.db, 'friendships', id), { status: 'accepted', acceptedAt: serverTimestamp() });
  for (const kind of shared) assert.equal((await getDoc(doc(b.db, kind, a.uid))).data().roomId, '123456');
  for (const kind of shared) await denied(updateDoc(doc(b.db, kind, a.uid), { roomId: '654321', updatedAt: serverTimestamp() }));
  for (const kind of shared) await denied(getDoc(doc(c.db, kind, a.uid)));
  const own = await getDocs(query(collection(b.db, 'friendships'), where('members', 'array-contains', b.uid), limit(100)));
  assert.equal(own.docs.length, 1);
  await denied(getDocs(collection(b.db, 'friendships')));
  await denied(updateDoc(doc(b.db, 'friendships', id), { members: [b.uid, c.uid], status: 'accepted', acceptedAt: serverTimestamp() }));
  await deleteDoc(doc(b.db, 'friendships', id));
  for (const kind of shared) await denied(getDoc(doc(b.db, kind, a.uid)));
});
