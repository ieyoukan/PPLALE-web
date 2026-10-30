import Image from 'next/image';
import { HeroCardNavigation } from './HeroCardNavigation';
import styles from './HeroSection.module.css';

export default function HeroSection() {
  return <section aria-label="ぷぷりえーるを遊ぶ" className={styles.hero}>
    <div className={styles.visual}>
      <Image src="/images/home/hero-friends.webp" alt="" fill sizes="100vw" loading="eager" fetchPriority="high" className={styles.illustration} />
      <h1 className={styles.logo}>
        <Image src="/pupu_game.webp" alt="お菓子争奪戦争ぷぷりえーる" width={500} height={281} sizes="(max-width: 600px) 34vw, 30vw" loading="eager" />
      </h1>
    </div>
    <div className={styles.content}>
      <HeroCardNavigation />
    </div>
  </section>;
}
