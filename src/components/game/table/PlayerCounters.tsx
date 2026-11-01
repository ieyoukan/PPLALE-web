'use client';

import { playableMp, skillsFor } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { useI18n } from '@/i18n/LocaleProvider';
import { gameCatalog } from '@/lib/game/catalog';
import { useBoardContext } from '../board/BoardContext';
import { cardCounts } from '../board/matchInfo';
import styles from './PlayerCounters.module.css';

/** 数え方は既存の詳細画面と共通。席番号でPP欄と同じプレイヤーに結び付ける。 */
export function PlayerCounters({ side }: { side: Side }) {
  const { game, names, setPanel } = useBoardContext();
  const { t } = useI18n();
  const player = game.players[side], counts = cardCounts(player, gameCatalog);
  const mp = playableMp[player.playable];
  // MPを使って0になった後も表示する。使用履歴を使うので復帰・観戦でも同じ表示になる。
  const skills = skillsFor(player.playable);
  const spentMp = (player.skillHistory ?? []).some(index => !!skills[index]?.mp);
  const counters: { key: string; label: string; value: number; maximum?: number }[] = [
    { key: 'uyuchi', label: 'うゆち', value: counts.uyuchi },
    { key: 'sweets', label: 'お菓子', value: counts.sweets },
    { key: 'mochida', label: 'もちだ', value: counts.mochida },
  ].filter(counter => counter.value > 0);
  if (mp && ((player.mp ?? 0) > 0 || spentMp)) counters.unshift({ key: 'mp', label: 'MP', value: player.mp ?? 0, maximum: mp.max });
  if (!counters.length) return null;
  const name = t(names[side]);
  return <div className={styles.counters} data-player-counters={side} role="group" aria-label={t('{name}のカウンター', { name })}>
    {counters.map(counter => <button key={counter.key} data-resource={counter.key} className={styles.counter}
      aria-label={t('{name}の{counter} {value}', { name, counter: t(counter.label), value: counter.maximum === undefined ? String(counter.value) : `${counter.value} / ${counter.maximum}` })}
      onClick={() => setPanel(counter.key === 'mp' ? { type: 'skills', side } : { type: 'counts' })}>
      <span title={t(counter.label)}>{t(counter.label)}</span><b>{counter.value}{counter.maximum !== undefined && <small>/{counter.maximum}</small>}</b>
    </button>)}
  </div>;
}
