// The rooms, in memory and as one file each under `rooms/` (a volume in the cluster), so a
// restart of the server does not end the matches in progress.
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isRoomId } from '@pplale/game-core/room';
import type { Room } from './rooms.ts';

export interface Store {
    readonly directory: string;
    get(id: string): Room | undefined;
    all(): Room[];
    /** Keeps the room as it is now (new or changed). */
    save(room: Room): void;
    remove(id: string): void;
}

export function openStore(directory: string): Store {
    const folder = path.join(directory, 'rooms');
    mkdirSync(folder, { recursive: true });
    const file = (id: string) => path.join(folder, `${id}.json`);
    const rooms = new Map<string, Room>();
    for (const name of readdirSync(folder)) {
        const id = name.replace(/\.json$/, '');
        if (!isRoomId(id) || !name.endsWith('.json')) continue;
        // A file cut off by a crash is not worth stopping the server for.
        try { rooms.set(id, JSON.parse(readFileSync(file(id), 'utf8')) as Room); } catch { rmSync(file(id), { force: true }); }
    }
    return {
        directory,
        get: id => rooms.get(id),
        all: () => Array.from(rooms.values()),
        save(room) {
            rooms.set(room.id, room);
            // Written beside and renamed, so a reader never finds half a file.
            const temporary = `${file(room.id)}.tmp`;
            writeFileSync(temporary, JSON.stringify(room));
            renameSync(temporary, file(room.id));
        },
        remove(id) {
            rooms.delete(id);
            rmSync(file(id), { force: true });
        },
    };
}
