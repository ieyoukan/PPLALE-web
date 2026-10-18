// Run against a restored, isolated PostgreSQL database. Never mutates history data.
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import type { Catalog } from '@pplale/game-core';
import type { ReplayFrame } from '@pplale/game-core/history';
const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
export async function verifyHistoryDatabase(url: string) {
    const pool = new Pool({ connectionString: url });
    pool.on('error', () => {});
    const client = await pool.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const catalogs = new Map<string, Catalog>();
        for (const row of (await client.query('SELECT * FROM catalogs')).rows) {
            if (sha(row.data) !== row.id) throw new Error('Catalog hash mismatch');
            catalogs.set(row.id, JSON.parse(gunzipSync(row.data).toString()) as Catalog);
        }
        const assets = new Set<string>();
        for (const row of (await client.query('SELECT * FROM assets')).rows) {
            if (sha(row.data) !== row.id) throw new Error('Card image hash mismatch');
            assets.add(row.id);
        }
        let frameCount = 0;
        const matches = (await client.query('SELECT * FROM matches')).rows;
        for (const match of matches) {
            if (sha(match.catalog + '\n' + match.meta + '\n' + match.hash) !== match.meta_hash) throw new Error('Match metadata hash mismatch');
            let previous = '', sequence = 0;
            const frames = (await client.query('SELECT * FROM frames WHERE match=$1 ORDER BY seq', [match.id])).rows;
            for (const row of frames) {
                const hash = sha(Buffer.concat([Buffer.from(previous + '\n'), row.data]));
                if (row.seq !== sequence || row.previous !== previous || row.hash !== hash) throw new Error('Frame chain mismatch');
                const frame = JSON.parse(gunzipSync(row.data).toString()) as ReplayFrame;
                if (frame.sequence !== sequence || !catalogs.has(frame.catalogId)) throw new Error('Frame sequence/catalog mismatch');
                const catalog = catalogs.get(frame.catalogId)!;
                for (const card of Object.values(frame.state.cards)) if (!catalog[card.cardId] || !frame.presentation.cards[card.uid]) throw new Error('Missing historical card or presentation');
                previous = hash; sequence++;
            }
            if (!sequence || sequence !== match.count || previous !== match.hash) throw new Error('Recording tail mismatch');
            frameCount += sequence;
        }
        for (const catalog of catalogs.values()) for (const card of Object.values(catalog)) {
            const id = (card as typeof card & { imageHash?: string }).imageHash;
            if (id && !assets.has(id)) throw new Error('Missing historical card image');
        }
        await client.query('COMMIT');
        return { matches: matches.length, frames: frameCount, catalogs: catalogs.size, images: assets.size };
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!process.env.HISTORY_DATABASE_URL) throw new Error('HISTORY_DATABASE_URL is required (an isolated restored DB)');
    console.log(JSON.stringify({ ok: true, ...await verifyHistoryDatabase(process.env.HISTORY_DATABASE_URL) }));
}
