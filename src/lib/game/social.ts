'use client';

import { displayCards } from './catalog';
export interface PlayerProfile { uid: string; displayName: string; comment: string; iconCardId: string }
export interface Friendship { id: string; members: [string, string]; requestedBy: string; status: 'pending' | 'accepted' }
/** `watching`: the room a friend is looking on at, and when they last said so (ms). */
export interface SocialPlayer { friendship: Friendship; profile: PlayerProfile; roomId?: string; watching?: { roomId: string; at: number } }
/** How often a spectator repeats that they are still watching, and how old a claim may be before it is ignored. */
export const WATCHING_BEAT = 60_000, WATCHING_STALE = 3 * 60_000;
export const defaultProfile = (uid: string, name = 'プレイヤー'): PlayerProfile => ({ uid, displayName: name, comment: 'よろしくお願いします！', iconCardId: 'p_1' });
export const friendshipId = (a: string, b: string) => [a, b].sort().join('~');
async function store() {
  const [sdk, { db, auth }] = await Promise.all([import('firebase/firestore'), import('@/lib/firebase')]);
  await auth.authStateReady();
  return { sdk, db, auth };
}
function profileOf(uid: string, data?: Record<string, unknown>): PlayerProfile {
  return { uid, displayName: typeof data?.displayName === 'string' ? data.displayName : 'プレイヤー', comment: typeof data?.comment === 'string' ? data.comment : '', iconCardId: typeof data?.iconCardId === 'string' && displayCards[data.iconCardId] ? data.iconCardId : 'p_1' };
}
export async function readProfile(uid: string): Promise<PlayerProfile | null> {
  const { sdk, db } = await store(), value = await sdk.getDoc(sdk.doc(db, 'profiles', uid));
  return value.exists() ? profileOf(uid, value.data()) : null;
}
export async function saveProfile(profile: PlayerProfile) {
  const { sdk, db, auth } = await store();
  if (auth.currentUser?.uid !== profile.uid) throw new Error('ログインし直してください');
  const displayName = Array.from(profile.displayName.replace(/\p{C}/gu, '').trim()).slice(0, 12).join('');
  const comment = Array.from(profile.comment.replace(/\p{C}/gu, '').trim()).slice(0, 80).join('');
  if (!displayName || !displayCards[profile.iconCardId]) throw new Error('名前とカードのアイコンを選んでください');
  const ref = sdk.doc(db, 'profiles', profile.uid);
  await sdk.runTransaction(db, async transaction => {
    const old = await transaction.get(ref);
    transaction.set(ref, { displayName, comment, iconCardId: profile.iconCardId, updatedAt: sdk.serverTimestamp(), ...(!old.exists() && { createdAt: sdk.serverTimestamp() }) }, { merge: true });
  });
  return { ...profile, displayName, comment };
}
export async function requestFriend(other: string) {
  const { sdk, db, auth } = await store(), uid = auth.currentUser?.uid;
  if (!uid || uid === other) throw new Error('相手のプロフィールから申請してください');
  const members = [uid, other].sort(), ref = sdk.doc(db, 'friendships', friendshipId(uid, other));
  await sdk.runTransaction(db, async transaction => {
    if ((await transaction.get(ref)).exists()) throw new Error('申請済みか、すでにフレンドです');
    transaction.set(ref, { members, requestedBy: uid, status: 'pending', createdAt: sdk.serverTimestamp() });
  });
}
export async function respondFriend(friendship: Friendship, accept: boolean) {
  const { sdk, db } = await store(), ref = sdk.doc(db, 'friendships', friendship.id);
  if (accept) await sdk.updateDoc(ref, { status: 'accepted', acceptedAt: sdk.serverTimestamp() });
  else await sdk.deleteDoc(ref);
}
export async function readRecruitment() {
  const { sdk, db, auth } = await store(), uid = auth.currentUser?.uid;
  if (!uid) return null;
  const value = await sdk.getDoc(sdk.doc(db, 'recruitments', uid));
  return value.data()?.roomId as string | undefined;
}
export async function publishRecruitment(roomId: string | null) {
  const { sdk, db, auth } = await store(), uid = auth.currentUser?.uid;
  if (!uid) throw new Error('ログインしてから募集してください');
  const ref = sdk.doc(db, 'recruitments', uid);
  if (roomId) await sdk.setDoc(ref, { roomId, updatedAt: sdk.serverTimestamp() });
  else await sdk.deleteDoc(ref);
}

/** Tells friends which room this player is watching (`null`: none). Repeated every WATCHING_BEAT while watching. */
export async function publishWatching(roomId: string | null) {
  const { sdk, db, auth } = await store(), uid = auth.currentUser?.uid;
  if (!uid) return;
  const ref = sdk.doc(db, 'watching', uid);
  if (roomId) await sdk.setDoc(ref, { roomId, updatedAt: sdk.serverTimestamp() });
  else await sdk.deleteDoc(ref);
}

/** Listeners exist only while the social screen is open. Presence itself stays in Redis. */
export function watchSocial(uid: string, receive: (players: SocialPlayer[]) => void, fail: () => void): () => void {
  let cancelled = false, stop: (() => void) | undefined;
  const profiles = new Map<string, PlayerProfile>(), rooms = new Map<string, string>(), watching = new Map<string, { roomId: string; at: number }>();
  const subscriptions = new Map<string, (() => void)[]>();
  let friendships: Friendship[] = [];
  const emit = () => { if (!cancelled) receive(friendships.map(friendship => { const other = friendship.members.find(member => member !== uid)!; return { friendship, profile: profiles.get(other) ?? defaultProfile(other), roomId: rooms.get(other), watching: watching.get(other) }; })); };
  void store().then(({ sdk, db }) => {
    if (cancelled) return;
    stop = sdk.onSnapshot(sdk.query(sdk.collection(db, 'friendships'), sdk.where('members', 'array-contains', uid), sdk.limit(100)), { includeMetadataChanges: true }, snapshot => {
      const confirmed = new Set(snapshot.docs.filter(doc => !doc.metadata.hasPendingWrites).map(doc => doc.id));
      friendships = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Friendship));
      const kept = new Set(friendships.map(friendship => friendship.members.find(member => member !== uid)!));
      for (const [other, stops] of subscriptions) if (!kept.has(other)) { stops.forEach(stop => stop()); subscriptions.delete(other); profiles.delete(other); rooms.delete(other); watching.delete(other); }
      for (const friendship of friendships) {
        const other = friendship.members.find(member => member !== uid)!;
        // An accepted relation needs an additional, rule-protected recruitment listener.
        const existing = subscriptions.get(other) ?? [];
        if (!existing.length) existing.push(sdk.onSnapshot(sdk.doc(db, 'profiles', other), doc => { profiles.set(other, profileOf(other, doc.data())); emit(); }, fail));
        if (friendship.status === 'accepted' && confirmed.has(friendship.id) && existing.length === 1) existing.push(sdk.onSnapshot(sdk.doc(db, 'recruitments', other), doc => { const roomId = doc.data()?.roomId; if (typeof roomId === 'string' && /^\d{6}$/.test(roomId)) rooms.set(other, roomId); else rooms.delete(other); emit(); }, () => { rooms.delete(other); emit(); }));
        if (friendship.status === 'accepted' && confirmed.has(friendship.id) && existing.length === 2) existing.push(sdk.onSnapshot(sdk.doc(db, 'watching', other), doc => {
          const data = doc.data(), roomId = data?.roomId, at = data?.updatedAt?.toMillis?.();
          if (typeof roomId === 'string' && /^\d{6}$/.test(roomId) && typeof at === 'number') watching.set(other, { roomId, at }); else watching.delete(other);
          emit();
        }, () => { watching.delete(other); emit(); }));
        subscriptions.set(other, existing);
      }
      emit();
    }, fail);
  }).catch(fail);
  return () => { cancelled = true; stop?.(); for (const stops of subscriptions.values()) stops.forEach(stop => stop()); };
}
