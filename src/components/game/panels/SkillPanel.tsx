'use client';

import { exSkillInfo, playableView } from '@pplale/game-core';
import type { ExSkillId, Side, SkillView } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { englishCard, englishPassiveDescription, englishSkillDescription, passiveDescription, skillDescription } from '@/lib/game/skillText';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
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
  const { locale, t, gameText } = useI18n();
  const cardName = useCardName();
  /** The skill's text from the playable's printed card, in English from the English card. */
  const describe = (playable: string, index: number) => {
    const english = locale === 'en' ? englishCard(playable)?.effect : undefined;
    return english ? englishSkillDescription(english, index) : skillDescription(displayCards[playable]?.effect, index);
  };
  const englishEffect = locale === 'en' ? englishCard(player.playable)?.effect : undefined;
  return <>
    <div className={styles.inspectImage}><GameCard id={player.playable} sizes="120px" /></div>
    <h2>{cardName(player.playable, card.name)}</h2>
    {mp && <p className={styles.skillMp} role="group" aria-label={`MP ${mp.current} / ${mp.max}`}><b>MP</b> {mp.current}<small> / {mp.max}</small></p>}
    {/* A passive is never used: it is text, not a button. */}
    {passive && <div className={styles.skillPassive} data-active={passive.active}>
      <b>{t('パッシブ')}</b>
      <span><strong>{gameText(passive.name)}</strong><p>{englishEffect ? englishPassiveDescription(englishEffect) : passiveDescription(card.effect)}</p></span>
      <small>{t(passive.active ? '発動中' : '条件を満たすと発動')}</small>
    </div>}
    {skills.map((skill, index) => <button className={styles.skillButton} key={index}
      disabled={!usable || !!skill.unavailable}
      onClick={() => { act({ type: 'skill', actor: side, index }); setPanel(null); }}>
      <b className={skill.mp ? styles.mpCost : undefined}>{costOf(skill)}</b>
      <span><strong>{gameText(skill.name)}</strong><p>{describe(player.playable, index)}</p></span>
      {/* A reaction skill is offered by the game when its moment comes. */}
      <small>{skill.reaction && <>{t('相手ターンに確認')}<br /></>}{skill.left === null ? t('回数制限なし') : t('残り{n}回', { n: skill.left })}</small>
    </button>)}
    {taken.length > 0 && <h3>{t('相手から奪ったスキル')}</h3>}
    {taken.map(skill => <button className={styles.skillButton} key={skill.index}
      disabled={!usable || !!skill.unavailable}
      onClick={() => { act({ type: 'skill', actor: side, index: skill.index }); setPanel(null); }}>
      <b>{costOf(skill)}</b>
      <span><strong>{gameText(skill.name)}</strong><p>{describe(skill.playable, skill.origin)}</p></span>
      <small>{t('残り{n}回', { n: skill.left ?? '' })}</small>
    </button>)}
    {Object.keys(player.exSkills ?? {}).length > 0 && <h3>{t('Exスキル')}</h3>}
    {(Object.keys(player.exSkills ?? {}) as ExSkillId[]).map(id => {
      const skill = player.exSkills![id]!, info = exSkillInfo[id];
      return <button className={styles.skillButton} key={id} disabled={!usable || info.automatic || !skill.uses || player.pp < info.cost || (id === 'alice' || id === 'kamikakushi') && skill.lastTurn === game.turn}
        onClick={() => { act({ type: 'exSkill', actor: side, skill: id }); setPanel(null); }}>
        <b>{info.cost} PP</b><span><strong>{gameText(info.name)}</strong><p>{gameText(info.description)}</p></span><small>{info.automatic ? t('自動発動') : ''}{['alice', 'dagger', 'smoke'].includes(id) ? t('毎ターン／永続') : t('残り{n}回', { n: skill.uses })}</small>
      </button>;
    })}
    <p>{t('アイス {ice} ／ どんぐり {acorns}', { ice: player.ice ?? 0, acorns: player.acorns ?? 0 })}</p>
    {(player.acorns ?? 0) > 0 && <div className={styles.menuList}>
      {(['draw', 'pp'] as const).map(action => <button key={action} disabled={game.phase !== 'playing' || !!game.pending || game.active !== side || busy || !board.canControl(side)} onClick={() => { act({ type: 'acorn', actor: side, mode: action }); setPanel(null); }}>{t(action === 'draw' ? 'どんぐり1：1枚引く' : 'どんぐり1：現在PPを1増やす')}</button>)}
    </div>}
    {mode === 'hotseat' && <div className={styles.testControls}>
      <h3>{t('現在PP')}</h3>
      <button onClick={() => board.adjust(side, 'pp', -1)}>−1</button><b>{player.pp}</b><button onClick={() => board.adjust(side, 'pp', 1)}>＋1</button>
      <h3>{t('テスト用の追加ドロー')}</h3>
      {(['yojo', 'sweet'] as const).map(deck => <button key={deck} disabled={!!game.pending || game.phase !== 'playing'} onClick={() => act({ type: 'draw', actor: side, deck })}>{t(deck === 'yojo' ? '幼女' : 'お菓子')}</button>)}
    </div>}
    <div className={styles.skillClose}><button onClick={() => setPanel(null)}>{t('閉じる')}</button></div>
  </>;
}
