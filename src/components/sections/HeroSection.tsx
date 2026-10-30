import Link from 'next/link';
import Image from 'next/image';
import { homeTitleFont } from './homeFont';
import styles from './HeroSection.module.css';

const destinations = [
  { title: 'ぷぷりえーるとは', lines: ['ぷぷりえーる', 'とは'], href: '/about' },
  { title: 'ゲームをプレイ', lines: ['ゲームを', 'プレイ'], href: '/game' },
  { title: 'デッキをつくる', lines: ['デッキを', 'つくる'], href: '/build' },
];

export default function HeroSection() {
  return <section aria-label="ぷぷりえーるを遊ぶ" className={styles.hero}>
    <div className={styles.visual}>
      <Image src="/images/home/hero-friends.webp" alt="" fill sizes="(max-width: 900px) 100vw, 1100px" loading="eager" fetchPriority="high" className={styles.illustration} />
      <h1 className={styles.logo}>
        <Image src="/pupu_game.webp" alt="お菓子争奪戦争ぷぷりえーる" width={500} height={281} sizes="(max-width: 600px) 34vw, 300px" loading="eager" />
      </h1>
    </div>
    <nav aria-label="メニュー" className={styles.menu}>
      {destinations.map(destination => <Link key={destination.href} href={destination.href} prefetch={false} aria-label={destination.title}
        className={`${styles.card} ${homeTitleFont.className}`} data-play={destination.href === '/game' || undefined}>
        <Image src="/images/back-card.webp" alt="" width={40} height={60} sizes="40px" className={styles.cardArt} />
        <span>{destination.lines.map(line => <span key={line}>{line}</span>)}</span>
      </Link>)}
    </nav>
  </section>;
}
