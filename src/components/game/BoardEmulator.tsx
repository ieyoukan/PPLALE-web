'use client';

// Layout of the game screen. Rules live in @pplale/game-core, interaction state in board/useBoard,
// each visible region in table/ and the drawers in panels/.
import { useRef } from 'react';
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
import { AnimationLayer, HeldCard } from './table/Overlays';
import { Finale } from './table/Finale';
import { ResultScreen } from './table/ResultScreen';
import { PlayAnnouncement, TargetPing } from './table/PlayAnnouncement';
import { EffectBlockAnnouncement } from './table/EffectBlockAnnouncement';
import { EffectDie } from './table/EffectDie';
import { OrderNotice } from './table/OrderNotice';
import { PlayerSide } from './table/PlayerSide';
import { TurnControl } from './table/TurnControl';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { HOME_PATH } from '@/lib/game/sessionStore';
import type { DeckKind } from '@pplale/game-core';
import styles from './BoardEmulator.module.css';

const MulliganBoard = dynamic(() => import('./MulliganBoard').then(module => module.MulliganBoard));

/** The board of the match kept in this browser (against the CPU, same device, watching). */
export default function BoardEmulator() {
  const router = useRouter();
  // No saved match (opened directly, or storage cleared): prepare one first.
  const session = useGameSession({ onMissing: () => router.replace(HOME_PATH) });
  return <BoardTable session={session} />;
}

/** The game screen for any match: `session` says where it lives and who plays it. */
export function BoardTable({ session }: { session: BoardSession }) {
  const container = useRef<HTMLDivElement>(null);
  const board = useBoard(container, session);
  const { game, me, view, mode, paused, attacker, drag, mulligan, ready, panel, error, replaying, remote, setPanel, setPaused, setAttacker, stopReplay } = board;
  // The saved match is still loading (or missing, and the preparation page is opening).
  if (!ready) return <div className={styles.emulator} aria-busy="true" />;
  // Any open panel (drawer or modal) is closed from the same corner button.
  const drawerOpen = !!panel;
  return <BoardContext.Provider value={board}>
    <div className={styles.emulator} ref={container}
      onKeyDown={event => { if (event.key === 'Escape') board.clearSelection(); }}
      onPointerMove={drag.move} onPointerUp={drag.release} onPointerCancel={drag.cancel}>
      <header className={styles.toolbar}>
        {/* One button in one place: opens the menu, and closes whatever drawer is open. */}
        <button className={`${styles.menuButton} ${drawerOpen ? styles.menuButtonOpen : ''}`} aria-expanded={drawerOpen}
          onClick={() => setPanel(drawerOpen ? null : { type: 'menu' })} aria-label={drawerOpen ? 'メニューを閉じる' : 'メニュー'}>
          <span aria-hidden="true">{drawerOpen ? '×' : '☰'}</span>
        </button>
        {(mode === 'cpu' || mode === 'watch' || replaying) && paused && <button className={styles.menuButton} onClick={() => setPaused(false)} aria-label={replaying ? '再生する' : 'CPU再開'}>▶</button>}
      </header>
      {replaying && <div className={styles.replayBadge}><span>リプレイ中</span><button onClick={stopReplay}>やめる</button></div>}
      <div className={`${styles.tableViewport} ${styles.withTurnControl}`}>
        <div className={styles.table} data-table>
          <div className={styles.mat}><div className={styles.logoLayer} aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => index).map(index => <Image key={index} src="/images/game/cafe-logo.svg" alt="" width={1568} height={882}
              unoptimized loading="eager" fetchPriority={index === 0 ? 'high' : 'auto'} className={styles.matLogo} />)}
          </div></div>
          <PlayerSide side={0} />
          <PlayerSide side={1} />
        </div>
      </div>
      <TurnControl />
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
      {game.phase === 'mulligan' && !game.pending && mulligan.remaining === 0 && !remote?.watching && <MulliganBoard key={view}
        cards={me.hand.map(uid => ({ uid, id: game.cards[uid].cardId, name: displayCards[game.cards[uid].cardId].name, deck: gameCatalog[game.cards[uid].cardId].type as DeckKind }))}
        selected={mulligan.selected} enabled={mulligan.enabled} confirmed={game.mulligan.confirmed[view]}
        onToggle={mulligan.toggle} onConfirm={mulligan.confirm} />}
      <SidePanel />
      <HeldCard />
      <AnimationLayer />
      <TargetPing />
      <OrderNotice />
      <Finale />
      <ResultScreen />
      <PlayAnnouncement />
      <EffectBlockAnnouncement />
      <EffectDie />
    </div>
  </BoardContext.Provider>;
}
