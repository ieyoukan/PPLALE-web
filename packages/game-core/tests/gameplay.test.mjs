import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { arena, catalog } from './helpers.mjs';
import { applyCommand, keywords, MAX_PP } from '../dist/index.js';
import { cpuCommand, cpuStrategies, legalMoves } from '../dist/ai/index.js';
import { describeGame, describeCard, describeRules, listCommandDefinitions, legalActions, inspectActions,
  enumerateActionLines, bindDecision, actionCost } from '../dist/gameplay/index.js';
import { observeDecision, researchCatalog } from '../dist/research/index.js';
import { cardAllowedInMatch, defaultMatchRules, playableNow } from '../dist/rules.js';
import { FIELD_SIZE } from '../dist/core/zones.js';
import { actingSides as ruleActors, actionCost as ruleCost } from '../dist/core/actions.js';
import { createGameController } from '../scripts/gameplay.mjs';

test('gameplay: shared rules and observations do not depend on research modules', () => {
  const source = new URL('../src/', import.meta.url);
  const files = readdirSync(source, { recursive: true }).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    if (!/^(core|cards|commands|effects|playables|gameplay)\//.test(file) && !['model.ts', 'setup.ts', 'rules.ts'].includes(file)) continue;
    const imports = [...readFileSync(new URL(file, source), 'utf8').matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)].map(match => match[1]);
    assert.ok(imports.every(path => !path.includes('/research/')), `${file} must not depend on research`);
    if (file.startsWith('core/') || ['model.ts', 'setup.ts', 'rules.ts'].includes(file))
      assert.ok(imports.every(path => !path.includes('/gameplay/')), `${file} must not depend on the gameplay API`);
  }
});

test('gameplay: rules, keyword vocabulary, cards and commands form one JSON description', () => {
  const description = describeGame(catalog);
  assert.equal(description.rules.limits.maxPp, MAX_PP);
  assert.equal(description.rules.limits.field, FIELD_SIZE);
  assert.equal(description.rules.limits.endTurnHand, 9);
  assert.deepEqual(description.rules.points.thresholdDraws.map(draw => draw.points), [10, 5]);
  assert.deepEqual(description.rules.abilities.map(ability => ability.id), keywords);
  assert.equal(description.cards.length, Object.keys(catalog).length);
  assert.equal(JSON.parse(JSON.stringify(description)).cards.length, description.cards.length);
  assert.equal(listCommandDefinitions().some(definition => definition.sandbox), false);
  assert.deepEqual(listCommandDefinitions(true).filter(definition => definition.sandbox).map(definition => definition.type).sort(), ['adjust', 'draw']);
  assert.equal(description.commands.find(definition => definition.type === 'play').fields.uid.kind, 'card-reference');
  assert.equal(describeRules({ initialPoints: 15, initialYojo: 2, initialSweet: 2, firstPlayer: 1, turnDraw: 'sweet' }).setup.opening.second, 5);
});

test('gameplay: all printed facts, skills and deck eligibility are enumerable without annotations', () => {
  for (const id of Object.keys(catalog)) {
    const card = describeCard(catalog, id);
    assert.equal(card.name, catalog[id].name);
    assert.equal(card.effect, catalog[id].effect ?? '');
    assert.equal(card.deck.allowed, cardAllowedInMatch(catalog, id, playableNow));
  }
  const playable = describeCard(catalog, 'p_0');
  assert.equal(playable.implementation.registered, true);
  assert.equal(playable.skills[0].index, 0);
  assert.ok(playable.skills.length > 1);
  assert.equal(researchCatalog(catalog).p_0.implemented, true);
  assert.equal(describeCard(catalog, 's_24', defaultMatchRules).deck.allowed, true);
  assert.equal(describeCard(catalog, 's_24').deck.allowed, false);
  const future = { ...catalog, future: { id: 'future', name: '未来', type: 'yojo', fruit: 'future', cost: 1, attack: 2, hp: 3, effect: '新しい効果', role: '未来の役割' } };
  assert.equal(describeCard(future, 'future').role, '未来の役割');
  assert.equal(describeCard(future, 'future').effect, '新しい効果');
});

test('gameplay: the CPU and engine share legal actions, costs and rejection reasons', () => {
  assert.equal(legalActions, legalMoves);
  assert.equal(actionCost, ruleCost);
  const s = arena({ me: { hand: ['s_6', 'y_0'], pp: 1 } });
  const inspected = inspectActions(s, 0, catalog);
  assert.match(inspected.find(a => a.command.type === 'play' && a.command.uid === s.players[0].hand[0]).error, /PP/);
  const playable = legalActions(s, 0, catalog).find(a => a.command.type === 'play');
  assert.equal(actionCost(s, playable.command, catalog).pp, 1);
  const diagnostics = observeDecision(s, 0, catalog, undefined, { diagnostics: true }).observation;
  assert.equal(diagnostics.unavailable.find(a => a.source === '0.hand.0').cost.pp, catalog.s_6.cost);
  assert.doesNotMatch(JSON.stringify(diagnostics), /"c\d+"/);
  assert.equal(diagnostics.actions.find(a => a.type === 'play').cost.pp, 1);
  assert.deepEqual(ruleActors(s), [0]);
});

test('gameplay: optional revealing on the opponent turn is legal and does not transfer priority', () => {
  const s = arena({ foe: { hand: ['y_148'] } });
  const actions = legalActions(s, 1, catalog);
  assert.deepEqual(actions.map(a => a.command.type), ['reveal']);
  assert.equal(actions[0].next.active, s.active);
  assert.equal(actions[0].next.cards[s.players[1].hand[0]].revealed, true);
});

test('gameplay: action lines enumerate follow-up targets and stop at limits or opponent responses', () => {
  const s = arena({ me: { hand: ['y_9'] }, foe: { field: ['y_0', 'y_8'] } });
  const uid = s.players[0].hand[0];
  const lines = enumerateActionLines(s, 0, catalog, { source: uid, types: ['play'] });
  assert.equal(lines.lines.length, 2);
  assert.equal(lines.truncated, false);
  assert.ok(lines.lines.every(line => line.status === 'resolved' && line.commands.length === 2));
  assert.deepEqual(lines.lines.map(line => line.commands[1].option).sort(), [...s.players[1].field].sort());
  assert.equal(enumerateActionLines(s, 0, catalog, { source: uid, maxNodes: 1 }).truncated, true);
  assert.throws(() => enumerateActionLines(s, 0, catalog, { maxDepth: 0 }), /limits/);
  const reacting = arena({ me: { hand: ['y_9'] }, foe: { hand: ['y_109', 'y_0', 's_19'] } });
  const response = enumerateActionLines(reacting, 0, catalog, { source: reacting.players[0].hand[0] });
  assert.equal(response.lines[0].status, 'other-player-choice');
});

test('gameplay: decision IDs bind offered actions to the exact state and reject stale or forged choices', () => {
  const s = arena({ me: { hand: ['y_0'] } }), decision = bindDecision(s, 0, catalog);
  const action = decision.input.observation.actions.find(a => a.type === 'play');
  const selection = { decisionId: decision.input.decisionId, actionId: action.id };
  const command = decision.command(s, selection);
  decision.input.observation.actions.reverse(); // Public JSON cannot alter the captured action map.
  assert.equal(decision.command(s, selection).uid, s.players[0].hand[0]);
  command.uid = 'forged';
  assert.notEqual(decision.command(s, selection).uid, 'forged');
  const result = decision.apply(s, selection);
  assert.equal(result.error, undefined);
  assert.throws(() => decision.command(result.state, selection), /Stale/);
  assert.throws(() => decision.command(structuredClone(s), selection), /Stale/);
  assert.throws(() => decision.command(s, { ...selection, actionId: 'candidate.0' }), /not offered/);
});

test('gameplay: CPU policies consume JSON observations and choose offered IDs', () => {
  const s = arena({ me: { hand: ['y_0'] }, foe: { hand: ['y_25'] } });
  const command = cpuCommand(s, catalog, { side: 0, policy(input) {
    assert.equal(input.observation.cards.find(c => c.ref === '1.hand.0').cardId, null);
    return { decisionId: input.decisionId, actionId: input.observation.actions.find(a => a.type === 'play').id };
  } });
  assert.equal(command.type, 'play');
  assert.equal(applyCommand(s, command, catalog).error, undefined);
  assert.throws(() => cpuCommand(s, catalog, { side: 0, policy: input => ({ decisionId: input.decisionId, actionId: 'invented' }) }), /not offered/);
  assert.throws(() => cpuCommand(s, catalog, { side: 0, strategy: { ...cpuStrategies.normal,
    choose: d => ({ next: d.state, command: { type: 'adjust', actor: 0, resource: 'points', delta: 100 } }) } }), /offered/);
});

test('gameplay: protocol preserves priority, rejects stale requests and continues after errors', () => {
  const control = createGameController(catalog);
  assert.equal(control({ op: 'describe', cardId: 'y_9' }).name, catalog.y_9.name);
  assert.throws(() => control({ op: 'new', rules: [] }), /object/);
  const initial = control({ op: 'new', seed: 17 });
  const input = initial.decision, first = input.observation.actions[0];
  const selection = { op: 'act', viewer: input.viewer, decisionId: input.decisionId, actionId: first.id };
  const moved = control(selection);
  assert.equal(moved.decision.revision, input.revision + 1);
  assert.throws(() => control(selection), /Stale/);
  assert.equal(control({ op: 'observe' }).decision.revision, moved.decision.revision);
  moved.decision.observation.actions.push({ id: 'invented' });
  assert.equal(control({ op: 'observe' }).decision.observation.actions.some(a => a.id === 'invented'), false);
  for (let i = 0; i < 35; i++) control({ op: 'cpu', level: 'normal' });
  assert.equal(control({ op: 'observe' }).decision.observation.phase, 'playing');
});
