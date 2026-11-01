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
import { MISSIONS_PATH } from '@/lib/game/introCourse';
import { useI18n } from '@/i18n/LocaleProvider';
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
  const { openAt } = useLaunchpad(), { view } = usePlaza(), { t } = useI18n();
  return <div className={styles.home}>
    <CurrentRoomBanner />
    <GuestSignInPrompt compact />
    <section aria-label={t('クイックリンク')}>
      <nav className={styles.destinations} aria-label={t('ゲームの画面')}>{destinations.map(({ target, character, tone }) =>
        <CharacterDestination key={target} character={character} tone={tone} label={t(target === 'discover' ? 'ルーム' : sectionInfo[target].label)}
          onClick={() => openAt({ section: target })} />)}</nav>
    </section>
    <div className={styles.quick} role="group" aria-label={t('ルームの操作')}>
      <button onClick={onHome}><GameIcon name="home" /><span>{t('ホーム')}</span></button>
      <button disabled={!view?.plaza} onClick={onShare}><GameIcon name="letter" /><span>{t('さそう')}</span></button>
    </div>
    <footer className={styles.foot}>
      <nav className={styles.moreLinks} aria-label={t('その他の画面')}>
        <Link href={MISSIONS_PATH} prefetch={false}><GameIcon name="beginner" /><span>{t('初心者ミッション')}</span></Link>
        <Link href="/" prefetch={false}><GameIcon name="exit" /><span>{t('サイトへ')}</span></Link>
      </nav>
    </footer>
  </div>;
}

function CurrentRoomBanner() {
  const { openAt } = useLaunchpad(), { view, stage } = usePlaza(), { t, nameText } = useI18n();
  const room = view?.plaza;
  if (!room || !view) return <OrnateFrame size="sm" className={styles.roomMain}>
    <span className={styles.emptyRoomArt}><GameIcon name="home" /></span><span className={styles.roomText}><small>{t('いまのルーム')}</small><b data-ui-title>{t('ホーム')}</b><span>{stage.kind === 'entering' ? t('つないでいます…') : t('みんなで遊ぶ場所')}</span></span>
  </OrnateFrame>;
  return <button className={styles.roomBanner} onClick={() => openAt({ section: 'instance' })} aria-label={t('いまのルームの詳細')}>
    <OrnateFrame size="sm" className={styles.roomMain}>
      <RoomThumbnailImage rules={room.nextRules ?? view.rules} className={styles.roomArt} sizes="160px" />
      <span className={styles.roomText}><small>{t('いまのルーム')}</small><b data-ui-title>{nameText(room.name)}</b><span><GameIcon name={visibilityInfo[room.visibility].icon} />{t(visibilityInfo[room.visibility].label)}<GameIcon name="people" />{room.members.length}</span></span>
      <GameIcon name="pin" />
    </OrnateFrame>
  </button>;
}
