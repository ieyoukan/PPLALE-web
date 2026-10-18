import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { IncomingMessage } from 'node:http';
import { RoomError } from '../rooms.ts';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const project = process.env.FIREBASE_PROJECT_ID ?? 'pplale-6cca0';
/** Untrusted user ids are never accepted; a guest proves possession of a persistent 256-bit key. */
export async function historyOwners(request: IncomingMessage): Promise<string[]> {
    const owners: string[] = [];
    const device = request.headers['x-history-key'];
    if (typeof device === 'string') {
        if (!/^[\da-f]{64}$/.test(device)) throw new RoomError(400, '履歴の認証情報が正しくありません');
        owners.push(`device:${createHash('sha256').update(device).digest('hex')}`);
    }
    const auth = request.headers.authorization;
    if (auth) {
        if (!auth.startsWith('Bearer ')) throw new RoomError(401, 'ログインし直してください');
        try {
            const { payload } = await jwtVerify(auth.slice(7), keys, { issuer: `https://securetoken.google.com/${project}`, audience: project, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub'] });
            if (!payload.sub || payload.sub.length > 128 || typeof payload.iat !== 'number' || payload.iat > Date.now() / 1000 + 60) throw new Error('invalid subject');
            owners.push(`user:${payload.sub}`);
        } catch { throw new RoomError(401, 'ログイン状態を確認できません。もう一度お試しください'); }
    }
    return owners;
}

/** Signed-in matches belong to the account; logging out must not expose them via the device key. */
export function seatOwners(owners: string[]) {
    const accounts = owners.filter(owner => owner.startsWith('user:'));
    return accounts.length ? accounts : owners;
}
