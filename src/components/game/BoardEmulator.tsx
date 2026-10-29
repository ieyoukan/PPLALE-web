'use client';

// 盤面の配置を組み立てる。ルールはgame-core、操作状態はboard/useBoard、表示はtable/、補助画面はpanels/で管理する。
import { Suspense, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties } from 'react';
import { BoardSurfaceContext } from './board/BoardSurfaceMount';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { BoardContext } from './board/BoardContext';
import { useBoard } from './board/useBoard';
import { useGameSession } from './board/useGameSession';
import type { BoardSession } from './board/useGameSession';
import { SidePanel } from './panels/SidePanel';
import { ChoiceTray } from './table/ChoiceTray';
import { DiceStage } from './table/DiceStage';
import { HandDock, SelectedCard } from './table/HandDock';
import { ReplayBar } from './table/ReplayBar';
import { AnimationLayer, HeldCard } from './table/Overlays';
import { Finale } from './table/Finale';
import { ResultScreen } from './table/ResultScreen';
import { PlayAnnouncement, TargetPing } from './table/PlayAnnouncement';
import { EffectDie } from './table/EffectDie';
import { OrderNotice } from './table/OrderNotice';
import { PlayerSide } from './table/PlayerSide';
import { TurnControl } from './table/TurnControl';
import { AssessmentBar } from './table/Assessment';
import { CardPicker, EditBar, EditButton } from './table/EditMode';
import { FullscreenButton } from './table/FullscreenButton';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { CPU_PATH } from '@/lib/game/sessionStore';
import type { DeckKind } from '@pplale/game-core';
import styles from './BoardEmulator.module.css';
import { useGameNotifications } from './notifications/GameNotifications';
import { PuzzleControls } from './puzzles/PuzzleControls';

const MulliganBoard = dynamic(() => import('./MulliganBoard').then(module => module.MulliganBoard));

/** The board of the match kept in this browser (against the CPU, same device, watching). */
export default function BoardEmulator() {
  const router = useRouter();
  // No saved match (opened directly, or storage cleared): prepare one first.
  const session = useGameSession({ onMissing: () => router.replace(CPU_PATH) });
  const { notify } = useGameNotifications();
  const startKey = session.ready && !session.position && !session.replaying && session.mode !== 'watch'
    && session.game.phase === 'dice' && session.record ? String(session.record.seed) : null;
  useEffect(() => { if (startKey) notify('started', `local:${startKey}`); }, [startKey, notify]);
  return <BoardTable session={session} />;
}

/** The game screen for any match (inside a GameStage): `session` says where it lives and who plays it. */
export function BoardTable({ session }: { session: BoardSession }) {
  const surface = useContext(BoardSurfaceContext);
  const container = useRef<HTMLDivElement>(null);
  const board = useBoard(surface?.root ?? container, session);
  const { game, me, view, mode, paused, attacker, selected, drag, mulligan, ready, panel, error, replaying, remote, editing, animations, setup, puzzle, setPanel, setPaused, setAttacker } = board;
  // The saved match is still loading (or missing, and the preparation page is opening).
  if (!ready) return <div data-readable className={styles.emulator} aria-busy="true" />;
  // An open drawer is closed from the corner button. An enlarged card and the skills are not: they
  // have 閉じる beside them, where the buttons of a chosen hand card are.
  const drawerOpen = !!panel && panel.type !== 'inspect' && panel.type !== 'skills';
  const { timing } = animations;
  const timingStyle = { '--draw-duration': `${timing.draw}ms`, '--strike-duration': `${timing.strike}ms`, '--announcement-duration': `${timing.announce}ms`, '--ping-duration': `${timing.ping}ms` } as CSSProperties;
  const table = <div className={`${styles.table} ${surface ? styles.sceneTable : ''}`} data-table data-readable={surface ? '' : undefined} style={timingStyle}>
    <div className={styles.mat}><div className={styles.logoLayer} aria-hidden="true">
      {Array.from({ length: 8 }, (_, index) => <Image key={index} src="/images/game/cafe-logo.svg" alt="" width={1568} height={882}
        unoptimized loading="eager" fetchPriority={index === 0 ? 'high' : 'auto'} className={styles.matLogo} />)}
    </div></div>
    <PlayerSide side={0} />
    <PlayerSide side={1} />
  </div>;
  return <BoardContext.Provider value={board}>
    <div data-readable data-puzzle={puzzle?.problem.id} data-puzzle-revision={puzzle ? game.revision : undefined} data-in-scene={surface ? '' : undefined} data-scene-ready={surface?.controlsReady} inert={surface && !surface.controlsReady} className={styles.emulator} ref={container}
      style={timingStyle}
      // Escape closes what is open on the table first; with nothing open it is left to the game's menu.
      onKeyDown={event => { if (event.key === 'Escape' && (panel || selected || attacker)) { board.clearSelection(); event.preventDefault(); } }}
      onPointerMove={drag.move} onPointerUp={drag.release} onPointerCancel={drag.cancel}>
      <header className={styles.toolbar}>
        {/* One button in one place: opens the menu, and closes whatever drawer is open. */}
        <button className={`${styles.menuButton} ${drawerOpen ? styles.menuButtonOpen : ''}`} aria-expanded={drawerOpen}
          onClick={() => setPanel(drawerOpen ? null : { type: editing ? 'editMenu' : 'menu' })} aria-label={drawerOpen ? 'メニューを閉じる' : 'メニュー'}>
          <span aria-hidden="true">{drawerOpen ? '×' : '☰'}</span>
        </button>
        <button className={styles.infoButton} aria-label="対戦ログ" aria-expanded={panel?.type === 'logs'} onClick={() => setPanel(panel?.type === 'logs' ? null : { type: 'logs' })}>☷<small>ログ</small></button>
        <button className={styles.infoButton} aria-label="カードのカウント" aria-expanded={panel?.type === 'counts'} onClick={() => setPanel(panel?.type === 'counts' ? null : { type: 'counts' })}>✦<small>カウント</small></button>
        {(remote ? !!remote.ownDeck && !remote.watching : !!setup) && <button className={styles.infoButton} aria-label="自分のデッキ" aria-expanded={panel?.type === 'deck'} onClick={() => setPanel(panel?.type === 'deck' ? null : { type: 'deck' })}>▤<small>自分のデッキ</small></button>}
        <EditButton />
        {(mode === 'cpu' || mode === 'watch') && !replaying && paused && <button className={styles.menuButton} onClick={() => setPaused(false)} aria-label="CPU再開">▶</button>}
      </header>
      {/* Below the own PP, where nothing else on the rail sits, so the toolbar keeps its width. */}
      <FullscreenButton />
      <EditBar />
      <PuzzleControls />
      {replaying && <ReplayBar />}
      {surface ? createPortal(table, surface.target) : <div className={`${styles.tableViewport} ${styles.withTurnControl}`}>{table}</div>}
      <TurnControl />
      <AssessmentBar />
      <DiceStage />
      <ChoiceTray />
      {error && <div className={styles.errorToast} role="alert">{error}</div>}
      {attacker && <div className={styles.attackActions}>
        <button onClick={() => setPanel({ type: 'inspect', uid: attacker })}>拡大</button>
        <button onClick={() => { setAttacker(null); drag.cancel(); }}>戻す ↶</button>
      </div>}
      <HandDock />
      <SelectedCard />
      {/* While the replacements are drawn the table itself is used: the decks glow and the hand shows. */}
      {mulligan.remaining > 0 && board.canControl(view) && <div className={styles.drawHint} role="status">あと{mulligan.remaining}枚、好きな山札から引く</div>}
      {/* Loading an overlay must never suspend the room's whole board. */}
      {game.phase === 'mulligan' && !game.pending && mulligan.remaining === 0 && !remote?.watching && <Suspense fallback={null}><MulliganBoard key={view}
        cards={me.hand.map(uid => ({ uid, id: game.cards[uid].cardId, name: displayCards[game.cards[uid].cardId].name, deck: gameCatalog[game.cards[uid].cardId].type as DeckKind }))}
        selected={mulligan.selected} enabled={mulligan.enabled} confirmed={game.mulligan.confirmed[view]}
        onToggle={mulligan.toggle} onConfirm={mulligan.confirm} /></Suspense>}
      <SidePanel />
      <CardPicker />
      <HeldCard />
      <AnimationLayer />
      <TargetPing />
      <OrderNotice />
      {!puzzle && <Finale />}
      {!puzzle && <ResultScreen />}
      <PlayAnnouncement />
      <EffectDie />
    </div>
  </BoardContext.Provider>;
}
