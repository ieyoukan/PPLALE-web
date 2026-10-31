'use client';

// 各画面の遅延読込をここに集約する。開いていない画面のコードは先に読み込まない。
import dynamic from 'next/dynamic';
import { NotificationVolumeControl } from '../notifications/GameNotifications';
import { NotificationsPage } from '../social/NotificationsPage';
import { GameSettings } from '../settings/GameSettings';
import { CurrentRoomPanel } from '../plaza/CurrentRoomPanel';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { LaunchpadHome } from './LaunchpadHome';
import type { Place, Section } from './places';
import styles from './Launchpad.module.css';

// 各画面の本体は初めて開くときに読み込む。
const GameLobby = dynamic(() => import('@/components/game/GameLobby'));
const MatchHistory = dynamic(() => import('@/components/game/history/MatchHistory').then(module => module.MatchHistory));
const PuzzleLobby = dynamic(() => import('@/components/game/puzzles/PuzzleLobby'));
const BeginnerMissions = dynamic(() => import('@/components/game/missions/BeginnerMissions').then(module => module.BeginnerMissions));
const CardsMenu = dynamic(() => import('@/components/game/home/CardsMenu').then(module => module.CardsMenu));
const CardGallery = dynamic(() => import('@/components/game/home/CardGallery'));
const RoomBrowser = dynamic(() => import('@/components/game/plaza/RoomBrowser').then(module => module.RoomBrowser));
const EditorLobby = dynamic(() => import('@/components/game/editor/EditorLobby'));
const SocialPage = dynamic(() => import('@/components/game/social/SocialPage').then(module => module.SocialPage));
const DecksPage = dynamic(() => import('@/components/game/decks/DecksPage').then(module => module.DecksPage));
const DeckEditor = dynamic(() => import('@/components/game/decks/DeckEditor').then(module => module.DeckEditor));
const ProfilePage = dynamic(() => import('@/components/game/social/ProfilePage').then(module => module.ProfilePage));
const PlayPerformancePanel = dynamic(() => import('@/components/game/performance/PlayPerformancePanel').then(module => module.PlayPerformancePanel));

export type RoomPanel = 'share' | 'new' | 'home' | 'rules';

export function LaunchpadScreens({ section, place, onPanel, onClose }: { section: Section; place: Place; onPanel: (panel: RoomPanel) => void; onClose: () => void }) {
  switch (section) {
    case 'discover': return <RoomBrowser onCreate={() => onPanel('new')} onEntered={onClose} />;
    case 'home': return <LaunchpadHome onHome={() => onPanel('home')} onShare={() => onPanel('share')} />;
    case 'notifications': return <NotificationsPage />;
    case 'instance': return <CurrentRoomPanel onAction={onPanel} />;
    case 'volume': return <div className={styles.preferences}><GameIcon name="volume" className={styles.preferenceIcon} /><NotificationVolumeControl /></div>;
    case 'settings': return <GameSettings volume={false} />;
    case 'cpu': return <GameLobby />;
    case 'history': return <MatchHistory />;
    case 'puzzles': return <PuzzleLobby fruitId={place.fruit} />;
    case 'missions': return <BeginnerMissions />;
    case 'cards': return <CardsMenu />;
    case 'zukan': return <CardGallery />;
    case 'decks': return <DecksPage key={`${place.id ?? ''}:${place.from ?? ''}`} place={place} />;
    case 'deckEditor': return <DeckEditor key={place.id} place={place} onClose={onClose} />;
    case 'editor': return <EditorLobby />;
    case 'social': return <SocialPage />;
    case 'profile': return <ProfilePage id={place.id} />;
    case 'performance': return <PlayPerformancePanel />;
  }
}
