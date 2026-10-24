import type { RoomVisibility } from '@pplale/game-core/room';
import type { PlazaIconName } from './PlazaIcon';

/** Who may come in, in the words players know from VRChat, with one icon each. */
export const visibilityInfo: Record<RoomVisibility, { label: string; note: string; icon: PlazaIconName; plus?: true }> = {
  public: { label: 'パブリック', note: 'だれでも入れる', icon: 'globe' },
  friends: { label: 'フレンド', note: '作った人のフレンド', icon: 'heart' },
  friendsPlus: { label: 'フレンド＋', note: 'いる人のフレンドも', icon: 'heart', plus: true },
  invite: { label: 'インバイト', note: '招待した人だけ', icon: 'letter' },
  invitePlus: { label: 'インバイト＋', note: 'いる人が招待できる', icon: 'letter', plus: true },
};
