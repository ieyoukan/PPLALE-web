'use client';

// 入室までの起動画面。ロゴとランダムなカードを表示し、準備が済めば待ち時間を足さずに消す。
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { fruitNames } from '@pplale/game-core';
import type { Fruit } from '@pplale/game-core';
import { defaultRoomRules } from '@pplale/game-core/room';
import type { RoomRules } from '@pplale/game-core/room';
import { displayCards } from '@/lib/game/catalog';
import { RoomThumbnailImage } from './RoomThumbnailImage';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { getCardCatalog } from '@/data/catalog';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './LaunchScreen.module.css';

interface Shown { id: string; name: string; image: string; kind: 'yojo' | 'sweet'; fruit?: Fruit; effect: string }

/** Where the stars twinkle (spread over the screen, the same on every visit). */
const stars = Array.from({ length: 14 }, (_, index) => [6 + index * 37 % 88, 8 + index * 53 % 84, -0.41 * index] as const);

/** A yojo or sweet whose effect is short enough to read while waiting. */
function someCard(): Shown | null {
  const cards = Object.values(displayCards).flatMap(card => {
    const { type, effect, imageUrl } = card as { type?: string; effect?: string; imageUrl?: string };
    if ((type !== 'yojo' && type !== 'sweet') || !imageUrl || !effect || Array.from(effect).length > 90) return [];
    const { id, name, fruit } = card as unknown as { id: string; name: string; fruit: Fruit };
    return [{ id, name, image: imageUrl, kind: type as Shown['kind'], fruit: fruitNames[fruit] ? fruit : undefined, effect }];
  });
  return cards.length ? cards[Math.floor(Math.random() * cards.length)] : null;
}

/** The card's name and effect in English (the Japanese ones when it has no English). */
function inEnglish(card: Shown): Shown {
  const { allYojoCards, allSweetCards } = getCardCatalog('en');
  const english = [...allYojoCards, ...allSweetCards].find(item => item.id === card.id);
  return english ? { ...card, name: english.name || card.name, effect: english.effect || card.effect } : card;
}

/** `status`: what is happening, for screen readers. `children`: what to do when it failed. */
export function LaunchScreen({ status = 'ルームに接続しています', preview, home = false, homeRules = defaultRoomRules, children }: { status?: string; preview?: { rules: RoomRules; plaza?: { name: string } } | null; home?: boolean; homeRules?: RoomRules; children?: ReactNode }) {
  // Chosen in the browser after the first paint, so the page itself can be sent before scripts run.
  const { t, locale, cardTypeLabel, fruitLabel, nameText } = useI18n();
  const [picked, setCard] = useState<Shown | null>(null);
  useEffect(() => { setCard(someCard()); }, []);
  const card = picked && locale === 'en' ? inEnglish(picked) : picked;
  return <section className={styles.launch} aria-busy={!children} aria-label={t('ぷぷりえーる')}>
    <span className={styles.stars} aria-hidden="true">{stars.map(([left, top, delay], index) => <i key={index} style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }} />)}</span>
    <Image className={styles.logo} src="/images/game/logo.webp" alt={t('お菓子争奪戦争 ぷぷりえーる')} width={462} height={227} priority />
    {(preview?.plaza || home) && <OrnateFrame size="sm" className={styles.roomPreview}>
      <RoomThumbnailImage rules={preview?.rules ?? homeRules} alt={t('ルームのサムネイル')} sizes="240px" />
      <span>{preview?.plaza ? nameText(preview.plaza.name) : t('あなたのルーム')}</span>
    </OrnateFrame>}
    <div className={styles.feature} data-shown={card ? '' : undefined}>
      <span className={styles.cardArt}>{card && <Image src={card.image} alt="" fill sizes="240px" priority />}</span>
      {card && <OrnateFrame className={styles.cardText}>
        <span className={styles.chips}><b>{cardTypeLabel(card.kind)}</b>{card.fruit && <b>{fruitLabel(card.fruit)}</b>}</span>
        <h2 data-ui-title>{card.name}</h2>
        <p>{card.effect}</p>
      </OrnateFrame>}
    </div>
    {children ? <OrnateFrame className={styles.trouble}>{children}</OrnateFrame>
      : <p className={styles.status} role="status" aria-label={t(status)}><span className={styles.dots} aria-hidden="true"><i /><i /><i /></span></p>}
  </section>;
}
