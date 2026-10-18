import Image from 'next/image';
import type { Catalog } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import styles from './History.module.css';

/** The archived catalog owns names and text; existing immutable card images are referenced by URL. */
export function RecordedCard({ id, catalog, sizes = '120px' }: { id: string; catalog?: Catalog; sizes?: string }) {
  const card = catalog?.[id] as (Catalog[string] & { imageUrl?: string; imageHash?: string }) | undefined;
  const base = process.env.NEXT_PUBLIC_ROOM_SERVER_URL?.replace(/\/+$/, '');
  const image = card?.imageHash && base ? `${base}/history/assets/${card.imageHash}` : card?.imageUrl ?? displayCards[id]?.imageUrl;
  return image ? <Image src={image} alt={card?.name ?? displayCards[id]?.name ?? id} fill sizes={sizes} unoptimized={!!card?.imageHash} draggable={false} />
    : <span className={styles.missingCard}>{card?.name ?? id}</span>;
}
