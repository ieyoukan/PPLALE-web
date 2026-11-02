'use client';

// 音量の設定：BGM・効果音・通知音を同じ形の行で並べる。ランチパッドの「音量」と設定画面で共用する。
import { useId } from 'react';
import type { ReactNode } from 'react';
import { gameAudio } from '@/lib/game/gameAudio';
import { useI18n } from '@/i18n/LocaleProvider';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import type { GameIconName } from '@/components/shared/ui/GameIcon';
import { NotificationSoundToggle, useGameNotifications } from '../notifications/GameNotifications';
import { useAudioVolume } from './GameAudio';
import styles from './SoundSettings.module.css';

export function SoundSettings() {
  const [bgm, setBgm] = useAudioVolume('bgm'), [se, setSe] = useAudioVolume('se');
  const notices = useGameNotifications();
  return <div className={styles.sound}>
    <VolumeRow icon="music" label="BGM" volume={bgm} onChange={setBgm} />
    <VolumeRow icon="sparkle" label="効果音" volume={se} onChange={setSe} onSettle={() => gameAudio().play('land')} />
    <VolumeRow icon="bell" label="通知音" volume={notices.enabled ? notices.volume : 0} onChange={notices.setVolume} onSettle={notices.preview} disabled={!notices.enabled}>
      <NotificationSoundToggle compact />
    </VolumeRow>
  </div>;
}

/** `onSettle`: when the slider is let go, a sample of the sound at the new volume. */
function VolumeRow({ icon, label, volume, onChange, onSettle, disabled, children }: {
  icon: GameIconName; label: string; volume: number; onChange: (volume: number) => void; onSettle?: () => void; disabled?: boolean; children?: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId(), percent = Math.round(volume * 100);
  return <section className={styles.row} aria-labelledby={`${id}-name`}>
    <h3 id={`${id}-name`} data-ui-title><GameIcon name={icon} />{t(label)}</h3>
    <input id={id} type="range" min="0" max="100" value={percent} disabled={disabled} aria-labelledby={`${id}-name`} aria-valuetext={`${percent}%`}
      onChange={event => onChange(Number(event.target.value) / 100)} onPointerUp={onSettle} onKeyUp={onSettle} />
    <output htmlFor={id}>{percent}%</output>
    <span className={styles.extra}>{children}</span>
  </section>;
}
