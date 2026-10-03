'use client';

// Layout of the game screen. Rules live in @pplale/game-core, interaction state in board/useBoard,
// each visible region in table/ and the drawers in panels/.
import { useRef } from 'react';
import { BoardContext } from './board/BoardContext';
import { useBoard } from './board/useBoard';
import { MulliganBoard } from './MulliganBoard';
import { SidePanel } from './panels/SidePanel';
import { ChoiceTray } from './table/ChoiceTray';
import { DiceStage } from './table/DiceStage';
import { HandDock, SelectedCard } from './table/HandDock';
import { AnimationLayer, HeldCard, ResultBanner } from './table/Overlays';
import { PlayerSide } from './table/PlayerSide';
import { TurnControl } from './table/TurnControl';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import type { DeckKind } from '@pplale/game-core';
import styles from './BoardEmulator.module.css';

export default function BoardEmulator() {
  const container = useRef<HTMLDivElement>(null);
  const board = useBoard(container);
  const { game, me, view, mode, paused, attacker, drag, mulligan, setup, error, setPanel, setPaused, setAttacker } = board;
  return <BoardContext.Provider value={board}>
    <div className={styles.emulator} ref={container}
      onKeyDown={event => { if (event.key === 'Escape') board.clearSelection(); }}
      onPointerMove={drag.move} onPointerUp={drag.release} onPointerCancel={drag.cancel}>
      <header className={styles.toolbar}>
        <button className={styles.menuButton} onClick={() => setPanel({ type: 'menu' })} aria-label="メニュー">☰</button>
        {mode === 'cpu' && paused && <button className={styles.menuButton} onClick={() => setPaused(false)} aria-label="CPU再開">▶</button>}
      </header>
      <div className={`${styles.tableViewport} ${game.phase === 'playing' ? styles.withTurnControl : ''}`}>
        <div className={styles.table} data-table>
          <div className={styles.mat}><div className={styles.logoLayer} /></div>
          <PlayerSide side={0} />
          <PlayerSide side={1} />
          <ResultBanner />
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
      {game.phase === 'mulligan' && !game.pending && !setup && <MulliganBoard key={view}
        cards={me.hand.map(uid => ({ uid, id: game.cards[uid].cardId, name: displayCards[game.cards[uid].cardId].name, deck: gameCatalog[game.cards[uid].cardId].type as DeckKind }))}
        exchanges={mulligan.exchanges} enabled={mulligan.enabled} confirmed={game.mulligan.confirmed[view]}
        onChange={mulligan.change} onConfirm={mulligan.confirm} />}
      <SidePanel />
      <HeldCard />
      <AnimationLayer />
    </div>
  </BoardContext.Provider>;
}
