import type { CardContext, Effects } from '../effects/context.ts';
import type { ExSkillId, Task } from '../model.ts';
import { enterField, FIELD_SIZE } from '../core/zones.ts';

export const napUnits = (ctx: CardContext) => ctx.me.nap.filter(uid => ctx.defOf(uid).type === 'yojo');
export const napCost = (ctx: CardContext, uid: string) => ctx.s.cards[uid].cardId === 'y_146' && !ctx.s.cards[uid].silenced ? 10 : ctx.defOf(uid).cost;
export const revealedUnits = (ctx: CardContext, fruit: string) => ctx.me.hand.filter(uid => ctx.s.cards[uid].revealed && ctx.defOf(uid).type === 'yojo' && ctx.fruits(uid).includes(fruit));
export const step = (ctx: CardContext, name: string, extra: Partial<Task> = {}) => ctx.queue('cardEffect', { step: name, ...extra });

/** Keep reversible selections private until the actor explicitly completes the reveal. */
export function revealStep(ctx: CardContext, t: Task, eligible: (uid: string) => boolean, done: () => void) {
    const cards = ctx.me.hand.filter(uid => !ctx.s.cards[uid].revealed && eligible(uid));
    let selected = (t.ids ?? []).filter(uid => cards.includes(uid));
    if (t.target && cards.includes(t.target)) {
        selected = selected.includes(t.target) ? selected.filter(uid => uid !== t.target) : [...selected, t.target];
    }
    if (t.target !== 'done' && cards.length) {
        ctx.ask('公開する手札を選んでください（任意）', [{ id: 'done', label: '公開を完了' }, ...cards.map(id => ({ id, label: ctx.defOf(id).name }))], { ...t, ids: selected, target: undefined });
        return;
    }
    for (const uid of selected) ctx.reveal(uid);
    done();
}

export function gainEx(ctx: CardContext, id: ExSkillId, uses: number, owner = ctx.me, stack = true) {
    owner.exSkills ??= {};
    if (!stack && owner.exSkills[id]) return;
    // Added to what is held: the turn it was used (神隠し, 1ターンに1回) stays.
    owner.exSkills[id] = { ...owner.exSkills[id], uses: (owner.exSkills[id]?.uses ?? 0) + uses };
    ctx.note(`Exスキルを獲得：${id}`);
}

export function take(ctx: Effects, uid: string, zone: 'yojo' | 'sweet' | 'nap', reveal = false, zero = false) {
    ctx.me[zone] = ctx.me[zone].filter(id => id !== uid);
    ctx.me.hand.push(uid);
    // Moved into the hand: what effects gave it goes (core/movement.ts), then this effect's cost applies.
    ctx.touch(uid);
    if (zero) ctx.s.cards[uid].costDelta = -ctx.defOf(uid).cost;
    if (reveal) ctx.reveal(uid);
    // サーチもカード効果でデッキから手札に加えた1枚として魅惑の水煙を数える。
    // お昼寝場所から戻したカードや生成したカードは数えない。
    if (zone !== 'nap' && ctx.me.exSkills?.smoke) ctx.losePoints(ctx.side, 1, 'reduce');
}
export function randomSearch(ctx: CardContext, fruit: string, except?: string) {
    const eligible = ctx.me.yojo.filter(uid => ctx.fruits(uid).includes(fruit) && ctx.s.cards[uid].cardId !== except);
    if (eligible.length) take(ctx, eligible[ctx.random(eligible.length)], 'yojo', true);
}

export function revive(ctx: CardContext, uid: string) {
    if (ctx.me.field.length >= FIELD_SIZE) return;
    ctx.me.nap = ctx.me.nap.filter(id => id !== uid);
    // From the nap it arrives as the printed card (enterField resets it).
    enterField(ctx.s, ctx.side, uid, ctx.catalog, false);
}

export function exileDecks(ctx: CardContext, t: Task, enemy = false) {
    const p = enemy ? ctx.foe : ctx.me, owner = enemy ? ctx.foeSide : ctx.side;
    if (t.target) {
        const kind = t.target as 'yojo' | 'sweet';
        const eligible = p[kind].filter(uid => !(t.ids ?? []).includes(uid));
        if (eligible.length) ctx.exile(eligible[ctx.random(eligible.length)], owner);
        t = { ...t, target: undefined, count: (t.count ?? 1) - 1 };
    }
    if ((t.count ?? 0) <= 0) return;
    const kinds = (['yojo', 'sweet'] as const).filter(kind => p[kind].length);
    if (kinds.length) ctx.ask(`除外する${enemy ? '相手の' : ''}山札を選んでください（残り${t.count}枚）`, kinds.map(id => ({ id, label: id === 'yojo' ? '幼女デッキ' : 'お菓子デッキ' })), t);
}
