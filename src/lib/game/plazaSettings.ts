// What the rooms this player makes are like: who may come in (fixed once a room is made) and the
// rules its first match uses. Kept on this device; nothing chosen means an invited room, so a room
// is never public by mistake.
import { DEFAULT_VISIBILITY, defaultRoomRules, isRoomVisibility, parseRoomRules } from '@pplale/game-core/room';
import type { RoomRules, RoomVisibility } from '@pplale/game-core/room';

const KEY = 'pplale-room-settings-v1';
export interface RoomSettings { visibility: RoomVisibility; rules: RoomRules }

export function readRoomSettings(): RoomSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RoomSettings> | null;
    return {
      visibility: isRoomVisibility(saved?.visibility) ? saved.visibility : DEFAULT_VISIBILITY,
      rules: parseRoomRules(saved?.rules) ?? defaultRoomRules,
    };
  } catch { return { visibility: DEFAULT_VISIBILITY, rules: defaultRoomRules }; }
}
export function saveRoomSettings(change: Partial<RoomSettings>) {
  const next = { ...readRoomSettings(), ...change };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Used for this visit only. */ }
  window.dispatchEvent(new Event(KEY));
  return next;
}
/** Calls `listener` when the settings change here or in another tab. */
export function onRoomSettings(listener: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === KEY) listener(); };
  window.addEventListener(KEY, listener);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(KEY, listener); window.removeEventListener('storage', storage); };
}

const GUEST_NAME_KEY = 'pplale-guest-name-v2';
/** The name a guest goes by (signed-in players go by their profile, which the server reads). */
export function guestName() {
  try { return localStorage.getItem(GUEST_NAME_KEY)?.trim() || 'ゲスト'; } catch { return 'ゲスト'; }
}
