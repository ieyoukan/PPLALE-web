import type { RoomInfo } from '@pplale/game-core/room';
import { WATCHING_STALE } from '@/lib/game/social';
import type { SocialPlayer } from '@/lib/game/social';

/** What a room is doing: recruiting, a match that may be watched, or getting ready. */
export type Place = 'open' | 'playing' | 'lobby';
export const placeOrder: Place[] = ['open', 'playing', 'lobby'];
export const placeLabel: Record<Place, string> = { open: '募集中', playing: '対戦中', lobby: '準備中' };
export const placeOf = (room: RoomInfo): Place => room.open ? 'open' : room.spectators && room.status === 'playing' ? 'playing' : 'lobby';

/**
 * The room a friend is in, by what the rooms say now: one they host while connected as its host, or one
 * they keep saying they watch while its match can still be watched. `null`: none.
 */
export function locate({ profile, roomId, watching }: Pick<SocialPlayer, 'profile' | 'roomId' | 'watching'>, rooms: Record<string, RoomInfo>, now: number): { room: RoomInfo; role: 'host' | 'watching' } | null {
  const hosted = roomId ? rooms[roomId] : undefined, watched = watching ? rooms[watching.roomId] : undefined;
  if (hosted && hosted.hostProfileId === profile.uid && hosted.hostOnline) return { room: hosted, role: 'host' };
  if (watched && watched.spectators && watched.status === 'playing' && now - watching!.at < WATCHING_STALE) return { room: watched, role: 'watching' };
  return null;
}
