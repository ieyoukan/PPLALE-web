// The initial match rules for a new room, and the visibility of the home room: the one opening the
// game makes when this browser has no room (chosen in 設定; invited unless changed). A room made from
// the menu has its visibility chosen there.
import { DEFAULT_VISIBILITY, defaultRoomRules, isRoomVisibility, parseRoomRules } from '@pplale/game-core/room';
import type { RoomRules, RoomVisibility } from '@pplale/game-core/room';

const KEY = 'pplale-room-settings-v1';
export interface RoomSettings { rules: RoomRules; homeVisibility: RoomVisibility }

export function readRoomSettings(): RoomSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RoomSettings> | null;
    return { rules: parseRoomRules(saved?.rules) ?? defaultRoomRules, homeVisibility: isRoomVisibility(saved?.homeVisibility) ? saved.homeVisibility : DEFAULT_VISIBILITY };
  } catch { return { rules: defaultRoomRules, homeVisibility: DEFAULT_VISIBILITY }; }
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
