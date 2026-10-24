import type { GameState } from '@pplale/game-core';
import type { RoomInfo, RoomView } from '@pplale/game-core/room';
import type { HistoryEntry, MatchRecording } from '@pplale/game-core/history';

const FALLBACK = 'プレイヤー';
const UID = /^[\w-]{1,128}$/;
const clean = (value: unknown) => typeof value === 'string' ? Array.from(value.replace(/\p{C}/gu, '').trim()).slice(0, 12).join('') || FALLBACK : FALLBACK;
type Player = { name: string; profileId?: string };
function addAlias(aliases: Map<string, string>, old: string, current: string) {
    const existing = aliases.get(old);
    // Old text logs cannot identify which of two players with the same name wrote the line.
    aliases.set(old, existing !== undefined && existing !== current ? FALLBACK : current);
}

/** Read only the public profile field. No service account or Google account data is used. */
export async function readPublicName(uid: string): Promise<string> {
    const project = process.env.FIREBASE_PROJECT_ID ?? 'pplale-6cca0';
    const origin = process.env.FIRESTORE_EMULATOR_HOST ? `http://${process.env.FIRESTORE_EMULATOR_HOST}` : 'https://firestore.googleapis.com';
    const response = await fetch(`${origin}/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/profiles/${encodeURIComponent(uid)}?mask.fieldPaths=displayName`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return FALLBACK;
    const data = await response.json() as { fields?: { displayName?: { stringValue?: unknown } } };
    return clean(data.fields?.displayName?.stringValue);
}

/** Bounded cache and shared in-flight reads. Commands/animations never wait on Firestore. */
export function profileNames(read = readPublicName, now = Date.now) {
    const cache = new Map<string, { name: string; until: number }>();
    const pending = new Map<string, Promise<void>>();
    async function load(uid: string, refresh = false) {
        if (!UID.test(uid) || !refresh && (cache.get(uid)?.until ?? 0) > now()) return;
        let task = pending.get(uid);
        if (!task) {
            // A public list cannot open an unbounded number of outbound requests.
            if (pending.size >= 8) return;
            task = read(uid).then(clean, () => FALLBACK).then(name => {
                if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
                cache.set(uid, { name, until: now() + 60_000 });
            }).finally(() => pending.delete(uid));
            pending.set(uid, task);
        }
        await task;
    }
    function name(player: Player): string {
        if (!player.profileId) return player.name;
        void load(player.profileId);
        const value = cache.get(player.profileId);
        return value && value.until > now() ? value.name : FALLBACK;
    }
    const players = <T extends Player | null>(list: T[]) => list.map(player => player ? { ...player, name: name(player) } : player) as T[];
    function state(game: GameState, identities: (Player | null)[], aliases: Map<string, string> = new Map()) {
        const replacements = new Map(aliases);
        identities.forEach((player, side) => {
            if (!player?.profileId) return;
            addAlias(replacements, player.name, name(player));
            addAlias(replacements, game.players[side].name, name(player));
        });
        // Player names occur at the start of these log formats; card names stay untouched.
        const old = [...replacements.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
        return { ...game, players: game.players.map((player, side) => identities[side]?.profileId ? { ...player, name: name(identities[side]!) } : player) as GameState['players'],
            log: game.log.map(line => {
                const alias = old.find(value => line.startsWith(value) && /^(?:：|のダイス：|の\d+ターン目|が(?:先攻|後攻|投了しました))/.test(line.slice(value.length)));
                return alias ? replacements.get(alias)! + line.slice(alias.length) : line;
            }) };
    }
    function view(value: RoomView): RoomView {
        return { ...value, players: players(value.players) as RoomView['players'], ...(value.game && { game: state(value.game, value.players) }),
            ...(value.plaza && { plaza: { ...value.plaza, creator: { ...value.plaza.creator, name: name(value.plaza.creator) }, members: players(value.plaza.members) } }) };
    }
    const entry = (value: HistoryEntry): HistoryEntry => ({ ...value, players: players(value.players) as HistoryEntry['players'] });
    async function warm(list: (Player | null)[]) {
        const ids = [...new Set(list.flatMap(player => player?.profileId ? [player.profileId] : []))];
        await Promise.all(ids.map(uid => load(uid)));
    }
    /** Project only public identity fields, never arbitrary strings such as card/deck names. */
    async function response(value: unknown): Promise<unknown> {
        if (!value || typeof value !== 'object') return value;
        const body = value as Record<string, unknown>;
        if (body.view) { await warm([...(body.view as RoomView).players, ...(body.view as RoomView).plaza?.members ?? []]); return { ...body, view: view(body.view as RoomView) }; }
        if (Array.isArray(body.rooms)) {
            const rooms = body.rooms as RoomInfo[], hosts = rooms.map(room => ({ name: room.host, profileId: room.hostProfileId }));
            await warm(hosts);
            return { ...body, rooms: rooms.map(room => ({ ...room, host: name({ name: room.host, profileId: room.hostProfileId }), ...(room.plaza && { plaza: { ...room.plaza, creator: { ...room.plaza.creator, name: name(room.plaza.creator) } } }) })) };
        }
        if (typeof body.host === 'string') {
            const host = { name: body.host, profileId: body.hostProfileId as string | undefined }, plaza = body.plaza as RoomInfo['plaza'];
            await warm([host]); return { ...body, host: name(host), ...(plaza && { plaza: { ...plaza, creator: { ...plaza.creator, name: name(plaza.creator) } } }) };
        }
        if (Array.isArray(body.entries)) {
            await warm(body.entries.flatMap((match: HistoryEntry) => match.players));
            return { ...body, entries: (body.entries as HistoryEntry[]).map(entry) };
        }
        if (body.match) {
            const recording = body as unknown as MatchRecording;
            await warm(recording.match.players);
            if (!recording.frames) return { ...body, match: entry(recording.match) };
            const aliases = new Map<string, string>();
            for (const frame of recording.frames) frame.state.players.forEach((player, side) => {
                if (recording.match.players[side].profileId) addAlias(aliases, player.name, name(recording.match.players[side]));
            });
            return { ...body, match: entry(recording.match), publicNamesResolved: true,
                frames: recording.frames.map(frame => ({ ...frame, state: state(frame.state, recording.match.players, aliases) })) };
        }
        if (Array.isArray(body.waiting) && Array.isArray(body.matches)) {
            const waiting = body.waiting as Player[], matches = body.matches as { players: Player[] }[];
            await warm([...waiting, ...matches.flatMap(match => match.players)]);
            return { ...body, waiting: players(waiting), matches: matches.map(match => ({ ...match, players: players(match.players) })) };
        }
        return value;
    }
    return { load, name, view, response };
}
