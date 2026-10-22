'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { attackTargets, canPlay, costOf, handReactionOps, other, pendingView } from '@pplale/game-core';
import type { BoardEdit, Command, DeckKind, EditZone, GameState, Side } from '@pplale/game-core';
import type { ZoneKind } from '../BoardPieces';
import type { RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { gameCatalog } from '@/lib/game/catalog';
import { useMyProfile } from '../social/useMyProfile';
import { learningConsent, reportMatch } from '@/lib/game/cpuServer';
import { HOME_PATH, PUZZLES_PATH } from '@/lib/game/sessionStore';
import { useBoardAnimations } from './useBoardAnimations';
import { useCardDrag } from './useCardDrag';
import type { DragSource } from './useCardDrag';
import { useAssessment, useAssessmentSetting } from './useAssessment';
import { useCpuPlayer } from './useCpuPlayer';
import { cpuSidesOf, sideLabel } from './useGameSession';
import type { BoardSession } from './useGameSession';
import { useOpeningDice } from './useOpeningDice';
import { enterLandscape } from '../stage/stageSpace';

export type Panel =
  | { type: 'menu' } | { type: 'deck' } | { type: 'counts' } | { type: 'logs' } | { type: 'analysis' }
  | { type: 'inspect'; uid: string } | { type: 'skills'; side: Side } | { type: 'zone'; side: Side; kind: 'nap' | 'exile' }
  // 盤面エディタ (edit mode)
  | { type: 'editUnit'; uid: string } | { type: 'editHand'; uid: string } | { type: 'editPile'; side: Side; kind: ZoneKind }
  | { type: 'editPlayer'; side: Side } | { type: 'editMenu' } | { type: 'play' }
  | null;
/** Where a card chosen in the card picker goes (edit mode). */
export type Picking = { side: Side; zone: EditZone | 'played'; slot?: number };

const typeOf = (game: GameState, uid: string) => gameCatalog[game.cards[uid].cardId].type;
// A replay moves quickly through the opening and leaves time to follow each turn.
const REPLAY_DELAY = 500;
const REPLAY_OPENING_DELAY = 150;

/**
 * Everything the board UI needs: the match, who may act, what is targetable, and the handlers
 * for each kind of tap / drag. Components read it through BoardContext and stay presentational.
 */
export function useBoard(container: RefObject<HTMLDivElement | null>, session: BoardSession) {
  const [panel, setPanel] = useState<Panel>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const router = useRouter();
  /** Set in a room: the seat this browser plays, and the changes arriving from the server. */
  const { remote, puzzle } = session;
  const puzzleFinished = !!puzzle && puzzle.status !== 'playing';
  const { game: actual, mode, levels, ready, error, saveError, canUndo, send, undo: undoCommand, replaying, replayNext, setup, canRematch, canReplay, position, editing, edit: editSession } = session;
  const profile = useMyProfile(!remote && mode !== 'watch');
  /** Public profile only. Loading/missing profiles must never fall back to a Google account name. */
  const localNames = useMemo<[string, string]>(() => [mode !== 'watch' && profile?.displayName || sideLabel(mode, 0), sideLabel(mode, 1)], [mode, profile]);
  const names = remote?.names ?? localNames;
  const home: Side = remote?.seat ?? (mode === 'watch' ? 1 : 0);
  const [view, setView] = useState<Side>(home);
  const [selected, setSelected] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  /** Opening cards marked to be given back in the mulligan. */
  const [exchanges, setExchanges] = useState<string[]>([]);
  /** The saved match is still loading; nothing may act yet. */
  const loading = !ready;
  // Nobody controls a replay: both sides are driven, like watching two CPUs. A recorded room match arrives like a room's.
  const cpuSides = useMemo<Side[]>(() => replaying && !remote ? [0, 1] : editing ? [] : cpuSidesOf(mode), [mode, replaying, editing, remote]);
  const watching = !!remote?.watching;
  /** This screen acts for the side (nobody does while watching two CPUs; in a room only the own seat). */
  const seat = remote?.seat;
  const canControl = useCallback((side: Side) => seat === undefined ? !cpuSides.includes(side) : !watching && side === seat, [cpuSides, seat, watching]);
  // While the other player decides whether to answer from their hand, the table stays as it was
  // before: what the command already changed (an attacker that has acted, the next turn begun) would
  // tell that they hold such a card. Once they answer with one, it is no secret. See 偽ラグ in useBoardAnimations.
  const task = actual.pending?.task;
  const deciding = !!task && handReactionOps.includes(task.op) && !(task.op === 'playResponse' ? task.subject : task.ids?.length) && !canControl(task.actor)
    && mode !== 'watch' && !watching && !replaying;
  const [before, setBefore] = useState(actual);
  if (!deciding && before !== actual) setBefore(actual);
  const game = deciding ? before : actual;
  const animations = useBoardAnimations({ game: actual, shown: game, view, mode, cpuSides, replaying, container, spectating: watching ? names : undefined });
  const { run: animate, skipNext: skipAnimation, flights, strike, turnNotice, announcement, ping, order, effectRoll, choiceNote, busy: animating } = animations;
  // The request travels while the presentation runs. Only the presentation gates accepting its view.
  const [presentingOwn, setPresentingOwn] = useState(false);
  const [intent, setIntent] = useState<Command | null>(null);
  const roomInputLocked = useRef(false);

  /** Sends a command (with its animation). Clears the local selection of the acting side. */
  const act = useCallback((command: Command) => {
    if (remote && (remote.watching || remote.sending || roomInputLocked.current || remote.waiting && actual.phase === 'playing')) return;
    const inputAt = performance.now();
    if (remote) roomInputLocked.current = true;
    if (command.actor === view) {
      setSelected(null);
      setAttacker(null);
      setExchanges([]);
    }
    if (remote) {
      setIntent(command);
      setPresentingOwn(true);
      animate(command, () => setPresentingOwn(false));
      send(command,inputAt);
    } else animate(command, () => send(command));
  }, [view, animate, send, remote, actual.phase]);

  const presented = remote?.presented;
  useLayoutEffect(() => {
    if (!presented || watching) return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => presented(game.revision)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  },[presented,game.revision,watching]);

  const dice = useOpeningDice({ game: actual, act, paused: loading, cpuSides, cpuRolls: ready && !loading && !paused && !animating, remote: !!remote });
  const { busy: rollingDice } = dice;
  const moving = animating || rollingDice || !!remote?.waiting || presentingOwn;
  const busy = moving || deciding;
  // Opening draws are independent: the other side's flights must not retain our submission lock.
  useLayoutEffect(() => {
    if (!presentingOwn && !remote?.waiting) roomInputLocked.current = false;
  }, [presentingOwn, remote?.waiting]);
  const modelUsed = useCpuPlayer({
    enabled: ready && !replaying && !puzzleFinished && cpuSides.length > 0 && !loading && !paused, sides: cpuSides, levels, game: actual, act, flights,
    busy: { any: moving, blocking: rollingDice || !!strike || !!turnNotice || !!announcement || !!ping || !!order || !!effectRoll || !!choiceNote },
  });
  // A finished match against さいきょう goes to the CPU server once, if this browser agreed to it.
  // The course of the match (形勢), judged with what side 0 can know.
  const [showAssessment, setShowAssessment] = useAssessmentSetting();
  const assessable = !editing && (remote ? !!remote.assessment?.length : mode === 'cpu' || mode === 'watch' || mode === 'hotseat');
  const { initial, commands } = session;
  const localAssessment = useAssessment({ enabled: !remote && assessable && showAssessment && ready, initial, current: actual, commands, viewer: 0 });
  const assessment = showAssessment ? remote?.assessment ?? localAssessment : [];
  const { record, markReported } = session;
  useEffect(() => {
    if (mode !== 'cpu' || levels[1] !== 'master' || typeof game.winner !== 'number') return;
    if (!record || record.reported || !learningConsent.given()) return;
    reportMatch({ seed: record.seed, decks: record.decks, commands: record.commands, model: modelUsed.current ?? 'unknown' });
    markReported();
  }, [mode, levels, game.winner, record, markReported, modelUsed]);

  // ── Replay ──
  const { stopReplay: endReplay } = session;
  // Feeds the recorded commands one at a time. The dice hook throws the dice itself (same result).
  useEffect(() => {
    if (!replaying || remote || paused || busy) return;
    if (!replayNext || error) {
      // The recorded match is over (or no longer applies): back to its result without animating the jump.
      skipAnimation();
      return endReplay();
    }
    if (replayNext.type === 'roll') return;
    const timer = setTimeout(() => act(replayNext), game.phase === 'playing' ? REPLAY_DELAY : REPLAY_OPENING_DELAY);
    return () => clearTimeout(timer);
  }, [replaying, remote, paused, busy, replayNext, error, endReplay, skipAnimation, act, game.phase]);

  // ── Room ──
  // Shows the changes the server sends, one at a time: the answer to this seat's own command goes
  // straight onto the table (its animation already ran), the other side's is announced first
  // (for a spectator, either side's).
  const next = remote?.next, accept = remote?.accept;
  const handling = useRef<string | null>(null);
  const { reset: resetAnimations } = animations, { reset: resetDice, show: showDie } = dice;
  useEffect(() => {
    if (!next || !accept || seat === undefined || handling.current === next.key || replaying && paused) return;
    const { key, command, cardId, fresh, game: after } = next;
    if (fresh) {
      handling.current = key;
      resetAnimations();
      resetDice();
      setPresentingOwn(false);
      setIntent(null);
      roomInputLocked.current = false;
      setSelected(null);
      setAttacker(null);
      setExchanges([]);
      setPanel(null);
      return accept();
    }
    if (command?.type === 'roll') {
      if (rollingDice) return;
      handling.current = key;
      return showDie(command.actor, after.dice?.rolls[command.actor] ?? 1, accept);
    }
    if (!command || !watching && command.actor === seat) {
      if (presentingOwn) return;
      handling.current = key;
      return accept();
    }
    const parallelDraw = command.type === 'openingDraw' && (actual.phase === 'opening' || actual.phase === 'mulligan');
    if (rollingDice || animating && !parallelDraw) return;
    handling.current = key;
    // A hand reaction reveals its card in the resulting public zone, even if the previous hand was hidden.
    const shownCardId = cardId ?? (command.type === 'choose' ? after.cards[command.option]?.cardId : undefined);
    animate(command, accept, shownCardId);
  }, [next, accept, seat, watching, replaying, paused, animating, rollingDice, animate, resetAnimations, resetDice, showDie, presentingOwn, actual.phase]);

  // A replay moved to another position: what was being presented is dropped and the new position shown as it is.
  const timeline = session.timeline;
  const seekReplay = useCallback((at: number) => {
    if (!timeline || at === timeline.at) return;
    handling.current = null;
    resetAnimations();
    resetDice();
    skipAnimation();
    setSelected(null);
    setAttacker(null);
    setExchanges([]);
    timeline.seek(at);
  }, [timeline, resetAnimations, resetDice, skipAnimation]);

  const failed = remote?.failed;
  useEffect(() => {
    if (!failed) return;
    // Reset cancels queued presentation callbacks too; let an unaccepted server view run again.
    handling.current = null;
    resetAnimations();
    setPresentingOwn(false);
    setIntent(null);
    roomInputLocked.current = false;
  }, [failed, resetAnimations]);

  // Watching starts from CPU 2's seat, so CPU 1 is on top and CPU 2 at the bottom (on the table and the versus screen).
  useEffect(() => { if (mode === 'watch') setView(1); }, [mode]);
  // Same-device play follows whoever has to act.
  useEffect(() => {
    if (mode === 'hotseat' && !editing && (game.phase === 'playing' || game.phase === 'mulligan') && !busy) setView(game.pending?.task.actor ?? game.active);
  }, [mode, editing, game.phase, game.active, game.pending, busy]);
  // The board is edited from the near side's seat, whoever's turn it is set to be.
  useEffect(() => { if (editing) setView(0); }, [editing]);

  // ── Derived state ──
  const me = game.players[view];
  const pending = useMemo(() => pendingView(game), [game]);
  const ours = !!pending && canControl(pending.actor);
  const attacks = useMemo(() => attackTargets(game, game.active, gameCatalog), [game]);
  const playEnabled = !editing && !puzzleFinished && game.phase === 'playing' && canControl(view) && game.active === view && !game.pending && !busy && !loading && game.winner === null;
  const flying = (uid: string) => flights.some(f => f.uid === uid);
  const canStrike = useCallback((uid: string, target: string | 'leader') => game.active === view && !!attacks[uid]?.includes(target), [attacks, game.active, view]);
  const canAttackNow = (uid: string) => !!attacks[uid];
  const affordable = (uid: string) => playEnabled && costOf(game, uid, gameCatalog, view) <= me.pp && canPlay(game, view, uid, gameCatalog);
  /** The pending choice lets the player pick this option id. */
  const isOption = (id: string) => ours && !!pending && [...pending.units, ...pending.hand].includes(id);

  // ── Actions ──
  const choose = (option: string) => { if (ours && pending && !busy) act({ type: 'choose', actor: pending.actor, option }); };
  const play = (uid: string, slot?: number) => act({ type: 'play', actor: view, uid, slot });
  /** One change of the board in edit mode, shown at once (no animation). */
  const editBoard = useCallback((change: BoardEdit) => {
    skipAnimation();
    editSession(change);
  }, [skipAnimation, editSession]);
  const adjust = (side: Side, resource: 'points' | 'ppBonus' | 'pp', delta: number) => {
    const p = game.players[side];
    if (editing) return editBoard({ type: 'player', side, [resource]: p[resource] + delta });
    act({ type: 'adjust', actor: side, resource, delta });
  };

  function deckReady(side: Side, kind: DeckKind) {
    if (remote?.sending) return false;
    // Opening draws, and the redraws after giving cards back in the mulligan (once those have landed in the deck).
    const redraw = game.phase === 'mulligan' && !game.mulligan.confirmed[side] && !flights.some(f => f.toZone === 'yojo' || f.toZone === 'sweet');
    if (game.phase === 'opening' || redraw) return canControl(side) && !loading && !rollingDice && game.openingRemaining[side] > 0 && !flights.some(f => game.players[side].hand.includes(f.uid));
    return ours && !busy && !loading && pending!.actor === side && pending!.decks.includes(kind);
  }
  function clickDeck(side: Side, kind: DeckKind) {
    if (editing) return setPanel({ type: 'editPile', side, kind });
    if (game.phase === 'opening' || game.phase === 'mulligan') act({ type: 'openingDraw', actor: side, deck: kind });
    else choose(kind);
  }
  /** Tap on a field slot: pick an effect target, attack, place the selected unit, or inspect. */
  function clickSlot(side: Side, uid: string | undefined, slot: number) {
    if (editing) return uid ? setPanel({ type: 'editUnit', uid }) : setPicking({ side, zone: 'field', slot });
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
    if (editing) return setPanel({ type: 'editHand', uid });
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
      // Edit mode: units move between slots, hand units are put on the field.
      if (editing) return { canDrag: true };
      if (busy || kind === 'field' && (!playEnabled || !attacks[uid])) return null;
      return { canDrag: playEnabled && (kind === 'field' || costOf(game, uid, gameCatalog, view) <= game.players[view].pp && canPlay(game, view, uid, gameCatalog)) };
    }, [editing, busy, playEnabled, attacks, game, view]),
    onDragStart: useCallback((uid: string, kind: DragSource) => {
      // Edit mode only moves the card: nothing is selected to attack with or to play.
      if (editing) return;
      setAttacker(kind === 'field' ? uid : null);
      setSelected(kind === 'hand' ? uid : null);
    }, [editing]),
    // Drop a unit on an enemy / their sweets to attack; a hand card on an empty slot or the table to play.
    onDrop: useCallback((uid: string, kind: DragSource, target: Element | null) => {
      if (editing) {
        const slot = target?.closest<HTMLElement>('[data-slot]');
        if (!slot || slot.dataset.unit || slot.dataset.side !== String(view)) return;
        const at = Number(slot.dataset.slot);
        if (kind === 'field') return editBoard({ type: 'move', uid, slot: at });
        if (typeOf(game, uid) === 'yojo') editBoard({ type: 'toField', uid, slot: at });
        return;
      }
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
    }, [editing, editBoard, view, canStrike, act, game]),
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
  /** Back to the game menu. The match stays saved and can be resumed from there. */
  function leave() {
    if (remote) remote.leave();
    else router.push(puzzle ? PUZZLES_PATH : HOME_PATH);
  }
  /** Switching to another match (rematch, replay, back from a replay): nothing carries over. */
  function resetTable() {
    animations.reset();
    dice.reset();
    setView(home);
    setSelected(null);
    setAttacker(null);
    setExchanges([]);
    setPanel(null);
    setPaused(false);
  }
  function rematch() { resetTable(); session.rematch(); }
  /** Edit mode on the position on the table. */
  function openEditor() {
    resetTable();
    session.startEdit();
  }
  /** Edit mode on the board the match started from. */
  function editStartingBoard() {
    resetTable();
    session.editStart();
  }
  function startReplay() { resetTable(); session.startReplay(); }
  function stopReplay() { resetTable(); session.stopReplay(); }
  function undo() {
    animations.skipNext();
    undoCommand();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void enterLandscape();
  }
  function clearSelection() {
    setPanel(null);
    setSelected(null);
    setAttacker(null);
    drag.cancel();
  }

  return {
    game, mode, levels, view, me, panel, ready, busy, paused, names, remote, puzzle,
    assessment, assessable, showAssessment, setShowAssessment,
    setup, canRematch, canReplay, replaying, timeline, seekReplay, position, editBoard: openEditor, editStartingBoard,
    editing, edit: editBoard, picking, setPicking, session,
    error: error || saveError, canUndo,
    selected, attacker, pending, ours, playEnabled,
    animations, dice, drag, mulligan,
    intent: remote && (presentingOwn || remote.waiting) ? intent : null,
    canControl, canStrike, canAttackNow, affordable, isOption, flying, deckReady,
    act, choose, play, adjust, clickDeck, clickSlot, clickHand, attackLeader,
    setPanel, setSelected, setAttacker, setView, setPaused, leave, undo, clearSelection, toggleFullscreen, rematch, startReplay, stopReplay,
  };
}
export type Board = ReturnType<typeof useBoard>;
