'use client';

import Image from 'next/image';
import previews from '@/data/lethalPuzzlePreviews.json';
import { PUZZLE_TAGLINE } from '../puzzles/copy';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { PlazaIcon } from './PlazaIcon';
import { useLaunchpad } from './LaunchpadContext';
import styles from './GameDiscover.module.css';

/** Curated introductions to features available in the game; no invented publication dates or news. */
const highlights = [
  { section: 'social', title: 'フレンドと、同じテーブルへ', text: 'プロフィールから現在地を見つけて、合流しよう。' },
  { section: 'cards', title: 'デッキもカードも、じっくり', text: 'カードを大きく見ながら、お気に入りの組み合わせを。' },
  { section: 'history', title: 'あの一戦を、もう一度', text: 'ルームでの対戦をリプレイで振り返ろう。' },
] as const;
const puzzle = previews.puzzles['melon-beginner-1'];

export function GameDiscover({ onCreate }: { onCreate: () => void }) {
  const { openAt } = useLaunchpad();
  return <div className={styles.discover}>
    <OrnateFrame as="section" size="sm" className={styles.feature} aria-label="ルームで待ち合わせ">
      <div className={styles.featureText}>
        <Image className={styles.logo} src="/images/game/logo.webp" alt="お菓子争奪戦争ぷぷりえーる" width={240} height={135} />
        <h3 data-ui-title>ルームで、待ち合わせ。</h3>
        <p>対戦する人も、見ている人も。<br />いつものおやつ時間を、いっしょに。</p>
        <OrnateFrame as="button" size="sm" className={styles.create} onClick={onCreate}><PlazaIcon name="door" /><span data-ui-title>ルームを作る</span></OrnateFrame>
      </div>
      <Image className={styles.friends} src="/images/game/characters/friends.webp" alt="" width={480} height={360} />
    </OrnateFrame>
    <div className={styles.columns}>
      <section className={styles.highlights} aria-label="いま遊べること">
        <h3 data-ui-title>いま遊べること</h3>
        <ul>{highlights.map(item => <li key={item.section}>
          <button onClick={() => openAt({ section: item.section })}>
            <span><b data-ui-title>{item.title}</b><small>{item.text}</small></span>
            <PlazaIcon name="back" className={styles.next} />
          </button>
        </li>)}</ul>
      </section>
      <section className={styles.pickup} aria-label="パズルピックアップ">
        <h3 data-ui-title>{PUZZLE_TAGLINE}</h3>
        <button onClick={() => openAt({ section: 'puzzles' })}>
          <Image src={puzzle.src} width={puzzle.width} height={puzzle.height} alt="メロン初級のパズル盤面" sizes="(max-width: 900px) 45vw, 500px" />
          <span><b data-ui-title>このターンで、勝てるかな？</b><small>メロンのリーサルパズルをのぞいてみよう</small></span>
        </button>
      </section>
    </div>
  </div>;
}
