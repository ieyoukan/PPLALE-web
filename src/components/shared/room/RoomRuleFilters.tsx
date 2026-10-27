'use client';

import { fruitNames, playableNow } from '@pplale/game-core';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './RoomRuleFilters.module.css';
import { allRoomRules } from '@/lib/game/room/filters';
import type { RoomRuleFilter } from '@/lib/game/room/filters';

/** Shared rule controls; the caller decides which room list to filter. */
export function RoomRuleFilters({ value, onChange }: { value: RoomRuleFilter; onChange: (value: RoomRuleFilter) => void }) {
  const active = value.fruit !== 'any' || value.extended !== 'any' || value.turn !== 'any';
  return <section className={styles.ruleFilters} aria-label="ルームのルールで絞り込む">
    <strong><GameIcon name="star" />ルールで絞る</strong>
    <div className={styles.ruleFilterControls}>
      <label>フルーツ
        <select value={value.fruit} onChange={event => onChange({ ...value, fruit: event.target.value as RoomRuleFilter['fruit'] })}>
          <option value="any">すべて</option>
          {playableNow.fruits.map(fruit => <option key={fruit} value={fruit}>{fruitNames[fruit]}まで</option>)}
        </select>
      </label>
      <label>プレイアブル
        <select value={value.extended} onChange={event => onChange({ ...value, extended: event.target.value as RoomRuleFilter['extended'] })}>
          <option value="any">すべて</option><option value="normal">通常</option><option value="extended">拡張あり</option>
        </select>
      </label>
      <label>1ターン
        <select value={value.turn} onChange={event => onChange({ ...value, turn: event.target.value as RoomRuleFilter['turn'] })}>
          <option value="any">すべて</option><option value="none">無制限</option><option value="120">2分</option><option value="180">3分</option><option value="300">5分</option>
        </select>
      </label>
      {active && <button type="button" className={styles.clearRules} onClick={() => onChange(allRoomRules)}><GameIcon name="close" />解除</button>}
    </div>
  </section>;
}
