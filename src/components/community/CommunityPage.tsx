'use client';

import '@/app/panda.css';

import Image from 'next/image';
import Link from 'next/link';
import styles from './CommunityPage.module.css';
import { SitePage, SitePanel } from '@/components/site/SitePage';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { Bi } from '@/i18n/Bi';
import { useI18n } from '@/i18n/LocaleProvider';
import { DISCORD_INVITE_URL, VRCHAT_WORLD_URL } from '@/lib/communityLinks';
import type { FruitType } from '@/types/card';

type Fruit = Exclude<FruitType, 'all'>;

/** 大会は小さく一覧にする。細かいレギュレーションと日程はDiscordで案内する。 */
const tournaments: { ja: string; en: string; fruits: Fruit[]; jaNote: string; enNote: string; href?: string }[] = [
  { ja: 'つぼみ杯', en: 'Tsubomi Cup', fruits: ['strawberry'], jaNote: 'はじめての人向け', enNote: 'For first-timers' },
  { ja: 'イチゴ杯', en: 'Strawberry Cup', fruits: ['strawberry'], jaNote: 'いちごだけ', enNote: 'Strawberry only' },
  { ja: 'ぶどう杯', en: 'Grape Cup', fruits: ['grape', 'strawberry'], jaNote: 'いちご・ぶどう', enNote: 'Strawberry and Grape' },
  { ja: 'メロン杯', en: 'Melon Cup', fruits: ['melon', 'grape', 'strawberry'], jaNote: 'いちご・ぶどう・めろん', enNote: 'Up to Melon' },
  { ja: 'オレンジ杯', en: 'Orange Cup', fruits: ['orange', 'melon', 'grape', 'strawberry'], jaNote: 'いちご・ぶどう・めろん・おれんじ', enNote: 'Up to Orange' },
  { ja: 'ようかん杯', en: 'Yokan Cup', fruits: ['strawberry'], jaNote: '2Pickのデッキで', enNote: 'With a 2Pick deck', href: '/deck/2pick?twoCardLimit=false&fruits=strawberry' },
];

export default function CommunityPage() {
  const { t, fruitLabel } = useI18n();
  return (
    <SitePage ja="コミュニティ" en="Community" pattern="blush" width="lg"
      lead={<Bi ja="VRChatのワールドとDiscordで、いっしょに遊ぼう！" en="Play together in the VRChat world and on Discord!" />}>
      <div className={styles.links}>
        <OrnateFrame as="a" appearance="panel" href={VRCHAT_WORLD_URL} target="_blank" rel="noopener noreferrer" className={styles.link}>
          <span className={styles.art}>
            <Image src="/images/home/movie-poster.webp" alt="" fill sizes="(max-width: 760px) 90vw, 460px" preload loading="eager" fetchPriority="high" className={styles.world} />
          </span>
          <span className={styles.caption}>
            <Image src="/VRChat-Logo-Black.png" alt="" width={64} height={32} className={`${styles.brand} ${styles.wordmark}`} />
            <span className={styles.name}><Bi ja="ワールドであそぶ" en="Visit the world" /></span>
            <span className={styles.go} aria-hidden="true">↗</span>
          </span>
          <span className={styles.sr}>{t('VRChatで開きます')}</span>
        </OrnateFrame>

        <OrnateFrame as="a" appearance="panel" href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer" className={styles.link}>
          <span className={`${styles.art} ${styles.discordArt}`}>
            <Image src="/images/game/characters/rikusu-momoka.webp" alt="" fill sizes="(max-width: 760px) 70vw, 340px" className={styles.friends} />
          </span>
          <span className={styles.caption}>
            <Image src="/Discord-Symbol-Black.svg" alt="" width={40} height={40} className={styles.brand} />
            <span className={styles.name}><Bi ja="Discordに参加" en="Join the Discord" /></span>
            <span className={styles.go} aria-hidden="true">↗</span>
          </span>
          <span className={styles.sr}>{t('Discordの招待ページを開きます')}</span>
        </OrnateFrame>
      </div>

      <SitePanel size="sm" aria-labelledby="tournament-heading" className={styles.tournaments}>
        <h2 id="tournament-heading" className={styles.smallHeading}><Bi ja="大会" en="Tournaments" /></h2>
        <ul className={styles.cups}>
          {tournaments.map(cup => {
            const body = <>
              <span className={styles.fruits} role="img" aria-label={cup.fruits.map(fruitLabel).join('・')}>
                {cup.fruits.map(fruit => <Image key={fruit} src={`/images/game/fruits/${fruit}.webp`} alt="" width={24} height={24} />)}
              </span>
              <span className={styles.cupName}><Bi ja={cup.ja} en={cup.en} /></span>
              <span className={styles.cupNote}><Bi ja={cup.jaNote} en={cup.enNote} /></span>
              {cup.href && <span className={styles.cupGo} aria-hidden="true">→</span>}
            </>;
            return <li key={cup.en}>{cup.href ? <Link href={cup.href} prefetch={false} className={styles.cup}>{body}</Link> : <div className={styles.cup}>{body}</div>}</li>;
          })}
        </ul>
        <p className={styles.cupMore}><Bi ja="ほかにも、さまざまなレギュレーションの大会があります。" en="There are also tournaments with many other rules." /></p>
        <p className={styles.cupFoot}><Bi ja="日程・レギュレーションはDiscordでお知らせします" en="Dates and rules are announced on Discord" /></p>
      </SitePanel>
    </SitePage>
  );
}
