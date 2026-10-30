// 画面名・アイコン・旧URL・親画面の対応をここに集約する。ゲーム内の画面切り替えではルームのURLを変えない。
import { BATTLE_PATH, CARDS_PATH, CARD_GALLERY_PATH, CPU_PATH, EDITOR_PATH, NOTIFICATIONS_PATH, PUZZLES_PATH, SETTINGS_PATH } from '@/lib/game/sessionStore';
import type { GameIconName } from '@/components/shared/ui/GameIcon';

/** The launchpad's own tabs, then the game's screens. */
export type Section = 'home' | 'notifications' | 'instance' | 'volume' | 'settings'
  | 'discover' | 'cpu' | 'history' | 'puzzles' | 'missions' | 'cards' | 'zukan' | 'editor' | 'social' | 'profile' | 'performance';
/** A section and its selected profile or puzzle fruit, without changing the room address. */
export interface Place { section: Section; id?: string; fruit?: string }

export const sectionInfo: Record<Section, { label: string; icon: GameIconName }> = {
  home: { label: 'ランチパッド', icon: 'rocket' },
  discover: { label: 'いまのぷぷりえーる', icon: 'star' },
  notifications: { label: '通知', icon: 'bell' },
  instance: { label: 'いまのルーム', icon: 'pin' },
  volume: { label: '音量', icon: 'volume' },
  settings: { label: '設定', icon: 'gear' },
  cpu: { label: 'CPU対決', icon: 'cpu' },
  history: { label: '対戦履歴', icon: 'history' },
  puzzles: { label: 'リーサルパズル', icon: 'puzzle' },
  missions: { label: '初心者ミッション', icon: 'beginner' },
  cards: { label: 'カード', icon: 'cards' },
  zukan: { label: 'カード図鑑', icon: 'cards' },
  editor: { label: '盤面エディタ', icon: 'pen' },
  social: { label: 'ソーシャル', icon: 'social' },
  profile: { label: 'プロフィール', icon: 'star' },
  performance: { label: '通信計測', icon: 'history' },
};

const paths: [string, Section][] = [
  [CPU_PATH, 'cpu'], [`${BATTLE_PATH}history/`, 'history'], [BATTLE_PATH, 'discover'],
  [PUZZLES_PATH, 'puzzles'], [CARD_GALLERY_PATH, 'zukan'], [CARDS_PATH, 'cards'], [EDITOR_PATH, 'editor'],
  ['/game/social/', 'social'], ['/game/profile/', 'profile'], [NOTIFICATIONS_PATH, 'notifications'], [SETTINGS_PATH, 'settings'],
  ['/game/performance/', 'performance'],
  ['/game/missions/', 'missions'],
];

/** The section an address of the game opens, or null for a board, a room or anything else. */
export function placeOf(url: URL): Place | null {
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const section = paths.find(([prefix]) => path === prefix)?.[1];
  if (!section) return null;
  // A shared position for the editor opens straight on the board: that stays a page.
  if (section === 'editor' && url.search) return null;
  const id = section === 'profile' ? url.searchParams.get('id') ?? undefined : undefined;
  const fruit = section === 'puzzles' ? url.searchParams.get('fruit') ?? undefined : undefined;
  return { section, ...(id && { id }), ...(fruit && { fruit }) };
}

export const samePlace = (a: Place, b: Place) => a.section === b.section && a.id === b.id && a.fruit === b.fruit;

/** Compact controls and expanded destinations share the same metadata above. */
export const padTabs: Section[] = ['home', 'notifications', 'instance', 'volume', 'settings'];
export const screens: Section[] = ['discover', 'social', 'cards', 'puzzles', 'history', 'editor'];
/** Screens opened from another keep their parent selected in the rail. */
export const parentSection: Partial<Record<Section, Section>> = { missions: 'puzzles', zukan: 'cards', profile: 'social', performance: 'settings' };
