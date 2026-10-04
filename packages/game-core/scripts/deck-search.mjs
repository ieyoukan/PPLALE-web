// Reproducible deck search and held-out evaluation, using the existing CPU and rules.
// node scripts/deck-search.mjs search [generations=20] [candidates=16] [pairs=6] [copyLimit=2]
// node scripts/deck-search.mjs evaluate <deck.json> [pairs=100] [cpu=hard] [seed=90000000] [opponents.json]
// `compare` takes an array of decks instead and ranks them on the same opponents and seeds.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { resolve } from 'node:path';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { costOf, createHard, defaultWeights, playMatch, randomStrawberryDeck, validateDeck } from '../dist/index.js';
import { catalog } from './catalog.mjs';

// npm workspace scripts run with the package as cwd; CLI paths are relative to the repository.
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const readJson = path => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));

const copies = entries => entries.flatMap(([id, n]) => Array(n).fill(id));
const deck = (name, yojo, sweet, playable = 'p_1') => ({ name, yojo: copies(yojo), sweet: copies(sweet), playable });
const cakes = [['s_15', 2], ['s_16', 2], ['s_17', 2], ['s_6', 2], ['s_7', 2]];
const cafe = [['s_6', 2], ['s_7', 2], ['s_8', 2], ['s_18', 2], ['s_19', 2]];
const defense = [['s_6', 2], ['s_8', 2], ['s_18', 2], ['s_19', 2], ['s_21', 2]];
const inomaYojo = [['y_3', 2], ['y_4', 2], ['y_6', 2], ['y_8', 2], ['y_15', 2], ['y_16', 2], ['y_26', 1], ['y_27', 1], ['y_9', 1], ['y_7', 2], ['y_12', 2], ['y_14', 1]];
const inomaSweet = [['s_15', 2], ['s_16', 2], ['s_17', 2], ['s_23', 2], ['s_25', 1], ['s_19', 1]];
const twice = ids => ids.map(id => [id, 2]);
// All baseline decks obey the default two-copy setting; sodas remain limited to one.
export const archetypes = [
    deck('速攻', twice(['y_0', 'y_4', 'y_6', 'y_9', 'y_13', 'y_15', 'y_16', 'y_20', 'y_21', 'y_25']), cakes),
    deck('防衛回復', twice(['y_3', 'y_6', 'y_8', 'y_9', 'y_16', 'y_17', 'y_21', 'y_22', 'y_23', 'y_24']), defense, 'p_3'),
    deck('除去', twice(['y_4', 'y_6', 'y_8', 'y_9', 'y_20', 'y_21', 'y_22', 'y_24', 'y_26', 'y_28']), cafe),
    deck('貫通', twice(['y_0', 'y_6', 'y_8', 'y_9', 'y_13', 'y_15', 'y_16', 'y_20', 'y_21', 'y_25']), cakes, 'p_4'),
    deck('ランプ', twice(['y_0', 'y_6', 'y_8', 'y_12', 'y_14', 'y_22', 'y_24', 'y_25', 'y_26', 'y_28']), cafe, 'p_0'),
    deck('うゆち', twice(['y_2', 'y_4', 'y_6', 'y_8', 'y_9', 'y_13', 'y_15', 'y_16', 'y_20', 'y_25']), cakes, 'p_5'),
    deck('効果耐性', twice(['y_0', 'y_3', 'y_6', 'y_8', 'y_9', 'y_19', 'y_21', 'y_23', 'y_28', 'y_30']), defense, 'p_5'),
    deck('横展開', twice(['y_0', 'y_2', 'y_4', 'y_6', 'y_7', 'y_8', 'y_13', 'y_15', 'y_16', 'y_23']), cakes, 'p_4'),
    deck('ソーダ', twice(['y_0', 'y_3', 'y_6', 'y_8', 'y_9', 'y_13', 'y_20', 'y_21', 'y_23', 'y_25']), [...Array.from({ length: 6 }, (_, i) => [`s_${i}`, 1]), ['s_6', 2], ['s_19', 2]], 'p_3'),
    deck('前借り', twice(['y_0', 'y_4', 'y_6', 'y_9', 'y_13', 'y_15', 'y_16', 'y_20', 'y_21', 'y_25']), cafe, 'p_2'),
    { ...readJson('src/data/strawberryStableDeck.json'), name: 'おためし' },
    deck('いのまこアグロ・うぃまる', inomaYojo, inomaSweet, 'p_1'),
    deck('いのまこアグロ・ストラ', inomaYojo, inomaSweet, 'p_2'),
];
const tempo = createHard({ ...defaultWeights, points: 14, defender: 2, unitHp: 2, hand: 1 });
const board = createHard({ ...defaultWeights, points: 7, unitAttack: 6, unitHp: 4, defender: 5 });
const strategies = { hard: 'hard', normal: 'normal', master: 'master', tempo, board };
const canonical = d => ({ ...d, yojo: [...d.yojo].sort(), sweet: [...d.sweet].sort() });
const keyOf = d => JSON.stringify([d.playable, [...d.yojo].sort(), [...d.sweet].sort()]);
const assertDeck = (d, limit = Infinity) => {
    const errors = validateDeck(d, catalog);
    for (const kind of ['yojo', 'sweet']) for (const id of new Set(d[kind]))
        if (d[kind].filter(v => v === id).length > limit) errors.push(`${id}: copy limit ${limit}`);
    if (errors.length) throw new Error(errors.join(' / '));
};

function duel({ candidate, opponent, seeds, cpu = 'hard', opponentCpu = cpu }) {
    const result = { wins: 0, losses: 0, draws: 0, unfinished: 0, turns: 0, firstWins: 0, firstGames: 0, secondWins: 0, secondGames: 0, turnTwoObserved: 0, emptyTurnTwo: 0, pairSum: 0, pairSquares: 0 };
    for (const seed of seeds) {
        let pairScore = 0;
        for (const seat of [0, 1]) {
            let first, sawTurnTwo = false;
            const match = playMatch(catalog, {
                decks: seat === 0 ? [candidate, opponent] : [opponent, candidate], seed,
                levels: seat === 0 ? [strategies[cpu], strategies[opponentCpu]] : [strategies[opponentCpu], strategies[cpu]],
                onStep: state => {
                    if (first === undefined && state.phase === 'playing') first = state.rules.firstPlayer;
                    const p = state.players[seat];
                    if (!sawTurnTwo && state.phase === 'playing' && state.active === seat && p.turns === 2 && !state.pending) {
                        sawTurnTwo = true;
                        result.turnTwoObserved++;
                        if (!p.field.length && !p.hand.some(uid => catalog[state.cards[uid].cardId].type === 'yojo' && costOf(state, uid, catalog, seat) <= p.pp)) result.emptyTurnTwo++;
                    }
                },
            });
            const won = match.winner === seat;
            if (won) { result.wins++; pairScore++; }
            else if (match.winner === 'draw') { result.draws++; pairScore += 0.5; }
            else if (match.winner === null) result.unfinished++;
            else result.losses++;
            result.turns += match.turns;
            const order = first === seat ? 'first' : 'second';
            result[`${order}Games`]++;
            result[`${order}Wins`] += Number(won);
        }
        pairScore /= 2;
        result.pairSum += pairScore;
        result.pairSquares += pairScore ** 2;
    }
    return result;
}
const summarize = (result, pairs) => {
    const games = pairs * 2, score = result.pairSum / pairs;
    // Seats in a pair share a seed; estimate uncertainty from pairs rather than independent games.
    const variance = pairs > 1 ? Math.max(0, (result.pairSquares - result.pairSum ** 2 / pairs) / (pairs - 1)) : 0;
    return { ...result, games, pairs, winRate: result.wins / games, score, se: Math.sqrt(variance / pairs), averageTurns: result.turns / games };
};

if (!isMainThread) {
    parentPort.on('message', ({ id, job }) => {
        try { parentPort.postMessage({ id, result: duel(job) }); }
        catch (error) { parentPort.postMessage({ id, error: error.stack }); }
    });
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const workers = Array.from({ length: Math.min(8, Math.max(1, os.availableParallelism() - 1)) }, () => new Worker(new URL(import.meta.url)));
    const waiting = new Map(), queue = [];
    let serial = 0, matches = 0;
    const dispatch = worker => {
        const next = queue.shift();
        if (next) { worker.busy = true; worker.postMessage(next); }
        else worker.busy = false;
    };
    for (const worker of workers) {
        worker.on('message', ({ id, result, error }) => {
            const pending = waiting.get(id);
            waiting.delete(id);
            if (error) pending.reject(new Error(error));
            else pending.resolve(result);
            dispatch(worker);
        });
        worker.on('error', error => { for (const pending of waiting.values()) pending.reject(error); waiting.clear(); });
    }
    const run = job => new Promise((resolve, reject) => {
        matches += job.seeds.length * 2;
        const id = serial++;
        waiting.set(id, { resolve, reject });
        queue.push({ id, job });
        for (const worker of workers) if (!worker.busy) dispatch(worker);
    });
    const assess = async (candidate, opponents, pairs, seed, cpu = 'hard', varied = false, stability = false) => {
        assertDeck(candidate);
        const rows = await Promise.all(opponents.map(async (opponent, i) => {
            assertDeck(opponent);
            const opponentCpu = varied ? ['hard', 'normal', 'tempo', 'board'][i % 4] : cpu;
            const seeds = Array.from({ length: pairs }, (_, j) => seed + i * 10000 + j);
            return { name: opponent.name, opponentCpu, ...summarize(await run({ candidate, opponent, seeds, cpu, opponentCpu }), pairs) };
        }));
        const total = rows.reduce((acc, row) => {
            for (const k of Object.keys(acc)) acc[k] += row[k];
            return acc;
        }, { wins: 0, losses: 0, draws: 0, unfinished: 0, turns: 0, firstWins: 0, firstGames: 0, secondWins: 0, secondGames: 0, turnTwoObserved: 0, emptyTurnTwo: 0, pairSum: 0, pairSquares: 0 });
        const average = rows.reduce((sum, r) => sum + r.score, 0) / rows.length;
        const worst = Math.min(...rows.map(r => r.score));
        const emptyTurnTwoRate = total.turnTwoObserved ? total.emptyTurnTwo / total.turnTwoObserved : 0;
        return { candidate: canonical(candidate), fitness: 0.65 * average + 0.35 * worst - (stability ? 0.15 * emptyTurnTwoRate : 0), average, worst, emptyTurnTwoRate, total: summarize(total, pairs * rows.length), rows };
    };
    const root = new URL('../../../.cache/deck-search/', import.meta.url);
    mkdirSync(root, { recursive: true });
    let rng = 20261004;
    const random = n => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return Math.floor(rng / 4294967296 * n); };
    const [mode = 'search', ...args] = process.argv.slice(2);
    const started = Date.now();
    try {
        if (mode === 'evaluate' || mode === 'compare') {
            const [path, pairArg = '100', cpu = 'hard', seedArg = '90000000', opponentPath] = args;
            if (!(cpu in strategies)) throw new Error(`Unknown CPU: ${cpu}`);
            const input = readJson(path);
            const candidates = mode === 'compare' ? input : [input];
            if (!Array.isArray(candidates) || !candidates.length) throw new Error('Candidate list must be a non-empty array');
            const seed = Number(seedArg), pairs = Number(pairArg);
            if (!Number.isSafeInteger(pairs) || pairs < 1 || !Number.isSafeInteger(seed) || seed < 0) throw new Error('Invalid pairs/seed');
            // Evaluation includes fresh random decks and every playable using the same tempo shell.
            const opponents = opponentPath ? readJson(opponentPath) : [...archetypes, ...Array.from({ length: 6 }, (_, i) => ({ ...archetypes[0], name: `速攻・${catalog[`p_${i}`].name}`, playable: `p_${i}` })), ...Array.from({ length: 8 }, (_, i) => ({ ...randomStrawberryDeck(seed + i * 313), name: `未使用ランダム${i + 1}` }))];
            if (!Array.isArray(opponents) || opponents.length === 0) throw new Error('Opponent list must be a non-empty array');
            let completed = 0;
            const reports = await Promise.all(candidates.map(async c => {
                const report = await assess(c, opponents, pairs, seed, cpu, false, true);
                completed++;
                console.log(`${mode}: ${completed}/${candidates.length} candidates complete (${Math.round((Date.now() - started) / 1000)}s)`);
                return report;
            }));
            reports.sort((a, b) => b.fitness - a.fitness);
            const report = reports[0];
            const output = new URL(`${mode === 'compare' ? 'comparison' : 'evaluation'}-${cpu}-${seed}.json`, root);
            writeFileSync(output, JSON.stringify({ seed, cpu, matches, report, ...(mode === 'compare' ? { reports } : {}) }, null, 2) + '\n');
            console.log(JSON.stringify({ output: output.pathname, matches, seconds: Math.round((Date.now() - started) / 1000), report }));
        } else if (mode === 'search') {
            const [generations = 20, count = 16, pairs = 6, limit = 2] = args.map(Number);
            if (![generations, count, pairs, limit].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Search arguments must be positive integers');
            if (limit < 2) throw new Error('Baseline decks require a copy limit of at least 2');
            const ids = { yojo: Array.from({ length: 31 }, (_, i) => `y_${i}`), sweet: Array.from({ length: 28 }, (_, i) => `s_${i}`) };
            const mutate = base => {
                const next = structuredClone(base);
                for (let edits = 1 + random(4); edits > 0; edits--) {
                    if (random(7) === 0) { next.playable = `p_${random(6)}`; continue; }
                    const kind = random(3) === 0 ? 'sweet' : 'yojo', slot = random(next[kind].length);
                    const options = ids[kind].filter(id => next[kind].filter((c, i) => i !== slot && c === id).length < (catalog[id].sweetType === 'animal_soda' ? 1 : limit));
                    next[kind][slot] = options[random(options.length)];
                }
                assertDeck(next, limit);
                return canonical(next);
            };
            let elite = archetypes.map(canonical), hall = [];
            const trace = [];
            console.log(`search ${generations} generations × ${count} candidates; ${pairs} pairs/opponent; copy limit ${limit}; ${workers.length} workers`);
            for (let gen = 0; gen < generations; gen++) {
                const opponents = [...archetypes.filter(d => d.name !== 'おためし'), ...hall.slice(0, 3)];
                const pool = elite.slice(0, Math.min(4, count));
                if (gen === 0) pool.push(...elite.slice(4, count));
                const keys = new Set(pool.map(keyOf));
                while (pool.length < count) {
                    const candidate = mutate(elite[random(Math.min(elite.length, 6))]);
                    const key = keyOf(candidate);
                    if (!keys.has(key)) { keys.add(key); pool.push(candidate); }
                }
                const results = await Promise.all(pool.map(c => assess(c, opponents, pairs, 1000 + gen * 1000000)));
                results.sort((a, b) => b.fitness - a.fitness);
                elite = results.slice(0, 6).map(r => r.candidate);
                if (!hall.some(c => keyOf(c) === keyOf(elite[0]))) hall.unshift({ ...elite[0], name: `探索世代${gen + 1}` });
                hall = hall.slice(0, 6);
                trace.push({ generation: gen + 1, fitness: results[0].fitness, average: results[0].average, worst: results[0].worst, candidate: elite[0] });
                writeFileSync(new URL(`search-${limit}.json`, root), JSON.stringify({ limit, generations, count, pairs, rng, matches, elite, hall, trace }, null, 2) + '\n');
                console.log(`gen ${gen + 1}: mean ${(results[0].average * 100).toFixed(1)}%, worst ${(results[0].worst * 100).toFixed(1)}%; ${matches} matches; ${Math.round((Date.now() - started) / 1000)}s; ${keyOf(elite[0])}`);
            }
            // Selection uses new seeds, with alternate CPU play styles. Final reporting is a separate run.
            const finalists = [...new Map([...elite, ...hall].map(c => [keyOf(c), c])).values()];
            const opponents = [...archetypes, ...hall];
            const confirmed = await Promise.all(finalists.map(c => assess(c, opponents, Math.max(40, pairs * 5), 60000000, 'hard', true)));
            confirmed.sort((a, b) => b.fitness - a.fitness);
            writeFileSync(new URL(`selection-${limit}.json`, root), JSON.stringify({ matches, seconds: Math.round((Date.now() - started) / 1000), confirmed }, null, 2) + '\n');
            writeFileSync(new URL(`best-${limit}.json`, root), JSON.stringify({ ...confirmed[0].candidate, name: 'いちご・安定型' }, null, 2) + '\n');
            console.log(`selected: mean ${(confirmed[0].average * 100).toFixed(1)}%, worst ${(confirmed[0].worst * 100).toFixed(1)}%; ${matches} matches; ${Math.round((Date.now() - started) / 1000)}s`);
        } else throw new Error('Use search, compare or evaluate');
    } finally { await Promise.all(workers.map(w => w.terminate())); }
}
