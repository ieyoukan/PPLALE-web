import { memo } from 'react';
import Image from 'next/image';
import { attackOf, hpOf } from '@pplale/game-core';
import type { Instance } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import styles from './BoardEmulator.module.css';
const keywordNames = { charge: '突撃', fast: '早食い', taunt: '挑発', guard: '防衛', pierce: '貫通', immobile: '行動不能', noEat: '食不可', effectImmune: '効果耐性' } as const;
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;
/** Card face with live markers. Memoized: unchanged cards skip re-rendering during drags and selection. */
export const GameCard = memo(function GameCard({ id, instance, stats = false, abilities = false, currentCost, sizes = '(max-width: 900px) 90px, 110px' }: {
    id: string;
    instance?: Instance;
    stats?: boolean;
    abilities?: boolean;
    currentCost?: number;
    sizes?: string;
}) {
    const card = displayCards[id];
    if (!card)
        return null;
    return <>
    {card.imageUrl ? <Image src={card.imageUrl} alt={card.name} fill sizes={sizes} className={styles.cardImage} draggable={false}/> : <span className={styles.tokenCard}><span>{id === 'token_cat' ? '🐈' : '🍮'}</span>{card.name}<small>{card.effect}</small></span>}
    {instance && stats && <span className={styles.stats}><b>{attackOf(instance, gameCatalog)}</b><b>{hpOf(instance, gameCatalog)}</b></span>}
    {!!instance?.damage && <span className={styles.damageMarble} role="img" aria-label={`${instance.damage}ダメージ`}>−{instance.damage}</span>}
    {instance && !!(instance.attackBonus || instance.hpBonus) && <>
      <span className={`${styles.buffMarble} ${styles.attackMarble}`} role="img" aria-label={`攻撃力の変化 ${signed(instance.attackBonus)}`}>{signed(instance.attackBonus)}</span>
      <span className={`${styles.buffMarble} ${styles.hpMarble}`} role="img" aria-label={`HPの変化 ${signed(instance.hpBonus)}`}>{signed(instance.hpBonus)}</span>
    </>}
    {abilities && instance && (instance.keywords.length > 0 || instance.shield) && <span className={styles.keywordBadges}>
      {Array.from(new Set(instance.keywords)).map(keyword => <span key={keyword} className={keyword === 'taunt' ? styles.tauntBadge : ''}>{keywordNames[keyword]}</span>)}
      {instance.shield && <span>バリア</span>}
    </span>}
    {currentCost !== undefined && currentCost !== card.cost && <span key={currentCost} className={`${styles.costMarble} ${currentCost < card.cost ? styles.reducedCost : styles.increasedCost}`}
      role="img" aria-label={`コスト ${card.cost}から${currentCost}に${currentCost < card.cost ? '減少' : '増加'}`}>
      <span aria-hidden="true">{currentCost < card.cost ? '↓' : '↑'}</span>{currentCost}
    </span>}
  </>;
});
