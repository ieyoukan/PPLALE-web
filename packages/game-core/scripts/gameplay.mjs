// One engine process, JSON-lines in/out. No browser, HTTP server or Python rules implementation.
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { newGame, sandboxRules } from '../dist/index.js';
import { actingSides, bindDecision, describeGame, describeRules, describeCard, listCardDefinitions, listCommandDefinitions, listExSkills } from '../dist/gameplay/index.js';
import { observeDecision } from '../dist/gameplay/index.js';
import { cpuCommand } from '../dist/ai/index.js';
import { cpuLevels } from '../dist/ai/profiles.js';
import { randomDeck, playableNow } from '../dist/rules.js';
import { catalog } from './catalog.mjs';

/** In-process entry point also used by tests; state is private to this controller. */
export function createGameController(cards = catalog) {
  let state = null;
  const bindings = new Map();
  const viewerOf = value => {
    if (value !== 0 && value !== 1) throw new Error('viewer must be 0 or 1');
    return value;
  };
  const binding = viewer => {
    if (!state) throw new Error('Start a game with new first');
    if (!bindings.has(viewer)) bindings.set(viewer, bindDecision(state, viewer, cards));
    return bindings.get(viewer);
  };
  const snapshot = viewer => JSON.parse(JSON.stringify({ actors: actingSides(state), decision: binding(viewer).input }));
  return request => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Expected a request object');
    if (request.op === 'describe') {
      if (request.cardId !== undefined) return describeCard(cards, request.cardId);
      if (request.section === undefined) return describeGame(cards);
      if (request.section === 'rules') return describeRules();
      if (request.section === 'cards') return listCardDefinitions(cards);
      if (request.section === 'commands') return listCommandDefinitions();
      if (request.section === 'exSkills') return listExSkills();
      throw new Error('Unknown description section');
    }
    if (request.op === 'new') {
      const seed = request.seed ?? 1;
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must fit uint32');
      if (request.rules !== undefined && (!request.rules || typeof request.rules !== 'object' || Array.isArray(request.rules)))
        throw new Error('rules must be an object');
      const rules = { ...sandboxRules, ...(request.rules ?? {}) };
      for (const key of Object.keys(rules)) if (!Object.hasOwn(sandboxRules, key)) throw new Error(`Unknown rule: ${key}`);
      for (const key of ['initialPoints', 'initialYojo', 'initialSweet'])
        if (!Number.isInteger(rules[key]) || rules[key] < (key === 'initialPoints' ? 1 : 0)) throw new Error(`Invalid rule: ${key}`);
      if (![0, 1].includes(rules.firstPlayer) || !['yojo', 'sweet'].includes(rules.turnDraw)) throw new Error('Invalid firstPlayer/turnDraw');
      if (rules.initialYojo + rules.initialSweet >= 30) throw new Error('Opening draws must leave room for the second-player extra card');
      const decks = request.decks ?? [randomDeck(playableNow, cards, seed), randomDeck(playableNow, cards, (seed + 1) >>> 0)];
      if (!Array.isArray(decks) || decks.length !== 2 || decks.some(deck => !deck || !Array.isArray(deck.yojo) || !Array.isArray(deck.sweet)))
        throw new Error('decks must contain two decks');
      const next = newGame(decks, cards, rules, seed);
      const viewer = viewerOf(request.viewer ?? 0);
      state = next; bindings.clear();
      return snapshot(viewer);
    }
    const viewer = viewerOf(request.viewer ?? 0);
    const current = binding(viewer);
    if (request.op === 'observe') return snapshot(viewer);
    if (request.op === 'inspect') return { ...snapshot(viewer),
      unavailable: observeDecision(state, viewer, cards, undefined, { diagnostics: true }).observation.unavailable };
    if (request.op === 'act') {
      const result = current.apply(state, { decisionId: request.decisionId, actionId: request.actionId });
      if (result.error) throw new Error(result.error);
      state = result.state; bindings.clear();
      return snapshot(viewer);
    }
    if (request.op === 'cpu') {
      const actor = request.actor ?? actingSides(state)[0], level = request.level ?? 'normal';
      viewerOf(actor);
      if (!cpuLevels.includes(level)) throw new Error('Unknown CPU level');
      const decision = binding(actor), actions = decision.input.observation.actions;
      const command = state.phase === 'dice' ? { type: 'roll', actor } : cpuCommand(state, cards, { side: actor, level });
      if (!command) return snapshot(viewer);
      // Resolve the CPU's engine command through the same offered-ID boundary.
      const selected = observeDecision(state, actor, cards, command).selectedAction;
      const result = decision.apply(state, { decisionId: decision.input.decisionId, actionId: actions[selected].id });
      if (result.error) throw new Error(result.error);
      state = result.state; bindings.clear();
      return snapshot(viewer);
    }
    throw new Error(`Unknown operation: ${request.op}`);
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const control = createGameController();
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    let id = null;
    try {
      const request = JSON.parse(line); id = request?.id ?? null;
      process.stdout.write(JSON.stringify({ id, ok: true, result: control(request) }) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({ id, ok: false, error: error.message }) + '\n');
    }
  }
}
