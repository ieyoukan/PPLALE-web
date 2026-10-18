import type { HistoryRepository } from './repository.ts';
import { RoomError } from '../rooms.ts';

export function remoteHistory(url: string): HistoryRepository {
    async function call<T>(method: string, args: unknown[] = []): Promise<T> {
        try {
            const response = await fetch(url.replace(/\/$/, '') + '/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args }), signal: AbortSignal.timeout(15_000) });
            if (!response.ok) throw new Error('history write failed');
            return await response.json() as T;
        } catch { throw new RoomError(503, '記録サーバーに接続できません。接続が戻るまでお待ちください'); }
    }
    return {
        assetIds: () => call('assetIds'), putAsset: (...args) => call('putAsset', args), asset: (...args) => call('asset', args),
        registerCatalog: (...args) => call('registerCatalog', args),
        ingest: (...args) => call('ingest', args), get: (...args) => call('get', args),
        linkGuest: (...args) => call('linkGuest', args), list: (...args) => call('list', args),
        detail: (...args) => call('detail', args), recording: (...args) => call('recording', args), favorite: (...args) => call('favorite', args),
        ping: () => call<boolean>('ping').catch(() => false), close: async () => {},
    };
}
