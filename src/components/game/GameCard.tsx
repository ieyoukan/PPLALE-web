'use client';

import { memo } from 'react';
import Image from 'next/image';
import { attackOf, hpOf } from '@pplale/game-core';
import type { Instance } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import { BOARD_CARD_SIZES } from '@/lib/game/cardImages';
import { gameCardSource } from '@/lib/game/matchAssets';
import { keywordNames } from './labels';
import { useI18n } from '@/i18n/LocaleProvider';
import { englishCard } from '@/lib/game/skillText';
import styles from './BoardEmulator.module.css';
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;
/** Card face with live markers. Memoized: unchanged cards skip re-rendering during drags and selection. */
export const GameCard = memo(function GameCard({ id, instance, stats = false, abilities = false, currentCost, sizes = BOARD_CARD_SIZES }: {
    id: string;
    instance?: Instance;
    stats?: boolean;
    abilities?: boolean;
    currentCost?: number;
    sizes?: string;
}) {
    const { locale, t } = useI18n();
    const card = displayCards[id];
    if (!card)
        return null;
    // In English the printed English card (its text is on the picture), at match size; cards without one keep the match's picture.
    const english = locale === 'en' ? englishCard(id) : undefined;
    const image = gameCardSource(id, !!english);
    return <>
    <Image src={image ?? english?.imageUrl ?? card.imageUrl} unoptimized={!!image} alt={english?.name ?? card.name} fill sizes={sizes} className={styles.cardImage} draggable={false}/>
    {instance && stats && <span><b>{attackOf(instance, gameCatalog)}</b><b>{hpOf(instance, gameCatalog)}</b></span>}
    {!!instance?.damage && <span className={styles.damageMarble} role="img" aria-label={t('{n}ダメージ', { n: instance.damage })}>−{instance.damage}</span>}
    {instance && !!(instance.attackBonus || instance.hpBonus) && <>
      <span className={`${styles.buffMarble} ${styles.attackMarble}`} role="img" aria-label={t('攻撃力の変化 {n}', { n: signed(instance.attackBonus) })}>{signed(instance.attackBonus)}</span>
      <span className={`${styles.buffMarble} ${styles.hpMarble}`} role="img" aria-label={t('HPの変化 {n}', { n: signed(instance.hpBonus) })}>{signed(instance.hpBonus)}</span>
    </>}
    {abilities && instance && (instance.keywords.length > 0 || instance.shield || instance.immobileUntil !== undefined) && <span className={styles.keywordBadges}>
      {Array.from(new Set(instance.keywords)).map(keyword => <span key={keyword} className={keyword === 'taunt' ? styles.tauntBadge : ''}>{keyword === 'evade' ? t('おにごっこ≧{n}', { n: instance.evasion ?? 5 }) : keyword === 'hide' ? t(instance.slot === null ? 'かくれんぼ' : instance.hiding ? 'かくれんぼ中' : 'かくれんぼ終了') : t(keywordNames[keyword])}</span>)}
      {instance.shield && <span>{t('バリア')}</span>}
      {/* Given for a time (ちょり); the engine removes it when it ends. */}
      {instance.immobileUntil !== undefined && !instance.keywords.includes('immobile') && <span>{t('行動不能（一時）')}</span>}
    </span>}
    {currentCost !== undefined && currentCost !== card.cost && <span key={currentCost} className={`${styles.costMarble} ${currentCost < card.cost ? styles.reducedCost : styles.increasedCost}`}
      role="img" aria-label={t(currentCost < card.cost ? 'コスト {from}から{to}に減少' : 'コスト {from}から{to}に増加', { from: card.cost, to: currentCost })}>
      <span aria-hidden="true">{currentCost < card.cost ? '↓' : '↑'}</span>{currentCost}
    </span>}
  </>;
});
