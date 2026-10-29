// ゲームを見ていない人へ、手番・相手の入室・フレンド申請などをWeb Pushで伝える。
// ログイン済みのブラウザが購読を登録し、VAPID秘密鍵は送信するサーバーだけに置く。
//
//   pplale:push:sub:{uid}          hash    通知先と購読情報。再登録されなければ失効。
//   pplale:push:away:{room}:{seat} string  席の画面が非表示か。ルームとともに失効。
//   pplale:push:once:{key}         string  同じ通知の重複送信を防ぐ記録。
//
// Redis未設定時は、開発・テスト用にプロセス内で管理する。
import { createClient } from 'redis';
import webpush from 'web-push';
import { z } from 'zod';
import type { Side } from '@pplale/game-core';

/** What a notification shows and the page it opens (public/sw.js shows it). */
export interface Notice { title: string; body: string; url: string; tag: string }
export type Subscription = z.infer<typeof subscription>;

const SUBSCRIPTION_DAYS = 60;
const MAX_DEVICES = 8;
const DAY = 24 * 60 * 60 * 1000;
/** A notice nobody received in this long is dropped by the push service (an old "your turn" helps nobody). */
const NOTICE_TTL_SECONDS = 15 * 60;

/**
 * Only the browsers' own push services: a subscription is a URL this server will POST to, so any
 * other address (an internal service, say) is refused.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^([\w-]+\.)*push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^([\w-]+\.)*notify\.windows\.com$/];
const base64url = z.string().min(16).max(256).regex(/^[\w-]+=*$/);
export const subscription = z.object({
    endpoint: z.string().max(1024).url().refine(value => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some(host => host.test(url.hostname));
    }),
    keys: z.object({ p256dh: base64url, auth: base64url }),
});

export interface PushStore {
    add(uid: string, value: Subscription): Promise<void>;
    remove(uid: string, endpoint: string): Promise<void>;
    list(uid: string): Promise<Subscription[]>;
    /** The seat's (or plaza member's) page is hidden (true) or shown (false). */
    setAway(room: string, seat: Side | string, away: boolean, ttl: number): Promise<void>;
    away(room: string, seat: Side | string): Promise<boolean>;
    /** True the first time `key` is claimed within `ttl` ms. */
    once(key: string, ttl: number): Promise<boolean>;
    close(): Promise<void>;
}

type Saved = Subscription & { at: number };
const newest = (devices: Saved[]) => devices.sort((a, b) => b.at - a.at).slice(0, MAX_DEVICES);

export function memoryPushStore(now = Date.now): PushStore {
    const devices = new Map<string, Saved[]>(), flags = new Map<string, number>();
    const live = (key: string) => (flags.get(key) ?? 0) > now();
    return {
        async add(uid, value) { devices.set(uid, newest([{ ...value, at: now() }, ...(devices.get(uid) ?? []).filter(device => device.endpoint !== value.endpoint)])); },
        async remove(uid, endpoint) { devices.set(uid, (devices.get(uid) ?? []).filter(device => device.endpoint !== endpoint)); },
        async list(uid) { return (devices.get(uid) ?? []).filter(device => device.at + SUBSCRIPTION_DAYS * DAY > now()); },
        async setAway(room, seat, away, ttl) { if (away) flags.set(`away:${room}:${seat}`, now() + ttl); else flags.delete(`away:${room}:${seat}`); },
        async away(room, seat) { return live(`away:${room}:${seat}`); },
        async once(key, ttl) { if (live(`once:${key}`)) return false; flags.set(`once:${key}`, now() + ttl); return true; },
        async close() {},
    };
}

export async function redisPushStore(url: string, prefix = 'pplale:push:'): Promise<PushStore> {
    const client = createClient({ url });
    client.on('error', error => console.error('push redis', error instanceof Error ? error.message : error));
    await client.connect();
    const subs = (uid: string) => `${prefix}sub:${uid}`, awayKey = (room: string, seat: Side | string) => `${prefix}away:${room}:${seat}`;
    async function read(uid: string): Promise<Saved[]> {
        const values = Object.values(await client.hGetAll(subs(uid)));
        return values.flatMap(value => { try { return [JSON.parse(value) as Saved]; } catch { return []; } });
    }
    return {
        async add(uid, value) {
            const kept = newest([{ ...value, at: Date.now() }, ...(await read(uid)).filter(device => device.endpoint !== value.endpoint)]);
            const multi = client.multi().del(subs(uid));
            for (const device of kept) multi.hSet(subs(uid), device.endpoint, JSON.stringify(device));
            await multi.pExpire(subs(uid), SUBSCRIPTION_DAYS * DAY).exec();
        },
        async remove(uid, endpoint) { await client.hDel(subs(uid), endpoint); },
        list: read,
        async setAway(room, seat, away, ttl) {
            if (away) await client.set(awayKey(room, seat), '1', { PX: Math.ceil(ttl) });
            else await client.del(awayKey(room, seat));
        },
        async away(room, seat) { return !!await client.exists(awayKey(room, seat)); },
        async once(key, ttl) { return await client.set(`${prefix}once:${key}`, '1', { NX: true, PX: Math.ceil(ttl) }) === 'OK'; },
        async close() { await client.quit(); },
    };
}

export interface VapidKeys { publicKey: string; privateKey: string; subject: string }
type Send = (target: Subscription, payload: string, options: webpush.RequestOptions) => Promise<unknown>;

/**
 * Sends notices to a player's registered browsers. Without VAPID keys nothing is sent (the
 * registrations are still kept). A browser whose subscription ended (404/410) is forgotten.
 */
export function pusher(store: PushStore, keys: VapidKeys | null, send: Send = webpush.sendNotification) {
    async function tell(uid: string, notice: Notice) {
        if (!keys) return;
        const devices = await store.list(uid);
        await Promise.all(devices.map(async ({ endpoint, keys: secret }) => {
            try {
                await send({ endpoint, keys: secret }, JSON.stringify(notice), {
                    vapidDetails: keys, TTL: NOTICE_TTL_SECONDS, urgency: 'high', topic: notice.tag.replace(/[^\w-]/g, '').slice(0, 32), timeout: 5000,
                });
            } catch (error) {
                const status = (error as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) await store.remove(uid, endpoint);
                else console.error('push failed', status ?? (error instanceof Error ? error.message : 'unknown'));
            }
        }));
    }
    return {
        enabled: !!keys,
        /** What browsers subscribe with (the application server key); null when nothing is sent. */
        publicKey: keys?.publicKey ?? null,
        store,
        /** Never delays or fails the request that caused it. */
        later(uid: string | undefined, notice: Notice) {
            if (!uid || !keys) return;
            void tell(uid, notice).catch(error => console.error('push failed', error instanceof Error ? error.message : 'unknown'));
        },
        tell,
    };
}
export type Pusher = ReturnType<typeof pusher>;

export function vapidKeys(): VapidKeys | null {
    const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env;
    if (!publicKey || !privateKey) return null;
    return { publicKey, privateKey, subject: subject || 'https://pplale.vercel.app' };
}
