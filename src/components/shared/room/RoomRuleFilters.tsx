'use client';

import { playableNow } from '@pplale/game-core';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './RoomRuleFilters.module.css';
import { allRoomRules } from '@/lib/game/room/filters';
import type { RoomRuleFilter } from '@/lib/game/room/filters';

/** Shared rule controls; the caller decides which room list to filter. */
export function RoomRuleFilters({ value, onChange }: { value: RoomRuleFilter; onChange: (value: RoomRuleFilter) => void }) {
  const { t, fruitLabel } = useI18n();
  const active = value.fruit !== 'any' || value.extended !== 'any' || value.turn !== 'any';
  return <section className={styles.ruleFilters} aria-label={t('ルームのルールで絞り込む')}>
    <strong><GameIcon name="star" />{t('ルールで絞る')}</strong>
    <div className={styles.ruleFilterControls}>
      <label>{t('フルーツ')}
        <select value={value.fruit} onChange={event => onChange({ ...value, fruit: event.target.value as RoomRuleFilter['fruit'] })}>
          <option value="any">{t('すべて')}</option>
          {playableNow.fruits.map(fruit => <option key={fruit} value={fruit}>{t('{fruit}まで', { fruit: fruitLabel(fruit) })}</option>)}
        </select>
      </label>
      <label>{t('プレイアブル')}
        <select value={value.extended} onChange={event => onChange({ ...value, extended: event.target.value as RoomRuleFilter['extended'] })}>
          <option value="any">{t('すべて')}</option><option value="normal">{t('通常')}</option><option value="extended">{t('拡張あり')}</option>
        </select>
      </label>
      <label>{t('1ターン')}
        <select value={value.turn} onChange={event => onChange({ ...value, turn: event.target.value as RoomRuleFilter['turn'] })}>
          <option value="any">{t('すべて')}</option><option value="none">{t('無制限')}</option><option value="120">{t('{minutes}分', { minutes: 2 })}</option><option value="180">{t('{minutes}分', { minutes: 3 })}</option><option value="300">{t('{minutes}分', { minutes: 5 })}</option>
        </select>
      </label>
      {active && <button type="button" className={styles.clearRules} onClick={() => onChange(allRoomRules)}><GameIcon name="close" />{t('解除')}</button>}
    </div>
  </section>;
}
