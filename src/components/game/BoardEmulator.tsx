'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { applyCommand, canAttack, costOf, cpuCommand, maxPp, newGame, other, restoreGame, sandboxRules, skillsFor, attackOf, hpOf } from '@pplale/game-core';
import type { Command, DeckKind, GameState, Side } from '@pplale/game-core';
import { demoDeck, displayCards, gameCatalog } from '@/lib/game/catalog';
import { GameCard } from './GameCard';
import { MulliganBoard } from './MulliganBoard';
import { TurnAnnouncement, TURN_NOTICE_DURATION } from './TurnAnnouncement';
import type { TurnNotice } from './TurnAnnouncement';
import { OpeningDie, DICE_THROW_DURATION } from './OpeningDie';
import { GameSetup } from './GameSetup';
import { Counter, DeckStack, FlyingCard, PpPanel } from './BoardPieces';
import type { DrawFlight, ZoneKind } from './BoardPieces';
import styles from './BoardEmulator.module.css';

type Mode = 'cpu' | 'hotseat';
type Session = { game: GameState; error: string; history: GameState[] };
type Action = { type: 'command'; command: Command; test: boolean } | { type: 'load'; game: GameState } | { type: 'undo' };
type Panel = { type: 'menu' } | { type: 'setup' } | { type: 'inspect'; uid: string } | { type: 'skills'; side: Side } | { type: 'zone'; side: Side; kind: 'nap' | 'exile' } | { type: 'logs' } | null;
const STORAGE_KEY = 'pplale-game-session-v2';
const DRAW_DURATION = 800;
function reducer(session: Session, action: Action): Session {
  if (action.type === 'load') return { game: action.game, error: '', history: [] };
  if (action.type === 'undo') {
    const previous = session.history.at(-1);
    return previous ? { game: previous, error: '', history: session.history.slice(0, -1) } : session;
  }
  const result = applyCommand(session.game, action.command, gameCatalog, action.test);
  return result.error ? { ...session, error: result.error } : { game: result.state, error: '', history: [...session.history.slice(-19), session.game] };
}

export default function BoardEmulator() {
  const [session, dispatch] = useReducer(reducer, undefined, () => ({ game: newGame([{ ...demoDeck, name: 'あなた' }, { ...demoDeck, name: 'CPU' }], gameCatalog, sandboxRules, 42), error: '', history: [] }));
  const { game, error, history } = session;
  const [mode, setMode] = useState<Mode>('cpu');
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<Panel>({ type: 'setup' });
  const [view, setView] = useState<Side>(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);
  const [held, setHeld] = useState<{ uid: string; x: number; y: number } | null>(null);
  const [strike, setStrike] = useState<{ uid: string; cardId: string; x: number; y: number; dx: number; dy: number; width: number; height: number } | null>(null);
  const gesture = useRef<{ uid: string; kind: 'hand' | 'field'; x: number; y: number; moved: boolean; canDrag: boolean; scrolled?: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [paused, setPaused] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [exchanges, setExchanges] = useState<Record<string, DeckKind>>({});
  const [rolling, setRolling] = useState(false);
  const [rollingSide, setRollingSide] = useState<Side>(0);
  const [diceReveal, setDiceReveal] = useState(false);
  const [rollOutcome, setRollOutcome] = useState<number | null>(null);
  const [turnNotice, setTurnNotice] = useState<TurnNotice | null>(null);
  const [flights, setFlights] = useState<DrawFlight[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef(game);
  const animate = useRef(false);
  const animationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = rolling || diceReveal || flights.length > 0 || !!strike || !!turnNotice;
  const canControl = (side: Side) => mode === 'hotseat' || side === 0;
  const ours = game.pending && canControl(game.pending.task.actor);
  const drawPending = game.pending?.task.op === 'draw';
  const setup = panel?.type === 'setup';
  const act = useCallback((command: Command) => {
    const commit = () => { animate.current = true; dispatch({ type: 'command', command, test: mode === 'hotseat' }); };
    if (command.actor === view) { setSelected(null); setAttacker(null); setHeld(null); setExchanges({}); }
    if (command.type === 'attack' && container.current && canAttack(game, command.actor, command.uid, command.target, gameCatalog)) {
      const source = container.current.querySelector(`[data-unit="${command.uid}"]`);
      const target = container.current.querySelector(command.target === 'leader' ? `[data-leader="${other(command.actor)}"]` : `[data-unit="${command.target}"]`);
      if (source && target) {
        const a = source.getBoundingClientRect(), b = target.getBoundingClientRect();
        setStrike({ uid: command.uid, cardId: game.cards[command.uid].cardId, x: a.x, y: a.y, dx: b.x + b.width / 2 - a.x - a.width / 2, dy: b.y + b.height / 2 - a.y - a.height / 2, width: a.width, height: a.height });
        animationTimers.current.push(setTimeout(commit, 360), setTimeout(() => setStrike(null), 720));
        return;
      }
    }
    commit();
  }, [mode, game, view, setExchanges]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const state = restoreGame(saved.game, gameCatalog);
        if (state) { animate.current = false; dispatch({ type: 'load', game: state }); setMode(saved.mode === 'hotseat' ? 'hotseat' : 'cpu'); setPanel(null); }
        else setSaveError('前回の対戦を復元できませんでした');
      }
    } catch { setSaveError('前回の対戦を復元できませんでした'); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, mode })); }
    catch { setSaveError('このブラウザに対戦を保存できません'); }
  }, [ready, game, mode]);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = game;
    if (!animate.current || old === game || !container.current) return;
    const beginsTurn = game.phase === 'playing' && (old.phase !== 'playing' || old.turn !== game.turn);
    const next: DrawFlight[] = [];
    for (const side of [0, 1] as Side[]) for (const uid of game.players[side].hand) {
      if (old.players[side].hand.includes(uid)) continue;
      const kind: DeckKind | null = old.players[side].yojo.includes(uid) ? 'yojo' : old.players[side].sweet.includes(uid) ? 'sweet' : null;
      if (!kind) continue;
      const source = container.current.querySelector(`[data-deck="${side}-${kind}"] [data-stack]`);
      const target = container.current.querySelector(`[data-hand="${uid}"]`);
      if (!source || !target) continue;
      const from = source.getBoundingClientRect(), to = target.getBoundingClientRect();
      next.push({ uid, cardId: game.cards[uid].cardId, face: side === view || game.cards[uid].revealed, turn: side !== view,
        from: { x: from.x, y: from.y, width: from.width, height: from.height }, to: { x: to.x, y: to.y, width: to.width, height: to.height } });
    }
    if (next.length) {
      setFlights(current => [...current, ...next]);
      animationTimers.current.push(setTimeout(() => setFlights(current => current.filter(f => !next.some(n => n.uid === f.uid))), DRAW_DURATION));
    }
    if (beginsTurn) {
      const announce = () => {
        setTurnNotice({ id: game.turn, own: mode === 'hotseat' || game.active === view, number: game.players[game.active].turns, pp: game.players[game.active].pp });
        animationTimers.current.push(setTimeout(() => setTurnNotice(null), TURN_NOTICE_DURATION));
      };
      if (next.length) animationTimers.current.push(setTimeout(announce, DRAW_DURATION));
      else announce();
    }
  }, [game, view, mode]);
  useEffect(() => () => { animationTimers.current.forEach(clearTimeout); if (rollTimer.current) clearTimeout(rollTimer.current); }, []);
  useEffect(() => {
    if (mode === 'hotseat' && (game.phase === 'playing' || game.phase === 'mulligan') && !busy) setView(game.pending?.task.actor ?? game.active);
  }, [mode, game.phase, game.active, game.pending, busy]);
  useEffect(() => {
    if (!ready || mode !== 'cpu' || setup || paused || rolling || diceReveal || strike || turnNotice || game.winner !== null || game.phase === 'dice') return;
    if (game.phase === 'opening') {
      if (game.openingRemaining[1] <= 0 || flights.some(f => game.players[1].hand.includes(f.uid))) return;
    } else if (game.phase === 'mulligan') {
      if (game.mulligan.confirmed[1] || flights.some(f => game.players[1].hand.includes(f.uid))) return;
    } else if (busy || (game.pending?.task.actor ?? game.active) !== 1) return;
    const timer = setTimeout(() => { const command = cpuCommand(game, gameCatalog); if (command) act(command); }, 650);
    return () => clearTimeout(timer);
  }, [ready, mode, setup, paused, busy, game, act, rolling, diceReveal, strike, turnNotice, flights]);
  const diceComplete = !!game.dice?.rolls.every(value => value !== null);
  const nextDie: Side = diceComplete || !game.dice || game.dice.rolls[0] === null ? 0 : 1;
  const rollDice = useCallback(() => {
    if (rolling || diceReveal || setup || game.phase !== 'dice') return;
    const outcome = applyCommand(game, { type: 'roll', actor: nextDie }, gameCatalog);
    if (outcome.error) return;
    setRollOutcome(outcome.state.dice!.rolls[nextDie]);
    setRollingSide(nextDie);
    setRolling(true);
    rollTimer.current = setTimeout(() => {
      act({ type: 'roll', actor: nextDie });
      setRolling(false);
      setDiceReveal(true);
      rollTimer.current = setTimeout(() => { setDiceReveal(false); rollTimer.current = null; }, 1200);
    }, DICE_THROW_DURATION);
  }, [rolling, diceReveal, setup, game, nextDie, act]);
  useEffect(() => {
    if (!ready || mode !== 'cpu' || setup || paused || busy || game.phase !== 'dice' || nextDie !== 1) return;
    const timer = setTimeout(rollDice, 650);
    return () => clearTimeout(timer);
  }, [ready, mode, setup, paused, busy, game.phase, nextDie, rollDice]);
  function start(state: GameState, newMode: Mode) {
    if (rollTimer.current) clearTimeout(rollTimer.current);
    animationTimers.current.forEach(clearTimeout); animationTimers.current = [];
    animate.current = false; setFlights([]); setStrike(null); setHeld(null); setRolling(false); setDiceReveal(false); setTurnNotice(null);
    dispatch({ type: 'load', game: state }); setMode(newMode); setView(0); setPaused(false); setPanel(null);
    setSelected(null); setAttacker(null); setSaveError('');
  }
  const p = game.players[view];
  const playEnabled = game.phase === 'playing' && canControl(view) && game.active === view && !game.pending && !busy && !setup && game.winner === null;
  const previewUid = selected;
  const previewCard = previewUid ? game.cards[previewUid] : null;
  const replacements = p.hand.filter(uid => exchanges[uid] && game.mulligan.eligible[view].includes(uid)).map(uid => ({ uid, deck: exchanges[uid] }));
  const mulliganEnabled = game.phase === 'mulligan' && !game.mulligan.confirmed[view] && canControl(view) && !game.pending && !rolling && !diceReveal && !strike && !flights.some(f => p.hand.includes(f.uid)) && !setup;
  const pendingIds = ours ? game.pending!.options.map(option => option.id) : [];
  function choose(id: string) { if (ours && !busy) act({ type: 'choose', actor: game.pending!.task.actor, option: id }); }
  function deckReady(side: Side, kind: DeckKind) {
    if (game.phase === 'opening') return canControl(side) && !setup && !rolling && !diceReveal && game.openingRemaining[side] > 0 && !flights.some(f => game.players[side].hand.includes(f.uid));
    return !!ours && !busy && !setup && drawPending && game.pending!.task.actor === side && pendingIds.includes(kind); }
  function play(uid: string, slot?: number) { act({ type: 'play', actor: view, uid, slot }); }
  function attackAvailable(side: Side, uid: string) {
    return canAttack(game, side, uid, 'leader', gameCatalog) || game.players[other(side)].field.some(target => canAttack(game, side, uid, target, gameCatalog));
  }
  function clickField(side: Side, uid: string | undefined, slot: number) {
    if (uid && pendingIds.includes(uid)) { choose(uid); return; }
    if (attacker && side !== view && uid && canAttack(game, view, attacker, uid, gameCatalog)) { act({ type: 'attack', actor: view, uid: attacker, target: uid }); return; }
    if (selected && side === view && !uid && playEnabled && gameCatalog[game.cards[selected].cardId].type === 'yojo') { play(selected, slot); return; }
    if (uid && side === view && playEnabled && attackAvailable(side, uid)) { setAttacker(attacker === uid ? null : uid); setSelected(null); return; }
    if (attacker) return;
    if (uid) setPanel({ type: 'inspect', uid });
  }
  function pickUp(event: ReactPointerEvent<HTMLButtonElement>, uid: string, kind: 'hand' | 'field') {
    if (busy || (kind === 'field' && (!playEnabled || !attackAvailable(view, uid)))) return;
    gesture.current = { uid, kind, x: event.clientX, y: event.clientY, moved: false, canDrag: playEnabled && (kind === 'field' || costOf(game, uid, gameCatalog, view) <= p.pp) };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveCard(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || Math.hypot(event.clientX - g.x, event.clientY - g.y) < 10 && !g.moved) return;
    if (event.pointerType === 'touch' && g.kind === 'hand' && !g.moved && Math.abs(event.clientX - g.x) > Math.abs(event.clientY - g.y) * 1.2) {
      const list = container.current?.querySelector('[data-hand-list]');
      if (list) list.scrollLeft -= event.clientX - g.x;
      g.x = event.clientX; g.y = event.clientY; g.scrolled = true;
      return;
    }
    if (!g.canDrag) return;
    g.moved = true;

    setHeld({ uid: g.uid, x: event.clientX, y: event.clientY });
    if (g.kind === 'field') { setAttacker(g.uid); setSelected(null); }
    else { setSelected(g.uid); setAttacker(null); }
  }
  function releaseCard(event: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current; gesture.current = null; setHeld(null);
    if (!g || (!g.moved && !g.scrolled)) return;
    suppressClick.current = true;
    animationTimers.current.push(setTimeout(() => { suppressClick.current = false; }, 0));
    if (!g.moved) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (g.kind === 'field') {
      const unit = target?.closest<HTMLElement>('[data-unit]')?.dataset.unit;
      const leader = target?.closest<HTMLElement>('[data-leader]')?.dataset.leader;
      const id = unit ?? (leader === String(other(view)) ? 'leader' : null);
      if (id && canAttack(game, view, g.uid, id, gameCatalog)) act({ type: 'attack', actor: view, uid: g.uid, target: id });
    } else {
      const slot = target?.closest<HTMLElement>('[data-slot]');
      if (slot?.dataset.side === String(view) && !slot.dataset.unit && gameCatalog[game.cards[g.uid].cardId].type === 'yojo') play(g.uid, Number(slot.dataset.slot));
      else if (target?.closest('[data-table]') && gameCatalog[game.cards[g.uid].cardId].type === 'sweet') play(g.uid);
    }
  }
  function adjust(side: Side, resource: 'points' | 'ppBonus' | 'pp', delta: number) { act({ type: 'adjust', actor: side, resource, delta }); }
  function renderZone(side: Side, kind: ZoneKind, className: string) {
    const player = game.players[side], deck = kind === 'yojo' || kind === 'sweet';
    const drawing = deck && deckReady(side, kind);
    return <div className={className}><DeckStack side={side} kind={kind} ids={player[kind]} thresholds={player.milestones}
      enabled={deck ? drawing : true} drawing={drawing} onClick={() => deck ? game.phase === 'opening' ? act({ type: 'openingDraw', actor: side, deck: kind as DeckKind }) : choose(kind) : setPanel({ type: 'zone', side, kind })} /></div>;
  }
  function renderPlayer(side: Side) {
    const player = game.players[side], near = side === view;
    const test = mode === 'hotseat' && game.phase === 'playing' && !game.pending && !busy;
    const leaderTarget = !!attacker && side !== view && canAttack(game, view, attacker, 'leader', gameCatalog);
    return <section key={side} className={`${styles.playerSide} ${near ? styles.near : styles.far}`} aria-label={side === 0 ? 'あなたの盤面' : '相手の盤面'}>
      {renderZone(side, 'yojo', styles.deckYojo)}{renderZone(side, 'sweet', styles.deckSweet)}
      {renderZone(side, 'nap', styles.napZone)}{renderZone(side, 'exile', styles.exileZone)}
      <button className={styles.playableZone} onClick={() => setPanel({ type: 'skills', side })} aria-label={`${side === 0 ? 'あなた' : '相手'}のスキル`}>
        <span className={styles.playableCard}><GameCard id={player.playable} /></span>

      </button>
      <div className={styles.turnCounter}><Counter label="ターン数(+pp)" value={player.turns} bonus={player.ppBonus} pp={`${player.pp} / ${maxPp(game, side)}`}
        test={test} onAdjust={delta => adjust(side, 'ppBonus', delta)} onReset={() => adjust(side, 'ppBonus', -player.ppBonus)} /></div>
      <div className={styles.pointsCounter} data-leader={side}><Counter label="お菓子ポイント" value={player.points} points target={leaderTarget} test={test}
        onClick={() => { if (leaderTarget) act({ type: 'attack', actor: view, uid: attacker!, target: 'leader' }); }}
        onAdjust={delta => adjust(side, 'points', delta)} onReset={() => adjust(side, 'points', player.maxPoints - player.points)} />
        {player.shield && <span className={styles.shieldIndicator}>パンケーキ保護</span>}
      </div>
      <div className={styles.field}><span className={styles.fieldLabel}>Field</span>{Array.from({ length: 7 }, (_, slot) => {
        const uid = player.field.find(id => game.cards[id].slot === slot), card = uid ? game.cards[uid] : null;
        const targeting = uid && (pendingIds.includes(uid) || !!attacker && side !== view && canAttack(game, view, attacker, uid, gameCatalog));
        const placing = selected && near && !uid && playEnabled && gameCatalog[game.cards[selected].cardId].type === 'yojo';
        return <button key={slot} data-slot={slot} data-side={side} data-unit={uid} disabled={!!attacker && side !== view && !targeting} className={`${styles.fieldSlot} ${card ? styles.occupied : ''} ${targeting || placing ? styles.targetable : ''} ${uid === attacker ? styles.attacking : ''} ${card?.exhausted ? styles.exhausted : ''} ${uid && (held?.uid === uid || strike?.uid === uid) ? styles.dealing : ''} ${card?.keywords.includes('taunt') ? styles.tauntCard : ''}`}
          aria-label={`${side === 0 ? 'あなた' : '相手'}の場 ${slot + 1} ${card ? displayCards[card.cardId].name : '空き'}`}
          onClick={() => { if (!suppressClick.current) clickField(side, uid, slot); }}
          onPointerDown={event => { if (uid && near) pickUp(event, uid, 'field'); }}
          onContextMenu={event => { event.preventDefault(); if (uid) setPanel({ type: 'inspect', uid }); }}
          onDragOver={event => { if (near && !uid && playEnabled) event.preventDefault(); }}
          onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); if (near && !uid && playEnabled && p.hand.includes(id) && gameCatalog[game.cards[id].cardId].type === 'yojo') play(id, slot); }}>
          {card && <><GameCard id={card.cardId} instance={card} abilities />
            {!card.exhausted && attackAvailable(side, uid!) && <span className={styles.readyGem} />}
          </>}
        </button>;
      })}</div>
      {!near && <div className={styles.opponentHand} aria-label={`相手の手札 ${player.hand.length}枚`}>
        {player.hand.map((uid, i) => <span key={uid} data-hand={uid} className={`${styles.hiddenCard} ${flights.some(f => f.uid === uid) ? styles.dealing : ''}`} style={{ '--hand-index': i - (player.hand.length - 1) / 2, '--fan-step': `${Math.min(56, 360 / Math.max(1, player.hand.length))}px` } as CSSProperties}>
          {game.cards[uid].revealed && <GameCard id={game.cards[uid].cardId} />}
        </span>)}
      </div>}
    </section>;
  }
  const diceFocus = !setup && (game.phase === 'dice' || game.phase === 'initiative' || diceReveal);
  const visibleDie: Side = rolling || diceReveal ? rollingSide : game.phase === 'opening' ? 1 : nextDie;
  const diceValue = rolling ? rollOutcome : diceComplete && game.phase === 'dice' && !diceReveal ? null : game.dice?.rolls[visibleDie] ?? null;
  const diceInteractive = game.phase === 'dice' && !busy && canControl(visibleDie) && visibleDie === nextDie;
  const diceTie = game.phase === 'dice' && diceComplete && !rolling;
  const directOptions = game.pending?.options.filter(option => !game.cards[option.id] || !game.players.some(player => player.field.includes(option.id) || player.hand.includes(option.id))) ?? [];
  return <div className={styles.emulator} ref={container} onKeyDown={event => { if (event.key === 'Escape') { setPanel(null); setSelected(null); setAttacker(null); setHeld(null); } }} onPointerMove={moveCard} onPointerUp={releaseCard} onPointerCancel={() => { gesture.current = null; setHeld(null); }}>
    <header className={styles.toolbar}>
      <button className={styles.menuButton} onClick={() => setPanel({ type: 'menu' })} aria-label="メニュー">☰</button>
      {mode === 'cpu' && paused && <button className={styles.menuButton} onClick={() => setPaused(false)} aria-label="CPU再開">▶</button>}
    </header>
    <div className={`${styles.tableViewport} ${game.phase === 'playing' ? styles.withTurnControl : ''}`}><div className={styles.table} data-table>
      <div className={styles.mat}><div className={styles.logoLayer} /></div>{([0, 1] as Side[]).map(renderPlayer)}
      {game.winner !== null && <div className={styles.result}><strong>{game.winner === 'draw' ? '引き分け' : `${game.players[game.winner].name}の勝利`}</strong><button onClick={() => setPanel({ type: 'setup' })}>次の対戦を準備する</button></div>}
    </div></div>
      {game.phase === 'playing' && <div className={styles.turnControl}>
        <PpPanel current={game.players[other(view)].pp} maximum={maxPp(game, other(view))} own={false} />
        <button className={`${styles.endTurnButton} ${game.active !== view ? styles.enemyTurn : ''}`} disabled={!playEnabled} onClick={() => act({ type: 'end', actor: game.active })}>{game.active === view ? <>ターン<br />終了</> : <>相手の<br />ターン</>}</button>
        <PpPanel current={p.pp} maximum={maxPp(game, view)} own />
      </div>}
    {diceFocus && <div className={styles.diceFocus} aria-label="先攻・後攻のダイス">
      <div className={styles.diceStage}>
        {game.phase === 'initiative' && !busy ? <>
          <strong className={styles.diceResult}>{game.active === 0 ? 'あなた' : mode === 'cpu' ? 'CPU' : '相手'}が選べる！</strong>
          <div className={styles.initiativeChoices}>{(['first', 'second'] as const).map(order => <button key={order} disabled={!canControl(game.active)} onClick={() => act({ type: 'initiative', actor: game.active, order })}>{order === 'first' ? '先攻' : '後攻'}</button>)}</div>
        </> : <>
          <div className={styles.focusDie}>
            <span>{visibleDie === 0 ? 'あなた' : mode === 'cpu' ? 'CPU' : '相手'}</span>
            <OpeningDie value={diceValue} rolling={rolling} interactive={diceInteractive} label={visibleDie === 0 ? 'あなた' : mode === 'cpu' ? 'CPU' : '相手'} onRoll={rollDice} />
          </div>
          {game.phase === 'initiative' && <strong className={styles.diceResult}>{game.active === 0 ? 'あなた' : mode === 'cpu' ? 'CPU' : '相手'}が選べる！</strong>}
        </>}
        {diceTie && <strong className={styles.diceTie}>引き分け！</strong>}
      </div>
    </div>}
    {ours && !drawPending && <div className={styles.choiceTray} role="status"><strong>{game.pending!.prompt}</strong>
      {directOptions.map(option => <button key={option.id} disabled={busy} onClick={() => choose(option.id)}>{game.cards[option.id] ? <span className={styles.choiceThumb}><GameCard id={game.cards[option.id].cardId} /></span> : option.label}</button>)}
    </div>}
    {(error || saveError) && <div className={styles.errorToast} role="alert">{error || saveError}</div>}

    {attacker && <div className={styles.attackActions}><button onClick={() => setPanel({ type: 'inspect', uid: attacker })}>拡大</button><button onClick={() => { setAttacker(null); setHeld(null); }}>戻す ↶</button></div>}
    {p.hand.length > 0 && game.phase !== 'mulligan' && <>
      <div className={styles.handDock}>
        <div className={styles.hand} data-hand-list>{p.hand.map((uid, index) => {
          const card = game.cards[uid], allowed = playEnabled && costOf(game, uid, gameCatalog, view) <= p.pp, offset = index - (p.hand.length - 1) / 2;
          return <button key={uid} data-hand={uid} className={`${styles.handCard} ${allowed ? styles.playableHand : ''} ${selected === uid ? styles.selectedHand : ''} ${pendingIds.includes(uid) ? styles.targetable : ''} ${flights.some(f => f.uid === uid) || held?.uid === uid ? styles.dealing : ''}`}
            style={{ '--angle': `${Math.max(-16, Math.min(16, offset * 4))}deg`, '--lift': `${Math.min(35, Math.abs(offset) * 7)}px`, '--overlap': `${Math.min(100, Math.max(40, (p.hand.length - 4) * 13))}px`, zIndex: index } as CSSProperties}
            aria-label={`手札 ${displayCards[card.cardId].name}`} onPointerDown={event => pickUp(event, uid, 'hand')}
            onClick={() => { if (suppressClick.current) return; if (pendingIds.includes(uid)) choose(uid); else { setSelected(selected === uid ? null : uid); setAttacker(null); } }}>
            <GameCard id={card.cardId} instance={card} currentCost={costOf(game, uid, gameCatalog, view)} />{card.revealed && <span className={styles.revealed}>公開</span>}
          </button>;
        })}</div>

      </div>
    </>}
    {selected && previewCard && p.hand.includes(selected) && game.phase !== 'mulligan' && <aside className={styles.cardSelection} aria-label="選んだ手札">
      <button className={styles.selectedCardImage} onPointerDown={event => pickUp(event, selected, 'hand')} aria-label="選択したカードを持つ"><GameCard id={previewCard.cardId} instance={previewCard} currentCost={costOf(game, selected, gameCatalog, view)} /></button>
      <div className={styles.cardSelectionActions}>
        <button className={styles.primaryAction} disabled={!playEnabled || costOf(game, selected, gameCatalog, view) > p.pp || gameCatalog[previewCard.cardId].type === 'yojo' && p.field.length >= 7} onClick={() => play(selected)}>{gameCatalog[previewCard.cardId].type === 'yojo' ? '場に出す' : '使う'}</button>
        {previewCard.cardId === 's_24' && !previewCard.revealed && game.phase === 'playing' && <button disabled={!playEnabled} onClick={() => act({ type: 'reveal', actor: view, uid: selected })}>公開する</button>}
        <button onClick={() => setSelected(null)}>閉じる</button>
      </div>
    </aside>}
    {game.phase === 'mulligan' && !game.pending && !setup && <MulliganBoard key={view}
      cards={p.hand.map(uid => ({ uid, id: game.cards[uid].cardId, name: displayCards[game.cards[uid].cardId].name, deck: gameCatalog[game.cards[uid].cardId].type as DeckKind }))}
      exchanges={exchanges} enabled={mulliganEnabled} confirmed={game.mulligan.confirmed[view]}
      onChange={(uid, deck) => setExchanges(current => { const next = { ...current }; if (deck) next[uid] = deck; else delete next[uid]; return next; })}
      onConfirm={() => act(replacements.length ? { type: 'mulligan', actor: view, replacements } : { type: 'keep', actor: view })} />}
    {panel?.type === 'skills' && <button className={styles.modalBackdrop} aria-label="スキルを閉じる" onClick={() => setPanel(null)} />}
    {panel && <aside className={`${styles.drawer} ${panel.type === 'skills' ? styles.skillModal : panel.type === 'inspect' ? styles.inspection : ''}`}  role={panel.type === 'skills' ? 'dialog' : undefined} aria-modal={panel.type === 'skills' ? true : undefined} aria-label={panel.type === 'setup' ? '対戦の準備' : panel.type === 'skills' ? 'スキル' : 'カード情報'}>
      {panel.type === 'setup' ? <GameSetup onClose={() => setPanel(null)} onStart={start} /> : <><button className={styles.close} onClick={() => setPanel(null)} aria-label="パネルを閉じる">×</button>
        {panel.type === 'menu' ? <><h2>メニュー</h2><div className={styles.menuList}><button onClick={() => setPanel({ type: 'setup' })}>対戦の準備</button><button onClick={() => { setMode(mode === 'cpu' ? 'hotseat' : 'cpu'); setPanel(null); }}>{mode === 'cpu' ? '両側を操作' : 'CPUに任せる'}</button>{mode === 'cpu' ? <button onClick={() => { setPaused(!paused); setPanel(null); }}>{paused ? 'CPU再開' : 'CPU一時停止'}</button> : <><button onClick={() => { setView(other(view)); setPanel(null); }}>反対側を見る</button><button disabled={!history.length || busy} onClick={() => { animate.current = false; dispatch({ type: 'undo' }); setPanel(null); }}>一手戻す</button></>}<button onClick={() => setPanel({ type: 'logs' })}>履歴</button><button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void container.current?.requestFullscreen().catch(() => {}); setPanel(null); }}>全画面</button><Link href="/">ホームへ</Link></div></> : panel.type === 'logs' ? <><h2>対戦の履歴</h2>{game.log.map((line, i) => <p className={styles.logLine} key={`${i}-${line}`}>{line}</p>)}</> : panel.type === 'zone' ? <><h2>{panel.kind === 'nap' ? 'お昼寝場所' : '除外カード'}（{game.players[panel.side][panel.kind].length}枚）</h2><div className={styles.zoneCards}>{game.players[panel.side][panel.kind].map(uid => <button key={uid} onClick={() => setPanel({ type: 'inspect', uid })}><GameCard id={game.cards[uid].cardId} /></button>)}</div></> : panel.type === 'inspect' ? <>
          <div className={styles.inspectImage}><GameCard id={game.cards[panel.uid].cardId} instance={game.cards[panel.uid]} abilities
            currentCost={game.players.some(player => player.hand.includes(panel.uid)) ? costOf(game, panel.uid, gameCatalog, game.players[0].hand.includes(panel.uid) ? 0 : 1) : undefined} /></div>
          <div className={styles.inspectActions}><p>攻撃 {attackOf(game.cards[panel.uid], gameCatalog)} / 残りHP {hpOf(game.cards[panel.uid], gameCatalog)}</p>
          {mode === 'hotseat' && game.players.some(player => player.field.includes(panel.uid)) && <div className={styles.testControls}><h3>ダメージのおはじき</h3>{[-1, 1].map(delta => <button key={delta} onClick={() => act({ type: 'adjust', actor: game.players[0].field.includes(panel.uid) ? 0 : 1, resource: 'damage', delta, uid: panel.uid })}>{delta < 0 ? '−1' : '＋1'}</button>)}</div>}
          </div>
        </> : <><div className={styles.inspectImage}><GameCard id={game.players[panel.side].playable} /></div><h2>{displayCards[game.players[panel.side].playable].name}</h2>

          {skillsFor(game.players[panel.side].playable).map((skill, index) => <button className={styles.skillButton} key={index}
            disabled={game.phase !== 'playing' || game.active !== panel.side || !canControl(panel.side) || !!game.pending || busy || game.players[panel.side].skills[index] <= 0 || game.players[panel.side].pp < skill.cost}
            onClick={() => { act({ type: 'skill', actor: panel.side, index }); setPanel(null); }}><b>{skill.cost} PP</b><span><strong>{skill.name}</strong><p>{displayCards[game.players[panel.side].playable].effect?.split('\n')[index]?.replace(/^.*?】/, '').replace(/コスト\d+[,、]\s*/, '').replace(/使用回数制限\d+回。?/, '')}</p></span><small>残り{game.players[panel.side].skills[index]}回</small></button>)}
          {mode === 'hotseat' && <div className={styles.testControls}><h3>現在PP</h3><button onClick={() => adjust(panel.side, 'pp', -1)}>−1</button><b>{game.players[panel.side].pp}</b><button onClick={() => adjust(panel.side, 'pp', 1)}>＋1</button>
            <h3>テスト用の追加ドロー</h3>{(['yojo', 'sweet'] as const).map(deck => <button key={deck} disabled={!!game.pending || game.phase !== 'playing'} onClick={() => act({ type: 'draw', actor: panel.side, deck })}>{deck === 'yojo' ? '幼女' : 'お菓子'}</button>)}
          </div>}
        </>}
      </>}
    </aside>}
    {turnNotice && <TurnAnnouncement key={turnNotice.id} notice={turnNotice} />}
    {held && <div className={styles.heldCard} style={{ left: held.x, top: held.y }}><GameCard id={game.cards[held.uid].cardId} instance={game.cards[held.uid]}
      currentCost={p.hand.includes(held.uid) ? costOf(game, held.uid, gameCatalog, view) : undefined} /></div>}
    {strike && <div className={styles.strikeLayer}><div className={styles.strikeCard} style={{ left: strike.x, top: strike.y, width: strike.width, height: strike.height, '--strike-x': `${strike.dx}px`, '--strike-y': `${strike.dy}px` } as CSSProperties}><GameCard id={strike.cardId} /></div><div className={styles.impact} style={{ left: strike.x + strike.dx + strike.width / 2, top: strike.y + strike.dy + strike.height / 2 }}>✦</div></div>}
    <div className={styles.flightLayer}>{flights.map(flight => <FlyingCard key={flight.uid} flight={flight} />)}</div>
  </div>;
}
