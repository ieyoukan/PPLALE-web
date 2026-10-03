// Manual test operations for the same-device sandbox. Rejected unless `allowAdjust` is set.
import { maxPp } from '../core/cards.ts';
import { heal, losePoints } from '../core/points.ts';
import { draw } from '../core/zones.ts';
import { RuleError } from '../model.ts';
import type { Handlers } from './types.ts';

export const sandboxCommands: Handlers<'adjust' | 'draw'> = {
    adjust(s, c) {
        if (s.pending) throw new RuleError('効果の選択を先に完了してください');
        const p = s.players[c.actor];
        switch (c.resource) {
            case 'damage': {
                if (!c.uid || !p.field.includes(c.uid)) throw new RuleError('場のカードを指定してください');
                const card = s.cards[c.uid];
                card.damage = Math.max(0, card.damage + c.delta);
                return;
            }
            case 'points':
                if (c.delta < 0) losePoints(s, c.actor, -c.delta, 'reduce');
                else heal(s, c.actor, c.delta);
                return;
            case 'ppBonus':
                p.ppBonus = Math.max(-p.turns, p.ppBonus + c.delta);
                p.pp = Math.min(p.pp, maxPp(s, c.actor));
                return;
            case 'pp':
                p.pp = Math.max(0, Math.min(maxPp(s, c.actor), p.pp + c.delta));
        }
    },
    draw(s, c) {
        if (s.pending) throw new RuleError('効果の選択を先に完了してください');
        draw(s, c.actor, c.deck);
    },
};
