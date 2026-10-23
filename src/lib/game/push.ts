'use client';

// Push notifications in the browser: the subscription of this browser, registered with the room
// server (services/room-server/src/push.ts), which sends them. Only signed-in players can have them.
import { isIos, isStandalone } from '@/lib/pwa';
import { pushFriend, pushRecruit, readPushKey, registerPush, roomServerUrl, unregisterPush } from './room/client';

/**
 * What the bell can do here. `install`: iPhone/iPad Safari only notifies apps added to the home
 * screen. `denied`: the browser was told to block notifications. `unsupported`: no push at all.
 */
export type PushAvailability = 'ready' | 'install' | 'denied' | 'unsupported';

export function pushAvailability(): PushAvailability {
  if (!roomServerUrl) return 'unsupported';
  if (isIos() && !isStandalone()) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return Notification.permission === 'denied' ? 'denied' : 'ready';
}

/**
 * The room server's VAPID public key (its private key is a Secret of the room server), asked once a
 * visit: null when the server sends no notifications, and then there is no bell.
 */
let serverKey: Promise<string | null> | undefined;
export function pushKey() {
  serverKey ??= roomServerUrl ? readPushKey().then(({ publicKey }) => publicKey, () => { serverKey = undefined; return null; }) : Promise.resolve(null);
  return serverKey;
}
const bytes = (base64url: string) => Uint8Array.from(atob(base64url.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
const sameKey = (subscription: PushSubscription, key: Uint8Array) => {
  const own = subscription.options.applicationServerKey;
  return !!own && own.byteLength === key.byteLength && new Uint8Array(own).every((byte, index) => byte === key[index]);
};
const registration = () => navigator.serviceWorker.ready;

/** This browser's subscription, if it has one. */
export async function currentSubscription() {
  if (pushAvailability() !== 'ready') return null;
  return (await registration()).pushManager.getSubscription();
}

/** Asks for permission (needs a tap), subscribes and registers this browser. False when refused. */
export async function enablePush() {
  if (await Notification.requestPermission() !== 'granted') return false;
  const publicKey = await pushKey();
  if (!publicKey) return false;
  const key = bytes(publicKey), manager = (await registration()).pushManager;
  let subscription = await manager.getSubscription();
  // A subscription made with an earlier key of the server is not one it can send to.
  if (subscription && !sameKey(subscription, key)) { await subscription.unsubscribe(); subscription = null; }
  subscription ??= await manager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await registerPush(subscription.toJSON());
  return true;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await unregisterPush(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe();
}

/** Registers the subscription again (it may have been renewed, or forgotten by the server). Once per visit. */
export async function refreshPush() {
  // Notification is missing in iPhone Safari outside the home screen app.
  if (sessionStorage.getItem('pplale-push-refreshed') || pushAvailability() !== 'ready' || Notification.permission !== 'granted') return;
  const [subscription, publicKey] = await Promise.all([currentSubscription(), pushKey()]);
  if (!subscription || !publicKey) return;
  if (sameKey(subscription, bytes(publicKey))) await registerPush(subscription.toJSON());
  else await enablePush();
  sessionStorage.setItem('pplale-push-refreshed', '1');
}

// Telling friends. Best effort: the friendship or recruitment is already saved, a lost notice is no error.
export const tellFriend = (to: string, kind: 'request' | 'accepted') => { if (roomServerUrl) void pushFriend(to, kind).catch(() => {}); };
export const tellRecruit = (roomId: string) => { if (roomServerUrl) void pushRecruit(roomId).catch(() => {}); };
