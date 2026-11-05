'use client';

import Image from 'next/image';
import Link from 'next/link';
import styles from './ToolsSection.module.css';
import { Bi } from '@/i18n/Bi';
import { useI18n } from '@/i18n/LocaleProvider';

const destinations = [
  { href: '/build', title: 'デッキをつくる', description: '推しのデッキを作ろう', en: 'Build a deck', enDescription: 'Make a deck of your favorites', image: 'home-mint.webp', color: 'mint' },
  { href: '/deck/2pick', title: '2Pickであそぶ', description: '選ぶたび、わくわく。', en: 'Play 2Pick', enDescription: 'Every pick is a thrill.', image: 'home-yellow.webp', color: 'yellow' },
  { href: '/community', title: 'コミュニティ', description: 'みんなで、お菓子争奪戦！', en: 'Community', enDescription: 'Battle for sweets together!', image: 'home-pink.webp', color: 'pink' },
  { href: '/deck-view', title: 'デッキを画像に', description: 'お気に入りをシェアしよう。', en: 'Deck image', enDescription: 'Share your favorite deck.', image: 'home-purple.webp', color: 'peach' },
];

export default function ToolsSection() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="tools-heading" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow} aria-hidden="true">LET’S PLAY!</span>
            <h2 id="tools-heading"><Bi ja={<>もっと、<br className={styles.mobileBreak} />ぷぷりえーる</>} en={<>More <br className={styles.mobileBreak} />PPLALE</>} /></h2>
          </div>
          <Image src="/images/game/characters/home-rabbit.webp" alt="" width={444} height={640}
            sizes="(max-width: 600px) 90px, 120px" className={styles.mascot} />
        </div>

        <Link href="/game" prefetch={false} className={styles.battle}>
          <div className={styles.battleArt}>
            <Image src="/images/baner.webp" alt={t('カードを手に向かい合う、ぷぷりえーるの2人のキャラクター')} fill
              sizes="(max-width: 1048px) calc(100vw - 40px), 1008px" className={styles.battleImage} />
          </div>
          <div className={styles.battleCaption}>
            <div>
              <h3><Bi ja="ブラウザで対戦" en="Play in your browser" /></h3>
              <p><Bi ja="推しの幼女で勝利をつかめ！" en="Win with your favorite little girls!" /></p>
            </div>
            <span className={styles.playButton} aria-hidden="true"><Bi ja="あそぶ" en="Play" /> <span>→</span></span>
          </div>
        </Link>

        <div className={styles.grid}>
          {destinations.map(destination => (
            <Link key={destination.href} href={destination.href} prefetch={false} className={`${styles.card} ${styles[destination.color]}`}>
              <div className={styles.characterStage}>
                <span className={styles.halo} aria-hidden="true" />
                <span className={styles.sparkle} aria-hidden="true">✦</span>
                <Image src={`/images/game/characters/${destination.image}`} alt="" fill
                  sizes="(max-width: 600px) 40vw, 220px" className={styles.character} />
              </div>
              <div className={styles.cardCaption}>
                <h3><Bi ja={destination.title} en={destination.en} /></h3>
                <p><Bi ja={destination.description} en={destination.enDescription} /></p>
                <span className={styles.arrow} aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
