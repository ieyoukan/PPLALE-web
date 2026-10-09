'use client';

import { exSkillInfo, skillBlocked, skillsFor } from '@pplale/game-core';
import type { ExSkillId, Side } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
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
      disabled={!usable || player.skills[index] <= 0 || player.pp < skill.cost || !!skillBlocked(game, side, index, gameCatalog)}
      onClick={() => { act({ type: 'skill', actor: side, index }); setPanel(null); }}>
      <b>{skill.cost} PP</b>
      <span><strong>{skill.name}</strong><p>{skillDescription(card.effect, index)}</p></span>
      <small>残り{player.skills[index]}回</small>
    </button>)}
    {Object.keys(player.exSkills ?? {}).length > 0 && <h3>Exスキル</h3>}
    {(Object.keys(player.exSkills ?? {}) as ExSkillId[]).map(id => {
      const skill = player.exSkills![id]!, info = exSkillInfo[id];
      return <button className={styles.skillButton} key={id} disabled={!usable || info.automatic || !skill.uses || player.pp < info.cost || id === 'alice' && skill.lastTurn === game.turn}
        onClick={() => { act({ type: 'exSkill', actor: side, skill: id }); setPanel(null); }}>
        <b>{info.cost} PP</b><span><strong>{info.name}</strong><p>{info.description}</p></span><small>{info.automatic ? '自動発動' : ''}{['alice', 'dagger', 'smoke'].includes(id) ? '毎ターン／永続' : `残り${skill.uses}回`}</small>
      </button>;
    })}
    <p>アイス {player.ice ?? 0} ／ どんぐり {player.acorns ?? 0}</p>
    {(player.acorns ?? 0) > 0 && <div className={styles.menuList}>
      {(['draw', 'pp'] as const).map(action => <button key={action} disabled={game.phase !== 'playing' || !!game.pending || busy || !board.canControl(side)} onClick={() => { act({ type: 'acorn', actor: side, mode: action }); setPanel(null); }}>どんぐり1：{action === 'draw' ? '1枚引く' : '現在PPを1増やす'}</button>)}
    </div>}
    {mode === 'hotseat' && <div className={styles.testControls}>
      <h3>現在PP</h3>
      <button onClick={() => board.adjust(side, 'pp', -1)}>−1</button><b>{player.pp}</b><button onClick={() => board.adjust(side, 'pp', 1)}>＋1</button>
      <h3>テスト用の追加ドロー</h3>
      {(['yojo', 'sweet'] as const).map(deck => <button key={deck} disabled={!!game.pending || game.phase !== 'playing'} onClick={() => act({ type: 'draw', actor: side, deck })}>{deck === 'yojo' ? '幼女' : 'お菓子'}</button>)}
    </div>}
    <div className={styles.skillClose}><button onClick={() => setPanel(null)}>閉じる</button></div>
  </>;
}
