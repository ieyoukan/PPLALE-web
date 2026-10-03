// 通常プレイアブルのスキル。index 0 は共通スキル、1 以降が固有スキル（カード原文の順）。
// 原文は src/data/playable.json。
import type { OpTable } from '../cards/types.ts';
import { costOf } from '../core/cards.ts';
import type { Effects } from '../effects/context.ts';
import { selectable } from '../effects/targets.ts';

export interface SkillScript {
    name: string;
    cost: number;
    /** Uses per game. */
    uses: number;
    /** Reason it cannot be used now, checked before paying. */
    blocked?(fx: Effects): string | undefined;
    use(fx: Effects): void;
    /** Steps only this skill uses. */
    ops?: OpTable;
    /** Whether the CPU should use it now. */
    cpu?(fx: Effects): boolean;
}

const ateLastTurn = (fx: Effects) => fx.foe.field.filter(uid => fx.s.cards[uid].ateOn === fx.s.turn - 1);

// 【突撃！隣のおやつタイム】コスト0, 場の幼女1人に突撃を付与する。2回。
export const commonSkill: SkillScript = {
    name: '突撃！隣のおやつタイム', cost: 0, uses: 2,
    blocked: fx => fx.me.field.length ? undefined : '突撃を付与する幼女が場にいません',
    use: fx => fx.queue('keyword', { scope: 'friendly', keyword: 'charge' }),
    cpu: fx => fx.foe.field.length > 0 && fx.me.field.some(uid => {
        const c = fx.s.cards[uid];
        return c.entered === fx.s.turn && !c.exhausted && !c.keywords.some(k => ['charge', 'fast', 'immobile'].includes(k));
    }),
};

export const playableSkills: Record<string, SkillScript[]> = {
    // p_0 あみの
    p_0: [
        {
            // 【ぷぷりえの参謀】最大PP+1。手札のお菓子1枚のコストをターン終了時まで-2。
            name: 'ぷぷりえの参謀', cost: 3, uses: 1,
            use(fx) {
                fx.me.ppBonus++;
                fx.queue('handCost', { amount: -2, text: 'temporary' });
            },
            cpu: fx => fx.maxPp() < fx.s.rules.maxPP,
        },
        {
            // 【参謀の全面バックアップ】最大PPが7以上なら使用可。最大PP+1。ランダムな相手幼女に2ダメージ。1枚引く。
            name: '参謀の全面バックアップ', cost: 2, uses: 1,
            blocked: fx => fx.maxPp() >= 7 ? undefined : '最大PPが7以上必要です',
            use(fx) {
                fx.me.ppBonus++;
                fx.queue('randomDamage', { amount: 2 });
                fx.queue('draw');
            },
            cpu: () => true,
        },
    ],
    // p_1 うぃまる
    p_1: [
        // 【お菓子はうぃまるが守りまｽﾔｧ】相手の幼女1人に1ダメージ。
        { name: 'お菓子はうぃまるが守りまｽﾔｧ', cost: 0, uses: 2, use: fx => fx.queue('damage', { scope: 'enemy', amount: 1 }), cpu: fx => fx.foe.field.length > 0 },
        // 【うぃまるの本気を見せまｽﾔｧ】相手の幼女1人に2ダメージ。
        { name: 'うぃまるの本気を見せまｽﾔｧ', cost: 1, uses: 2, use: fx => fx.queue('damage', { scope: 'enemy', amount: 2 }), cpu: fx => fx.foe.field.length > 0 },
        {
            // 【うぃまる、実は色々できまｽﾔｧ】相手の幼女1人に1ダメージ。追加で1PP支払ったなら2ダメージ。
            name: '実は色々できまｽﾔｧ', cost: 1, uses: 1,
            use: fx => fx.queue('bonusDamage'),
            ops: {
                bonusDamage: {
                    run(fx, t) {
                        if (!t.target && fx.me.pp >= 1) {
                            fx.ask('追加で1PP支払いますか？', [{ id: 'no', label: '1ダメージ' }, { id: 'yes', label: '1PP追加・2ダメージ' }], t);
                            return;
                        }
                        if (t.target === 'yes') fx.me.pp--;
                        fx.next({ op: 'damage', actor: t.actor, scope: 'enemy', amount: t.target === 'yes' ? 2 : 1 });
                    },
                    cpu: fx => fx.me.pp >= 1 ? 'yes' : 'no',
                },
            },
            cpu: fx => fx.foe.field.length > 0,
        },
    ],
    // p_2 ストラ
    p_2: [
        {
            // 【絶対に後で返すからそのお菓子ちょうだい？】2ターン連続で使用不可。今のターンのPP+2、次のターンのPP-2。
            name: '後で返すからそのお菓子ちょうだい？', cost: 0, uses: 2,
            blocked: fx => fx.me.lastBorrow >= fx.me.turns - 1 ? '2ターン連続では使えません' : undefined,
            use(fx) {
                fx.me.pp += 2;
                fx.me.nextPpDebt += 2;
                fx.me.lastBorrow = fx.me.turns;
            },
            cpu: fx => fx.me.hand.some(uid => {
                const cost = costOf(fx.s, uid, fx.catalog, fx.side);
                return cost > fx.me.pp && cost <= fx.me.pp + 2;
            }),
        },
    ],
    // p_3 ももか
    p_3: [
        {
            // 【応急手当】お菓子を1回復。共通スキルの残り回数を1回復。
            name: '応急手当', cost: 0, uses: 2,
            use(fx) {
                fx.heal(1);
                fx.me.skills[0]++;
            },
            cpu: fx => fx.me.points < fx.me.maxPoints,
        },
        {
            // 【お菓子買ってきたよー】お菓子を1回復。自分の場のランダムな幼女1人に防衛。
            name: 'お菓子買ってきたよー', cost: 1, uses: 1,
            use(fx) {
                fx.heal(1);
                if (fx.me.field.length) fx.addKeyword(fx.me.field[fx.random(fx.me.field.length)], 'guard');
            },
            cpu: fx => fx.me.points < fx.me.maxPoints,
        },
        {
            // 【皆元気になあれ！】お菓子の最大値+3、お菓子を3回復。
            name: '皆元気になあれ！', cost: 1, uses: 1,
            use(fx) {
                fx.me.maxPoints += 3;
                fx.heal(3);
            },
            cpu: () => true,
        },
    ],
    // p_4 りくす
    p_4: [
        {
            // 【店長のリーダーシップなん】自分の幼女全員 +1/+1。2体以下なら +2/+2。
            name: '店長のリーダーシップなん', cost: 3, uses: 2,
            use(fx) {
                const amount = fx.me.field.length <= 2 ? 2 : 1;
                fx.queue('allBuff', { scope: 'friendly', amount, hp: amount });
            },
            cpu: fx => fx.me.field.length > 0,
        },
        {
            // 【おしおきなん！】直前の相手ターンにお菓子を食べた幼女1人を破壊。追加で2支払えば全員。
            name: 'おしおきなん！', cost: 1, uses: 1,
            use: fx => fx.queue('punish'),
            ops: {
                punish: {
                    run(fx, t) {
                        const ate = ateLastTurn(fx);
                        if (!t.target) {
                            if (!ate.length) return;
                            fx.ask('直前にお菓子を食べた幼女を破壊', [
                                ...selectable(fx.s, fx.side, ate).map(id => ({ id, label: fx.defOf(id).name })),
                                ...(fx.me.pp >= 2 ? [{ id: 'all', label: '追加2PPで全員' }] : []),
                            ], t);
                            return;
                        }
                        if (t.target !== 'all') return fx.destroy(t.target);
                        fx.me.pp -= 2;
                        ate.forEach(uid => fx.destroy(uid));
                    },
                    cpu: fx => ateLastTurn(fx).length > 1 ? 'all' : undefined,
                },
            },
            cpu: fx => ateLastTurn(fx).length > 0,
        },
    ],
    // p_5 レンテ
    p_5: [
        {
            // 【ｸﾏｰ（うち来ない？）】自分のお菓子を2減らす。相手の幼女1人を奪う（能力変化を引き継いで自分の場に出す）。
            name: 'うち来ない？', cost: 4, uses: 1,
            use(fx) {
                fx.losePoints(fx.side, 2, 'reduce');
                fx.queue('stealUnit', { scope: 'enemy' });
            },
            cpu: fx => fx.foe.field.length > 0 && fx.me.field.length < 7 && fx.me.points > 2,
        },
        // 【ｸﾏｰ（強欲なｸﾏ）】幼女デッキから2枚引く。
        { name: '強欲なｸﾏ', cost: 1, uses: 1, use: fx => fx.queue('draw', { count: 2, deck: 'yojo' }), cpu: fx => fx.me.yojo.length > 0 },
    ],
};

export function skillsFor(playable: string): SkillScript[] {
    return [commonSkill, ...(playableSkills[playable] ?? [])];
}
export const allSkills = (): SkillScript[] => [commonSkill, ...Object.values(playableSkills).flat()];
