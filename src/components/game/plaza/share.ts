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

type Translate = (text: string, vars?: Record<string, string | number>) => string;
const same: Translate = text => text;

/**
 * The words of an invitation: Discord shows the link's card (the room's picture) below them.
 * `t`, `gameText`: the current language's (useI18n); the rules' description is the engine's text.
 */
export function invitation(view: RoomView, url: string, t: Translate = same, gameText: (text: string) => string = same) {
  const plaza = view.plaza!, rules = gameText(describeMatchRules(plaza.nextRules ?? view.rules));
  const greeting = t('ぷぷりえーるであそぼう！「{name}」', { name: plaza.name });
  const postText = `${greeting}\n${rules}\n#ぷぷりえーる`;
  return {
    /** What the post says (X adds the link after it). */
    postText,
    discord: `${t('**ぷぷりえーる**であそぼう！')}\n${t('「{name}」（{visibility}）', { name: plaza.name, visibility: t(visibilityInfo[plaza.visibility].label) })}\n${rules}\n${url}`,
    plain: `${greeting}\n${rules}\n${url}`,
    post: `https://x.com/intent/post?${new URLSearchParams({ text: postText, url })}`,
  };
}
