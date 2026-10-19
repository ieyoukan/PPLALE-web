'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { canAttack, changesBetween, handReactionOps, HIDDEN_CARD, other, scriptOf, skillAt, turnOf } from '@pplale/game-core';
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
import { useAnimationTiming } from './useAnimationTiming';
import { stageRect } from '../stage/stageSpace';

export type Strike = { uid: string; cardId: string; x: number; y: number; dx: number; dy: number; width: number; height: number };
/** A card, skill or hand reaction, shown large before it resolves. */
export type Announcement = { id: number; kind: 'play' | 'skill' | 'reveal' | 'reaction'; side: Side; cardId: string; title: string; text: string };
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

/**
 * 偽ラグ: a hand reaction the other player may answer with (リンネ・うぃまる・あみの to an attack, ぶらんちゃん
 * to a play, オレンジのリンネ to the turn's draw) makes the player wait while they decide (the table stays
 * as it was meanwhile, see useBoard), which would tell that the card is in their hand. So such a command
 * waits as long now and then, at random, whether or not they hold one, and a CPU takes as long to decide.
 */
const FAKE_LAG_CHANCE = 0.3;
export const fakeLag = () => 900 + Math.random() * 1700;
const HIT_DURATION = 1100;
const POP_DURATION = 1300;
const ROLL_RESULT = 1300;
export const ORDER_NOTICE_DURATION = 3200;
// The last blow lands, then ゲームセット and the verdict are shown before the result screen.
const FINALE_WAIT = 700;
const FINALE_SET = 1700;
const FINALE_VERDICT = 2400;
// Effects are placed on the game stage, so every box is measured in stage pixels.
const rectOf = (element: Element): Rect => stageRect(element);
/**
 * A unit's attack landing is felt as well as seen: a short buzz, longer for more damage (phones that can
 * vibrate; iPhone browsers cannot). Effects that deal damage stay silent.
 */
function buzz(hits: Hit[]) {
  const blows = hits.filter(hit => hit.kind === 'attack');
  if (!blows.length || typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  const amount = Math.max(...blows.map(hit => hit.amount));
  navigator.vibrate(amount >= 4 ? [70, 50, 90] : 30 + amount * 15);
}
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
export function useBoardAnimations({ game, shown, view, mode, cpuSides, replaying, container, spectating }: {
  /** The match, for the commands to run. */
  game: GameState;
  /** What is on the table: `game`, or the state before a hand reaction the other player is still deciding (see useBoard). */
  shown: GameState;
  view: Side; mode: Mode; cpuSides: Side[]; replaying: boolean; container: RefObject<HTMLDivElement | null>;
  /** Watching a room's match without a seat: both players' names, used where a player would read あなた / 相手. */
  spectating?: [string, string];
}) {
  const timing = useAnimationTiming();
  const { draw: DRAW_DURATION, rest: FLIGHT_REST, strikeHit: STRIKE_HIT, strike: STRIKE_DURATION,
    announceHit: ANNOUNCE_HIT, announce: ANNOUNCE_DURATION, pingHit: PING_HIT, ping: PING_DURATION,
    choiceHit: CHOICE_HIT, choice: CHOICE_DURATION } = timing;
  const [flights, setFlights] = useState<DrawFlight[]>([]);
  const [strike, setStrike] = useState<Strike | null>(null);
  const [turnNotice, setTurnNotice] = useState<TurnNotice | null>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [ping, setPing] = useState<Ping | null>(null);
  const [order, setOrder] = useState<OrderNotice | null>(null);
  const [finale, setFinale] = useState<Finale>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [effectRoll, setEffectRoll] = useState<EffectRoll | null>(null);
  const [choiceNote, setChoiceNote] = useState<ChoiceNote | null>(null);
  /** A fake wait after the viewer's attack (偽ラグ): nothing may be done meanwhile. */
  const [lagging, setLagging] = useState(false);
  /** Where cards and counters were just before the command, for the ones it moves or removes. */
  const rectsBefore = useRef(new Map<string, Rect>());
  const [pops, setPops] = useState<Pop[]>([]);
  /** The command being applied, so its damage can be shown as an attack or as an effect. */
  const lastCommand = useRef<Command['type'] | null>(null);
  const previous = useRef(shown);
  const enabled = useRef(false);
  /**
   * Timers still to fire. They are only cancelled by `reset` (another match on the table), never when
   * React takes the effects down: that also happens while the board stays on screen with its state
   * (a lazily loaded part arriving, development refresh), and a cancelled timer would then leave a card
   * flying forever, or never apply the command whose announcement it was waiting for.
   */
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((callback: () => void, delay: number) => {
    const id = setTimeout(() => { timers.current.delete(id); callback(); }, delay);
    timers.current.add(id);
  }, []);

  // Compare with the previous state and present the difference.
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = shown;
    if (!enabled.current || old === shown || !container.current) return;
    const root = container.current;
    // Everything the command changed, shown by the presenter registered for each kind of change.
    const seen = present(changesBetween(old, shown), {
      before: old, after: shown, view, open: mode === 'watch' || !!spectating, byAttack: lastCommand.current === 'attack',
      rect: (spot, when) => when === 'before' ? rectsBefore.current.get(spotKey(spot)) : liveRect(root, spot),
    });
    // A card rolled a die in this command: throw it, then hold the result for a moment.
    if (seen.roll) {
      const roll = { id: shown.revision, side: seen.roll.side, value: seen.roll.value, cardId: seen.roll.cardId, rolling: true };
      setEffectRoll(roll);
      later(() => setEffectRoll(current => current?.id === roll.id ? { ...current, rolling: false } : current), DICE_THROW_DURATION);
      later(() => setEffectRoll(current => current?.id === roll.id ? null : current), DICE_THROW_DURATION + ROLL_RESULT);
    }
    if (seen.hits.length) {
      if (!replaying) buzz(seen.hits);
      setHits(current => [...current, ...seen.hits]);
      later(() => setHits(current => current.filter(hit => !seen.hits.includes(hit))), HIT_DURATION);
    }
    if (seen.pops.length) {
      setPops(current => [...current, ...seen.pops]);
      later(() => setPops(current => current.filter(pop => !seen.pops.includes(pop))), POP_DURATION);
    }
    const next = seen.flights;
    if (next.length) {
      // A card is in one flight at a time: one that starts replaces an earlier one still shown
      // (given back in the mulligan and drawn again right away).
      setFlights(current => [...current.filter(f => !next.some(n => n.uid === f.uid)), ...next]);
      // The card rests where it lands for a moment: removing it exactly when the flight should end cuts
      // the landing off whenever the animation starts a little late (a busy frame).
      later(() => setFlights(current => current.filter(f => !next.includes(f))), Math.max(...next.map(f => f.delay)) + DRAW_DURATION + FLIGHT_REST);
    }
    // Who goes first was decided: show both sides' order before the opening draws.
    if (old.phase === 'initiative' && shown.phase === 'opening') {
      setOrder({ chooser: old.active, first: shown.rules.firstPlayer });
      later(() => setOrder(null), ORDER_NOTICE_DURATION);
    }
    // The match just ended: ゲームセット, then the verdict, then the result screen (finale = null).
    if (old.winner === null && shown.winner !== null && !replaying) {
      setFinale('wait');
      later(() => setFinale(current => current === 'wait' ? 'set' : current), FINALE_WAIT);
      later(() => setFinale(current => current === 'set' ? 'verdict' : current), FINALE_WAIT + FINALE_SET);
      later(() => setFinale(current => current === 'verdict' ? null : current), FINALE_WAIT + FINALE_SET + FINALE_VERDICT);
    }
    const beginsTurn = shown.phase === 'playing' && (old.phase !== 'playing' || old.turn !== shown.turn);
    if (beginsTurn) {
      const announce = () => {
        const { order, number } = turnOf(shown);
        setTurnNotice({ id: shown.turn, own: mode === 'hotseat' || shown.active === view, order: order === 'first' ? '先攻' : '後攻', number, pp: shown.players[shown.active].pp, label: mode === 'watch' ? `${sideLabel(mode, shown.active)}のターン` : spectating ? `${spectating[shown.active]}のターン` : undefined });
        later(() => setTurnNotice(null), TURN_NOTICE_DURATION);
      };
      if (next.length) later(announce, Math.max(...next.map(f => f.delay)) + DRAW_DURATION);
      else announce();
    }
  }, [shown, view, mode, replaying, container, later, spectating, DRAW_DURATION, FLIGHT_REST]);

  /**
   * Runs `commit` (applying the command) with its animation: attacks lunge first; cards, skills and
   * chosen targets of the opponent or of any CPU side are shown before they resolve, so the result
   * can be followed. `cardId`: the card a play / reveal shows, when the match on the table hides it.
   */
  const run = useCallback((command: Command, commit: () => void, cardId?: string) => {
    const root = container.current;
    // Capture before submitting: a room's request now travels during this presentation.
    const captured = captureRects(root);
    // The answer to a hand reaction finishes the command that asked for it (an attack stays an attack).
    const answer = command.type === 'choose' && handReactionOps.includes(game.pending?.task.op ?? '');
    const apply = () => {
      enabled.current = true;
      if (!answer) lastCommand.current = command.type;
      rectsBefore.current = captured;
      commit();
    };
    const lags = !replaying && !spectating && mode !== 'hotseat' && mode !== 'watch' && Math.random() < FAKE_LAG_CHANCE && answerable(game, command, view, cpuSides);
    const lag = (delay: number) => {
      setLagging(true);
      later(() => { setLagging(false); apply(); }, delay + fakeLag());
    };
    // A spectator is shown either side's cards and choices like an opponent's.
    const opponent = command.actor !== view || cpuSides.includes(command.actor) || !!spectating;
    // Discarding うぃまる is an activation, including when the human uses it on the CPU's turn.
    const handReaction = command.type === 'choose' && game.pending?.task.op === 'eatResponse' && command.option !== 'skip';
    const announced = opponent || handReaction ? describe(game, command, cardId) : null;
    if (announced) {
      setAnnouncement(announced);
      later(apply, ANNOUNCE_HIT);
      later(() => setAnnouncement(current => current?.id === announced.id ? null : current), ANNOUNCE_DURATION);
      return;
    }
    // The opponent picked an option that is not on the table (pay extra PP, skip …): say which.
    // Declining a hand reaction is not shown: the question never was.
    const option = opponent && command.type === 'choose' && game.pending?.task.op !== 'draw' && !(answer && command.option === 'skip')
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
        if (lags) lag(STRIKE_HIT);
        else later(apply, STRIKE_HIT);
        later(() => setStrike(null), STRIKE_DURATION);
        return;
      }
    }
    if (lags) lag(0);
    else apply();
  }, [game, view, cpuSides, container, later, spectating, mode, replaying, STRIKE_HIT, STRIKE_DURATION, ANNOUNCE_HIT, ANNOUNCE_DURATION, PING_HIT, PING_DURATION, CHOICE_HIT, CHOICE_DURATION]);

  /** Loads, restores and undo jump without animating the difference. */
  const skipNext = useCallback(() => { enabled.current = false; }, []);
  const reset = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    enabled.current = false;
    setFlights([]);
    setStrike(null);
    setTurnNotice(null);
    setAnnouncement(null);
    setPing(null);
    setOrder(null);
    setFinale(null);
    setHits([]);
    setPops([]);
    setEffectRoll(null);
    setChoiceNote(null);
    setLagging(false);
  }, []);
  /** A tap moves on: ゲームセット → verdict → result screen. */
  const advanceFinale = useCallback(() => setFinale(current => current === 'set' ? 'verdict' : current === 'verdict' ? null : current), []);

  return { timing, flights, strike, turnNotice, announcement, ping, order, finale, hits, pops, effectRoll, choiceNote, advanceFinale, busy: flights.some(blocksPlay) || !!strike || !!turnNotice || !!announcement || !!ping || !!order || !!effectRoll || !!choiceNote || lagging, run, skipNext, reset };
}

/**
 * The player who is `view` would wait for the other player's hand reaction to `command`, if they hold
 * one (judged from what `view` can know: a hidden card may be anything). The other player decides
 * elsewhere: a CPU, or a room's other seat.
 */
function answerable(game: GameState, command: Command, view: Side, cpuSides: Side[]): boolean {
  // The turn's draw is answered by the player who just ended their turn.
  const waiter = command.type === 'end' ? other(command.actor) : command.actor, decider = other(waiter);
  if (waiter !== view || cpuSides.includes(waiter)) return false;
  const exists = (...ids: string[]) => Object.values(game.cards).some(card => card.cardId === HIDDEN_CARD || ids.includes(card.cardId));
  if (command.type === 'attack') return exists('y_33', 'y_64', 'y_91');
  if (command.type === 'play') {
    const cardId = game.cards[command.uid]?.cardId;
    return gameCatalog[cardId]?.type === 'yojo' && !!scriptOf(cardId).onPlay && game.players[decider].hand.length >= 3 && exists('y_109');
  }
  return command.type === 'end' && game.players[decider].pp >= 4 && exists('y_122');
}

let choiceId = 0;
let announcementId = 0;
/** Announced plays, skills, reveals and activated hand effects. */
function describe(game: GameState, command: Command, cardId?: string): Announcement | null {
  const id = ++announcementId;
  if (command.type === 'choose' && game.pending?.task.op === 'eatResponse' && command.option !== 'skip'
    && game.pending.task.actor === command.actor && game.players[command.actor].hand.includes(command.option)
    && (cardId ?? game.cards[command.option]?.cardId) === 'y_64') {
    return { id, kind: 'reaction', side: command.actor, cardId: 'y_64', title: 'うぃまるを使った！', text: '手札から公開してお昼寝場所へ\nお菓子ポイントの変動を無効化' };
  }
  if (command.type === 'play' || command.type === 'reveal') {
    const card = displayCards[cardId ?? game.cards[command.uid]?.cardId];
    return card && { id, kind: command.type, side: command.actor, cardId: card.id, title: card.name, text: card.effect ?? '' };
  }
  if (command.type === 'skill') {
    const ref = skillAt(game.players[command.actor], command.index);
    return ref ? { id, kind: 'skill', side: command.actor, cardId: ref.playable, title: ref.skill.name, text: skillDescription(displayCards[ref.playable].effect, ref.origin) } : null;
  }
  return null;
}
