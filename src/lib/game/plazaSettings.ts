// The initial match rules for a new room. Its visibility is chosen when the player explicitly
// creates it; opening the game without a room starts in an invited one.
import { defaultRoomRules, parseRoomRules } from '@pplale/game-core/room';
import type { RoomRules } from '@pplale/game-core/room';

const KEY = 'pplale-room-settings-v1';
export interface RoomSettings { rules: RoomRules }

export function readRoomSettings(): RoomSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RoomSettings> | null;
    return { rules: parseRoomRules(saved?.rules) ?? defaultRoomRules };
  } catch { return { rules: defaultRoomRules }; }
}
export function saveRoomSettings(change: Partial<RoomSettings>) {
  const next = { ...readRoomSettings(), ...change };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Used for this visit only. */ }
  return next;
}

const GUEST_NAME_KEY = 'pplale-guest-name-v2';
/** The name a guest goes by (signed-in players go by their profile, which the server reads). */
export function guestName() {
  try { return localStorage.getItem(GUEST_NAME_KEY)?.trim() || 'ゲスト'; } catch { return 'ゲスト'; }
}
