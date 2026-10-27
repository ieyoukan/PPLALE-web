import Image from 'next/image';
import styles from './CharacterDestination.module.css';

/** Fixed geometry for character-led menu destinations. Callers choose content, never dimensions. */
export function CharacterDestination({ label, character, tone, onClick }: {
  label: string;
  character: string;
  tone: 'vanilla' | 'sage' | 'pink';
  onClick: () => void;
}) {
  return <button type="button" className={styles.tile} data-palette={tone} onClick={onClick}>
    <Image src={`/images/game/characters/${character}.webp`} alt="" width={100} height={110} />
    <span data-ui-title>{label}</span>
  </button>;
}
