'use client';

import Link from 'next/link';
import { GuestSignInPrompt } from '@/components/shared/auth/GuestSignInPrompt';
import { CharacterDestination } from './CharacterDestination';
import { useLaunchpad } from './LaunchpadContext';
import { usePlaza } from '@/components/game/plaza/PlazaProvider';
import { RoomThumbnailImage } from '@/components/game/plaza/RoomThumbnailImage';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { sectionInfo } from './places';
import { visibilityInfo } from '@/components/game/plaza/visibility';
import styles from './LaunchpadHome.module.css';

/** One ordered list owns each destination's behavior and illustration. */
const destinations = [
  { target: 'social', character: 'home-pink', tone: 'vanilla' },
  { target: 'discover', character: 'home-purple', tone: 'sage' },
  { target: 'cards', character: 'home-mint', tone: 'pink' },
  { target: 'puzzles', character: 'home-rabbit', tone: 'vanilla' },
  { target: 'history', character: 'home-yellow', tone: 'vanilla' },
  { target: 'editor', character: 'pink-friend', tone: 'pink' },
] as const;

export function LaunchpadHome({ onHome, onShare }: { onHome: () => void; onShare: () => void }) {
  const { openAt } = useLaunchpad(), { view } = usePlaza();
  return <div className={styles.home}>
    <CurrentRoomBanner />
    <GuestSignInPrompt compact />
    <section aria-label="クイックリンク">
      <nav className={styles.destinations} aria-label="ゲームの画面">{destinations.map(({ target, character, tone }) =>
        <CharacterDestination key={target} character={character} tone={tone} label={target === 'discover' ? 'ルーム' : sectionInfo[target].label}
          onClick={() => openAt({ section: target })} />)}</nav>
    </section>
    <div className={styles.quick} role="group" aria-label="ルームの操作">
      <button onClick={onHome}><GameIcon name="home" /><span>ホーム</span></button>
      <button disabled={!view?.plaza} onClick={onShare}><GameIcon name="letter" /><span>さそう</span></button>
    </div>
    <footer className={styles.foot}>
      <nav className={styles.moreLinks} aria-label="その他の画面">
        {(['profile', 'performance'] as const).map(target => <button key={target} onClick={() => openAt({ section: target })}><GameIcon name={sectionInfo[target].icon} /><span>{sectionInfo[target].label}</span></button>)}
        <Link href="/" prefetch={false}><GameIcon name="exit" /><span>サイトへ</span></Link>
      </nav>
    </footer>
  </div>;
}

function CurrentRoomBanner() {
  const { openAt } = useLaunchpad(), { view, stage } = usePlaza();
  const room = view?.plaza;
  if (!room || !view) return <OrnateFrame size="sm" className={styles.roomMain}>
    <span className={styles.emptyRoomArt}><GameIcon name="home" /></span><span className={styles.roomText}><small>いまのルーム</small><b data-ui-title>ホーム</b><span>{stage.kind === 'entering' ? 'つないでいます…' : 'みんなで遊ぶ場所'}</span></span>
  </OrnateFrame>;
  return <button className={styles.roomBanner} onClick={() => openAt({ section: 'instance' })} aria-label="いまのルームの詳細">
    <OrnateFrame size="sm" className={styles.roomMain}>
      <RoomThumbnailImage rules={room.nextRules ?? view.rules} className={styles.roomArt} sizes="160px" />
      <span className={styles.roomText}><small>いまのルーム</small><b data-ui-title>{room.name}</b><span><GameIcon name={visibilityInfo[room.visibility].icon} />{visibilityInfo[room.visibility].label}<GameIcon name="people" />{room.members.length}</span></span>
      <GameIcon name="pin" />
    </OrnateFrame>
  </button>;
}
