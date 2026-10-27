'use client';

import { fruitNames, playableNow } from '@pplale/game-core';
import type { Fruit } from '@pplale/game-core';
import type { RoomInfo } from '@pplale/game-core/room';
import { PlazaIcon } from '../plaza/PlazaIcon';
import styles from './Social.module.css';

export interface RoomRuleFilter { fruit: Fruit | 'any'; extended: 'any' | 'normal' | 'extended'; turn: 'any' | 'none' | '120' | '180' | '300' }
export const allRoomRules: RoomRuleFilter = { fruit: 'any', extended: 'any', turn: 'any' };

export function matchesRoomRules(room: RoomInfo, filter: RoomRuleFilter) {
  return (filter.fruit === 'any' || room.rules.fruits.at(-1) === filter.fruit)
    && (filter.extended === 'any' || room.rules.extendedPlayable === (filter.extended === 'extended'))
    && (filter.turn === 'any' || (room.rules.turnSeconds ?? 0) === (filter.turn === 'none' ? 0 : Number(filter.turn)));
}

/** Filters only the room cards; friends away from rooms remain visible below. */
export function RoomRuleFilters({ value, onChange }: { value: RoomRuleFilter; onChange: (value: RoomRuleFilter) => void }) {
  const active = value.fruit !== 'any' || value.extended !== 'any' || value.turn !== 'any';
  return <section className={styles.ruleFilters} aria-label="ルームのルールで絞り込む">
    <strong><PlazaIcon name="star" />ルールで絞る</strong>
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
      {active && <button type="button" className={styles.clearRules} onClick={() => onChange(allRoomRules)}><PlazaIcon name="close" />解除</button>}
    </div>
  </section>;
}
