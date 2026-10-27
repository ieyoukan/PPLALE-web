import type { RoomInfo } from '@pplale/game-core/room';
import { WATCHING_STALE } from '@/lib/game/social';
import type { SocialPlayer } from '@/lib/game/social';

/** What a room is doing: recruiting, a match that may be watched, or getting ready. */
type Place = 'open' | 'playing' | 'lobby';
export const placeOrder: Place[] = ['open', 'playing', 'lobby'];
export const placeLabel: Record<Place, string> = { open: '募集中', playing: '対戦中', lobby: '準備中' };
export const placeOf = (room: RoomInfo): Place => room.plaza
  // A room to gather in: a free seat at its table, a match on, or both seats taken.
  ? room.status === 'playing' ? 'playing' : room.plaza.seated < 2 ? 'open' : 'lobby'
  : room.open ? 'open' : room.spectators && room.status === 'playing' ? 'playing' : 'lobby';

/**
 * The room a friend is in, by what the rooms say now: a room to gather in that they keep saying they
 * are in, one they host while connected as its host, or one they keep saying they watch while its match
 * can still be watched. `null`: none.
 */
export function locate({ profile, roomId, watching }: Pick<SocialPlayer, 'profile' | 'roomId' | 'watching'>, rooms: Record<string, RoomInfo>, now: number): { room: RoomInfo; role: 'host' | 'watching' } | null {
  const hosted = roomId ? rooms[roomId] : undefined, watched = watching ? rooms[watching.roomId] : undefined;
  // In a room friends may find (the server only describes one this player may enter): they are there.
  if (watched?.plaza && now - watching!.at < WATCHING_STALE) return { room: watched, role: 'host' };
  if (hosted && hosted.hostProfileId === profile.uid && hosted.hostOnline) return { room: hosted, role: 'host' };
  if (watched && watched.spectators && watched.status === 'playing' && now - watching!.at < WATCHING_STALE) return { room: watched, role: 'watching' };
  return null;
}
