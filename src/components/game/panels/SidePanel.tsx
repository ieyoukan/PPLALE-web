'use client';

import { useBoardContext } from '../board/BoardContext';
import { GameSetup } from '../GameSetup';
import styles from '../BoardEmulator.module.css';
import { InspectPanel } from './InspectPanel';
import { LogPanel } from './LogPanel';
import { MenuPanel } from './MenuPanel';
import { SkillPanel } from './SkillPanel';
import { ZonePanel } from './ZonePanel';

/** The drawer / modal that shows whichever panel is open. */
export function SidePanel() {
  const { panel, setPanel, start } = useBoardContext();
  if (!panel) return null;
  const modal = panel.type === 'skills';
  const className = [styles.drawer, modal && styles.skillModal, panel.type === 'inspect' && styles.inspection].filter(Boolean).join(' ');
  const label = panel.type === 'setup' ? '対戦の準備' : modal ? 'スキル' : 'カード情報';
  return <>
    {modal && <button className={styles.modalBackdrop} aria-label="スキルを閉じる" onClick={() => setPanel(null)} />}
    <aside className={className} role={modal ? 'dialog' : undefined} aria-modal={modal || undefined} aria-label={label}>
      {panel.type === 'setup' ? <GameSetup onClose={() => setPanel(null)} onStart={start} /> : <>
        <button className={styles.close} onClick={() => setPanel(null)} aria-label="パネルを閉じる">×</button>
        {panel.type === 'menu' && <MenuPanel />}
        {panel.type === 'logs' && <LogPanel />}
        {panel.type === 'zone' && <ZonePanel side={panel.side} kind={panel.kind} />}
        {panel.type === 'inspect' && <InspectPanel uid={panel.uid} />}
        {panel.type === 'skills' && <SkillPanel side={panel.side} />}
      </>}
    </aside>
  </>;
}
