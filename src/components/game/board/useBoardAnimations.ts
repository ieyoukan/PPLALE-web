'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { canAttack, other, skillsFor } from '@pplale/game-core';
import type { Command, DeckKind, GameState, Side } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { skillDescription } from '@/lib/game/skillText';
import type { DrawFlight } from '../BoardPieces';
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
/** End of the match: `wait` for the last animation, ゲームセット, the verdict; null shows the result screen. */
export type Finale = 'wait' | 'set' | 'verdict' | null;
/** Damage just taken by a unit or by a side's sweet points, shown large over it. */
export type Hit = { id: number; amount: number; x: number; y: number; /** Dealt by a unit's attack (a scuffle cloud) or by an effect (a flash). */ kind: 'attack' | 'effect' };
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
// A destroyed unit stays put while its damage shows, then is carried to its pile.
const FALL_DELAY = 450;
const FALL_REST = 350;
export const ORDER_NOTICE_DURATION = 3200;
// The last blow lands, then ゲームセット and the verdict are shown before the result screen.
const FINALE_WAIT = 700;
const FINALE_SET = 1700;
const FINALE_VERDICT = 2400;
const rectOf = (element: Element) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
};

/**
 * Visual effects derived from state changes: cards flying from deck to hand, the attack lunge and
 * the turn announcement. Nothing here changes the game; `busy` tells the board to wait.
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
  /** Where each unit was before the command, for units that are destroyed by it. */
  const unitRects = useRef(new Map<string, ReturnType<typeof rectOf>>());
  /** The command being applied, so its damage can be shown as an attack or as an effect. */
  const lastCommand = useRef<Command['type'] | null>(null);
  const previous = useRef(game);
  const enabled = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((callback: () => void, delay: number) => { timers.current.push(setTimeout(callback, delay)); }, []);

  // Compare with the previous state: new hand cards that came from a deck fly in.
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = game;
    if (!enabled.current || old === game || !container.current) return;
    const root = container.current;
    if (game.effectBlocks?.revision === game.revision) {
      const seen = new Set<string>();
      const targets = game.effectBlocks.events.flatMap(event => {
        const element = root.querySelector(`[data-unit="${event.uid}"]`);
        if (seen.has(event.uid) || !game.cards[event.uid]) return [];
        seen.add(event.uid);
        return [{ ...event, cardId: game.cards[event.uid].cardId, ...(element ? rectOf(element) : { x: 0, y: 0, width: 0, height: 0 }) }];
      });
      if (targets.length) {
        setAnnouncement(null);
        setPing(null);
        setBlocked({ id: game.revision, targets });
        later(() => setBlocked(current => current?.id === game.revision ? null : current), 1200);
      }
    }
    // Damage taken: by units (also ones destroyed by it, at their last position) and by sweet points.
    const struck: Hit[] = [];
    const at = (rect: ReturnType<typeof rectOf> | undefined, amount: number) => { if (rect && amount > 0) struck.push({ id: ++hitId, amount, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, kind: lastCommand.current === 'attack' ? 'attack' : 'effect' }); };
    for (const side of [0, 1] as Side[]) {
      for (const uid of old.players[side].field) {
        const element = root.querySelector(`[data-unit="${uid}"]`);
        at(element ? rectOf(element) : unitRects.current.get(uid), (game.cards[uid]?.damage ?? 0) - old.cards[uid].damage);
      }
      const leader = root.querySelector(`[data-leader="${side}"]`);
      at(leader ? rectOf(leader) : undefined, old.players[side].points - game.players[side].points);
    }
    if (struck.length) {
      setHits(current => [...current, ...struck]);
      later(() => setHits(current => current.filter(hit => !struck.includes(hit))), HIT_DURATION);
    }
    // Units that left the field for a pile (お昼寝場所 / 除外) are carried there from where they stood.
    const fallen: DrawFlight[] = [];
    for (const side of [0, 1] as Side[]) {
      for (const uid of old.players[side].field) {
        const owner = ([0, 1] as Side[]).find(s => game.players[s].nap.includes(uid) || game.players[s].exile.includes(uid));
        const from = unitRects.current.get(uid);
        if (owner === undefined || !from || !game.cards[uid]) continue;
        const pile = root.querySelector(`[data-deck="${owner}-${game.players[owner].nap.includes(uid) ? 'nap' : 'exile'}"] [data-stack]`);
        // The far side's cards lie upside down on the table; they keep that way up on the way to the pile.
        if (pile) fallen.push({ uid, cardId: game.cards[uid].cardId, face: true, turn: side !== view, fallen: true, from, to: rectOf(pile) });
      }
    }
    if (fallen.length) {
      setFlights(current => [...current, ...fallen]);
      // The card rests on the pile for a moment: removing it exactly when the flight should end cuts the
      // landing off whenever the animation starts a little late (a busy frame).
      later(() => setFlights(current => current.filter(f => !fallen.includes(f))), FALL_DELAY + DRAW_DURATION + FALL_REST);
    }
    const next: DrawFlight[] = [];
    for (const side of [0, 1] as Side[]) {
      for (const uid of game.players[side].hand) {
        if (old.players[side].hand.includes(uid)) continue;
        const kind: DeckKind | null = old.players[side].yojo.includes(uid) ? 'yojo' : old.players[side].sweet.includes(uid) ? 'sweet' : null;
        const source = kind && root.querySelector(`[data-deck="${side}-${kind}"] [data-stack]`);
        const target = root.querySelector(`[data-hand="${uid}"]`);
        if (!source || !target) continue;
        next.push({ uid, cardId: game.cards[uid].cardId, face: side === view || mode === 'watch' || game.cards[uid].revealed, turn: side !== view, from: rectOf(source), to: rectOf(target) });
      }
    }
    if (next.length) {
      setFlights(current => [...current, ...next]);
      later(() => setFlights(current => current.filter(f => !next.some(n => n.uid === f.uid))), DRAW_DURATION);
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
        setTurnNotice({ id: game.turn, own: mode === 'hotseat' || game.active === view, number: game.players[game.active].turns, pp: game.players[game.active].pp, label: mode === 'watch' ? `${sideLabel(mode, game.active)}のターン` : undefined });
        later(() => setTurnNotice(null), TURN_NOTICE_DURATION);
      };
      if (next.length) later(announce, DRAW_DURATION);
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
      unitRects.current = new Map(Array.from(root?.querySelectorAll<HTMLElement>('[data-unit]') ?? [], element => [element.dataset.unit!, rectOf(element)]));
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
    // Mulligan: the cards given back fly from the hand into their decks.
    if (command.type === 'mulligan' && root) {
      const back: DrawFlight[] = command.uids.flatMap(uid => {
        const kind = gameCatalog[game.cards[uid]?.cardId]?.type;
        const source = root.querySelector(`[data-hand="${uid}"]`);
        const target = root.querySelector(`[data-deck="${command.actor}-${kind}"] [data-stack]`) ?? root.querySelector(`[data-deck="${command.actor}-${kind}"]`);
        return source && target ? [{ uid, cardId: game.cards[uid].cardId, face: command.actor === view || mode === 'watch', turn: false, returning: true, from: rectOf(source), to: rectOf(target) }] : [];
      });
      if (back.length) {
        setFlights(current => [...current, ...back]);
        later(() => setFlights(current => current.filter(f => !back.some(b => b.uid === f.uid))), DRAW_DURATION);
      }
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
  }, [game, view, mode, cpuSides, container, later]);

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
  }, []);
  /** A tap moves on: ゲームセット → verdict → result screen. */
  const advanceFinale = useCallback(() => setFinale(current => current === 'set' ? 'verdict' : current === 'verdict' ? null : current), []);

  return { flights, strike, turnNotice, announcement, ping, blocked, order, finale, hits, advanceFinale, busy: flights.length > 0 || !!strike || !!turnNotice || !!announcement || !!ping || !!blocked || !!order, run, skipNext, reset };
}

let hitId = 0;
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
