// Where rooms are kept. Firestore in production: the room itself is readable by the server only,
// and each seat's view is published in its own document, whose unguessable id that seat alone
// knows and listens to. `ROOM_STORE=memory` keeps rooms in this process instead (development and
// tests: nothing leaves the machine, and the browser asks the API for its view).
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Side } from '@pplale/game-core';
import { RoomError, seatView } from './model';
import type { Room } from './model';

/** Rooms and their views are deleted this long after their last change (Firestore TTL on `expiresAt`). */
const ROOM_LIFETIME = 12 * 60 * 60 * 1000;
const GONE = 'ルームが見つかりません';

export interface RoomStore {
  /** Whether views are published for the browser to listen to. */
  readonly publishes: boolean;
  /** False when the id is already taken. */
  create(room: Room): Promise<boolean>;
  read(id: string): Promise<Room>;
  /** Changes the room in a transaction: `change` edits it (or throws RoomError) and its result is returned. */
  update<T>(id: string, change: (room: Room) => T): Promise<T>;
}

function firestoreStore(): RoomStore {
  const app = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  const db = getFirestore(app), rooms = db.collection('rooms'), views = db.collection('roomViews');
  // Stored as JSON: a match has arrays inside arrays, which Firestore documents cannot hold.
  const documents = (room: Room) => {
    const expiresAt = new Date(Date.now() + ROOM_LIFETIME);
    return [
      { ref: rooms.doc(room.id), data: { json: JSON.stringify(room), expiresAt } },
      ...room.seats.flatMap((seat, index) => seat ? [{ ref: views.doc(seat.viewKey), data: { json: JSON.stringify(seatView(room, index as Side)), expiresAt } }] : []),
    ];
  };
  return {
    publishes: true,
    async create(room) {
      try {
        const [own, ...rest] = documents(room), batch = db.batch();
        batch.create(own.ref, own.data);
        for (const { ref, data } of rest) batch.set(ref, data);
        await batch.commit();
        return true;
      } catch (error) {
        // 6 = ALREADY_EXISTS
        if ((error as { code?: unknown }).code === 6) return false;
        throw error;
      }
    },
    async read(id) {
      const snapshot = await rooms.doc(id).get();
      if (!snapshot.exists) throw new RoomError(404, GONE);
      return JSON.parse(snapshot.get('json')) as Room;
    },
    update(id, change) {
      return db.runTransaction(async transaction => {
        const snapshot = await transaction.get(rooms.doc(id));
        if (!snapshot.exists) throw new RoomError(404, GONE);
        const room = JSON.parse(snapshot.get('json')) as Room, result = change(room);
        room.version++;
        for (const { ref, data } of documents(room)) transaction.set(ref, data);
        return result;
      });
    },
  };
}

function memoryStore(): RoomStore {
  const rooms = new Map<string, string>();
  const read = (id: string) => {
    const json = rooms.get(id);
    if (!json) throw new RoomError(404, GONE);
    return JSON.parse(json) as Room;
  };
  return {
    publishes: false,
    async create(room) {
      if (rooms.has(room.id)) return false;
      rooms.set(room.id, JSON.stringify(room));
      return true;
    },
    async read(id) { return read(id); },
    async update(id, change) {
      const room = read(id), result = change(room);
      room.version++;
      rooms.set(id, JSON.stringify(room));
      return result;
    },
  };
}

// One store per process, also across the dev server's module reloads.
const shared = globalThis as { pplaleRoomStore?: RoomStore };
export const roomStore = (): RoomStore => shared.pplaleRoomStore ??= process.env.ROOM_STORE === 'memory' ? memoryStore() : firestoreStore();
