// Checks each card's script against the wording of its printed text, so a whole class of
// mistakes (wrong trigger timing, missing keyword, wrong use limit) fails here instead of in play.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extendedPlayables, playableMp, playableNow, playablePassives, scriptOf, skillsFor } from '../dist/index.js';
import { catalog } from './helpers.mjs';

const units = Object.values(catalog).filter(c => c.type === 'yojo' && (c.fruit === 'strawberry' || c.id.startsWith('yt_')));
const printedKeywords = { 挑発: 'taunt', 防衛: 'guard', 早食い: 'fast', 突撃: 'charge', 貫通: 'pierce' };

/** Keywords the text opens with (「早食い。挑発。…」). Conditional ones later in the text do not count. */
function leadingKeywords(text) {
  const found = [];
  for (const sentence of text.split('。')) {
    if (!(sentence in printedKeywords)) break;
    found.push(printedKeywords[sentence]);
  }
  return found.sort();
}

// Hook → wording that calls for it. Each hook must be used exactly when its wording is printed.
const timings = {
  // 「この幼女が手札から場に出たとき」だけ。条件付きの常在能力（まこぽに）や、さらの複製で出たときには使わない。
  onPlay: /この幼女が手札から場に出たとき/,
  // 手札からに限らない登場時（がと）と、場の状況による自身の能力変化（まこぽに）。
  onEnter: /この幼女が場に出たとき|が自分の場にいるならば、.*この幼女を[+＋]/,
  onAllyEnter: /この幼女が自分の場にいる(ならば|状態で)、.*場に出た/,
  onDestroyed: /この幼女が破壊されたとき/,
  onDiscarded: /手札から直接お昼寝場所に捨てられたとき/,
  onAttack: /攻撃時/,
  onOwnerPlayed: /お菓子カードをプレイしたならば/,
  onDrawn: /引いたカード|からカードを引いたならば/,
};

for (const card of units) {
  test(`card text: ${card.id} ${card.name} uses the hooks and keywords its text describes`, () => {
    const script = scriptOf(card.id);
    for (const [hook, wording] of Object.entries(timings)) {
      assert.equal(typeof script[hook] === 'function', wording.test(card.effect), `${hook}: ${card.effect}`);
    }
    const own = (script.keywords ?? []).filter(k => Object.values(printedKeywords).includes(k)).sort();
    assert.deepEqual(own, leadingKeywords(card.effect));
  });
}

// The other fruits write most effects as steps of one `effect` function, so only the hooks that say
// WHEN something happens are compared, and the keywords the text opens with.
const laterUnits = Object.values(catalog).filter(c => c.type === 'yojo' && c.fruit !== 'strawberry' && playableNow.fruits.includes(c.fruit));
const laterKeywords = { ...printedKeywords, かくれんぼ: 'hide' };
// Text in 「」 is an effect given to another unit or a condition about other cards (リマチャン, えーりん,
// ぶらんちゃん), not this card's own timing.
const own = text => text.replace(/「[^」]*」/g, '');
const laterTimings = {
  onPlay: text => /この幼女が手札から場に出た(とき|時)/.test(own(text)),
  onEnter: text => /この幼女が場に出た(とき|時)/.test(own(text)),
  onDestroyed: text => /この幼女が(相手幼女からの攻撃で)?破壊された(とき|時)/.test(own(text)),
  // 「相手幼女の攻撃時」 is a reaction from the hand, 「被攻撃時」 is the defender's.
  onAttack: text => /攻撃時/.test(own(text).replace(/被攻撃時|相手幼女の攻撃時/g, '')),
  onDefend: text => /被攻撃時/.test(own(text)),
  // 「ターン終了時まで」 is how long something lasts (ちょり, レンス), not a trigger.
  onTurnEnd: text => /ターン終了時(?!まで)/.test(own(text)),
};
// What happens in the combat itself is written as 攻撃時 / 被攻撃時 but done by the combat step:
// damage taken (しゅお) and no damage taken back (とここ).
const combatHooks = { onAttack: ['onCombatDamage', 'unharmedAttacking'], onDefend: ['onCombatDamage'] };
const hasHook = (script, hook) => typeof script[hook] === 'function' || (combatHooks[hook] ?? []).some(other => script[other] !== undefined);
/** 「早食い。挑発。」「おにごっこ(1d6≧5)。」「色おに（オレンジ）。」 at the start of the text. */
function openingAbilities(text) {
  const found = [];
  for (const sentence of text.split('。')) {
    if (sentence in laterKeywords) found.push(laterKeywords[sentence]);
    else if (/^おにごっこ[（(]/.test(sentence)) found.push('evade');
    else if (/^色おに[（(]/.test(sentence)) found.push('color');
    else break;
  }
  return found.sort();
}
const openingOf = keywords => keywords.map(k => k.startsWith('color') ? 'color' : k).filter(k => [...Object.values(laterKeywords), 'evade', 'color'].includes(k)).sort();

for (const card of laterUnits) {
  test(`card text: ${card.id} ${card.name}（${card.fruit}） uses the hooks and keywords its text describes`, () => {
    const script = scriptOf(card.id);
    for (const [hook, described] of Object.entries(laterTimings)) {
      assert.equal(hasHook(script, hook), described(card.effect), `${hook}: ${card.effect}`);
    }
    assert.deepEqual(openingOf(script.keywords ?? []), openingAbilities(card.effect));
  });
}

test('card text: every implemented sweet does something when played', () => {
  for (const card of Object.values(catalog).filter(c => c.type === 'sweet' && c.fruit === 'strawberry')) {
    assert.equal(typeof scriptOf(card.id).onPlay, 'function', `${card.id} ${card.name}`);
  }
});

test('card text: skill costs and use limits match the playable cards', () => {
  for (const id of ['p_0', 'p_1', 'p_2', 'p_3', 'p_4', 'p_5']) {
    const lines = catalog[id].effect.split('\n').filter(line => /スキル\d/.test(line));
    const skills = skillsFor(id);
    assert.equal(skills.length, lines.length, id);
    lines.forEach((line, index) => {
      const cost = Number(line.match(/コスト(\d+)/)[1]), uses = Number(line.match(/使用回数制限(\d+)回/)[1]);
      assert.deepEqual([skills[index].cost, skills[index].uses], [cost, uses], `${id} ${line}`);
    });
  }
});

// 拡張プレイアブル: a cost may be in MP (消費MP), a line may state no cost (a reaction: 0) or no use
// limit (none), and the card has lines that are not skills: its MP and its 固有パッシブスキル.
test('card text: 拡張プレイアブル skills, passives and MP match the playable cards', () => {
  const number = (line, wording) => { const found = line.match(wording); return found ? Number(found[1]) : undefined; };
  for (const id of extendedPlayables) {
    const all = catalog[id].effect.split('\n');
    const lines = all.filter(line => /スキル\d/.test(line)), skills = skillsFor(id);
    assert.equal(skills.length, lines.length, id);
    lines.forEach((line, index) => {
      const skill = skills[index];
      assert.deepEqual([skill.cost, skill.mp, skill.uses], [number(line, /コスト(\d+)/) ?? 0, number(line, /消費MP(\d+)/), number(line, /使用回数制限(\d+)回/)], `${id} ${line}`);
      assert.ok(line.includes(`【${skill.name}】`), `${id} ${skill.name}: ${line}`);
      // 「相手ターン中、〜とき」 is used in answer to the opponent, not on the owner's turn.
      assert.equal(!!skill.reaction, /相手ターン中/.test(line), `${id} ${line}`);
    });
    const passive = all.find(line => /パッシブスキル/.test(line));
    assert.equal(passive?.match(/【(.+?)】/)?.[1], playablePassives[id]?.name, `${id} パッシブ`);
    const mp = [number(catalog[id].effect, /初期MP(\d+)/), number(catalog[id].effect, /最大MP(\d+)/)];
    assert.deepEqual([playableMp[id]?.initial, playableMp[id]?.max], mp, `${id} MP`);
    // Every line of the card is one of the three.
    assert.equal(all.length, lines.length + (passive ? 1 : 0) + mp.filter(n => n !== undefined).length, id);
  }
});
