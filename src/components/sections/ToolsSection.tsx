import Image from 'next/image';
import Link from 'next/link';
import styles from './ToolsSection.module.css';

const destinations = [
  { href: '/build', title: 'デッキをつくる', description: '推しのカードで、とっておき。', image: 'home-mint.webp', color: 'mint' },
  { href: '/deck/2pick', title: '2Pickであそぶ', description: '選ぶたび、わくわく。', image: 'home-yellow.webp', color: 'yellow' },
  { href: '/tournament', title: '大会をチェック', description: 'みんなで、お菓子争奪戦！', image: 'home-pink.webp', color: 'pink' },
  { href: '/deck-view', title: 'デッキを画像に', description: 'お気に入りをシェアしよう。', image: 'home-purple.webp', color: 'peach' },
];

export default function ToolsSection() {
  return (
    <section aria-labelledby="tools-heading" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.heading}>
          <div>
            <span className={styles.eyebrow} aria-hidden="true">LET’S PLAY!</span>
            <h2 id="tools-heading">もっと、<br className={styles.mobileBreak} />ぷぷりえーる</h2>
          </div>
          <Image src="/images/game/characters/home-rabbit.webp" alt="" width={444} height={640}
            sizes="(max-width: 600px) 90px, 120px" className={styles.mascot} />
        </div>

        <Link href="/game" className={styles.battle}>
          <div className={styles.battleArt}>
            <Image src="/images/baner.webp" alt="カードを手に向かい合う、ぷぷりえーるの2人のキャラクター" fill
              sizes="(max-width: 1048px) calc(100vw - 40px), 1008px" className={styles.battleImage} />
          </div>
          <div className={styles.battleCaption}>
            <div>
              <h3>ブラウザで対戦</h3>
              <p>ひとりで練習も、友達との対戦も。</p>
            </div>
            <span className={styles.playButton} aria-hidden="true">あそぶ <span>→</span></span>
          </div>
        </Link>

        <div className={styles.grid}>
          {destinations.map(destination => (
            <Link key={destination.href} href={destination.href} className={`${styles.card} ${styles[destination.color]}`}>
              <div className={styles.characterStage}>
                <span className={styles.halo} aria-hidden="true" />
                <span className={styles.sparkle} aria-hidden="true">✦</span>
                <Image src={`/images/game/characters/${destination.image}`} alt="" fill
                  sizes="(max-width: 600px) 40vw, 220px" className={styles.character} />
              </div>
              <div className={styles.cardCaption}>
                <h3>{destination.title}</h3>
                <p>{destination.description}</p>
                <span className={styles.arrow} aria-hidden="true">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
