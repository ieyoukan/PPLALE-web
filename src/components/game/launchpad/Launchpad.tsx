'use client';

// The menu shell: tabs, focus handling and room sheets. Navigation state lives in the provider.
import { Suspense, useEffect, useId, useRef, useState } from 'react';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { usePlaza } from '../plaza/PlazaProvider';
import { RulesSheet } from '../plaza/PlazaSheets';
import { RoomNameSheet } from '../plaza/RoomManagementSheets';
import { ShareSheet } from '../plaza/ShareSheet';
import { HomeRoomSheet } from '../plaza/HomeRoomSheet';
import { NewRoomSheet } from '../plaza/NewRoomSheet';
import { useLaunchpad } from './LaunchpadContext';
import { LaunchpadScreens } from './LaunchpadScreens';
import type { RoomPanel } from './LaunchpadScreens';
import { padTabs, screens, parentSection, sectionInfo } from './places';
import type { Place, Section } from './places';
import styles from './Launchpad.module.css';

const tabLabel = (section: Section) => section === 'home' ? 'ホーム' : section === 'discover' ? 'ぷぷりえーる' : sectionInfo[section].label;

export function Launchpad({ stack, choose }: { stack: Place[]; choose: (section: Section) => void }) {
  const { close: onClose, expanded, setExpanded, place, back } = useLaunchpad();
  const plaza = usePlaza();
  const [panel, setPanel] = useState<RoomPanel | null>(null);
  const [error, setError] = useState('');
  const box = useRef<HTMLDivElement>(null), panelRef = useRef<HTMLDivElement>(null), tabId = useId();
  const view = plaza.view;
  // The small pad is for quick actions; its expanded landing page finds public rooms.
  const shownSection = (section: Section) => expanded && section === 'home' ? 'discover' : !expanded && section === 'discover' ? 'home' : section;
  const section = shownSection(place.section);
  // Each screen opens at its top.
  useEffect(() => { panelRef.current?.scrollTo({ top: 0 }); }, [place, expanded]);
  // Focus moves into the pad (to the pad itself, so no button looks chosen by it).
  useEffect(() => { box.current?.focus(); }, [expanded]);
  const rail = expanded ? screens : padTabs;
  // The rail shows the screen the shown one was opened from (a profile from フレンド: フレンド).
  const current = [...stack].reverse().map(item => shownSection(parentSection[item.section] ?? item.section)).find(item => rail.includes(item));
  const title = sectionInfo[section].label;
  const icons = expanded && <div className={styles.tabIcons} role="tablist" aria-label="ランチパッドのタブ">{padTabs.filter(item => item !== 'home').map(item =>
    <button key={item} id={`${tabId}-${item}`} type="button" role="tab" className={styles.iconButton} aria-label={sectionInfo[item].label} aria-selected={section === item} aria-controls={`${tabId}-panel`} title={sectionInfo[item].label} onClick={() => choose(item)}><GameIcon name={sectionInfo[item].icon} /></button>)}</div>;
  const head = <header className={styles.head}>
    {back && <button className={styles.iconButton} onClick={back} aria-label="もどる" title="もどる"><GameIcon name="back" /></button>}
    <h2 data-ui-title>{title}</h2>
    <div className={styles.headTools}>
      {icons}
      <button className={styles.iconButton} onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'ランチパッドに縮小' : 'ゲームメニューを拡大'} title={expanded ? '縮小' : '拡大'}><GameIcon name={expanded ? 'collapse' : 'expand'} /></button>
      <button className={styles.iconButton} onClick={onClose} aria-label="メニューを閉じる"><GameIcon name="close" /></button>
    </div>
  </header>;
  // The tabs (small) or the game's screens (expanded) down the left side of the pad.
  const tabRail = <nav className={styles.tabBar} role="tablist" aria-orientation="vertical" aria-label={expanded ? 'ゲームの画面' : 'ランチパッドのタブ'} onKeyDown={event => {
      const index = Math.max(0, rail.findIndex(item => item === current));
      const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight', backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
      const next = forward ? (index + 1) % rail.length : backward ? (index + rail.length - 1) % rail.length : event.key === 'Home' ? 0 : event.key === 'End' ? rail.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); choose(rail[next]);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
    }}>{rail.map(item => <button key={item} id={`${tabId}-${item}`} type="button" role="tab" aria-label={item === 'home' ? 'ランチパッドホーム' : sectionInfo[item].label} aria-selected={current === item} aria-controls={`${tabId}-panel`} tabIndex={current === item || (!current && item === 'home') ? 0 : -1} title={sectionInfo[item].label} onClick={() => choose(item)}><GameIcon name={sectionInfo[item].icon} /><span data-ui-title>{tabLabel(item)}</span></button>)}</nav>;

  return <div className={styles.backdrop} onClick={onClose} data-launchpad>
    <div ref={box} tabIndex={-1} inert={!!panel} className={expanded ? styles.expanded : styles.dialog} role="dialog" aria-modal="true" aria-label="ゲームメニュー" data-launchpad onClick={event => event.stopPropagation()} onKeyDown={event => {
      event.stopPropagation();
      const typing = (event.target as HTMLElement).closest('input:not([type=range]), textarea, select, [contenteditable=true]');
      if (event.key === 'Escape' && !panel && !typing && !event.nativeEvent.isComposing && !event.defaultPrevented) { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]')).filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && (document.activeElement === first || !event.currentTarget.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <OrnateFrame className={styles.pad} data-section={section}>
        {tabRail}{head}
        <div ref={panelRef} className={styles.tabPanel} role="tabpanel" id={`${tabId}-panel`} aria-label={title} tabIndex={0}>
          <Suspense fallback={null}><LaunchpadScreens section={section} place={place} onPanel={setPanel} onClose={onClose} /></Suspense>
          {error && <p className={styles.createError} role="alert">{error}</p>}
        </div>
      </OrnateFrame>
    </div>
    <span onClick={event => event.stopPropagation()}>
      {panel === 'share' && view?.plaza && <ShareSheet view={view} onClose={() => setPanel(null)} />}
      {panel === 'new' && <NewRoomSheet onClose={() => setPanel(null)} onDone={onClose} />}
      {panel === 'home' && <HomeRoomSheet onClose={() => setPanel(null)} onDone={onClose} />}
      {panel === 'name' && view?.plaza && <RoomNameSheet view={view} onClose={() => setPanel(null)} />}
      {panel === 'rules' && view?.plaza && <RulesSheet view={view} onClose={() => setPanel(null)} onSave={rules => {
        void plaza.send({ action: 'rules', rules }).then(() => { setError(''); setPanel(null); }, failure => { setError(failure instanceof Error ? failure.message : 'ルールを変えられませんでした'); setPanel(null); });
      }} />}
      <InstallPrompt />
    </span>
  </div>;
}
