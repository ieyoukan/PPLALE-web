'use client';

// Keep dynamic entry points here: adding a screen must not make every menu load it eagerly.
import dynamic from 'next/dynamic';
import { NotificationVolumeControl } from '../notifications/GameNotifications';
import { NotificationsPage } from '../social/NotificationsPage';
import { GameSettings } from '../settings/GameSettings';
import { CurrentRoomPanel } from '../plaza/CurrentRoomPanel';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { LaunchpadHome } from './LaunchpadHome';
import type { Place, Section } from './places';
import styles from './Launchpad.module.css';

// The game's screens, loaded when first opened.
const GameLobby = dynamic(() => import('@/components/game/GameLobby'));
const RoomEntrance = dynamic(() => import('@/components/game/room/RoomEntrance').then(module => module.RoomEntrance));
const FreeMatch = dynamic(() => import('@/components/game/room/FreeMatch').then(module => module.FreeMatch));
const MatchHistory = dynamic(() => import('@/components/game/history/MatchHistory').then(module => module.MatchHistory));
const PuzzleLobby = dynamic(() => import('@/components/game/puzzles/PuzzleLobby'));
const CardsMenu = dynamic(() => import('@/components/game/home/CardsMenu').then(module => module.CardsMenu));
const CardGallery = dynamic(() => import('@/components/game/home/CardGallery'));
const RoomBrowser = dynamic(() => import('@/components/game/plaza/RoomBrowser').then(module => module.RoomBrowser));
const EditorLobby = dynamic(() => import('@/components/game/editor/EditorLobby'));
const SocialPage = dynamic(() => import('@/components/game/social/SocialPage').then(module => module.SocialPage));
const ProfilePage = dynamic(() => import('@/components/game/social/ProfilePage').then(module => module.ProfilePage));
const PlayPerformancePanel = dynamic(() => import('@/components/game/performance/PlayPerformancePanel').then(module => module.PlayPerformancePanel));

export type RoomPanel = 'share' | 'new' | 'home' | 'rules';

export function LaunchpadScreens({ section, place, onPanel, onClose }: { section: Section; place: Place; onPanel: (panel: RoomPanel) => void; onClose: () => void }) {
  return {
    discover: <RoomBrowser onCreate={() => onPanel('new')} onEntered={onClose} />,
    home: <LaunchpadHome onHome={() => onPanel('home')} onShare={() => onPanel('share')} />,
    notifications: <NotificationsPage />,
    instance: <CurrentRoomPanel onAction={onPanel} />,
    volume: <div className={styles.preferences}><GameIcon name="volume" className={styles.preferenceIcon} /><NotificationVolumeControl /></div>,
    settings: <GameSettings volume={false} />,
    cpu: <GameLobby />,
    battle: <RoomEntrance />,
    free: <FreeMatch />,
    history: <MatchHistory />,
    puzzles: <PuzzleLobby fruitId={place.fruit} />,
    cards: <CardsMenu />,
    zukan: <CardGallery />,
    editor: <EditorLobby />,
    social: <SocialPage />,
    profile: <ProfilePage id={place.id} />,
    performance: <PlayPerformancePanel />,
  }[section];
}
