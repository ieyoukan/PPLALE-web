// Before the first turn: dice, choosing first/second, opening draws and the mulligan.
import { note } from '../core/cards.ts';
import { rollDie, shuffled } from '../core/rng.ts';
import { draw } from '../core/zones.ts';
import { other, RuleError, sides } from '../model.ts';
import type { DeckKind, GameState, Side } from '../model.ts';
import type { Handlers } from './types.ts';

export const openingCommands: Handlers<'roll' | 'initiative' | 'openingDraw' | 'mulligan' | 'keep'> = {
    // Each side rolls once in order (side 0 first); a tie clears both and repeats.
    roll(s, c) {
        if (s.phase !== 'dice') throw new RuleError('手番は既に決まっています');
        const complete = s.dice?.rolls.every(value => value !== null);
        const rolls: [number | null, number | null] = complete ? [null, null] : [...(s.dice?.rolls ?? [null, null])];
        if (c.actor !== (rolls[0] === null ? 0 : 1)) throw new RuleError('順番にダイスを振ってください');
        rolls[c.actor] = rollDie(s);
        s.dice = { rolls, ties: s.dice?.ties ?? 0 };
        note(s, `${s.players[c.actor].name}のダイス：${rolls[c.actor]}`);
        if (rolls[0] === null || rolls[1] === null) return;
        if (rolls[0] === rolls[1]) {
            s.dice.ties++;
            note(s, '同じ目なので、もう一度順番に振ってください');
            return;
        }
        s.active = rolls[0] > rolls[1] ? 0 : 1;
        s.phase = 'initiative';
        note(s, `${s.players[s.active].name}が先攻・後攻を選びます`);
    },
    // The dice winner chooses; the second player draws one extra opening card.
    initiative(s, c) {
        if (s.phase !== 'initiative' || s.active !== c.actor) throw new RuleError('ダイスで勝った側が先攻・後攻を選んでください');
        if (c.order !== 'first' && c.order !== 'second') throw new RuleError('先攻・後攻を選んでください');
        s.rules.firstPlayer = c.order === 'first' ? c.actor : other(c.actor);
        s.active = s.rules.firstPlayer;
        s.phase = 'opening';
        note(s, `${s.players[c.actor].name}が${c.order === 'first' ? '先攻' : '後攻'}を選びました`);
        for (const side of sides) s.openingRemaining[side] = s.rules.initialYojo + s.rules.initialSweet + (side === s.rules.firstPlayer ? 0 : 1);
    },
    // Both sides draw in parallel, one card per click from either deck.
    openingDraw(s, c) {
        if (s.phase !== 'opening' || s.openingRemaining[c.actor] <= 0) throw new RuleError('必要な初期手札は引き終わっています');
        if (c.deck !== 'yojo' && c.deck !== 'sweet' || !s.players[c.actor][c.deck].length) throw new RuleError('カードのある山札を選んでください');
        draw(s, c.actor, c.deck);
        s.openingRemaining[c.actor]--;
    },
    // Each opening card can be exchanged once, all in one batch, each from a chosen deck.
    mulligan(s, c, catalog) {
        assertMulligan(s, c.actor);
        const p = s.players[c.actor], ids = c.replacements.map(item => item.uid);
        if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !p.hand.includes(id) || !s.mulligan.eligible[c.actor].includes(id)))
            throw new RuleError('交換できる初期手札を選んでください');
        if (c.replacements.some(item => item.deck !== 'yojo' && item.deck !== 'sweet')) throw new RuleError('交換先のデッキを選んでください');
        for (const kind of ['yojo', 'sweet'] as const) {
            if (c.replacements.filter(item => item.deck === kind).length > p[kind].length) throw new RuleError('交換先のデッキにカードが足りません');
        }
        // Draw the entire batch before returning originals, so none can be redrawn.
        p.hand = p.hand.filter(id => !ids.includes(id));
        for (const item of c.replacements) draw(s, c.actor, item.deck);
        for (const uid of ids) p[catalog[s.cards[uid].cardId].type as DeckKind].push(uid);
        for (const kind of ['yojo', 'sweet'] as const) p[kind] = shuffled(s, p[kind]);
        note(s, `${p.name}：初期手札を${ids.length}枚まとめて交換`);
        confirm(s, c.actor);
    },
    keep(s, c) {
        assertMulligan(s, c.actor);
        confirm(s, c.actor);
    },
};

function assertMulligan(s: GameState, actor: Side) {
    if (s.phase !== 'mulligan' || s.mulligan.confirmed[actor] || s.pending) throw new RuleError('初期手札の確認中だけ操作できます');
}
function confirm(s: GameState, actor: Side) {
    s.mulligan.confirmed[actor] = true;
    s.mulligan.eligible[actor] = [];
    if (!s.mulligan.confirmed[other(actor)]) s.active = other(actor);
}
