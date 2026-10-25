import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { arena, catalog, choose, playFirst } from './helpers.mjs';
import { legalMoves, spawnCard } from '../dist/index.js';
import { createResearchEvaluator, createValueEvaluator, valueFeatures, valueModel, parsePooledValueModel, pooledLogit } from '../dist/ai/index.js';
import { RESEARCH_VERSION, encodeFeatures, encodeObservation, fingerprintData, observeDecision, observeGame,
  researchCard, researchCatalog, researchSchema, observeState, createPoolEncoder, poolSpec, poolNames } from '../dist/research/index.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const pythonPath = path.join(root, 'research/cpu');
const profiles = researchCatalog(catalog);
const digest = value => createHash('sha256').update(fingerprintData(value)).digest('hex');
const fixture = () => arena({ me: { field: ['y_3', 'y_9'], hand: ['s_6', 'y_15'], points: 8 }, foe: { field: ['y_8'], hand: ['y_0'], points: 3 } });
const python = (code, input, args = []) => {
  const result = spawnSync('python3', ['-c', `import sys,json;sys.path.insert(0,sys.argv[1]);${code}`, pythonPath, ...args],
    { input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  return JSON.parse(result.stdout);
};

test('research: pooled cards are order invariant, private, and numerically identical in Python', () => {
  const s = fixture(), observation = observeState(s, 0, catalog), spec = poolSpec(), encode = createPoolEncoder(profiles, spec);
  assert.deepEqual(observation.actions, []);
  assert.deepEqual({ ...observeGame(s, 0, catalog), actions: [] }, observation);
  const vector = [...encode(observation)];
  assert.equal(vector.length, poolNames(spec).length);
  assert.deepEqual([...encode({ ...observation, cards: [...observation.cards].reverse() })], vector);
  const result = python('from pooling import PoolEncoder;d=json.load(sys.stdin);print(json.dumps(PoolEncoder(d["catalog"],d["spec"])(d["observation"])))',
    { catalog: profiles, spec, observation });
  assert.deepEqual(result, vector);
  s.cards[s.players[1].hand[0]].cardId = 'y_25';
  s.rng = 999;
  s.players[0].yojo.reverse();
  assert.deepEqual([...encode(observeState(s, 0, catalog))], vector);
});

test('research: pooled model dimensions and finite parameters are checked before inference', () => {
  const spec = poolSpec(), inputs = poolNames(spec).length;
  const model = { version: 'pplale-pooled-value-v1', kind: 'mlp', spec, inputs, hidden: 1,
    mean: Array(inputs).fill(0), scale: Array(inputs).fill(1), valueScale: 100,
    weights: { w1: Array.from({ length: inputs }, (_, i) => [i === 0 ? 2 : 0]), b1: [0.25], w2: [3], b2: -0.1 } };
  const parsed = parsePooledValueModel(model), x = Array(inputs).fill(0); x[0] = 0.5;
  assert.equal(pooledLogit(parsed, x), Math.tanh(1.25) * 3 - 0.1);
  assert.throws(() => parsePooledValueModel({ ...model, inputs: 1 }), /Incompatible/);
  assert.throws(() => parsePooledValueModel({ ...model, weights: { ...model.weights, w2: [NaN] } }), /Invalid/);
});

test('research: legacy model inputs and evaluations match the pre-refactor baseline exactly', () => {
  const expected = [
    ['86c9ad77b5c4e2d09a150c1c7c8598f605956c6fce886e91ab1d2ad78ed2e068', 85.02824077173759],
    ['beebd84894464ba3d7a7216da07e15f411ca7e50561e070cec465e7068fdc401', 229.0569612280205],
  ];
  [arena(), fixture()].forEach((state, index) => {
    const hash = createHash('sha256').update(JSON.stringify([...valueFeatures(state, catalog)])).digest('hex');
    assert.equal(hash, expected[index][0]);
    assert.equal(createValueEvaluator(valueModel)(state, 0, catalog), expected[index][1]);
  });
});

test('research: card facts and semantic annotations stay separate from execution and scores', () => {
  const c = researchCard(catalog, 's_6');
  assert.equal(c.coverage, 'complete');
  assert.equal(c.cost, catalog.s_6.cost);
  assert.equal(c.effects[0].amount, 3);
  assert.deepEqual(c.effects[1].condition, { kind: 'played', cards: ['s_7'] });
  assert.equal(researchCard(catalog, 'y_0').coverage, 'unannotated');
  assert.ok(researchCard(catalog, 'y_0').hooks.includes('onPlay'));
  assert.deepEqual(profiles.y_4.keywords, ['charge']);
  assert.equal('imageUrl' in c, false);
  c.effects[0].amount = 99;
  assert.equal(researchCard(catalog, 's_6').effects[0].amount, 3);
});

test('research: a fixed effect descriptor agrees with actual engine resolution', () => {
  const state = arena({ me: { hand: ['y_9'] }, foe: { field: ['y_8'] } });
  const target = state.players[1].field[0];
  state.cards[target].hpBonus = 10; // Keep the target alive; moving to nap resets its damage.
  const result = choose(playFirst(state, 'y_9'), target);
  assert.equal(result.cards[target].damage - state.cards[target].damage, profiles.y_9.effects[0].amount);
});

test('research: per-card current values and relations survive without changing printed definitions', () => {
  const s = fixture(), uid = s.players[0].field[0];
  Object.assign(s.cards[uid], { attackBonus: 2, hpBonus: 3, damage: 1, links: [s.players[1].field[0]], immobileUntil: s.turn });
  s.cards[s.players[0].hand[0]].costDelta = -1;
  const before = JSON.stringify(s), obs = observeGame(s, 0, catalog);
  const card = obs.cards.find(c => c.ref === '0.field.0');
  assert.equal(card.current.attack, catalog.y_3.attack + 2);
  assert.equal(card.current.hp, catalog.y_3.hp + 2);
  assert.deepEqual(card.current.links, ['1.field.0']);
  assert.equal(card.current.immobile, true);
  assert.equal(profiles.y_3.attack, catalog.y_3.attack);
  assert.equal(obs.cards.find(c => c.ref === '0.hand.0').current.cost, catalog.s_6.cost - 1);
  assert.equal(JSON.stringify(s), before);
});

test('research: hidden identities, deck order, RNG, queue and engine uids do not enter observations', () => {
  const a = fixture(), b = structuredClone(a);
  b.cards[b.players[1].hand[0]].cardId = 'y_25';
  b.players[0].yojo.reverse(); b.players[1].sweet.reverse();
  b.rng = 987654; b.log = ['PRIVATE'];
  b.queue.push({ op: 'draw', actor: 1, cardId: 'PRIVATE' });
  const observation = observeGame(a, 0, catalog);
  assert.deepEqual(observeGame(b, 0, catalog), observation);
  assert.equal(observation.cards.find(c => c.ref === '1.hand.0').cardId, null);
  assert.equal(observation.cards.find(c => c.ref === '1.hand.0').current, null);
  assert.doesNotMatch(JSON.stringify(observation), /"c\d+"|PRIVATE|"rng"|"queue"/);
  a.cards[a.players[1].hand[0]].revealed = true;
  assert.equal(observeGame(a, 0, catalog).cards.find(c => c.ref === '1.hand.0').cardId, 'y_0');
});

test('research: viewer is always side zero, including opponents and public pending choices', () => {
  const s = fixture();
  const obs = observeGame(s, 1, catalog);
  assert.equal(obs.active, 1);
  assert.equal(obs.players[0].points, s.players[1].points);
  assert.equal(obs.cards.find(c => c.ref === '0.hand.0').cardId, 'y_0');
  assert.equal(obs.cards.find(c => c.ref === '1.hand.0').cardId, null);
  assert.deepEqual(obs.actions, []);
  s.pending = { task: { op: 'playResponse', actor: 1, source: s.players[1].hand[0] }, options: [], prompt: 'PRIVATE' };
  const pending = observeGame(s, 0, catalog);
  assert.equal(pending.cards.find(c => c.ref === '1.hand.0').cardId, 'y_0');
  assert.equal(pending.pending.source, '1.hand.0');
  assert.equal('prompt' in pending.pending, false);
});

test('research: chosen actions and card targets use observation-local references', () => {
  const s = fixture(), attack = legalMoves(s, 0, catalog).find(m => m.command.type === 'attack');
  const { observation, selectedAction } = observeDecision(s, 0, catalog, attack.command);
  assert.equal(observation.actions[selectedAction].type, 'attack');
  assert.match(observation.actions[selectedAction].source, /^0\.field\./);
  assert.throws(() => observeDecision(s, 0, catalog, { type: 'play', actor: 0, uid: 'nonexistent' }), /not a legal/);
  const choosing = playFirst(s, 's_6');
  const choice = legalMoves(choosing, 0, catalog)[0].command;
  const result = observeDecision(choosing, 0, catalog, choice);
  assert.equal(result.observation.actions[result.selectedAction].option, 'option.0');
  assert.equal(result.observation.pending.options[0].card, '1.field.0');
});

test('research: zero, missing and new categories remain distinguishable; invalid numbers fail', () => {
  const spec = [{ name: 'n', path: ['n'], kind: 'number', scale: 10 }];
  assert.deepEqual(encodeFeatures({ n: 0 }, spec).known, [true]);
  assert.deepEqual(encodeFeatures({ n: null }, spec).known, [false]);
  assert.throws(() => encodeFeatures({ n: NaN }, spec), /Non-finite/);
  assert.throws(() => encodeFeatures({ n: true }, spec), /Expected number/);
  assert.throws(() => encodeFeatures({}, [{ ...spec[0], scale: 0 }]), /scale/);
  assert.throws(() => encodeFeatures({}, [spec[0], spec[0]]), /Duplicate/);
  assert.throws(() => encodeFeatures({}, [{ ...spec[0], kind: 'unsupported' }]), /Unknown feature kind/);
  const category = [{ name: 'fruit:strawberry', path: ['fruit'], kind: 'equals', value: 'strawberry', scale: 1 }];
  assert.deepEqual(encodeFeatures({ fruit: 'new-fruit' }, category), { values: [0], known: [false], unmapped: { fruit: ['new-fruit'] } });
});

test('research: a new card gets facts without adding card-id dimensions or pretending its effect is known', () => {
  const future = { ...catalog, future: { id: 'future', name: 'future', type: 'yojo', fruit: 'new-fruit', cost: 2, attack: 3, hp: 4 } };
  const s = fixture(); s.players[0].hand.push(spawnCard(s, 'future'));
  const data = researchCatalog(future), obs = observeGame(s, 0, future), x = encodeObservation(obs, data);
  const encoded = x.cards.find(c => c.cardId === 'future');
  assert.equal(encoded.vector.values.length, researchSchema.card.length);
  assert.equal(data.future.coverage, 'unannotated');
  assert.deepEqual(encoded.vector.unmapped['definition.fruit'], ['new-fruit']);
  assert.deepEqual(encoded.vector.unmapped['current.fruits'], ['new-fruit']);
  assert.equal(encoded.vector.values[researchSchema.card.findIndex(f => f.name === 'definition.attack')], Math.fround(0.3));
  assert.throws(() => encodeObservation(obs, profiles), /absent/);
});

test('research: TS and Python encoding and provenance fingerprints match exactly', () => {
  const observations = [observeGame(fixture(), 0, catalog), observeGame(fixture(), 1, catalog)];
  const floatProbe = { small: 1e-7, large: 1e21, negativeZero: -0, text: '日本語', nested: [true, null, 0.1] };
  const result = python('from dataset import encode_observation,fingerprint;p=json.load(sys.stdin);print(json.dumps({"encoded":[encode_observation(o,p["catalog"],p["schema"]) for o in p["observations"]],"hash":fingerprint(p["probe"])}))',
    { observations, catalog: profiles, schema: researchSchema, probe: floatProbe });
  assert.deepEqual(result.encoded, observations.map(o => encodeObservation(o, profiles)));
  // JSON transport normalizes -0 to 0; fingerprints must be taken over the transported data.
  assert.equal(result.hash, digest(JSON.parse(JSON.stringify(floatProbe))));
  const specs = [{ name: 'skill0', path: ['skills', '0'], kind: 'number', scale: 3 }];
  const fields = { skills: [2] };
  const vector = python('from dataset import encode_features;p=json.load(sys.stdin);print(json.dumps(encode_features(p["data"],p["specs"])))', { data: fields, specs });
  assert.deepEqual(vector, encodeFeatures(fields, specs));
});

test('research: an experimental scorer plugs into evaluation without exposing labels', () => {
  const score = createResearchEvaluator((encoded, observation) => {
    assert.equal('outcome' in encoded, false);
    return observation.players[0].points - observation.players[1].points;
  });
  const s = fixture();
  assert.equal(score(s, 0, catalog), 5);
  assert.equal(score(s, 1, catalog), -5);
  s.winner = 'draw'; assert.equal(score(s, 0, catalog), 0);
  s.winner = 1; assert.equal(score(s, 0, catalog), -1_000_000);
  assert.throws(() => createResearchEvaluator(() => NaN)(fixture(), 0, catalog), /non-finite/);
});

test('research: exporter produces a complete, reproducible dataset readable by Python', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'pplale-research-'));
  const file = path.join(directory, 'sample.jsonl');
  const exporter = path.join(root, 'packages/game-core/scripts/research.mjs');
  const args = [exporter, 'collect', '--out', file, '--games', '3', '--seed', '1000000', '--share', '1', '--max-commands', '45'];
  try {
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const lines = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines[0].version, RESEARCH_VERSION);
    assert.equal(lines[0].schemaHash, digest(researchSchema));
    assert.equal(lines.at(-1).type, 'summary');
    assert.ok(lines.at(-1).decisions > 0);
    const summary = python('from dataset import Dataset;d=Dataset(sys.argv[2]);s=list(d.samples());print(json.dumps({"splits":sorted(set(x["split"] for x in s)),"samples":len(s),"encoded":len(list(d.encoded(include_unfinished=True)))}))', {}, [file]);
    assert.deepEqual(summary.splits, ['test']);
    assert.equal(lines[0].provenance.splitPolicy, 'environment-block-v1');
    assert.equal(summary.samples, lines.at(-1).decisions);
    assert.equal(summary.encoded, summary.samples);
    assert.notEqual(spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' }).status, 0, 'must not overwrite datasets');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
