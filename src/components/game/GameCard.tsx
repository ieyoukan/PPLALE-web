import Image from 'next/image';
import { attackOf, hpOf } from '@pplale/game-core';
import type { Instance } from '@pplale/game-core';
import { displayCards, gameCatalog } from '@/lib/game/catalog';
import styles from './BoardEmulator.module.css';
export function GameCard({ id, instance, stats = false }: {
    id: string;
    instance?: Instance;
    stats?: boolean;
}) {
    const card = displayCards[id];
    if (!card)
        return null;
    return <>
    {card.imageUrl ? <Image src={card.imageUrl} alt={card.name} fill sizes="(max-width: 700px) 110px, 150px" className={styles.cardImage} unoptimized draggable={false}/> : <span className={styles.tokenCard}><span>{id === 'token_cat' ? '🐈' : '🍮'}</span>{card.name}<small>{card.effect}</small></span>}
    {instance && stats && <span className={styles.stats}><b>{attackOf(instance, gameCatalog)}</b><b>{hpOf(instance, gameCatalog)}</b></span>}
    {!!instance?.damage && <span className={styles.damageMarble} aria-label={`${instance.damage}ダメージ`}>−{instance.damage}</span>}
  </>;
}
