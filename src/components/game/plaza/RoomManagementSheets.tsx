'use client';

import { useState } from 'react';
import type { RoomView } from '@pplale/game-core/room';
import { RulesSheet } from './PlazaSheets';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { RoomThumbnailImage } from './RoomThumbnailImage';
import { ShareSheet } from './ShareSheet';
import { Sheet } from './Sheet';
import { visibilityInfo } from './visibility';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './RoomManagementSheets.module.css';

/** A new room is already joined; these actions can be done before showing its table. */
export function RoomCreatedSheet({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const { t, nameText } = useI18n();
  const [panel, setPanel] = useState<'created' | 'rules' | 'share'>('created');
  if (panel === 'rules') return <RulesSheet view={view} onClose={() => setPanel('created')} />;
  if (panel === 'share') return <ShareSheet view={view} onClose={() => setPanel('created')} />;
  const room = view.plaza!, info = visibilityInfo[room.visibility];
  return <Sheet title={t('ルームを作りました')} onClose={onClose} wide>
    <div className={styles.created}>
      <RoomThumbnailImage rules={room.nextRules ?? view.rules} alt={t('ルームのサムネイル')} className={styles.thumbnail} sizes="(max-width: 700px) 90vw, 560px" priority />
      <div className={styles.identity}>
        <b data-ui-title>{nameText(room.name)}</b><span>#{view.id}</span>
        <small><GameIcon name={info.icon} />{t(info.label)}</small>
      </div>
      <div className={styles.actions}>
        <button onClick={() => setPanel('rules')}><GameIcon name="star" />{t('ルームを編集')}</button>
        <button onClick={() => setPanel('share')}><GameIcon name="link" />{t('共有リンク')}</button>
      </div>
      <button className={styles.primary} onClick={onClose}><GameIcon name="door" />{t('盤面へ')}</button>
    </div>
  </Sheet>;
}
