'use client';

import { skillsFor } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import { skillDescription } from '@/lib/game/skillText';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/** The playable's skills (cost, remaining uses) and, in same-device play, PP / draw test controls. */
export function SkillPanel({ side }: { side: Side }) {
  const board = useBoardContext();
  const { game, busy, mode, act, setPanel } = board;
  const player = game.players[side], card = displayCards[player.playable];
  const usable = game.phase === 'playing' && game.active === side && board.canControl(side) && !game.pending && !busy;
  return <>
    <div className={styles.inspectImage}><GameCard id={player.playable} sizes="120px" /></div>
    <h2>{card.name}</h2>
    {skillsFor(player.playable).map((skill, index) => <button className={styles.skillButton} key={index}
      disabled={!usable || player.skills[index] <= 0 || player.pp < skill.cost}
      onClick={() => { act({ type: 'skill', actor: side, index }); setPanel(null); }}>
      <b>{skill.cost} PP</b>
      <span><strong>{skill.name}</strong><p>{skillDescription(card.effect, index)}</p></span>
      <small>残り{player.skills[index]}回</small>
    </button>)}
    {mode === 'hotseat' && <div className={styles.testControls}>
      <h3>現在PP</h3>
      <button onClick={() => board.adjust(side, 'pp', -1)}>−1</button><b>{player.pp}</b><button onClick={() => board.adjust(side, 'pp', 1)}>＋1</button>
      <h3>テスト用の追加ドロー</h3>
      {(['yojo', 'sweet'] as const).map(deck => <button key={deck} disabled={!!game.pending || game.phase !== 'playing'} onClick={() => act({ type: 'draw', actor: side, deck })}>{deck === 'yojo' ? '幼女' : 'お菓子'}</button>)}
    </div>}
  </>;
}
