// Every screen of the game outside the board opens inside the launchpad, over the room, without the
// address changing. The old addresses (`/game/cards/`, `/game/profile/?id=` …) still work: a link to
// one opens its section in the launchpad, and opening one from outside goes to the room first.
import { BATTLE_PATH, CARDS_PATH, CARD_GALLERY_PATH, CPU_PATH, EDITOR_PATH, NOTIFICATIONS_PATH, PUZZLES_PATH, SETTINGS_PATH } from '@/lib/game/sessionStore';
import type { PlazaIconName } from './PlazaIcon';

/** The launchpad's own tabs, then the game's screens. */
export type Section = 'home' | 'notifications' | 'instance' | 'volume' | 'settings'
  | 'cpu' | 'battle' | 'free' | 'history' | 'puzzles' | 'cards' | 'zukan' | 'editor' | 'social' | 'profile' | 'performance';
/** A section, and for a profile whose it is (none: the player's own). */
export interface Place { section: Section; id?: string }

export const sectionInfo: Record<Section, { label: string; icon: PlazaIconName }> = {
  home: { label: 'ランチパッド', icon: 'rocket' },
  notifications: { label: '通知', icon: 'bell' },
  instance: { label: 'いまのインスタンス', icon: 'pin' },
  volume: { label: '音量', icon: 'volume' },
  settings: { label: '設定', icon: 'gear' },
  cpu: { label: 'CPU対決', icon: 'cpu' },
  battle: { label: 'バトル', icon: 'sword' },
  free: { label: 'フリーマッチ', icon: 'sword' },
  history: { label: '対戦履歴', icon: 'history' },
  puzzles: { label: 'リーサルパズル', icon: 'puzzle' },
  cards: { label: 'カード', icon: 'cards' },
  zukan: { label: 'カード図鑑', icon: 'cards' },
  editor: { label: '盤面エディタ', icon: 'pen' },
  social: { label: 'ソーシャル', icon: 'heart' },
  profile: { label: 'プロフィール', icon: 'star' },
  performance: { label: '通信計測', icon: 'history' },
};

const paths: [string, Section][] = [
  [CPU_PATH, 'cpu'], [`${BATTLE_PATH}free/`, 'free'], [`${BATTLE_PATH}history/`, 'history'], [BATTLE_PATH, 'battle'],
  [PUZZLES_PATH, 'puzzles'], [CARD_GALLERY_PATH, 'zukan'], [CARDS_PATH, 'cards'], [EDITOR_PATH, 'editor'],
  ['/game/social/', 'social'], ['/game/profile/', 'profile'], [NOTIFICATIONS_PATH, 'notifications'], [SETTINGS_PATH, 'settings'],
  ['/game/performance/', 'performance'],
];

/** The section an address of the game opens, or null for a board, a room or anything else. */
export function placeOf(url: URL): Place | null {
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const section = paths.find(([prefix]) => path === prefix)?.[1];
  if (!section) return null;
  // A shared position for the editor opens straight on the board: that stays a page.
  if (section === 'editor' && url.search) return null;
  const id = section === 'profile' ? url.searchParams.get('id') ?? undefined : undefined;
  return id ? { section, id } : { section };
}

export const samePlace = (a: Place, b: Place) => a.section === b.section && a.id === b.id;
