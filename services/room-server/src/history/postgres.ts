// Redis owns live rooms. PostgreSQL durably archives the Redis transactional outbox.
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { matchTurns } from '@pplale/game-core';
import type { Catalog, GameState, Side } from '@pplale/game-core';
import type { HistoryPage, MatchDetails, MatchRecording, MatchSummary, ReplayFrame } from '@pplale/game-core/history';
import type { Room } from '../rooms.ts';
import type { SnapshotCapture } from './capture.ts';
import type { HistoryRepository, HistoryWrite } from './repository.ts';

const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const pack = (value: unknown) => gzipSync(JSON.stringify(value));
const unpack = <T>(value: Uint8Array): T => JSON.parse(gunzipSync(value).toString()) as T;
const schema = `
CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, version INTEGER NOT NULL, expires BIGINT NOT NULL, json TEXT NOT NULL, event_ms BIGINT NOT NULL, event_seq BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, data BYTEA NOT NULL, mime TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS catalogs(id TEXT PRIMARY KEY, data BYTEA NOT NULL);
CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, started BIGINT NOT NULL, ended BIGINT, meta TEXT NOT NULL, catalog TEXT NOT NULL REFERENCES catalogs(id), count INTEGER NOT NULL, hash TEXT NOT NULL, meta_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members(match TEXT NOT NULL REFERENCES matches(id), owner TEXT NOT NULL, seat INTEGER NOT NULL CHECK(seat IN (0,1)), favorite INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(match,owner,seat));
CREATE INDEX IF NOT EXISTS members_owner ON members(owner,match);
CREATE INDEX IF NOT EXISTS matches_ended ON matches(ended DESC,id DESC);
CREATE TABLE IF NOT EXISTS frames(match TEXT NOT NULL REFERENCES matches(id), seq INTEGER NOT NULL, data BYTEA NOT NULL, hash TEXT NOT NULL, previous TEXT NOT NULL, PRIMARY KEY(match,seq));
CREATE TABLE IF NOT EXISTS durability_fence(id INTEGER PRIMARY KEY, nonce INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS claims(device TEXT NOT NULL, account TEXT NOT NULL, before_ms BIGINT NOT NULL, PRIMARY KEY(device,before_ms));`;

export class PostgresHistory implements HistoryRepository {
    private pool: Pool;
    private closing?: Promise<void>;
    private sync: 'on' | 'remote_apply';
    private constructor(url: string, sync: 'on' | 'remote_apply') {
        this.sync = sync;
        this.pool = new Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 5000, statement_timeout: 15_000, application_name: 'pplale_history' });
        this.pool.on('error', error => console.error('history database connection', error.message));
    }
    static async open(url: string, sync: 'on' | 'remote_apply' = 'on') {
        const history = new PostgresHistory(url, sync);
        try { await history.transaction(async client => { await client.query(schema); }); return history; }
        catch (error) { await history.close(); throw error; }
    }
    private async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`SET LOCAL synchronous_commit = '${this.sync}'`);
            // Also serializes ingestion/claim operations from overlapping history service versions.
            await client.query('SELECT pg_advisory_xact_lock(727530120)');
            const result = await run(client);
            // A retry after a lost COMMIT response must also wait for replication, even if
            // ingest is idempotently skipped. A fresh WAL record fences all preceding writes.
            await client.query('INSERT INTO durability_fence VALUES(1,0) ON CONFLICT(id) DO UPDATE SET nonce=1-durability_fence.nonce');
            // Cancelling synchronous COMMIT can acknowledge only the primary copy. Let it
            // wait for the standby; RPC timeout leaves the Redis outbox available for retry.
            await client.query('SET LOCAL statement_timeout = 0');
            await client.query('COMMIT');
            return result;
        } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
        finally { client.release(); }
    }
    private async catalog(client: PoolClient | Pool, id: string) {
        const row = (await client.query('SELECT data FROM catalogs WHERE id=$1', [id])).rows[0];
        if (!row || sha(row.data) !== id) throw new Error('Catalog integrity check failed');
        return unpack<Catalog>(row.data);
    }
    private checkedMeta(row: QueryResultRow): MatchSummary {
        if (sha(row.catalog + '\n' + row.meta + '\n' + row.hash) !== row.meta_hash) throw new Error('Match metadata integrity check failed');
        return JSON.parse(row.meta) as MatchSummary;
    }
    private async append(client: PoolClient, room: Room, state: GameState, event: ReplayFrame['event'], capture?: SnapshotCapture | null, completeAllowed = true) {
        const row = (await client.query('SELECT * FROM matches WHERE id=$1', [room.record!.id])).rows[0];
        if (!row || row.ended !== null) return;
        const sequence = Number(row.count), previousHash = String(row.hash);
        const last = sequence ? (await client.query('SELECT data FROM frames WHERE match=$1 AND seq=$2', [room.record!.id, sequence - 1])).rows[0] : undefined;
        const prior = last ? unpack<ReplayFrame>(last.data) : undefined;
        capture ??= prior && { catalogId: prior.catalogId, engineVersion: prior.engineVersion, presentation: prior.presentation };
        if (!capture) throw new Error('Missing accepting engine snapshot');
        await this.catalog(client, capture.catalogId);
        const data = pack({ sequence, at: Date.now(), state, ...capture, command: event === 'command' || event === 'normal' ? room.last?.command ?? null : null, event });
        const hash = sha(Buffer.concat([Buffer.from(previousHash + '\n'), data]));
        await client.query('INSERT INTO frames VALUES($1,$2,$3,$4,$5)', [room.record!.id, sequence, data, hash, previousHash]);
        const ended = room.status === 'finished' || event === 'abandoned';
        const meta = this.checkedMeta(row);
        Object.assign(meta, {
            frames: sequence + 1, firstPlayer: state.rules.firstPlayer, turns: matchTurns(state), points: state.players.map(p => p.points),
            // Never claim completeness if any command was accepted by a pre-recording pod.
            complete: meta.complete && completeAllowed && event !== 'abandoned' && (!prior || state.revision === prior.state.revision + 1),
            ...(ended && { endedAt: Date.now(), reason: event, winner: event === 'abandoned' ? null : state.winner === 'draw' ? (1 - state.rules.firstPlayer) as Side : state.winner }),
        });
        await client.query('UPDATE matches SET count=$1,hash=$2,meta=$3,ended=$4,meta_hash=$5 WHERE id=$6', [sequence + 1, hash, JSON.stringify(meta), ended ? meta.endedAt : null, sha(row.catalog + '\n' + JSON.stringify(meta) + '\n' + hash), meta.id]);
    }
    private async archive(client: PoolClient, room: Room, previous: Room | null, capture: SnapshotCapture | null, completeAllowed: boolean) {
        if (previous?.record && previous.state && (room.record?.id !== previous.record.id || !room.state)) {
            await this.append(client, previous, previous.state, 'abandoned');
        }
        if (!room.record || !room.state) return;
        if (previous?.record?.id === room.record.id && JSON.stringify(previous.state) === JSON.stringify(room.state)) return;
        if (!capture) throw new Error('Missing snapshot capture');
        const catalog = await this.catalog(client, capture.catalogId);
        const existing = (await client.query('SELECT id FROM matches WHERE id=$1', [room.record.id])).rows[0];
        if (!existing) {
            const meta: MatchSummary = {
                id: room.record.id, mode: room.mode ?? 'room', startedAt: room.record.startedAt, endedAt: 0,
                players: room.seats.map(s => ({ name: s!.name, ...(s!.profileId && { profileId: s!.profileId }), deck: structuredClone(s!.deck!), playableName: catalog[s!.deck!.playable]?.name ?? s!.deck!.playable })) as MatchSummary['players'],
                rules: room.rules, winner: null, reason: 'normal', turns: 0, points: [0, 0], firstPlayer: room.state.rules.firstPlayer,
                frames: 0, complete: completeAllowed && room.state.revision === 0 && room.seats.every(seat => !!seat?.historyOwners?.length), engineVersion: capture.engineVersion,
            };
            await client.query("INSERT INTO matches VALUES($1,$2,NULL,$3,$4,0,'',$5)", [meta.id, meta.startedAt, JSON.stringify(meta), capture.catalogId, sha(capture.catalogId + '\n' + JSON.stringify(meta) + '\n')]);
            for (const seat of [0, 1] as const) for (let owner of room.seats[seat]?.historyOwners ?? []) {
                const claim = (await client.query('SELECT account FROM claims WHERE device=$1 AND before_ms >= $2 ORDER BY before_ms LIMIT 1', [owner, meta.startedAt])).rows[0];
                if (claim) owner = claim.account;
                await client.query('INSERT INTO members(match,owner,seat) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [meta.id, owner, seat]);
            }
        }
        await this.append(client, room, room.state, room.status === 'finished' ? room.record.reason ?? 'normal' : existing ? 'command' : 'start', capture, completeAllowed);
    }
    async ingest(write: HistoryWrite) {
        if (!/^\d+-\d+$/.test(write.id)) throw new Error('Invalid history event');
        const [ms, seq] = write.id.split('-');
        await this.transaction(async client => {
            const old = (await client.query('SELECT * FROM rooms WHERE id=$1', [write.room.id])).rows[0];
            if (old && (BigInt(old.event_ms) > BigInt(ms) || BigInt(old.event_ms) === BigInt(ms) && BigInt(old.event_seq) >= BigInt(seq))) return;
            const previous = old ? JSON.parse(old.json) as Room : write.previous;
            await this.archive(client, write.room, previous, write.capture, write.completeAllowed);
            await client.query('INSERT INTO rooms VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET version=excluded.version,expires=excluded.expires,json=excluded.json,event_ms=excluded.event_ms,event_seq=excluded.event_seq', [write.room.id, write.room.version, write.expires, JSON.stringify(write.room), ms, seq]);
        });
    }
    private async expire() {
        await this.transaction(async client => {
            const rows = (await client.query("SELECT json FROM rooms WHERE expires<=$1 AND (json::jsonb)->>'status' NOT IN ('closed','finished')", [Date.now()])).rows;
            for (const row of rows) {
                const room = JSON.parse(row.json) as Room;
                await this.archive(client, { ...room, status: 'closed', state: null }, room, null, false);
                await client.query('UPDATE rooms SET json=$1 WHERE id=$2', [JSON.stringify({ ...room, status: 'closed', state: null }), room.id]);
            }
        });
    }
    async get(id: string) {
        const row = (await this.pool.query('SELECT json FROM rooms WHERE id=$1 AND expires>$2', [id, Date.now()])).rows[0];
        return row ? JSON.parse(row.json) as Room : null;
    }
    async assetIds() { return (await this.pool.query('SELECT id FROM assets')).rows.map(row => row.id as string); }
    async putAsset(id: string, data: string, mime: string) {
        const bytes = Buffer.from(data, 'base64');
        if (bytes.length > 2 * 1024 * 1024 || sha(bytes) !== id || !['image/webp', 'image/png', 'image/jpeg'].includes(mime)) throw new Error('Invalid archived image');
        await this.transaction(async client => { await client.query('INSERT INTO assets VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [id, bytes, mime]); });
    }
    async asset(id: string) {
        const row = (await this.pool.query('SELECT * FROM assets WHERE id=$1', [id])).rows[0];
        if (!row) return null;
        if (sha(row.data) !== id) throw new Error('Archived image integrity check failed');
        return { data: (row.data as Buffer).toString('base64'), mime: String(row.mime) };
    }
    async registerCatalog(catalog: Catalog) {
        const data = pack(catalog), id = sha(data);
        await this.transaction(async client => { await client.query('INSERT INTO catalogs VALUES($1,$2) ON CONFLICT DO NOTHING', [id, data]); });
        return id;
    }
    private async access(owners: string[], id: string) {
        return (await this.pool.query('SELECT MIN(seat) AS seat, MAX(favorite) AS favorite FROM members WHERE match=$1 AND owner=ANY($2::text[]) HAVING COUNT(*)>0', [id, owners])).rows[0];
    }
    async linkGuest(owners: string[]) {
        const device = owners.find(owner => owner.startsWith('device:')), account = owners.find(owner => owner.startsWith('user:'));
        if (!device || !account) return;
        await this.transaction(async client => {
            await client.query('INSERT INTO claims VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [device, account, Date.now()]);
            await client.query(`INSERT INTO members(match,owner,seat,favorite) SELECT p.match,$2,p.seat,p.favorite FROM members p WHERE p.owner=$1 AND NOT EXISTS(SELECT 1 FROM members q WHERE q.match=p.match AND q.seat=p.seat AND q.owner LIKE 'user:%') ON CONFLICT DO NOTHING`, [device, account]);
            await client.query('DELETE FROM members p USING members q WHERE p.owner=$1 AND q.owner=$2 AND p.match=q.match AND p.seat=q.seat', [device, account]);
        });
    }
    async list(owners: string[], cursor?: string, favorites = false): Promise<HistoryPage> {
        await this.expire();
        if (!owners.length) return { entries: [], cursor: null };
        let before: [number, string] = [Number.MAX_SAFE_INTEGER, '\uffff'];
        if (cursor) {
            const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
            if (!Array.isArray(parsed) || parsed.length !== 2 || !Number.isSafeInteger(parsed[0]) || typeof parsed[1] !== 'string') throw new Error('Invalid history cursor');
            before = parsed as [number, string];
        }
        const rows = (await this.pool.query(`SELECT m.id,m.meta,m.catalog,m.hash,m.meta_hash, MIN(p.seat) AS seat, MAX(p.favorite) AS favorite FROM matches m JOIN members p ON p.match=m.id WHERE p.owner=ANY($1::text[]) AND m.ended IS NOT NULL AND (m.ended,m.id)<($2,$3) GROUP BY m.id ${favorites ? 'HAVING MAX(p.favorite)=1' : ''} ORDER BY m.ended DESC,m.id DESC LIMIT 31`, [owners, ...before])).rows;
        const entries = rows.slice(0, 30).map(row => ({ ...this.checkedMeta(row), seat: Number(row.seat) as Side, favorite: !!row.favorite }));
        const last = entries.at(-1);
        return { entries, cursor: rows.length > 30 && last ? Buffer.from(JSON.stringify([last.endedAt, last.id])).toString('base64url') : null };
    }
    async detail(owners: string[], id: string): Promise<MatchDetails | null> {
        const access = await this.access(owners, id), row = (await this.pool.query('SELECT * FROM matches WHERE id=$1 AND ended IS NOT NULL', [id])).rows[0];
        if (!row) return null;
        const meta = this.checkedMeta(row);
        if (!access && !(meta.mode === 'free' && meta.rules.spectators)) return null;
        return { format: 1, match: { ...meta, seat: Number(access?.seat ?? 0) as Side, favorite: !!access?.favorite, ...(!access && { watching: true as const }) }, catalog: await this.catalog(this.pool, row.catalog) };
    }
    async recording(owners: string[], id: string): Promise<MatchRecording | null> {
        const detail = await this.detail(owners, id);
        if (!detail) return null;
        const row = (await this.pool.query('SELECT * FROM matches WHERE id=$1', [id])).rows[0];
        const rows = (await this.pool.query('SELECT * FROM frames WHERE match=$1 ORDER BY seq', [id])).rows;
        let previous = '';
        const frames = rows.map((frame, index): ReplayFrame => {
            const hash = sha(Buffer.concat([Buffer.from(previous + '\n'), frame.data]));
            if (Number(frame.seq) !== index || frame.previous !== previous || frame.hash !== hash) throw new Error('Recording integrity check failed');
            previous = hash;
            return { ...unpack<Omit<ReplayFrame, 'hash' | 'previousHash'>>(frame.data), hash, previousHash: frame.previous };
        });
        if (!frames.length || frames.length !== Number(row.count) || previous !== row.hash) throw new Error('Incomplete recording');
        const catalogs: Record<string, Catalog> = {};
        for (const id of new Set(frames.map(frame => frame.catalogId))) catalogs[id] = await this.catalog(this.pool, id);
        return { ...detail, frames, catalogs };
    }
    async favorite(owners: string[], id: string, value: boolean) {
        return this.transaction(async client => {
            const rows = await client.query('UPDATE members SET favorite=$1 WHERE match=$2 AND seat IN (SELECT seat FROM members WHERE match=$2 AND owner=ANY($3::text[]))', [Number(value), id, owners]);
            return !!rows.rowCount;
        });
    }
    async ping() {
        try {
            if (this.sync === 'remote_apply') return !!(await this.pool.query("SELECT 1 FROM pg_stat_replication WHERE application_name='history_standby' AND state='streaming' AND sync_state='sync'")).rowCount;
            await this.pool.query('SELECT 1'); return true;
        } catch { return false; }
    }
    async close() { await (this.closing ??= this.pool.end()); }
}
