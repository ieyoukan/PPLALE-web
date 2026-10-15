'use client';

import { exSkillInfo, playableView } from '@pplale/game-core';
import type { ExSkillId, Side, SkillView } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { passiveDescription, skillDescription } from '@/lib/game/skillText';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/** 「1 PP」「5 MP」: MP when the skill costs MP (消費MP), otherwise PP. */
const costOf = (skill: SkillView) => skill.mp ? `${skill.mp} MP${skill.pp > 0 ? `＋${skill.pp} PP` : ''}` : `${skill.pp} PP`;

/** The playable's skills (cost, remaining uses), its passive and MP, and, in same-device play, PP / draw test controls. */
export function SkillPanel({ side }: { side: Side }) {
  const board = useBoardContext();
  const { game, busy, mode, act, setPanel } = board;
  const player = game.players[side], card = displayCards[player.playable];
  const usable = game.phase === 'playing' && game.active === side && board.canControl(side) && !game.pending && !busy;
  const { skills, taken, passive, mp } = playableView(game, side, gameCatalog);
  return <>
    <div className={styles.inspectImage}><GameCard id={player.playable} sizes="120px" /></div>
    <h2>{card.name}</h2>
    {mp && <p className={styles.skillMp} role="group" aria-label={`MP ${mp.current} / ${mp.max}`}><b>MP</b> {mp.current}<small> / {mp.max}</small></p>}
    {/* A passive is never used: it is text, not a button. */}
    {passive && <div className={styles.skillPassive} data-active={passive.active}>
      <b>パッシブ</b>
      <span><strong>{passive.name}</strong><p>{passiveDescription(card.effect)}</p></span>
      <small>{passive.active ? '発動中' : '条件を満たすと発動'}</small>
    </div>}
    {skills.map((skill, index) => <button className={styles.skillButton} key={index}
      disabled={!usable || !!skill.unavailable}
      onClick={() => { act({ type: 'skill', actor: side, index }); setPanel(null); }}>
      <b className={skill.mp ? styles.mpCost : undefined}>{costOf(skill)}</b>
      <span><strong>{skill.name}</strong><p>{skillDescription(card.effect, index)}</p></span>
      {/* A reaction skill is offered by the game when its moment comes. */}
      <small>{skill.reaction && <>相手ターンに確認<br /></>}{skill.left === null ? '回数制限なし' : `残り${skill.left}回`}</small>
    </button>)}
    {taken.length > 0 && <h3>相手から奪ったスキル</h3>}
    {taken.map(skill => <button className={styles.skillButton} key={skill.index}
      disabled={!usable || !!skill.unavailable}
      onClick={() => { act({ type: 'skill', actor: side, index: skill.index }); setPanel(null); }}>
      <b>{costOf(skill)}</b>
      <span><strong>{skill.name}</strong><p>{skillDescription(displayCards[skill.playable]?.effect, skill.origin)}</p></span>
      <small>残り{skill.left}回</small>
    </button>)}
    {Object.keys(player.exSkills ?? {}).length > 0 && <h3>Exスキル</h3>}
    {(Object.keys(player.exSkills ?? {}) as ExSkillId[]).map(id => {
      const skill = player.exSkills![id]!, info = exSkillInfo[id];
      return <button className={styles.skillButton} key={id} disabled={!usable || info.automatic || !skill.uses || player.pp < info.cost || (id === 'alice' || id === 'kamikakushi') && skill.lastTurn === game.turn}
        onClick={() => { act({ type: 'exSkill', actor: side, skill: id }); setPanel(null); }}>
        <b>{info.cost} PP</b><span><strong>{info.name}</strong><p>{info.description}</p></span><small>{info.automatic ? '自動発動' : ''}{['alice', 'dagger', 'smoke'].includes(id) ? '毎ターン／永続' : `残り${skill.uses}回`}</small>
      </button>;
    })}
    <p>アイス {player.ice ?? 0} ／ どんぐり {player.acorns ?? 0}</p>
    {(player.acorns ?? 0) > 0 && <div className={styles.menuList}>
      {(['draw', 'pp'] as const).map(action => <button key={action} disabled={game.phase !== 'playing' || !!game.pending || game.active !== side || busy || !board.canControl(side)} onClick={() => { act({ type: 'acorn', actor: side, mode: action }); setPanel(null); }}>どんぐり1：{action === 'draw' ? '1枚引く' : '現在PPを1増やす'}</button>)}
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
