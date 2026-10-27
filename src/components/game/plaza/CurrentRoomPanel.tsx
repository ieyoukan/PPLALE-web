'use client';

import { GameIcon } from '@/components/shared/ui/GameIcon';
import { usePlaza } from './PlazaProvider';
import { RoomThumbnailImage } from './RoomThumbnailImage';
import dynamic from 'next/dynamic';
import { visibilityInfo } from './visibility';
import styles from './CurrentRoomPanel.module.css';

const InstanceMembers = dynamic(() => import('./InstanceMembers').then(module => module.InstanceMembers));

/** Room information and management actions, independent of the menu's navigation shell. */
export function CurrentRoomPanel({ onAction }: { onAction: (action: 'name' | 'rules' | 'share' | 'home') => void }) {
  const plaza = usePlaza(), view = plaza.view, room = view?.plaza;
  return room && view ? <div className={styles.instance}>
      <RoomThumbnailImage rules={room.nextRules ?? view.rules} alt="ルームのサムネイル" className={styles.instanceArt} sizes="(max-width: 760px) 80vw, 620px" />
      <div className={styles.instanceHeading}><h3 data-ui-title>{room.name}</h3><small>#{view.id}</small></div>
      <div className={styles.instanceMeta}><span><GameIcon name={visibilityInfo[room.visibility].icon} />{visibilityInfo[room.visibility].label}</span><span><GameIcon name="people" />{room.members.length}人</span><span role="status">{plaza.linked ? '接続中' : '再接続中…'}</span></div>
      <dl className={styles.roomPeople}><div><dt>作成者</dt><dd>{room.creator.name}</dd></div><div><dt>オーナー</dt><dd>{room.members.find(member => member.id === room.owner)?.name ?? 'オーナー不在'}</dd></div></dl>
      <div className={`${styles.grid} ${styles.actionGrid}`}>
        <button className={styles.tile} disabled={room.owner !== room.me} onClick={() => onAction('name')}><GameIcon name="pen" /><span data-ui-title>ルーム名</span></button>
        <button className={styles.tile} onClick={() => onAction('rules')}><GameIcon name="rules" /><span data-ui-title>ルール</span></button>
        <button className={styles.tile} onClick={() => onAction('share')}><GameIcon name="link" /><span data-ui-title>共有リンク</span></button>
      </div>
      <InstanceMembers room={room} />
    </div> : <div className={styles.empty}><GameIcon name="pin" /><p>ルームに入ると、ここに表示されます</p><button className={styles.tile} onClick={() => onAction('home')}>ホーム</button></div>;
}
