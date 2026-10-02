import { baseKeywords, other, skillsFor } from './model.ts';
import type { Catalog, Command, Deck, DeckKind, GameState, Instance, Player, Result, Rules, Side, Task } from './model.ts';
export function attackOf(card: Instance, catalog: Catalog) { return Math.max(0, catalog[card.cardId].attack + card.attackBonus); }
export function hpOf(card: Instance, catalog: Catalog) { return catalog[card.cardId].hp + card.hpBonus - card.damage; }
export function maxPp(state: GameState, side: Side) { const p = state.players[side]; return Math.max(0, Math.min(state.rules.maxPP, p.turns + p.ppBonus)); }
export function costOf(state: GameState, uid: string, catalog: Catalog, side: Side) {
    const c = state.cards[uid];
    const base = c.cardId === 'y_15' && state.players[side].field.some(id => state.cards[id].cardId === 'y_16') ? 2 : catalog[c.cardId].cost;
    return Math.max(0, base + c.costDelta + c.temporaryCost);
}
export function validateDeck(deck: Deck, catalog: Catalog): string[] {
    const errors: string[] = [];
    if (deck.yojo.length !== 20)
        errors.push('幼女デッキは20枚にしてください');
    if (deck.sweet.length !== 10)
        errors.push('お菓子デッキは10枚にしてください');
    for (const kind of ['yojo', 'sweet'] as const)
        for (const id of deck[kind]) {
            const c = catalog[id];
            if (!c || c.type !== kind || c.fruit !== 'strawberry' || !(kind === 'yojo' ? /^y_(?:\d|[12]\d|30)$/ : /^s_(?:\d|1\d|2[0-7])$/).test(id))
                errors.push(`${id}: いちごの${kind === 'yojo' ? '幼女' : 'お菓子'}デッキに入れられません`);
        }
    if (!catalog[deck.playable] || !skillsFor(deck.playable).length || !/^p_[0-5]$/.test(deck.playable))
        errors.push('通常プレイアブルを選んでください');
    for (const id of Array.from(new Set(deck.sweet)))
        if (catalog[id]?.sweetType === 'animal_soda' && deck.sweet.filter(c => c === id).length > 1)
            errors.push(`${catalog[id].name}は1枚までです`);
    return Array.from(new Set(errors));
}
function random(state: GameState, size: number) { state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0; return Math.floor(state.rng / 0x100000000 * Math.max(1, size)); }
function note(s: GameState, text: string) { s.log.push(text); if (s.log.length > 100)
    s.log.shift(); }
function makeCard(s: GameState, id: string): string {
    const uid = `c${++s.serial}`;
    s.cards[uid] = { uid, cardId: id, attackBonus: 0, hpBonus: 0, damage: 0, costDelta: 0, temporaryCost: 0, keywords: [...(baseKeywords[id] ?? [])], shield: false, slot: null, entered: -1, exhausted: false, ateOn: -1, revealed: false, links: [] };
    return uid;
}
function shuffled(s: GameState, ids: string[]) { const result = [...ids]; for (let i = result.length - 1; i > 0; i--) {
    const j = random(s, i + 1);
    [result[i], result[j]] = [result[j], result[i]];
} return result; }
function draw(s: GameState, side: Side, kind: DeckKind): string | undefined {
    const p = s.players[side], uid = p[kind].shift();
    if (uid) {
        p.hand.push(uid);
        note(s, `${p.name}：${kind === 'yojo' ? '幼女' : 'お菓子'}を1枚ドロー`);
    }
    else {
        note(s, `${p.name}：${kind === 'yojo' ? '幼女' : 'お菓子'}デッキが空です`);
        if (s.rules.emptyDeckLoses)
            s.winner = other(side);
    }
    return uid;
}
function heal(s: GameState, side: Side, amount: number) { const p = s.players[side]; p.points = Math.min(p.maxPoints, p.points + amount); }
function points(s: GameState, side: Side, amount: number, mode: 'reduce' | 'steal' | 'eat', catalog: Catalog, piercing = false) {
    const p = s.players[side];
    if (mode !== 'reduce') {
        if (!piercing && p.field.some(uid => s.cards[uid].keywords.includes('taunt'))) {
            note(s, '挑発によってお菓子が守られました');
            return 0;
        }
        if (p.shield) {
            p.shield = false;
            note(s, 'パンケーキが一度だけ無効化しました');
            return 0;
        }
    }
    const before = p.points;
    p.points = Math.max(0, p.points - amount);
    note(s, `${p.name}：お菓子ポイント ${before} → ${p.points}`);
    for (const threshold of [10, 5])
        if (before > threshold && p.points <= threshold && !p.milestones.includes(threshold)) {
            p.milestones.push(threshold);
            note(s, `${threshold}ポイント到達：お菓子を1枚ドロー`);
            s.queue.push({op: 'draw', actor: side, deck: 'sweet', text: 'threshold'});
        }
    if (mode === 'steal' && s.rules.stealHeals)
        heal(s, other(side), before - p.points);
    void catalog;
    return before - p.points;
}
function hit(s: GameState, uid: string, amount: number, effect = true) { const c = s.cards[uid]; if (!c || amount <= 0)
    return; if (effect && c.keywords.includes('effectImmune'))
    return; if (c.shield) {
    c.shield = false;
    return;
} c.damage += amount; }
function buff(s: GameState, uid: string, attack: number, hp: number) { const c = s.cards[uid]; if (c) {
    c.attackBonus += attack;
    c.hpBonus += hp;
} }
function openSlot(s: GameState, side: Side): number {
    const used = s.players[side].field.map(id => s.cards[id].slot);
    return Array.from({length: 7}, (_, index) => index).find(index => !used.includes(index)) ?? -1;
}
function summon(s: GameState, side: Side, id: string, catalog: Catalog): string | undefined {
    const p = s.players[side];
    if (p.field.length >= 7) {
        note(s, '場がいっぱいのため登場できません');
        return;
    }
    const uid = makeCard(s, id);
    s.cards[uid].entered = s.turn;
    s.cards[uid].slot = openSlot(s, side);
    p.field.push(uid);
    entry(s, side, uid, catalog, false);
    return uid;
}
function entry(s: GameState, side: Side, uid: string, catalog: Catalog, fromHand: boolean) {
    const p = s.players[side], c = s.cards[uid];
    for (const friend of p.field.filter(id => id !== uid)) {
        if (s.cards[friend].cardId === 'y_1')
            buff(s, uid, 1, -1);
        if (s.cards[friend].cardId === 'y_16' && c.cardId === 'y_15')
            buff(s, friend, 1, 1);
    }
    if (c.cardId === 'y_13')
        buff(s, uid, p.nap.filter(id => s.cards[id].cardId === 'y_13').length, 0);
    if (fromHand)
        cardEffect(s, side, uid, catalog);
}
function discard(s: GameState, side: Side, uid: string) {
    const p = s.players[side];
    p.hand = p.hand.filter(id => id !== uid);
    p.nap.push(uid);
    if (s.cards[uid].cardId === 'y_5')
        s.queue.push({ op: 'draw', actor: side });
}
function destroy(s: GameState, uid: string, effect: boolean, catalog: Catalog) {
    const side = ([0, 1] as Side[]).find(side => s.players[side].field.includes(uid));
    if (side === undefined)
        return;
    const c = s.cards[uid];
    if (effect && c.keywords.includes('effectImmune'))
        return;
    const p = s.players[side];
    p.field = p.field.filter(id => id !== uid);
    c.slot = null;
    p.nap.push(uid);
    note(s, `${catalog[c.cardId].name}がお昼寝場所へ`);
    for (const linked of c.links)
        destroy(s, linked, true, catalog);
    const task = (op: string, extra: Partial<Task> = {}) => s.queue.push({ op, actor: side, source: uid, ...extra });
    switch (c.cardId) {
        case 'y_2':
            task('addHand', { cardId: 'yt_0' });
            break;
        case 'yt_0':
            task('addHand', { cardId: 'yt_1' });
            break;
        case 'y_4':
            task('draw');
            break;
        case 'y_7':
            task('summon', { cardId: 'token_cat' });
            break;
        case 'y_10':
            task('randomDamage', { amount: 2 });
            break;
        case 'y_11':
            task('allDamage', { amount: 1, scope: 'friendly' });
            task('heal', { amount: 2 });
            break;
    }
}
function settle(s: GameState, catalog: Catalog) {
    for (const side of [0, 1] as Side[])
        for (const uid of [...s.players[side].field])
            if (hpOf(s.cards[uid], catalog) <= 0)
                destroy(s, uid, false, catalog);
    const lost = ([0, 1] as Side[]).filter(side => s.players[side].points <= 0);
    if (lost.length)
        s.winner = lost.length === 2 ? 'draw' : other(lost[0]);
}
function cardEffect(s: GameState, side: Side, uid: string, catalog: Catalog) {
    const c = s.cards[uid], def = catalog[c.cardId], p = s.players[side];
    const mult = def.type === 'sweet' && def.sweetType !== 'animal_soda' && def.sweetType !== 'back_menu' && p.doubleSweet ? 2 : 1;
    if (mult === 2)
        p.doubleSweet = false;
    const add = (op: string, extra: Partial<Task> = {}) => s.queue.push({ op, actor: side, source: uid, multiplier: mult, ...extra });
    const played = (id: string) => p.played.includes(id);
    switch (c.cardId) {
        case 'y_0':
            if (p.turns === 1)
                add('draw');
            else {
                buff(s, uid, p.pp, p.pp);
                p.pp = 0;
            }
            break;
        case 'y_2':
        case 'yt_0':
        case 'yt_1':
            if (p.played.filter(id => catalog[id]?.name.includes('うゆち') && catalog[id].fruit === 'strawberry').length >= 5) {
                buff(s, uid, 3, 3);
                c.keywords.push('fast');
            }
            break;
        case 'y_5':
            add('discardThen', { text: 'draw' });
            break;
        case 'y_6':
            add('draw', { text: 'attackIfYojo' });
            break;
        case 'y_8':
            add('draw', { text: 'hpIfSweet' });
            break;
        case 'y_9':
            add('damage', { scope: 'enemy', amount: 2 });
            break;
        case 'y_11':
            add('reduce', { scope: 'friendly', amount: 2 });
            break;
        case 'y_12': {
            const before = maxPp(s, side);
            p.ppBonus++;
            if (before >= 7)
                add('randomDamage', { amount: 2 });
            if (before >= 10)
                add('steal', { amount: 2 });
            break;
        }
        case 'y_14':
            add('searchRole');
            break;
        case 'y_15':
            if (p.field.some(id => s.cards[id].cardId === 'y_16'))
                buff(s, uid, 1, 1);
            break;
        case 'y_18': {
            const roll = random(s, 6) + 1;
            note(s, `ぎってぃのダイス：${roll}（${Math.floor(roll / 2)}枚捨てる）`);
            add('diceDiscard', { count: Math.floor(roll / 2), amount: 0 });
            break;
        }
        case 'y_19':
            add('copy', { scope: 'friendly' });
            break;
        case 'y_22':
            add('heal', { amount: 2 });
            add('draw');
            break;
        case 'y_23':
            add('heal', { amount: 2 });
            break;
        case 'y_24': {
            const ids = s.players[other(side)].field.filter(id => s.cards[id].ateOn === s.turn - 1 && !s.cards[id].keywords.includes('effectImmune'));
            ids.forEach(id => destroy(s, id, true, catalog));
            if (ids.length <= 1) {
                add('pp', { amount: 1 });
                add('heal', { amount: 1 });
            }
            break;
        }
        case 'y_26':
            add('shurei');
            break;
        case 'y_27':
            add('discardThen', { text: 'oftini' });
            break;
        case 'y_29': {
            const own = p.points, enemy = s.players[other(side)].points;
            if (own > enemy) {
                points(s, side, own - enemy, 'reduce', catalog);
                heal(s, other(side), own - enemy);
            }
            else {
                points(s, other(side), enemy - own, 'reduce', catalog);
                heal(s, side, enemy - own);
            }
            break;
        }
        case 'y_30':
            add('copy', { scope: 'any' });
            break;
        case 's_0':
        case 's_1':
        case 's_2':
        case 's_3':
        case 's_4':
        case 's_5': {
            const x = new Set([...p.played, c.cardId].filter(id => catalog[id]?.sweetType === 'animal_soda')).size;
            if (x === 1)
                add('draw');
            if (x === 2)
                add('damage', { scope: 'enemy', amount: 2 });
            if (x === 3)
                add('steal', { amount: 2 });
            if (x === 4)
                add('allDamage', { scope: 'enemy', amount: 3 });
            if (x === 5)
                add('draw', { count: 3 });
            if (x === 6)
                add('steal', { amount: 5 });
            break;
        }
        case 's_6':
            add('damage', { scope: 'enemy', amount: 3 });
            if (played('s_7'))
                add('draw');
            break;
        case 's_7':
            add('damage', { scope: 'enemy', amount: 3 });
            if (played('s_6'))
                add('steal', { amount: 1 });
            break;
        case 's_8':
            add('allDamage', { scope: 'enemy', amount: 3 });
            if (played('s_6') && played('s_7')) {
                add('draw');
                add('steal', { amount: 2 });
            }
            break;
        case 's_9':
            add('damage', { scope: 'enemy', amount: played('s_10') ? 6 : 2 });
            if (!p.played.some(id => catalog[id]?.sweetType === 'float'))
                add('float');
            break;
        case 's_10':
            add(played('s_9') ? 'allDamage' : 'damage', { scope: 'enemy', amount: 2 });
            if (!p.played.some(id => catalog[id]?.sweetType === 'float'))
                add('float');
            break;
        case 's_11':
        case 's_12':
        case 's_13':
        case 's_14':
            add('doughnut', { keyword: ({ s_11: 'pierce', s_12: 'taunt', s_13: 'guard', s_14: 'fast' } as const)[c.cardId] });
            break;
        case 's_15':
        case 's_16':
        case 's_17': {
            const full = new Set([...p.played, c.cardId].filter(id => catalog[id]?.sweetType === 'cake')).size >= 3;
            if (c.cardId === 's_17' && full)
                add('allBuff', { scope: 'friendly', amount: 1, hp: 1 });
            else
                add('buff', { scope: 'friendly', amount: c.cardId === 's_16' && full ? 3 : 1, hp: c.cardId === 's_16' && full ? 3 : 1 });
            if (c.cardId === 's_15' && full)
                add('draw', { count: 2 });
            break;
        }
        case 's_18':
            add('draw', { count: 2, text: 'parfait' });
            break;
        case 's_19':
            add('heal', { amount: 3 });
            p.shield = true;
            break;
        case 's_20':
            add('buff', { scope: 'friendly', amount: 4, hp: 4, keyword: 'guard' });
            break;
        case 's_21':
            add('summon', { cardId: 'token_pudding', count: mult });
            add('heal', { amount: 2 });
            break;
        case 's_22':
            add('steal', { amount: 7 });
            break;
        case 's_23':
            add('pocky', { scope: 'friendly' });
            break;
        case 's_24':
            add('allBuff', { scope: 'friendly', amount: 1, hp: 1, keyword: 'fast' });
            break;
        case 's_25':
            p.doubleSweet = true;
            break;
        case 's_26':
            add('draw');
            add('handCost', { amount: -1 });
            break;
        case 's_27':
            add('gift');
            break;
    }
}
function options(s: GameState, catalog: Catalog, ids: string[]) { return ids.map(id => ({ id, label: catalog[s.cards[id]?.cardId ?? id]?.name ?? id })); }
function choose(s: GameState, prompt: string, ids: string[], task: Task, catalog: Catalog) { if (ids.length)
    s.pending = { prompt, options: options(s, catalog, ids), task }; }
function fieldTargets(s: GameState, t: Task) { return t.scope === 'friendly' ? s.players[t.actor].field : t.scope === 'any' ? s.players.flatMap(p => p.field) : s.players[other(t.actor)].field; }
function execute(s: GameState, t: Task, catalog: Catalog) {
    const p = s.players[t.actor], enemy = s.players[other(t.actor)], n = (t.amount ?? 0) * (t.multiplier ?? 1), source = t.source ? s.cards[t.source] : undefined;
    const targetOps = ['damage', 'buff', 'keyword', 'destroy', 'copy', 'pocky', 'pockyEnemy', 'stealUnit'];
    if (targetOps.includes(t.op) && !t.target) {
        choose(s, '対象の幼女を選んでください', fieldTargets(s, t), t, catalog);
        return;
    }
    switch (t.op) {
        case 'damage':
            hit(s, t.target!, n);
            if ((t.count ?? 1) > 1)
                s.queue.unshift({ ...t, target: undefined, count: t.count! - 1, ids: [...(t.ids ?? []), t.target!] });
            break;
        case 'allDamage':
            fieldTargets(s, t).forEach(id => hit(s, id, n));
            break;
        case 'randomDamage':
            if (enemy.field.length)
                hit(s, enemy.field[random(s, enemy.field.length)], n);
            break;
        case 'buff':
            buff(s, t.target!, n, (t.hp ?? 0) * (t.multiplier ?? 1));
            if (t.keyword)
                s.cards[t.target!].keywords.push(t.keyword);
            break;
        case 'allBuff':
            fieldTargets(s, t).forEach(id => { buff(s, id, n, (t.hp ?? 0) * (t.multiplier ?? 1)); if (t.keyword)
                s.cards[id].keywords.push(t.keyword); });
            break;
        case 'keyword':
            s.cards[t.target!].keywords = Array.from(new Set([...s.cards[t.target!].keywords, t.keyword!]));
            break;
        case 'destroy':
            destroy(s, t.target!, true, catalog);
            break;
        case 'copy': {
            const id = s.cards[t.target!].cardId;
            destroy(s, t.target!, true, catalog);
            summon(s, t.actor, id, catalog);
            break;
        }
        case 'stealUnit': {
            if (p.field.length >= 7)
                break;
            const uid = t.target!;
            enemy.field = enemy.field.filter(id => id !== uid);
            s.cards[uid].slot = openSlot(s, t.actor);
            p.field.push(uid);
            s.cards[uid].entered = s.turn;
            s.cards[uid].exhausted = false;
            entry(s, t.actor, uid, catalog, false);
            break;
        }
        case 'pocky':
            s.queue.unshift({ ...t, op: 'pockyEnemy', scope: 'enemy', target: undefined, ids: [t.target!] });
            break;
        case 'pockyEnemy':
            s.cards[t.target!].links.push(t.ids![0]);
            s.cards[t.ids![0]].links.push(t.target!);
            break;
        case 'heal':
            heal(s, t.actor, n);
            break;
        case 'reduce':
            points(s, t.scope === 'friendly' ? t.actor : other(t.actor), n, 'reduce', catalog);
            break;
        case 'steal':
            points(s, other(t.actor), n, 'steal', catalog);
            break;
        case 'pp':
            p.pp = Math.min(maxPp(s, t.actor), p.pp + n);
            break;
        case 'summon':
            for (let i = 0; i < (t.count ?? 1); i++)
                summon(s, t.actor, t.cardId!, catalog);
            break;
        case 'addHand':
            p.hand.push(makeCard(s, t.cardId!));
            break;
        case 'searchRole': {
            const found = p.yojo.filter(id => ['manager', 'assistant_manager'].includes(catalog[s.cards[id].cardId].role ?? ''));
            if (found.length) {
                const uid = found[random(s, found.length)];
                p.yojo = p.yojo.filter(id => id !== uid);
                p.hand.push(uid);
                s.cards[uid].revealed = true;
            }
            break;
        }
        case 'draw': {
            if (!t.target) {
                const kinds = t.deck ? [t.deck] : ['yojo', 'sweet'] as const;
                const reason = t.text === 'opening' ? '最初の手札' : t.text === 'turn' ? 'ターン開始' : t.text === 'threshold' ? 'お菓子ポイント到達' : 'カード効果';
                s.pending = { prompt: `${reason}：山札を押して1枚引いてください`, options: kinds.map(kind => ({ id: kind, label: `${kind === 'yojo' ? '幼女' : 'お菓子'}デッキ（${p[kind].length}枚）` })), task: t };
                break;
            }
            const kind = t.deck ?? t.target as DeckKind, uid = draw(s, t.actor, kind);
            const ids = [...(t.ids ?? []), ...(uid ? [uid] : [])];
            if (uid && t.text === 'attackIfYojo' && kind === 'yojo' && source)
                buff(s, source.uid, 1, 0);
            if (uid && t.text === 'hpIfSweet' && kind === 'sweet' && source)
                buff(s, source.uid, 0, 2);
            if (uid && t.text === 'parfait') {
                if (kind === 'yojo')
                    points(s, other(t.actor), 1, 'reduce', catalog);
                else
                    heal(s, t.actor, 1);
            }
            const total = (t.count ?? 1) * (t.multiplier ?? 1);
            if (total > 1)
                s.queue.unshift({ ...t, count: total - 1, target: undefined, ids, multiplier: 1 });
            else if (t.text === 'oftini' && ids.length === 2 && ids.every(id => catalog[s.cards[id].cardId].type === 'yojo'))
                p.pp = Math.min(maxPp(s, t.actor), p.pp + 1);
            break;
        }
        case 'discardThen':
            if (!t.target) {
                if (p.hand.length)
                    choose(s, '捨てる手札を選んでください', p.hand, t, catalog);
                else
                    continueDiscard();
            }
            else {
                discard(s, t.actor, t.target);
                continueDiscard();
            }
            break;
        case 'diceDiscard':
            if (t.target) {
                discard(s, t.actor, t.target);
                t = { ...t, target: undefined, count: (t.count ?? 0) - 1, amount: (t.amount ?? 0) + 1 };
            }
            if ((t.count ?? 0) > 0 && p.hand.length) {
                choose(s, `あと${t.count}枚捨てます（ダイス結果）`, p.hand, t, catalog);
                break;
            }
            if ((t.amount ?? 0) >= 1)
                for (let i = 0; i < 2 && enemy.hand.length; i++)
                    discard(s, other(t.actor), enemy.hand[random(s, enemy.hand.length)]);
            if ((t.amount ?? 0) >= 2 && source)
                source.keywords.push('charge');
            if ((t.amount ?? 0) >= 3)
                s.queue.unshift({ op: 'draw', actor: t.actor, count: 2 });
            break;
        case 'shurei':
            if (!t.target)
                s.pending = { prompt: 'しゅれいの効果を選んでください', options: [{ id: 'all', label: '相手全員に2ダメージ' }, { id: 'two', label: '相手2人に4ダメージ' }], task: t };
            else
                s.queue.unshift({ ...t, op: t.target === 'all' ? 'allDamage' : 'damage', amount: t.target === 'all' ? 2 : 4, count: t.target === 'all' ? 1 : 2, target: undefined, scope: 'enemy' });
            break;
        case 'doughnut':
            if (!t.target)
                choose(s, '捨てるドーナツを選んでください', p.hand.filter(id => catalog[s.cards[id].cardId].sweetType === 'doughnut'), t, catalog);
            else {
                discard(s, t.actor, t.target);
                s.queue.unshift({ ...t, op: 'keyword', scope: 'friendly', target: undefined });
            }
            break;
        case 'float':
            if (!t.target && p.hand.length)
                s.pending = { prompt: '手札を1枚除外してフロートを探しますか？', options: [{ id: 'skip', label: 'しない' }, ...options(s, catalog, p.hand)], task: t };
            else if (t.target && t.target !== 'skip') {
                p.hand = p.hand.filter(id => id !== t.target);
                p.exile.push(t.target);
                s.queue.unshift({ ...t, op: 'floatSearch', target: undefined });
            }
            break;
        case 'floatSearch':
            if (!t.target)
                choose(s, '手札に加えるフロートを選んでください', p.sweet.filter(id => catalog[s.cards[id].cardId].sweetType === 'float'), t, catalog);
            else {
                p.sweet = p.sweet.filter(id => id !== t.target);
                p.hand.push(t.target);
            }
            break;
        case 'handCost':
            if (!t.target)
                choose(s, 'コストを変更するお菓子を選んでください', p.hand.filter(id => catalog[s.cards[id].cardId].type === 'sweet' && catalog[s.cards[id].cardId].sweetType !== 'back_menu'), t, catalog);
            else {
                s.cards[t.target].revealed = true;
                if (t.text === 'temporary')
                    s.cards[t.target].temporaryCost += n;
                else
                    s.cards[t.target].costDelta += n;
            }
            break;
        case 'gift':
            if (!t.target)
                choose(s, '相手へ渡すお菓子を選んでください', p.hand.filter(id => catalog[s.cards[id].cardId].type === 'sweet' && catalog[s.cards[id].cardId].sweetType !== 'back_menu'), t, catalog);
            else {
                p.hand = p.hand.filter(id => id !== t.target);
                p.exile.push(t.target);
                const uid = makeCard(s, s.cards[t.target].cardId);
                enemy.hand.push(uid);
                s.cards[uid].revealed = true;
                p.pp = Math.min(maxPp(s, t.actor), p.pp + 2);
            }
            break;
        case 'bonusDamage':
            if (!t.target && p.pp >= 1)
                s.pending = { prompt: '追加で1PP支払いますか？', options: [{ id: 'no', label: '1ダメージ' }, { id: 'yes', label: '1PP追加・2ダメージ' }], task: t };
            else {
                if (t.target === 'yes')
                    p.pp--;
                s.queue.unshift({ op: 'damage', actor: t.actor, scope: 'enemy', amount: t.target === 'yes' ? 2 : 1 });
            }
            break;
        case 'punish': {
            const ids = enemy.field.filter(id => s.cards[id].ateOn === s.turn - 1);
            if (!t.target && ids.length)
                s.pending = { prompt: '直前にお菓子を食べた幼女を破壊', options: [...options(s, catalog, ids), ...(p.pp >= 2 ? [{ id: 'all', label: '追加2PPで全員' }] : [])], task: t };
            else if (t.target === 'all') {
                p.pp -= 2;
                ids.forEach(id => destroy(s, id, true, catalog));
            }
            else if (t.target)
                destroy(s, t.target, true, catalog);
            break;
        }
    }
    function continueDiscard() { if (t.text === 'oftini') {
        heal(s, t.actor, 2);
        s.queue.unshift({ op: 'draw', actor: t.actor, count: 2, text: 'oftini' });
    }
    else
        s.queue.unshift({ op: 'draw', actor: t.actor }); }
}
function drain(s: GameState, catalog: Catalog) {
    let limit = 0;
    settle(s, catalog);
    while (s.queue.length && !s.pending && s.winner === null) {
        if (++limit > 500)
            throw new Error('効果の解決が上限に達しました');
        const task = s.queue.shift()!;
        if (task.ids && task.op === 'damage' && !task.target) {
            const targets = fieldTargets(s, task).filter(id => !task.ids!.includes(id));
            choose(s, '別の対象を選んでください', targets, task, catalog);
        }
        else
            execute(s, task, catalog);
        settle(s, catalog);
    }
    if (s.phase === 'opening' && !s.pending && !s.queue.length && s.winner === null) {
        s.phase = 'playing';
        startTurn(s, s.rules.firstPlayer);
        if (s.rules.firstTurnDraw) {
            s.queue.push({op: 'draw', actor: s.active, deck: s.rules.turnDraw, text: 'turn'});
            drain(s, catalog);
        }
    }
    if (s.winner !== null) {
        s.pending = null;
        s.queue = [];
    }
}
export function newGame(decks: [
    Deck,
    Deck
], catalog: Catalog, rules: Rules, seed: number): GameState {
    for (const d of decks) {
        const errors = validateDeck(d, catalog);
        if (errors.length)
            throw new Error(errors.join(' / '));
    }
    const players = decks.map((d): Player => ({ name: d.name, yojo: [], sweet: [], hand: [], field: [], nap: [], exile: [], playable: d.playable, points: rules.initialPoints, maxPoints: rules.initialPoints, turns: 0, pp: 0, ppBonus: 0, nextPpDebt: 0, milestones: [], played: [], shield: false, doubleSweet: false, skills: skillsFor(d.playable).map(s => s.uses), lastBorrow: -10 })) as [
        Player,
        Player
    ];
    const s: GameState = { version: 1, phase: 'dice', dice: null, rules: { ...rules }, rng: seed >>> 0, serial: 0, revision: 0, active: rules.firstPlayer, turn: 0, players, cards: {}, queue: [], pending: null, winner: null, log: [] };
    for (const side of [0, 1] as Side[]) {
        for (const kind of ['yojo', 'sweet'] as const)
            s.players[side][kind] = shuffled(s, decks[side][kind].map(id => makeCard(s, id)));
    }
    note(s, 'ダイスを振って先攻・後攻を決めてください');
    return s;
}
function startTurn(s: GameState, side: Side) { s.active = side; s.turn++; const p = s.players[side]; p.turns++; p.pp = Math.max(0, maxPp(s, side) - p.nextPpDebt); p.nextPpDebt = 0; p.field.forEach(id => s.cards[id].exhausted = false); note(s, `${p.name}の${p.turns}ターン目`); }
export function canAttack(s: GameState, side: Side, uid: string, target: string | 'leader', catalog: Catalog): boolean {
    const p = s.players[side], c = s.cards[uid];
    if (s.phase !== 'playing' || s.active !== side || s.pending || s.winner !== null || !p.field.includes(uid) || !c || c.exhausted || c.keywords.includes('immobile') || attackOf(c, catalog) <= 0)
        return false;
    if (c.entered === s.turn && !c.keywords.includes('fast') && !(target !== 'leader' && c.keywords.includes('charge')))
        return false;
    const enemy = s.players[other(side)];
    if (target === 'leader')
        return !c.keywords.includes('noEat') && (!(enemy.field.some(id => s.cards[id].keywords.includes('taunt'))) || (s.rules.pierceIgnoresTaunt && c.keywords.includes('pierce')));
    if (!enemy.field.includes(target))
        return false;
    const guards = enemy.field.filter(id => s.cards[id].keywords.includes('guard'));
    return !s.rules.guardBlocksUnits || !guards.length || guards.includes(target) || c.keywords.includes('pierce');
}
export function applyCommand(previous: GameState, command: Command, catalog: Catalog, allowAdjust = false): Result {
    const s: GameState = JSON.parse(JSON.stringify(previous));
    try {
        const p = s.players[command.actor];
        if (s.winner !== null)
            throw new Error('この対戦は終了しています');
        if (command.type === 'roll') {
            if (s.phase !== 'dice') throw new Error('手番は既に決まっています');
            const rolls: [number, number] = [random(s, 6) + 1, random(s, 6) + 1];
            s.dice = {rolls, ties: (s.dice?.ties ?? 0) + (rolls[0] === rolls[1] ? 1 : 0)};
            note(s, `ダイス：${s.players[0].name} ${rolls[0]} / ${s.players[1].name} ${rolls[1]}`);
            if (rolls[0] === rolls[1]) note(s, '同じ目なので、もう一度振ってください');
            else {
                s.rules.firstPlayer = rolls[0] > rolls[1] ? 0 : 1;
                s.active = s.rules.firstPlayer;
                s.phase = 'opening';
                note(s, `${s.players[s.active].name}が先攻です。最初の手札を引いてください`);
                for (const side of [s.active, other(s.active)]) {
                    if (s.rules.initialYojo) s.queue.push({op: 'draw', actor: side, deck: 'yojo', count: s.rules.initialYojo, text: 'opening'});
                    if (s.rules.initialSweet) s.queue.push({op: 'draw', actor: side, deck: 'sweet', count: s.rules.initialSweet, text: 'opening'});
                }
            }
        }
        else if (command.type === 'adjust' || command.type === 'draw') {
            if (!allowAdjust)
                throw new Error('テスト操作は両側操作モードで利用できます');
            if (s.pending)
                throw new Error('効果の選択を先に完了してください');
            if (command.type === 'draw')
                draw(s, command.actor, command.deck);
            else if (command.resource === 'damage') {
                if (!command.uid || !p.field.includes(command.uid))
                    throw new Error('場のカードを指定してください');
                s.cards[command.uid].damage = Math.max(0, s.cards[command.uid].damage + command.delta);
            }
            else if (command.resource === 'points') {
                if (command.delta < 0)
                    points(s, command.actor, -command.delta, 'reduce', catalog);
                else
                    heal(s, command.actor, command.delta);
            }
            else if (command.resource === 'ppBonus') {
                p.ppBonus = Math.max(-p.turns, p.ppBonus + command.delta);
                p.pp = Math.min(p.pp, maxPp(s, command.actor));
            }
            else
                p.pp = Math.max(0, Math.min(maxPp(s, command.actor), p.pp + command.delta));
        }
        else if (command.type === 'choose') {
            if (!s.pending || s.pending.task.actor !== command.actor || !s.pending.options.some(o => o.id === command.option))
                throw new Error('この選択はできません');
            const t = s.pending.task;
            s.pending = null;
            s.queue.unshift({ ...t, target: command.option });
        }
        else {
            if (s.phase !== 'playing') throw new Error('ダイスと最初のドローを完了してください');
            if (s.active !== command.actor)
                throw new Error('相手のターンです');
            if (s.pending)
                throw new Error('効果の選択を先に完了してください');
            if (command.type === 'play') {
                if (!p.hand.includes(command.uid))
                    throw new Error('そのカードは手札にありません');
                const c = s.cards[command.uid], d = catalog[c.cardId], cost = costOf(s, c.uid, catalog, command.actor);
                if (cost > p.pp)
                    throw new Error('PPが足りません');
                if (d.type === 'yojo' && p.field.length >= 7)
                    throw new Error('場は7人までです');
                p.pp -= cost;
                p.hand = p.hand.filter(id => id !== c.uid);
                note(s, `${p.name}：「${d.name}」をプレイ（${cost}PP）`);
                if (d.type === 'yojo') {
                    const slot = command.slot ?? openSlot(s, command.actor);
                    if (!Number.isInteger(slot) || slot < 0 || slot > 6 || p.field.some(id => s.cards[id].slot === slot)) throw new Error('空いている場を選んでください');
                    c.slot = slot;
                    c.entered = s.turn;
                    p.field.push(c.uid);
                    entry(s, command.actor, c.uid, catalog, true);
                    for (const hand of p.hand)
                        if (s.cards[hand].cardId === 's_24' && s.cards[hand].revealed)
                            s.cards[hand].costDelta--;
                }
                else {
                    p.nap.push(c.uid);
                    cardEffect(s, command.actor, c.uid, catalog);
                    if (d.sweetType !== 'back_menu')
                        p.field.filter(id => s.cards[id].cardId === 'y_3').forEach(id => s.cards[id].shield = true);
                }
                p.played.push(c.cardId);
            }
            else if (command.type === 'attack') {
                if (!canAttack(s, command.actor, command.uid, command.target, catalog))
                    throw new Error('その対象には攻撃できません');
                const c = s.cards[command.uid];
                c.exhausted = true;
                if (c.cardId === 'y_20' && points(s, other(command.actor), 2, 'eat', catalog) > 0)
                    c.ateOn = s.turn;
                if (c.cardId === 'y_21') {
                    if (command.target !== 'leader')
                        hit(s, command.target, 3);
                    heal(s, command.actor, 1);
                    settle(s, catalog);
                }
                if (command.target === 'leader') {
                    if (points(s, other(command.actor), attackOf(c, catalog), 'eat', catalog, c.keywords.includes('pierce') && s.rules.pierceIgnoresTaunt) > 0)
                        c.ateOn = s.turn;
                    note(s, `${catalog[c.cardId].name}がお菓子を食べました`);
                }
                else if (p.field.includes(c.uid) && s.players[other(command.actor)].field.includes(command.target)) {
                    const target = s.cards[command.target], a = attackOf(c, catalog), b = attackOf(target, catalog);
                    hit(s, command.target, a, false);
                    hit(s, c.uid, b, false);
                    note(s, `${catalog[c.cardId].name}が${catalog[target.cardId].name}を攻撃`);
                }
            }
            else if (command.type === 'end') {
                p.hand.forEach(id => s.cards[id].temporaryCost = 0);
                startTurn(s, other(command.actor));
                s.queue.push({op: 'draw', actor: s.active, deck: s.rules.turnDraw, text: 'turn'});
            }
            else if (command.type === 'reveal') {
                if (!p.hand.includes(command.uid) || s.cards[command.uid].cardId !== 's_24')
                    throw new Error('公開できるカードではありません');
                s.cards[command.uid].revealed = true;
            }
            else if (command.type === 'skill')
                activateSkill(s, command.actor, command.index, catalog);
        }
        drain(s, catalog);
        s.revision++;
        return { state: s };
    }
    catch (error) {
        return { state: previous, error: error instanceof Error ? error.message : '操作できません' };
    }
}
function activateSkill(s: GameState, side: Side, index: number, catalog: Catalog) {
    const p = s.players[side], skill = skillsFor(p.playable)[index];
    if (!skill || p.skills[index] <= 0)
        throw new Error('スキルの残り回数がありません');
    if (skill.cost > p.pp)
        throw new Error('PPが足りません');
    if (index === 0 && !p.field.length)
        throw new Error('突撃を付与する幼女が場にいません');
    if (p.playable === 'p_0' && index === 2 && maxPp(s, side) < 7)
        throw new Error('最大PPが7以上必要です');
    if (p.playable === 'p_2' && index === 1 && p.lastBorrow >= p.turns - 1)
        throw new Error('2ターン連続では使えません');
    p.pp -= skill.cost;
    p.skills[index]--;
    note(s, `${p.name}：${skill.name}`);
    const add = (op: string, extra: Partial<Task> = {}) => s.queue.push({ op, actor: side, ...extra });
    if (index === 0) {
        add('keyword', { scope: 'friendly', keyword: 'charge' });
        return;
    }
    switch (p.playable) {
        case 'p_0':
            p.ppBonus++;
            if (index === 1)
                add('handCost', { amount: -2, text: 'temporary' });
            else {
                add('randomDamage', { amount: 2 });
                add('draw');
            }
            break;
        case 'p_1':
            if (index === 3)
                add('bonusDamage');
            else
                add('damage', { scope: 'enemy', amount: index });
            break;
        case 'p_2':
            p.pp += 2;
            p.nextPpDebt += 2;
            p.lastBorrow = p.turns;
            break;
        case 'p_3':
            if (index === 1) {
                heal(s, side, 1);
                p.skills[0]++;
            }
            else if (index === 2) {
                heal(s, side, 1);
                if (p.field.length)
                    s.cards[p.field[random(s, p.field.length)]].keywords.push('guard');
            }
            else {
                p.maxPoints += 3;
                heal(s, side, 3);
            }
            break;
        case 'p_4':
            if (index === 1)
                add('allBuff', { scope: 'friendly', amount: p.field.length <= 2 ? 2 : 1, hp: p.field.length <= 2 ? 2 : 1 });
            else
                add('punish');
            break;
        case 'p_5':
            if (index === 1) {
                points(s, side, 2, 'reduce', catalog);
                add('stealUnit', { scope: 'enemy' });
            }
            else
                add('draw', { count: 2, deck: 'yojo' });
            break;
    }
}
