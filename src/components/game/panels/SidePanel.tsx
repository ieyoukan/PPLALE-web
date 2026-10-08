'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useBoardContext } from '../board/BoardContext';
import type { Panel } from '../board/useBoard';
import styles from '../BoardEmulator.module.css';
const EditUnitPanel = dynamic(() => import('./EditPanels').then(module => module.EditUnitPanel));
const EditHandPanel = dynamic(() => import('./EditPanels').then(module => module.EditHandPanel));
const EditPilePanel = dynamic(() => import('./EditPanels').then(module => module.EditPilePanel));
const EditPlayerPanel = dynamic(() => import('./EditPanels').then(module => module.EditPlayerPanel));
const EditMenuPanel = dynamic(() => import('./EditPanels').then(module => module.EditMenuPanel));
const PlayPanel = dynamic(() => import('./EditPanels').then(module => module.PlayPanel));
const AnalysisPanel = dynamic(() => import('./AnalysisPanel').then(module => module.AnalysisPanel));
const InspectPanel = dynamic(() => import('./InspectPanel').then(module => module.InspectPanel));
const LogPanel = dynamic(() => import('./LogPanel').then(module => module.LogPanel));
const MenuPanel = dynamic(() => import('./MenuPanel').then(module => module.MenuPanel));
const SkillPanel = dynamic(() => import('./SkillPanel').then(module => module.SkillPanel));
const ZonePanel = dynamic(() => import('./ZonePanel').then(module => module.ZonePanel));

const drawers = ['menu', 'logs', 'zone', 'analysis', 'editUnit', 'editHand', 'editPile', 'editPlayer', 'editMenu', 'play'] as const;
type DrawerPanel = Extract<NonNullable<Panel>, { type: (typeof drawers)[number] }>;
const isDrawer = (panel: Panel): panel is DrawerPanel => !!panel && (drawers as readonly string[]).includes(panel.type);

/**
 * Menu, log and pile lists slide in from the right and are closed with the toolbar button, which
 * sits in the same corner. Card inspection and skills are closed with their own 閉じる button.
 */
export function SidePanel() {
  const { panel, setPanel } = useBoardContext();
  const drawer = isDrawer(panel) ? panel : null;
  // Keep the last content while the drawer slides out.
  const [last, setLast] = useState<DrawerPanel | null>(drawer);
  if (drawer && drawer !== last) setLast(drawer);
  const modal = panel?.type === 'skills';
  return <>
    <aside className={`${styles.drawer} ${styles.slideDrawer} ${drawer ? styles.drawerOpen : ''}`} inert={!drawer} aria-label="メニュー">
      {last?.type === 'menu' && <MenuPanel />}
      {last?.type === 'logs' && <LogPanel />}
      {/* Only searches while open: the search is heavy. */}
      {drawer?.type === 'analysis' && <AnalysisPanel />}
      {/* 盤面エディタ: shown from the live board, so a card removed in the panel closes it. */}
      {drawer?.type === 'editUnit' && <EditUnitPanel uid={drawer.uid} />}
      {drawer?.type === 'editHand' && <EditHandPanel uid={drawer.uid} />}
      {drawer?.type === 'editPile' && <EditPilePanel side={drawer.side} kind={drawer.kind} />}
      {drawer?.type === 'editPlayer' && <EditPlayerPanel side={drawer.side} />}
      {drawer?.type === 'editMenu' && <EditMenuPanel />}
      {drawer?.type === 'play' && <PlayPanel />}
      {last?.type === 'zone' && <ZonePanel side={last.side} kind={last.kind} />}
    </aside>
    {modal && <button className={styles.modalBackdrop} aria-label="スキルを閉じる" onClick={() => setPanel(null)} />}
    {(panel?.type === 'skills' || panel?.type === 'inspect') && <aside className={[styles.drawer, modal ? styles.skillModal : styles.inspection].join(' ')}
      role={modal ? 'dialog' : undefined} aria-modal={modal || undefined} aria-label={modal ? 'スキル' : 'カード情報'}>
      {/* Both end with their own 閉じる, placed like the buttons of a hand card chosen in play. */}
      {panel.type === 'inspect' && <InspectPanel uid={panel.uid} />}
      {panel.type === 'skills' && <SkillPanel side={panel.side} />}
    </aside>}
  </>;
}
