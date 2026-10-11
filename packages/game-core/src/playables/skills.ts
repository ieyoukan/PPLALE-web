// プレイアブルのスキル。index 0 は共通スキル、1 以降が固有スキル（カード原文の順）。
// 固有パッシブスキルは `playablePassives`、MP は `playableMp`。原文は src/data/playable.json。
import type { OpTable } from '../cards/types.ts';
import { attackOf, costOf, hpOf, immobilized } from '../core/cards.ts';
import { isHidden } from '../core/protection.ts';
import type { Effects } from '../effects/context.ts';
import { MAX_PP } from '../model.ts';
import type { Catalog, Keyword, Player, Task } from '../model.ts';
import { selectable } from '../effects/targets.ts';

export interface SkillScript {
    name: string;
    /** PP cost as printed. A passive can change what is paid: see `skillPrice`. */
    cost: number;
    /** MP cost (消費MP), for a playable that has MP. */
    mp?: number;
    /** Uses per game (使用回数制限). Omitted: no limit other than its cost. */
    uses?: number;
    /**
     * A skill that answers the opponent instead of being used on its owner's turn. The engine asks
     * the owner whenever it can be used (effects/expandedOps.ts `skillReaction`):
     * `attacked` — an enemy unit attacks one of the owner's units, before the おにごっこ roll.
     */
    reaction?: 'attacked';
    /**
     * Reason it cannot be used now, checked before paying. `event` is the step a reaction answers
     * (`source`: the attacking unit, `subject`: the attacked one).
     */
    blocked?(fx: Effects, event?: Task): string | undefined;
    /** A reaction may return what it changes in the step that continues (e.g. `value`: the 1d6). */
    use(fx: Effects, event?: Task): Partial<Task> | void;
    /** Steps only this skill uses. */
    ops?: OpTable;
    /** Whether the CPU should use it now. */
    cpu?(fx: Effects, event?: Task): boolean;
    /** Using it now would only spend its cost: the CPU's search leaves it out. */
    wasted?(fx: Effects): boolean;
}

/** 固有パッシブスキル: never used, it holds for the whole match (some only once a condition is met). */
export interface PassiveScript {
    name: string;
    /** The condition of a conditional passive. Omitted: it always holds. */
    active?(p: Pick<Player, 'played'>, catalog: Catalog): boolean;
    /** While it holds: the PP skill `index` costs, given its printed cost. */
    skillCost?(index: number, printed: number): number;
    /** While it holds: uses added to the printed limit of skill `index`. */
    extraUses?(index: number): number;
    /** A unit entered the owner's field, however it got there (played, summoned, copied, taken). */
    onUnitEnter?(fx: Effects, uid: string): void;
}

/** 「相手の幼女1人に〜」は対象の選択が必要。相手の場に幼女がいなければ使えない。 */
const needsEnemyUnit = (fx: Effects) => selectable(fx.s, fx.side, fx.foe.field).length ? undefined : '対象にできる相手の幼女がいません';
const needsOwnUnit = (what: string) => (fx: Effects) => fx.me.field.length ? undefined : `${what}を付与する幼女が場にいません`;
const ateLastTurn = (fx: Effects) => fx.foe.field.filter(uid => fx.s.cards[uid].ateOn === fx.s.turn - 1);

// ── What the CPU's rules of thumb look at ──
const has = (fx: Effects, uid: string, ...keywords: Keyword[]) => fx.s.cards[uid].keywords.some(k => keywords.includes(k));
const attack = (fx: Effects, uid: string) => attackOf(fx.s.cards[uid], fx.catalog);
const hp = (fx: Effects, uid: string) => hpOf(fx.s.cards[uid], fx.catalog);
const worth = (fx: Effects, uid: string) => attack(fx, uid) + Math.max(0, hp(fx, uid));
const total = (fx: Effects, uids: string[]) => uids.reduce((sum, uid) => sum + worth(fx, uid), 0);
/** 行動不能 now, by its ability or for a time. */
const cannotAct = (fx: Effects, uid: string) => has(fx, uid, 'immobile') || immobilized(fx.s, uid);
/** Skill effects that destroy are stopped by 効果耐性 / 効果破壊耐性. */
const destroyable = (fx: Effects, uid: string) => !has(fx, uid, 'effectImmune', 'destroyImmune');
const enemyTargets = (fx: Effects) => selectable(fx.s, fx.side, fx.foe.field);
/** It entered this turn and could attack if it did not have to wait. */
const waiting = (fx: Effects, uid: string) => {
    const c = fx.s.cards[uid];
    return c.entered === fx.s.turn && !c.exhausted && attack(fx, uid) > 0 && !cannotAct(fx, uid);
};
/** It can attack this turn. */
const ready = (fx: Effects, uid: string) => {
    const c = fx.s.cards[uid];
    return !c.exhausted && attack(fx, uid) > 0 && !cannotAct(fx, uid) && (c.entered !== fx.s.turn || has(fx, uid, 'fast', 'charge'));
};

// 【突撃！隣のおやつタイム】コスト0, 場の幼女1人に突撃を付与する。2回。
export const commonSkill: SkillScript = {
    name: '突撃！隣のおやつタイム', cost: 0, uses: 2,
    blocked: fx => fx.me.field.length ? undefined : '突撃を付与する幼女が場にいません',
    use: fx => fx.queue('keyword', { scope: 'friendly', keyword: 'charge' }),
    cpu: fx => fx.foe.field.length > 0 && fx.me.field.some(uid => {
        const c = fx.s.cards[uid];
        return c.entered === fx.s.turn && !c.exhausted && !has(fx, uid, 'charge', 'fast') && !cannotAct(fx, uid);
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
            cpu: fx => fx.maxPp() < MAX_PP,
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
        { name: 'お菓子はうぃまるが守りまｽﾔｧ', cost: 0, uses: 2, blocked: needsEnemyUnit, use: fx => fx.queue('damage', { scope: 'enemy', amount: 1 }), cpu: fx => fx.foe.field.length > 0 },
        // 【うぃまるの本気を見せまｽﾔｧ】相手の幼女1人に2ダメージ。
        { name: 'うぃまるの本気を見せまｽﾔｧ', cost: 1, uses: 2, blocked: needsEnemyUnit, use: fx => fx.queue('damage', { scope: 'enemy', amount: 2 }), cpu: fx => fx.foe.field.length > 0 },
        {
            // 【うぃまる、実は色々できまｽﾔｧ】相手の幼女1人に1ダメージ。追加で1PP支払ったなら2ダメージ。
            name: '実は色々できまｽﾔｧ', cost: 1, uses: 1,
            blocked: needsEnemyUnit,
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
            // 【応急手当】お菓子を1回復。共通スキルの残り回数を1回復（使用回数制限の2回は超えない）。
            name: '応急手当', cost: 0, uses: 2,
            use(fx) {
                fx.heal(1);
                fx.me.skills[0] = Math.min(fx.me.skills[0] + 1, skillLimit(fx.me, 0, fx.catalog));
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
            // 1人を選べない（かくれんぼ中など）ときは、追加の2PPで全員を破壊できる場合だけ使える。
            blocked: fx => !ateLastTurn(fx).length ? '直前の相手ターンにお菓子を食べた幼女がいません'
                : selectable(fx.s, fx.side, ateLastTurn(fx)).length || fx.me.pp >= 3 ? undefined : '選べる幼女がいません',
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
                            ], { ...t, selected: true });
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
            blocked: needsEnemyUnit,
            use(fx) {
                fx.losePoints(fx.side, 2, 'reduce');
                fx.queue('stealUnit', { scope: 'enemy' });
            },
            cpu: fx => fx.foe.field.length > 0 && fx.me.field.length < 7 && fx.me.points > 2,
        },
        // 【ｸﾏｰ（強欲なｸﾏ）】幼女デッキから2枚引く。
        { name: '強欲なｸﾏ', cost: 1, uses: 1, use: fx => fx.queue('draw', { count: 2, deck: 'yojo' }), cpu: fx => fx.me.yojo.length > 0 },
    ],
    // p_6 しゅれい（β）: 初期MP3・最大MP20（playableMp）。固有スキルに使用回数制限はなく、コスト（PP / MP）だけが制限。
    p_6: [
        {
            // 【ルナレストア】コスト1, MPを2回復する。
            name: 'ルナレストア', cost: 1,
            use: fx => fx.gainMp(2),
            // Not while part of it would be lost at the maximum.
            cpu: fx => (fx.me.mp ?? 0) + 2 <= mpMax(fx.me.playable),
            wasted: fx => (fx.me.mp ?? 0) >= mpMax(fx.me.playable),
        },
        {
            // 【アイシクルレイン】消費MP5, 相手幼女すべてに1ダメージ。
            name: 'アイシクルレイン', cost: 0, mp: 5,
            use: fx => fx.queue('allDamage', { amount: 1 }),
            cpu(fx) {
                const hit = fx.foe.field.filter(uid => !has(fx, uid, 'effectImmune') && !fx.s.cards[uid].shield);
                return hit.length >= 4 || hit.filter(uid => hp(fx, uid) <= 1).length >= 2;
            },
            wasted: fx => !fx.foe.field.length,
        },
        {
            // 【アブソリュートゼロ】消費MP9, 相手幼女1人を破壊する。
            name: 'アブソリュートゼロ', cost: 0, mp: 9,
            blocked: needsEnemyUnit,
            use: fx => fx.queue('destroy', { scope: 'enemy' }),
            cpu: fx => enemyTargets(fx).some(uid => destroyable(fx, uid) && worth(fx, uid) >= 6),
        },
        {
            // 【フロストバーンベール】消費MP9, 相手幼女1人を-3/-3する。
            name: 'フロストバーンベール', cost: 0, mp: 9,
            blocked: needsEnemyUnit,
            use: fx => fx.queue('buff', { scope: 'enemy', amount: -3, hp: -3 }),
            // The same MP destroys a unit outright, so only against one an effect cannot destroy.
            cpu: fx => enemyTargets(fx).some(uid => !destroyable(fx, uid) && worth(fx, uid) >= 6),
        },
        {
            // 【アストラルフレア】消費MP15, 場の幼女すべてを破壊する（自分の場も）。自ターン側から、場に出た順に破壊する。
            name: 'アストラルフレア', cost: 0, mp: 15,
            use(fx) { for (const uid of [...fx.me.field, ...fx.foe.field]) fx.destroy(uid); },
            cpu: fx => total(fx, fx.foe.field.filter(uid => destroyable(fx, uid))) - total(fx, fx.me.field.filter(uid => destroyable(fx, uid))) >= 12,
            wasted: fx => !fx.me.field.length && !fx.foe.field.length,
        },
    ],
    // p_7 いのまこ（β）。パッシブ【いのまこコンビネーション】は playablePassives。
    p_7: [
        {
            // 【つまみ食いなのー！】コスト1、自分の場の幼女1人に早食いを付与する。
            name: 'つまみ食いなのー！', cost: 1, uses: 1,
            blocked: needsOwnUnit('早食い'),
            use: fx => fx.queue('keyword', { scope: 'friendly', keyword: 'fast' }),
            cpu: fx => fx.me.field.some(uid => waiting(fx, uid) && !has(fx, uid, 'fast')),
        },
        {
            // 【皆さんご唱和ください、じゃんがりあーん】コスト1、自分の場の幼女1人に貫通を付与する。
            name: '皆さんご唱和ください、じゃんがりあーん', cost: 1, uses: 1,
            blocked: needsOwnUnit('貫通'),
            use: fx => fx.queue('keyword', { scope: 'friendly', keyword: 'pierce' }),
            cpu: fx => fx.foe.field.some(uid => has(fx, uid, 'guard') && !isHidden(fx.s, uid))
                && fx.me.field.some(uid => ready(fx, uid) && !has(fx, uid, 'pierce')),
        },
    ],
    // p_8 ちょり（β）。パッシブ【えへへー、みんなであそぼー！】は playablePassives。
    p_8: [
        {
            // 【きんきゅーかいひー！】相手ターン中、おにごっこを持つ自分の幼女が相手幼女から攻撃を受けたとき、
            // 1d6をせずに1d6=6として扱う。次の自分のターンに使用できるPPを2減らす。
            name: 'きんきゅーかいひー！', cost: 0, uses: 1, reaction: 'attacked',
            blocked: (fx, event) => event?.subject && fx.s.cards[event.subject]?.keywords.includes('evade') ? undefined : '相手ターン中、おにごっこを持つ自分の幼女が攻撃されたときに使えます',
            use(fx) {
                fx.me.nextPpDebt += 2;
                fx.note('1d6を振らず、出目を6として扱う');
                return { value: 6 };
            },
            // To keep a unit worth it that the attack would destroy, unless its own roll is likely to save it.
            cpu(fx, event) {
                if (!event?.source || !event.subject) return false;
                const target = event.subject, card = fx.s.cards[target];
                const lost = !card.shield && attack(fx, event.source) >= hp(fx, target);
                return lost && (card.evasion ?? 5) >= 4 && (worth(fx, target) >= 5 || has(fx, target, 'guard', 'taunt'));
            },
        },
        {
            // 【ちょりちゅけにむちゅーになれー！】コスト1，相手の場の幼女1人を次の相手ターン終了時まで行動不能にする。
            name: 'ちょりちゅけにむちゅーになれー！', cost: 1, uses: 1,
            blocked: needsEnemyUnit,
            use: fx => fx.queue('immobilize', { scope: 'enemy', amount: 1 }),
            cpu: fx => enemyTargets(fx).some(uid => attack(fx, uid) >= 3 && !cannotAct(fx, uid)),
        },
    ],
};

export const playablePassives: Record<string, PassiveScript> = {
    // p_7【いのまこコンビネーション】このバトル中、いのむーとまこぽにの両方をプレイしているならば、
    // 固有スキルの消費コストを0にする。さらに共通スキルの使用回数を+1する。
    // 「プレイ」は手札から出すこと（`played`）。フルーツは問わず、カード名で数える。
    p_7: {
        name: 'いのまこコンビネーション',
        active: (p, catalog) => ['いのむー', 'まこぽに'].every(name => p.played.some(id => catalog[id]?.type === 'yojo' && catalog[id].name === name)),
        skillCost: (index, printed) => index > 0 ? 0 : printed,
        extraUses: index => index === 0 ? 1 : 0,
    },
    // p_8【えへへー、みんなであそぼー！】このバトル中、自分の場に出た幼女すべては、おにごっこ（1d6≧6）を得る。
    // 元からおにごっこ(1d6≧X)をもつ幼女が出たときは、おにごっこ(1d6≧X-1）を得る。
    p_8: {
        name: 'えへへー、みんなであそぼー！',
        onUnitEnter(fx, uid) {
            const card = fx.s.cards[uid];
            if (card.keywords.includes('evade')) card.evasion = (card.evasion ?? 5) - 1;
            else {
                card.keywords.push('evade');
                card.evasion = 6;
            }
        },
    },
};

/** Playables with MP: what they start with and the most they can hold. */
export const playableMp: Record<string, { initial: number; max: number }> = {
    p_6: { initial: 3, max: 20 },
};
/** The most MP the playable can hold; 0 for one without MP. */
export const mpMax = (playable: string) => playableMp[playable]?.max ?? 0;

/** 拡張プレイアブル (version β). They lead a deck only when its rules allow it; each is playable once it has skills here. */
export const extendedPlayables: readonly string[] = ['p_6', 'p_7', 'p_8'];

export function skillsFor(playable: string): SkillScript[] {
    return [commonSkill, ...(playableSkills[playable] ?? [])];
}
export const allSkills = (): SkillScript[] => [commonSkill, ...Object.values(playableSkills).flat()];

/** A skill as the `skill` command numbers them: the playable's own first, then the ones taken from the opponent (レンテ). */
export interface SkillRef {
    skill: SkillScript;
    /** The playable it is printed on, and its index there. */
    playable: string;
    origin: number;
    /** Index in `Player.extraSkills` for a taken skill. */
    extra?: number;
}
export function skillAt(p: Pick<Player, 'playable' | 'extraSkills'>, index: number): SkillRef | undefined {
    const own = skillsFor(p.playable);
    if (index < own.length) return own[index] && { skill: own[index], playable: p.playable, origin: index };
    const extra = index - own.length, entry = p.extraSkills?.[extra];
    const skill = entry && skillsFor(entry.playable)[entry.index];
    return skill && { skill, playable: entry.playable, origin: entry.index, extra };
}
/** How many skills the `skill` command can name for this player. */
export const skillCount = (p: Pick<Player, 'playable' | 'extraSkills'>) => skillsFor(p.playable).length + (p.extraSkills?.length ?? 0);

type Owner = Pick<Player, 'playable' | 'played'>;
/** The playable's passive, when its condition holds for this player now. */
export function activePassive(p: Owner, catalog: Catalog): PassiveScript | undefined {
    const passive = playablePassives[p.playable];
    return passive && (passive.active?.(p, catalog) ?? true) ? passive : undefined;
}
/** What using skill `index` costs this player now. */
export function skillPrice(p: Owner, index: number, catalog: Catalog): { pp: number; mp: number } {
    const skill = skillsFor(p.playable)[index];
    if (!skill) return { pp: 0, mp: 0 };
    return { pp: activePassive(p, catalog)?.skillCost?.(index, skill.cost) ?? skill.cost, mp: skill.mp ?? 0 };
}
/**
 * The most uses skill `index` can have left now: its printed limit plus what a passive adds.
 * `Player.skills[index]` is always between 0 and this; 0 for a skill without a use limit.
 */
export function skillLimit(p: Owner, index: number, catalog: Catalog): number {
    const skill = skillsFor(p.playable)[index];
    if (skill?.uses === undefined) return 0;
    return skill.uses + (activePassive(p, catalog)?.extraUses?.(index) ?? 0);
}
export const skillLimits = (p: Owner, catalog: Catalog): number[] => skillsFor(p.playable).map((_, index) => skillLimit(p, index, catalog));

/**
 * Runs a change that can switch a passive on or off (a card was played, the editor rewrote the
 * history) and moves the remaining uses along with the limits: +1 to a limit is +1 use left.
 * Returns the passive when the change made its condition hold.
 */
export function withSkillLimits(p: Player, catalog: Catalog, change: () => void): PassiveScript | undefined {
    const before = skillLimits(p, catalog), was = activePassive(p, catalog);
    change();
    skillLimits(p, catalog).forEach((limit, index) => {
        if (limit !== before[index]) p.skills[index] = Math.max(0, Math.min(limit, p.skills[index] + limit - before[index]));
    });
    const now = activePassive(p, catalog);
    return now && !was ? now : undefined;
}
