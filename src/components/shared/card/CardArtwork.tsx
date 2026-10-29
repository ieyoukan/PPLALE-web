import Image from 'next/image';
import type { Catalog } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import styles from './CardArtwork.module.css';

/** 現在または保存済みのカード画像を描く。リプレイでは当時の画像を維持する。 */
export function CardArtwork({ id, catalog, sizes = '120px', eager }: { id: string; catalog?: Catalog; sizes?: string; eager?: boolean }) {
  const card = catalog?.[id] as (Catalog[string] & { imageUrl?: string; imageHash?: string }) | undefined;
  const base = process.env.NEXT_PUBLIC_ROOM_SERVER_URL?.replace(/\/+$/, '');
  const image = card?.imageHash && base ? `${base}/history/assets/${card.imageHash}` : card?.imageUrl ?? displayCards[id]?.imageUrl;
  return image ? <Image src={image} alt={card?.name ?? displayCards[id]?.name ?? id} fill sizes={sizes} unoptimized={!!card?.imageHash} draggable={false} loading={eager ? 'eager' : undefined} fetchPriority={eager ? 'high' : undefined} />
    : <span className={styles.missingCard}>{card?.name ?? id}</span>;
}
