import Image from 'next/image';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import type { GameIconName } from '@/components/shared/ui/GameIcon';
import styles from './CharacterDestination.module.css';

/** Fixed geometry for character-led menu destinations. Callers choose content, never dimensions. */
/** `icon`: drawn left of the name, so the destination reads without the words. */
export function CharacterDestination({ label, character, tone, icon, onClick }: {
  label: string;
  icon: GameIconName;
  character: string;
  tone: 'vanilla' | 'sage' | 'pink';
  onClick: () => void;
}) {
  return <button type="button" className={styles.tile} data-palette={tone} onClick={onClick}>
    <Image src={`/images/game/characters/${character}.webp`} alt="" width={100} height={110} />
    <span className={styles.name}><GameIcon name={icon} /><span data-ui-title>{label}</span></span>
  </button>;
}
