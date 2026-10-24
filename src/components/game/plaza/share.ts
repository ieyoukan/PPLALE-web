import { describeMatchRules } from '@pplale/game-core/room';
import type { RoomView } from '@pplale/game-core/room';
import { visibilityInfo } from './visibility';

/**
 * The room's link. In an invited room the invitation secret goes with it (only those who may share
 * it have one); a friends' room's link still needs the friendship, and a public room's anyone may use.
 */
export function plazaLink(origin: string, view: RoomView) {
  const invite = view.plaza?.invite;
  return `${origin}/game/room/${view.id}/${invite ? `?${new URLSearchParams({ invite })}` : ''}`;
}

/** The words of an invitation: Discord shows the link's card (the room's picture) below them. */
export function invitation(view: RoomView, url: string) {
  const plaza = view.plaza!, rules = describeMatchRules(plaza.nextRules ?? view.rules);
  return {
    discord: `**ぷぷりえーる**であそぼう！\n「${plaza.name}」（${visibilityInfo[plaza.visibility].label}）\n${rules}\n${url}`,
    plain: `ぷぷりえーるであそぼう！「${plaza.name}」\n${rules}\n${url}`,
    post: `https://x.com/intent/post?${new URLSearchParams({ text: `ぷぷりえーるであそぼう！「${plaza.name}」\n${rules}\n#ぷぷりえーる`, url })}`,
  };
}
