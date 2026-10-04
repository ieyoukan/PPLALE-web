'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { attackTargets, canPlay, costOf, other, pendingView } from '@pplale/game-core';
import type { Command, DeckKind, GameState, Side } from '@pplale/game-core';
import type { RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { gameCatalog } from '@/lib/game/catalog';
import { LOBBY_PATH } from '@/lib/game/sessionStore';
import { useBoardAnimations } from './useBoardAnimations';
import { useCardDrag } from './useCardDrag';
import type { DragSource } from './useCardDrag';
import { useCpuPlayer } from './useCpuPlayer';
import { cpuSidesOf, useGameSession } from './useGameSession';
import { useOpeningDice } from './useOpeningDice';

export type Panel =
  | { type: 'menu' } | { type: 'logs' }
  | { type: 'inspect'; uid: string } | { type: 'skills'; side: Side } | { type: 'zone'; side: Side; kind: 'nap' | 'exile' }
  | null;

const typeOf = (game: GameState, uid: string) => gameCatalog[game.cards[uid].cardId].type;

/**
 * Everything the board UI needs: the match, who may act, what is targetable, and the handlers
 * for each kind of tap / drag. Components read it through BoardContext and stay presentational.
 */
export function useBoard(container: RefObject<HTMLDivElement | null>) {
  const [panel, setPanel] = useState<Panel>(null);
  const router = useRouter();
  // No saved match (opened directly, or storage cleared): prepare one first.
  const { game, mode, levels, ready, error, saveError, canUndo, send, undo: undoCommand } = useGameSession({ onMissing: () => router.replace(LOBBY_PATH) });
  const [view, setView] = useState<Side>(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  /** Opening cards marked to be given back in the mulligan. */
  const [exchanges, setExchanges] = useState<string[]>([]);
  /** The saved match is still loading; nothing may act yet. */
  const loading = !ready;
  const cpuSides = useMemo(() => cpuSidesOf(mode), [mode]);
  const animations = useBoardAnimations({ game, view, mode, cpuSides, container });
  const { run: animate, flights, strike, turnNotice, announcement, ping, blocked, busy: animating } = animations;
  /** A human acts for this side (nobody does while watching two CPUs). */
  const canControl = useCallback((side: Side) => !cpuSides.includes(side), [cpuSides]);

  /** Sends a command (with its animation). Clears the local selection of the acting side. */
  const act = useCallback((command: Command) => {
    if (command.actor === view) {
      setSelected(null);
      setAttacker(null);
      setExchanges([]);
    }
    animate(command, () => send(command));
  }, [view, animate, send]);

  const dice = useOpeningDice({ game, act, paused: loading, cpuSides, cpuRolls: ready && !loading && !paused && !animating });
  const { busy: rollingDice } = dice;
  const busy = animating || rollingDice;
  useCpuPlayer({
    enabled: ready && cpuSides.length > 0 && !loading && !paused, sides: cpuSides, levels, game, act, flights,
    busy: { any: busy, blocking: rollingDice || !!strike || !!turnNotice || !!announcement || !!ping || !!blocked },
  });

  // Same-device play follows whoever has to act.
  useEffect(() => {
    if (mode === 'hotseat' && (game.phase === 'playing' || game.phase === 'mulligan') && !busy) setView(game.pending?.task.actor ?? game.active);
  }, [mode, game.phase, game.active, game.pending, busy]);

  // ── Derived state ──
  const me = game.players[view];
  const pending = useMemo(() => pendingView(game), [game]);
  const ours = !!pending && canControl(pending.actor);
  const attacks = useMemo(() => attackTargets(game, game.active, gameCatalog), [game]);
  const playEnabled = game.phase === 'playing' && canControl(view) && game.active === view && !game.pending && !busy && !loading && game.winner === null;
  const flying = (uid: string) => flights.some(f => f.uid === uid);
  const canStrike = useCallback((uid: string, target: string | 'leader') => game.active === view && !!attacks[uid]?.includes(target), [attacks, game.active, view]);
  const canAttackNow = (uid: string) => !!attacks[uid];
  const affordable = (uid: string) => playEnabled && costOf(game, uid, gameCatalog, view) <= me.pp && canPlay(game, view, uid, gameCatalog);
  /** The pending choice lets the player pick this option id. */
  const isOption = (id: string) => ours && !!pending && [...pending.units, ...pending.hand].includes(id);

  // ── Actions ──
  const choose = (option: string) => { if (ours && pending && !busy) act({ type: 'choose', actor: pending.actor, option }); };
  const play = (uid: string, slot?: number) => act({ type: 'play', actor: view, uid, slot });
  const adjust = (side: Side, resource: 'points' | 'ppBonus' | 'pp', delta: number) => act({ type: 'adjust', actor: side, resource, delta });

  function deckReady(side: Side, kind: DeckKind) {
    // Opening draws, and the redraws after giving cards back in the mulligan (once those have landed in the deck).
    const redraw = game.phase === 'mulligan' && !game.mulligan.confirmed[side] && !flights.some(f => f.returning);
    if (game.phase === 'opening' || redraw) return canControl(side) && !loading && !rollingDice && game.openingRemaining[side] > 0 && !flights.some(f => game.players[side].hand.includes(f.uid));
    return ours && !busy && !loading && pending!.actor === side && pending!.decks.includes(kind);
  }
  function clickDeck(side: Side, kind: DeckKind) {
    if (game.phase === 'opening' || game.phase === 'mulligan') act({ type: 'openingDraw', actor: side, deck: kind });
    else choose(kind);
  }
  /** Tap on a field slot: pick an effect target, attack, place the selected unit, or inspect. */
  function clickSlot(side: Side, uid: string | undefined, slot: number) {
    if (uid && isOption(uid)) return choose(uid);
    if (attacker && side !== view && uid && canStrike(attacker, uid)) return act({ type: 'attack', actor: view, uid: attacker, target: uid });
    if (selected && side === view && !uid && playEnabled && typeOf(game, selected) === 'yojo') return play(selected, slot);
    if (uid && side === view && playEnabled && canAttackNow(uid)) {
      setAttacker(attacker === uid ? null : uid);
      setSelected(null);
      return;
    }
    if (!attacker && uid) setPanel({ type: 'inspect', uid });
  }
  /** Tap on a hand card: pick it for an effect, or select it to show its actions. */
  function clickHand(uid: string) {
    if (isOption(uid)) return choose(uid);
    setSelected(selected === uid ? null : uid);
    setAttacker(null);
  }
  function attackLeader() {
    if (attacker && canStrike(attacker, 'leader')) act({ type: 'attack', actor: view, uid: attacker, target: 'leader' });
  }

  const drag = useCardDrag({
    container,
    canPick: useCallback((uid: string, kind: DragSource) => {
      if (busy || kind === 'field' && (!playEnabled || !attacks[uid])) return null;
      return { canDrag: playEnabled && (kind === 'field' || costOf(game, uid, gameCatalog, view) <= game.players[view].pp && canPlay(game, view, uid, gameCatalog)) };
    }, [busy, playEnabled, attacks, game, view]),
    onDragStart: useCallback((uid: string, kind: DragSource) => {
      setAttacker(kind === 'field' ? uid : null);
      setSelected(kind === 'hand' ? uid : null);
    }, []),
    // Drop a unit on an enemy / their sweets to attack; a hand card on an empty slot or the table to play.
    onDrop: useCallback((uid: string, kind: DragSource, target: Element | null) => {
      if (kind === 'field') {
        const unit = target?.closest<HTMLElement>('[data-unit]')?.dataset.unit;
        const leader = target?.closest<HTMLElement>('[data-leader]')?.dataset.leader;
        const id = unit ?? (leader === String(other(view)) ? 'leader' : null);
        if (id && canStrike(uid, id)) act({ type: 'attack', actor: view, uid, target: id });
        return;
      }
      const slot = target?.closest<HTMLElement>('[data-slot]');
      if (slot?.dataset.side === String(view) && !slot.dataset.unit && typeOf(game, uid) === 'yojo') act({ type: 'play', actor: view, uid, slot: Number(slot.dataset.slot) });
      else if (target?.closest('[data-table]') && typeOf(game, uid) === 'sweet') act({ type: 'play', actor: view, uid });
    }, [view, canStrike, act, game]),
  });

  // ── Mulligan ──
  const returning = me.hand.filter(uid => exchanges.includes(uid) && game.mulligan.eligible[view].includes(uid));
  const mulligan = {
    selected: returning,
    /** Replacements still to draw after giving cards back; each from either deck stack on the table. */
    remaining: game.phase === 'mulligan' && !game.mulligan.confirmed[view] ? game.openingRemaining[view] : 0,
    enabled: game.phase === 'mulligan' && !game.mulligan.confirmed[view] && canControl(view) && !game.pending && !rollingDice && !strike && !flights.some(f => me.hand.includes(f.uid)) && !loading,
    toggle: (uid: string, on: boolean) => setExchanges(current => on ? [...current.filter(id => id !== uid), uid] : current.filter(id => id !== uid)),
    confirm: () => act(returning.length ? { type: 'mulligan', actor: view, uids: returning } : { type: 'keep', actor: view }),
  };

  // ── Session ──
  /** Back to the preparation page. The match stays saved and can be resumed from there. */
  function leave() {
    router.push(LOBBY_PATH);
  }
  function undo() {
    animations.skipNext();
    undoCommand();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void container.current?.requestFullscreen().catch(() => {});
  }
  function clearSelection() {
    setPanel(null);
    setSelected(null);
    setAttacker(null);
    drag.cancel();
  }

  return {
    game, mode, levels, view, me, panel, ready, busy, paused,
    error: error || saveError, canUndo,
    selected, attacker, pending, ours, playEnabled,
    animations, dice, drag, mulligan,
    canControl, canStrike, canAttackNow, affordable, isOption, flying, deckReady,
    act, choose, play, adjust, clickDeck, clickSlot, clickHand, attackLeader,
    setPanel, setSelected, setAttacker, setView, setPaused, leave, undo, clearSelection, toggleFullscreen,
  };
}
export type Board = ReturnType<typeof useBoard>;
