'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { canAttack, changesBetween, other, skillsFor, turnOf } from '@pplale/game-core';
import type { Command, GameState, Side } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { skillDescription } from '@/lib/game/skillText';
import type { DrawFlight } from '../BoardPieces';
import { present } from './presenters';
import type { Hit, Pop, Rect, Spot } from './presenters';
import { DICE_THROW_DURATION } from '../OpeningDie';
import { TURN_NOTICE_DURATION } from '../TurnAnnouncement';
import type { TurnNotice } from '../TurnAnnouncement';
import { sideLabel } from './useGameSession';
import type { Mode } from './useGameSession';

export type Strike = { uid: string; cardId: string; x: number; y: number; dx: number; dy: number; width: number; height: number };
/** A card or skill the opponent used, shown large before it resolves. */
export type Announcement = { id: number; kind: 'play' | 'skill' | 'reveal'; side: Side; cardId: string; title: string; text: string };
/** Immunity outcomes to present after a command resolves. */
export type EffectBlockNotice = { id: number; targets: (Ping & { cardId: string; kind: 'damage' | 'destroy' })[] };
/** Who goes first, shown once it is decided. */
export type OrderNotice = { chooser: Side; first: Side };
/** A die a card rolled (ぎってぃ): thrown, then its result is shown. */
export type EffectRoll = { id: number; side: Side; value: number; cardId?: string; rolling: boolean };
/** What the opponent picked when the choice is not a card on the table (e.g. paying extra PP). */
export type ChoiceNote = { id: number; side: Side; label: string };
/** End of the match: `wait` for the last animation, ゲームセット, the verdict; null shows the result screen. */
export type Finale = 'wait' | 'set' | 'verdict' | null;
export type { Hit, Pop } from './presenters';
/** The card the opponent picked for an effect. */
export type Ping = { uid: string; x: number; y: number; width: number; height: number };

const DRAW_DURATION = 800;
const STRIKE_HIT = 360;
const STRIKE_DURATION = 720;
// The opponent's card stays readable for a moment before its effect resolves.
const ANNOUNCE_HIT = 1900;
const ANNOUNCE_DURATION = 2400;
const PING_HIT = 700;
const PING_DURATION = 1200;
const HIT_DURATION = 1100;
const POP_DURATION = 1300;
const FLIGHT_REST = 200;
const ROLL_RESULT = 1300;
const CHOICE_HIT = 1000;
const CHOICE_DURATION = 1500;
export const ORDER_NOTICE_DURATION = 3200;
// The last blow lands, then ゲームセット and the verdict are shown before the result screen.
const FINALE_WAIT = 700;
const FINALE_SET = 1700;
const FINALE_VERDICT = 2400;
const rectOf = (element: Element): Rect => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
};
/** Cards on their way into a hand, deck or the field must land before anyone acts; ones going to a pile are only decoration. */
const blocksPlay = (flight: DrawFlight) => flight.toZone !== 'nap' && flight.toZone !== 'exile';
const spotKey = (spot: Spot) => 'unit' in spot ? `unit:${spot.unit}` : 'hand' in spot ? `hand:${spot.hand}` : 'pile' in spot ? `pile:${spot.pile.join('-')}` : 'leader' in spot ? `leader:${spot.leader}` : `pp:${spot.pp}`;
const selectorOf = (spot: Spot) => 'unit' in spot ? `[data-unit="${spot.unit}"]` : 'hand' in spot ? `[data-hand="${spot.hand}"]`
  : 'pile' in spot ? `[data-deck="${spot.pile.join('-')}"] [data-stack]` : 'leader' in spot ? `[data-leader="${spot.leader}"]` : `[data-pp="${spot.pp}"]`;
const liveRect = (root: HTMLElement, spot: Spot) => { const element = root.querySelector(selectorOf(spot)); return element ? rectOf(element) : undefined; };
/** Every spot a presenter may point at, as it is right now (taken just before a command applies). */
function captureRects(root: HTMLElement | null): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  if (!root) return rects;
  root.querySelectorAll<HTMLElement>('[data-unit]').forEach(e => rects.set(`unit:${e.dataset.unit}`, rectOf(e)));
  root.querySelectorAll<HTMLElement>('[data-hand]').forEach(e => rects.set(`hand:${e.dataset.hand}`, rectOf(e)));
  root.querySelectorAll<HTMLElement>('[data-deck]').forEach(e => rects.set(`pile:${e.dataset.deck}`, rectOf(e.querySelector('[data-stack]') ?? e)));
  root.querySelectorAll<HTMLElement>('[data-leader]').forEach(e => rects.set(`leader:${e.dataset.leader}`, rectOf(e)));
  root.querySelectorAll<HTMLElement>('[data-pp]').forEach(e => rects.set(`pp:${e.dataset.pp}`, rectOf(e)));
  return rects;
}

/**
 * Visual effects: what each command changed (see presenters.ts), the attack lunge, the opponent's
 * cards and choices, and the turn / match announcements. Nothing here changes the game; `busy` tells
 * the board to wait.
 */
export function useBoardAnimations({ game, view, mode, cpuSides, replaying, container }: { game: GameState; view: Side; mode: Mode; cpuSides: Side[]; replaying: boolean; container: RefObject<HTMLDivElement | null> }) {
  const [flights, setFlights] = useState<DrawFlight[]>([]);
  const [strike, setStrike] = useState<Strike | null>(null);
  const [turnNotice, setTurnNotice] = useState<TurnNotice | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [ping, setPing] = useState<Ping | null>(null);
  const [blocked, setBlocked] = useState<EffectBlockNotice | null>(null);
  const [order, setOrder] = useState<OrderNotice | null>(null);
  const [finale, setFinale] = useState<Finale>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [effectRoll, setEffectRoll] = useState<EffectRoll | null>(null);
  const [choiceNote, setChoiceNote] = useState<ChoiceNote | null>(null);
  /** Where cards and counters were just before the command, for the ones it moves or removes. */
  const rectsBefore = useRef(new Map<string, Rect>());
  const [pops, setPops] = useState<Pop[]>([]);
  /** The command being applied, so its damage can be shown as an attack or as an effect. */
  const lastCommand = useRef<Command['type'] | null>(null);
  const previous = useRef(game);
  const enabled = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((callback: () => void, delay: number) => { timers.current.push(setTimeout(callback, delay)); }, []);

  // Compare with the previous state and present the difference.
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = game;
    if (!enabled.current || old === game || !container.current) return;
    const root = container.current;
    // Everything the command changed, shown by the presenter registered for each kind of change.
    const shown = present(changesBetween(old, game), {
      before: old, after: game, view, mode, byAttack: lastCommand.current === 'attack',
      rect: (spot, when) => when === 'before' ? rectsBefore.current.get(spotKey(spot)) : liveRect(root, spot),
    });
    if (shown.blocks.length) {
      setAnnouncement(null);
      setPing(null);
      setBlocked({ id: game.revision, targets: shown.blocks.map(b => ({ uid: b.uid, kind: b.what, cardId: game.cards[b.uid].cardId, ...b.rect })) });
      later(() => setBlocked(current => current?.id === game.revision ? null : current), 1200);
    }
    // A card rolled a die in this command: throw it, then hold the result for a moment.
    if (shown.roll) {
      const roll = { id: game.revision, side: shown.roll.side, value: shown.roll.value, cardId: shown.roll.cardId, rolling: true };
      setEffectRoll(roll);
      later(() => setEffectRoll(current => current?.id === roll.id ? { ...current, rolling: false } : current), DICE_THROW_DURATION);
      later(() => setEffectRoll(current => current?.id === roll.id ? null : current), DICE_THROW_DURATION + ROLL_RESULT);
    }
    if (shown.hits.length) {
      setHits(current => [...current, ...shown.hits]);
      later(() => setHits(current => current.filter(hit => !shown.hits.includes(hit))), HIT_DURATION);
    }
    if (shown.pops.length) {
      setPops(current => [...current, ...shown.pops]);
      later(() => setPops(current => current.filter(pop => !shown.pops.includes(pop))), POP_DURATION);
    }
    const next = shown.flights;
    if (next.length) {
      setFlights(current => [...current, ...next]);
      // The card rests where it lands for a moment: removing it exactly when the flight should end cuts
      // the landing off whenever the animation starts a little late (a busy frame).
      later(() => setFlights(current => current.filter(f => !next.includes(f))), Math.max(...next.map(f => f.delay)) + DRAW_DURATION + FLIGHT_REST);
    }
    // Who goes first was decided: show both sides' order before the opening draws.
    if (old.phase === 'initiative' && game.phase === 'opening') {
      setOrder({ chooser: old.active, first: game.rules.firstPlayer });
      later(() => setOrder(null), ORDER_NOTICE_DURATION);
    }
    // The match just ended: ゲームセット, then the verdict, then the result screen (finale = null).
    if (old.winner === null && game.winner !== null && !replaying) {
      setFinale('wait');
      later(() => setFinale(current => current === 'wait' ? 'set' : current), FINALE_WAIT);
      later(() => setFinale(current => current === 'set' ? 'verdict' : current), FINALE_WAIT + FINALE_SET);
      later(() => setFinale(current => current === 'verdict' ? null : current), FINALE_WAIT + FINALE_SET + FINALE_VERDICT);
    }
    const beginsTurn = game.phase === 'playing' && (old.phase !== 'playing' || old.turn !== game.turn);
    if (beginsTurn) {
      const announce = () => {
        const { order, number } = turnOf(game);
        setTurnNotice({ id: game.turn, own: mode === 'hotseat' || game.active === view, order: order === 'first' ? '先攻' : '後攻', number, pp: game.players[game.active].pp, label: mode === 'watch' ? `${sideLabel(mode, game.active)}のターン` : undefined });
        later(() => setTurnNotice(null), TURN_NOTICE_DURATION);
      };
      if (next.length) later(announce, Math.max(...next.map(f => f.delay)) + DRAW_DURATION);
      else announce();
    }
  }, [game, view, mode, replaying, container, later]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /**
   * Runs `commit` (applying the command) with its animation: attacks lunge first; cards, skills and
   * chosen targets of the opponent or of any CPU side are shown before they resolve, so the result
   * can be followed.
   */
  const run = useCallback((command: Command, commit: () => void) => {
    const root = container.current;
    const apply = () => {
      enabled.current = true;
      lastCommand.current = command.type;
      rectsBefore.current = captureRects(root);
      commit();
    };
    const opponent = command.actor !== view || cpuSides.includes(command.actor);
    const shown = opponent ? describe(game, command) : null;
    if (shown) {
      setAnnouncement(shown);
      later(apply, ANNOUNCE_HIT);
      later(() => setAnnouncement(current => current?.id === shown.id ? null : current), ANNOUNCE_DURATION);
      return;
    }
    // The opponent picked an option that is not on the table (pay extra PP, skip …): say which.
    const option = opponent && command.type === 'choose' && game.pending?.task.op !== 'draw'
      && !root?.querySelector(`[data-unit="${command.option}"], [data-hand="${command.option}"]`)
      ? game.pending?.options.find(o => o.id === command.option) : undefined;
    if (option) {
      const note = { id: ++choiceId, side: command.actor, label: option.label };
      setChoiceNote(note);
      later(apply, CHOICE_HIT);
      later(() => setChoiceNote(current => current?.id === note.id ? null : current), CHOICE_DURATION);
      return;
    }
    const picked = opponent && command.type === 'choose' && root?.querySelector(`[data-unit="${command.option}"], [data-hand="${command.option}"]`);
    if (picked) {
      setPing({ uid: (command as Extract<Command, { type: 'choose' }>).option, ...rectOf(picked) });
      later(apply, PING_HIT);
      later(() => setPing(null), PING_DURATION);
      return;
    }
    if (command.type === 'attack' && root && canAttack(game, command.actor, command.uid, command.target, gameCatalog)) {
      const source = root.querySelector(`[data-unit="${command.uid}"]`);
      const target = root.querySelector(command.target === 'leader' ? `[data-leader="${other(command.actor)}"]` : `[data-unit="${command.target}"]`);
      if (source && target) {
        const a = rectOf(source), b = rectOf(target);
        setStrike({ uid: command.uid, cardId: game.cards[command.uid].cardId, ...a, dx: b.x + b.width / 2 - a.x - a.width / 2, dy: b.y + b.height / 2 - a.y - a.height / 2 });
        later(apply, STRIKE_HIT);
        later(() => setStrike(null), STRIKE_DURATION);
        return;
      }
    }
    apply();
  }, [game, view, cpuSides, container, later]);

  /** Loads, restores and undo jump without animating the difference. */
  const skipNext = useCallback(() => { enabled.current = false; }, []);
  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    enabled.current = false;
    setFlights([]);
    setStrike(null);
    setTurnNotice(null);
    setAnnouncement(null);
    setPing(null);
    setBlocked(null);
    setOrder(null);
    setFinale(null);
    setHits([]);
    setPops([]);
    setEffectRoll(null);
    setChoiceNote(null);
  }, []);
  /** A tap moves on: ゲームセット → verdict → result screen. */
  const advanceFinale = useCallback(() => setFinale(current => current === 'set' ? 'verdict' : current === 'verdict' ? null : current), []);

  return { flights, strike, turnNotice, announcement, ping, blocked, order, finale, hits, pops, effectRoll, choiceNote, advanceFinale, busy: flights.some(blocksPlay) || !!strike || !!turnNotice || !!announcement || !!ping || !!blocked || !!order || !!effectRoll || !!choiceNote, run, skipNext, reset };
}

let choiceId = 0;
let announcementId = 0;
/** What to show for the opponent's play / skill / reveal, or null for other commands. */
function describe(game: GameState, command: Command): Announcement | null {
  const id = ++announcementId;
  if (command.type === 'play' || command.type === 'reveal') {
    const card = displayCards[game.cards[command.uid].cardId];
    return { id, kind: command.type, side: command.actor, cardId: card.id, title: card.name, text: card.effect ?? '' };
  }
  if (command.type === 'skill') {
    const playable = game.players[command.actor].playable, skill = skillsFor(playable)[command.index];
    return skill ? { id, kind: 'skill', side: command.actor, cardId: playable, title: skill.name, text: skillDescription(displayCards[playable].effect, command.index) } : null;
  }
  return null;
}
