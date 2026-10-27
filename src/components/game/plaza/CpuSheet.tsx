'use client';

import { useState } from 'react';
import { cpuLevels, cpuProfiles } from '@pplale/game-core';
import type { CpuLevel } from '@pplale/game-core';
import type { RoomPlayer } from '@pplale/game-core/room';
import { usableChoice } from '@/lib/game/deckSources';
import type { DeckChoice } from '@/lib/game/deckSources';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { Avatar } from './Avatar';
import { DeckSheet } from './PlazaSheets';
import { PlazaIcon } from './PlazaIcon';
import { Sheet } from './Sheet';
import styles from './Plaza.module.css';
import cpuStyles from './CpuSheet.module.css';

/** Strength and deck are confirmed together. Card lists and previews use the player's picker. */
export function CpuSheet({ choices, loading, signIn, current, onChoose, onClose }: {
  choices: DeckChoice[]; loading: boolean; signIn?: () => void; current?: RoomPlayer;
  onChoose: (level: CpuLevel, deck: DeckChoice) => void; onClose: () => void;
}) {
  const [level, setLevel] = useState<CpuLevel>(current?.cpu ?? 'normal');
  const [selected, setSelected] = useState(() => choices.find(choice => choice.name === current?.deck)?.id ?? 'random:deck');
  const [picking, setPicking] = useState(false);
  const chosen = usableChoice(choices, selected);
  if (picking) return <DeckSheet choices={choices} chosen={chosen} loading={loading} signIn={signIn}
    onChoose={id => { setSelected(id); setPicking(false); }} onClose={() => setPicking(false)} />;
  return <Sheet title="CPUをえらぶ" onClose={onClose} wide>
    <ul className={styles.cpuGrid}>{cpuLevels.map((item, index) => <li key={item}>
      <OrnateFrame as="button" size="sm" className={styles.cpuTile} data-level={item} aria-pressed={item === level} onClick={() => setLevel(item)}>
        <Avatar cpu size={72} /><b data-ui-title>{cpuProfiles[item].name}</b>
        <span className={styles.stars} aria-label={`強さ${index + 1}`}>{cpuLevels.map((_, star) => <PlazaIcon key={star} name="star" className={star <= index ? styles.starOn : styles.starOff} />)}</span>
        {item === level && <span className={styles.tileCheck}><PlazaIcon name="check" /></span>}
      </OrnateFrame>
    </li>)}</ul>
    <OrnateFrame as="button" size="line" className={cpuStyles.deck} onClick={() => setPicking(true)} aria-label={`CPUのデッキをえらぶ: ${chosen?.name ?? 'なし'}`}>
      <PlazaIcon name="cards" /><span><small>CPUのデッキ</small><b>{chosen?.name ?? 'えらぶ'}</b></span><PlazaIcon name="pen" />
    </OrnateFrame>
    <div className={styles.sheetFoot}><OrnateFrame as="button" size="line" className={styles.primaryButton} disabled={!chosen} onClick={() => { if (chosen) onChoose(level, chosen); }}>
      <PlazaIcon name="check" /><span data-ui-title>{current?.cpu ? 'このCPUにする' : 'このCPUを呼ぶ'}</span>
    </OrnateFrame></div>
  </Sheet>;
}
