'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { fruitNames } from '@pplale/game-core';
import { MAX_MEMBERS } from '@pplale/game-core/room';
import type { RoomInfo, RoomView } from '@pplale/game-core/room';
import { browseRooms } from '@/lib/game/room/client';
import { ScreenSubtitle } from '@/components/shared/ui/ScreenSubtitle';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { RoomRuleFilters } from '@/components/shared/room/RoomRuleFilters';
import { allRoomRules, matchesRoomRules } from '@/lib/game/room/filters';
import type { RoomRuleFilter } from '@/lib/game/room/filters';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { usePlaza } from './PlazaProvider';
import { RoomThumbnailImage } from './RoomThumbnailImage';
import { visibilityInfo } from './visibility';
import styles from './RoomBrowser.module.css';

/** Keep the current public room's live information; private rooms belong in Social. */
function currentRoomInfo(view: RoomView | null): RoomInfo | null {
  const room = view?.plaza;
  if (!view || !room || room.visibility !== 'public') return null;
  return {
    id: view.id, status: view.status, rules: room.nextRules ?? view.rules, host: room.creator.name,
    open: room.members.length < MAX_MEMBERS, spectators: true,
    plaza: { name: room.name, visibility: room.visibility, creator: room.creator, members: room.members.length, seated: view.players.filter(Boolean).length },
  };
}

/** Public room discovery shared by expansion and the small pad's room shortcut. */
export function RoomBrowser({ onCreate, onEntered }: { onCreate: () => void; onEntered: () => void }) {
  const plaza = usePlaza();
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<RoomRuleFilter>(allRoomRules);
  const [filtering, setFiltering] = useState(false);
  useEffect(() => {
    let active = true, pending = false;
    const refresh = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const result = await browseRooms();
        if (active) { setRooms(result.rooms.filter(room => room.plaza?.visibility === 'public')); setError(''); }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'ルームを読み込めませんでした');
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [revision]);
  const current = currentRoomInfo(plaza.view);
  const available = [...(current ? [current] : []), ...rooms.filter(room => room.id !== current?.id)].filter(room => matchesRoomRules(room, filters));
  const chosen = available.find(room => room.id === selected) ?? available[0];
  const enter = async () => {
    if (!chosen || busy) return;
    setBusy(true); setError('');
    try { await plaza.go(chosen.id); onEntered(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'ルームに入れませんでした'); }
    finally { setBusy(false); }
  };
  return <div className={styles.browser}>
    <div className={styles.toolbar}>
      <ScreenSubtitle>パブリックルーム</ScreenSubtitle>
      <button type="button" className={styles.iconButton} aria-label="ルーム一覧を更新" onClick={() => { setLoading(true); setRevision(value => value + 1); }} disabled={loading}><GameIcon name="refresh" /></button>
      <button type="button" className={styles.filterButton} aria-expanded={filtering} onClick={() => setFiltering(value => !value)}><GameIcon name="rules" /><span>絞り込み</span></button>
      <OrnateFrame as="button" size="line" className={styles.createButton} onClick={onCreate}><GameIcon name="plus" /><span data-ui-title>ルームを作る</span></OrnateFrame>
    </div>
    {filtering && <RoomRuleFilters value={filters} onChange={setFilters} />}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.layout}>
      {chosen ? <OrnateFrame as="section" size="sm" className={styles.detail} aria-label="選択したルーム">
        <div className={styles.overview}>
          <RoomThumbnailImage rules={chosen.rules} className={styles.thumbnail} alt="ルームのサムネイル" sizes="(max-width: 600px) 70vw, 320px" />
          <div className={styles.description}>
            <div className={styles.heading}><h3 data-ui-title>{chosen.plaza!.name}</h3><small>#{chosen.id}</small></div>
            <div className={styles.facts}>
              <span><GameIcon name={visibilityInfo[chosen.plaza!.visibility].icon} />{visibilityInfo[chosen.plaza!.visibility].label}</span>
              <span aria-label={`人数 ${chosen.plaza!.members} / ${MAX_MEMBERS}`}><GameIcon name="people" />{chosen.plaza!.members} / {MAX_MEMBERS}</span>
              <span><GameIcon name="seat" />{chosen.plaza!.seated} / 2</span>
            </div>
            <p className={styles.creator}><GameIcon name="crown" /><span>作成者</span><b>{chosen.plaza!.creator.name}</b></p>
          </div>
        </div>
        <div className={styles.rules} aria-label="ルームのルール">
          <span><GameIcon name="rules" />{fruitNames[chosen.rules.fruits.at(-1)!]}まで</span>
          <span>{chosen.rules.extendedPlayable ? '拡張あり' : '通常'}</span>
          <span><GameIcon name="timer" />{chosen.rules.turnSeconds ? `${chosen.rules.turnSeconds / 60}分` : '無制限'}</span>
        </div>
        <div className={styles.entry}>
          <span className={styles.status}>{chosen.status === 'playing' ? '対戦中・観戦できます' : '待機中'}</span>
          <OrnateFrame as="button" size="line" className={styles.enterButton} onClick={() => void enter()} disabled={busy || (!chosen.open && chosen.id !== current?.id)}>
            <GameIcon name={chosen.id === current?.id ? 'pin' : 'enter'} /><span data-ui-title>{busy ? 'つないでいます…' : chosen.id === current?.id ? 'いまのルームへ' : chosen.open ? '入る' : '満員'}</span>
          </OrnateFrame>
        </div>
      </OrnateFrame> : <div className={styles.empty}>
        <Image src="/images/game/characters/home-purple.webp" alt="" width={120} height={132} />
        <p role="status">{loading ? 'ルームを探しています…' : 'パブリックルームがありません'}</p>
      </div>}
      <aside className={styles.directory} aria-label="パブリックルーム一覧" aria-busy={loading}>
        <div className={styles.listHeading}><b data-ui-title>ルーム</b><span>{available.length}</span></div>
        <ul className={styles.list}>{available.map(room => <li key={room.id}>
          <button type="button" className={styles.room} aria-pressed={chosen?.id === room.id} onClick={() => setSelected(room.id)} aria-label={`${room.plaza!.name} #${room.id}`}>
            <span className={styles.roomIcon}><GameIcon name={visibilityInfo[room.plaza!.visibility].icon} /></span>
            <span className={styles.roomText}><b>{room.plaza!.name}</b><small>#{room.id}・{visibilityInfo[room.plaza!.visibility].label}</small>
              <span><GameIcon name="people" />{room.plaza!.members}<GameIcon name="seat" />{room.plaza!.seated} / 2{room.id === current?.id && <em>いまのルーム</em>}</span>
            </span>
          </button>
        </li>)}</ul>
        {loading && <p className={styles.loading} role="status">更新中…</p>}
      </aside>
    </div>
  </div>;
}
