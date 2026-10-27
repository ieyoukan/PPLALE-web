'use client';

import { displayCards } from './catalog';
import { tellFriend, tellRecruit } from './push';
/** `decks`: ids of the player's saved decks (users/{uid}/decks) they show on their profile, at most MAX_PUBLIC_DECKS. */
export interface PlayerProfile { uid: string; displayName: string; comment: string; iconCardId: string; decks: string[] }
export const MAX_PUBLIC_DECKS = 3;
const deckIds = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && /^[\w-]{1,128}$/.test(id)))].slice(0, MAX_PUBLIC_DECKS) : [];
export interface Friendship { id: string; members: [string, string]; requestedBy: string; status: 'pending' | 'accepted' }
/** `watching`: the room a friend is looking on at, and when they last said so (ms). */
export interface SocialPlayer { friendship: Friendship; profile: PlayerProfile; roomId?: string; watching?: { roomId: string; at: number } }
/** How often a spectator repeats that they are still watching, and how old a claim may be before it is ignored. */
export const WATCHING_BEAT = 60_000, WATCHING_STALE = 3 * 60_000;
export const defaultProfile = (uid: string, name = 'プレイヤー'): PlayerProfile => ({ uid, displayName: name, comment: 'よろしくお願いします！', iconCardId: 'p_1', decks: [] });
const friendshipId = (a: string, b: string) => [a, b].sort().join('~');
async function store() {
  const [sdk, { db, auth }] = await Promise.all([import('firebase/firestore'), import('@/lib/firebase')]);
  await auth.authStateReady();
  return { sdk, db, auth };
}
function profileOf(uid: string, data?: Record<string, unknown>): PlayerProfile {
  return { uid, displayName: typeof data?.displayName === 'string' ? data.displayName : 'プレイヤー', comment: typeof data?.comment === 'string' ? data.comment : '', iconCardId: typeof data?.iconCardId === 'string' && displayCards[data.iconCardId] ? data.iconCardId : 'p_1', decks: deckIds(data?.decks) };
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
    transaction.set(ref, { displayName, comment, iconCardId: profile.iconCardId, decks: deckIds(profile.decks), updatedAt: sdk.serverTimestamp(), ...(!old.exists() && { createdAt: sdk.serverTimestamp() }) }, { merge: true });
  });
  return { ...profile, displayName, comment, decks: deckIds(profile.decks) };
}
export async function requestFriend(other: string) {
  const { sdk, db, auth } = await store(), uid = auth.currentUser?.uid;
  if (!uid || uid === other) throw new Error('相手のプロフィールから申請してください');
  const members = [uid, other].sort(), ref = sdk.doc(db, 'friendships', friendshipId(uid, other));
  await sdk.runTransaction(db, async transaction => {
    if ((await transaction.get(ref)).exists()) throw new Error('申請済みか、すでにフレンドです');
    transaction.set(ref, { members, requestedBy: uid, status: 'pending', createdAt: sdk.serverTimestamp() });
  });
  tellFriend(other, 'request');
}
/** This player's friendship with `other`, if any (`null` also when not signed in). */
export async function readFriendship(other: string): Promise<Friendship | null> {
  const { sdk, db, auth } = await store(), uid = auth.currentUser?.uid;
  if (!uid || uid === other) return null;
  const value = await sdk.getDoc(sdk.doc(db, 'friendships', friendshipId(uid, other)));
  return value.exists() ? { id: value.id, ...value.data() } as Friendship : null;
}
export async function respondFriend(friendship: Friendship, accept: boolean) {
  const { sdk, db } = await store(), ref = sdk.doc(db, 'friendships', friendship.id);
  if (accept) {
    await sdk.updateDoc(ref, { status: 'accepted', acceptedAt: sdk.serverTimestamp() });
    tellFriend(friendship.requestedBy, 'accepted');
  } else await sdk.deleteDoc(ref);
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
  if (roomId) {
    await sdk.setDoc(ref, { roomId, updatedAt: sdk.serverTimestamp() });
    tellRecruit(roomId);
  }
  else await sdk.deleteDoc(ref);
}

/** A deck as a profile shows it (from users/{uid}/decks, which anyone may read for sharing). */
export interface PublicDeck { id: string; name: string; updatedAt: Date | null; yojoDeckIds: string[]; sweetDeckIds: string[]; playableCardId: string | null }
function deckOf(id: string, data?: Record<string, unknown>): PublicDeck {
  const cards = (value: unknown) => Array.isArray(value) ? value.filter((card): card is string => typeof card === 'string') : [];
  const updated = (data?.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.();
  return { id, name: typeof data?.name === 'string' && data.name ? data.name : '無名のデッキ', updatedAt: updated ?? null, yojoDeckIds: cards(data?.yojoDeckIds), sweetDeckIds: cards(data?.sweetDeckIds), playableCardId: typeof data?.playableCardId === 'string' ? data.playableCardId : null };
}
/** The decks a profile shows, in its order; ones since deleted are left out. */
export async function readPublicDecks(uid: string, ids: string[]): Promise<PublicDeck[]> {
  const { sdk, db } = await store();
  const found = await Promise.all(ids.map(id => sdk.getDoc(sdk.doc(db, 'users', uid, 'decks', id)).then(doc => doc.exists() ? deckOf(doc.id, doc.data()) : null, () => null)));
  return found.filter(deck => deck !== null);
}
/** Every saved deck of the signed-in player, newest first, to choose from. */
export async function readMyDecks(uid: string): Promise<PublicDeck[]> {
  const { sdk, db } = await store();
  const snapshot = await sdk.getDocs(sdk.collection(db, 'users', uid, 'decks'));
  return snapshot.docs.map(doc => deckOf(doc.id, doc.data())).sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}
/**
 * The room this browser says the player is at, for each reason: watching a match, or being in a room
 * to gather in. Both go to the one `watching` document (its rules allow one room): the match watched
 * comes first, and the document goes only once neither says anything, so one never deletes the other.
 */
const place: { watching: string | null; presence: string | null } = { watching: null, presence: null };
async function publishPlace(kind: keyof typeof place, roomId: string | null) {
  place[kind] = roomId;
  const { sdk, db, auth } = await store(), uid = auth.currentUser?.uid;
  if (!uid) return false;
  const ref = sdk.doc(db, 'watching', uid), shown = place.watching ?? place.presence;
  if (shown) await sdk.setDoc(ref, { roomId: shown, updatedAt: sdk.serverTimestamp() });
  else await sdk.deleteDoc(ref);
  return true;
}

/** Tells friends which room this player is watching (`null`: none). Repeated every WATCHING_BEAT while watching. */
export async function publishWatching(roomId: string | null) {
  if (await publishPlace('watching', roomId) && roomId) tellRecruit(roomId);
}

/**
 * Tells friends which room this player is in (`null`: none they could find). It is the `watching`
 * document, whose rules are already deployed: written only while in a room friends may see
 * (public, friends, friends+), repeated every WATCHING_BEAT, readable only by accepted friends.
 */
export async function publishPresence(roomId: string | null) {
  await publishPlace('presence', roomId);
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
