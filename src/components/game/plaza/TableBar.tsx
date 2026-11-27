'use client';

// The room's tables in a row: one chip per table (its number, its two seats, a sword while it plays),
// the one shown here lit up. Tapping a chip (or the arrows, or swiping the room) moves to that table.
// The owner adds a table at the end or takes the last one away. Hidden while there is only one table
// and nobody may add another.
import { MAX_TABLES } from '@pplale/game-core/room';
import type { PlazaTableView } from '@pplale/game-core/room';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './TableBar.module.css';

export function TableBar({ tables, current, owner, busy, compact = false, tournament, onLook, onAdd, onRemove }: {
  tables: PlazaTableView[];
  /** Tables a tournament match was called to: a small trophy on their chips. */
  tournament?: ReadonlySet<number>;
  current: number;
  /** The owner may add and take away tables. */
  owner: boolean;
  busy: boolean;
  /** Over a match's board: only the chips and arrows, smaller. */
  compact?: boolean;
  onLook: (table: number) => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  // A room server without tables (`plaza.tables` missing) shows none.
  if (!tables.length || tables.length < 2 && (!owner || compact)) return null;
  const last = tables.at(-1)!;
  // The last table may go when no person sits at it (a CPU leaves with it) and it is not playing.
  const removable = tables.length > 1 && last.status !== 'playing' && !last.players.some(player => player && !player.cpu);
  return <nav className={styles.bar} data-compact={compact || undefined} aria-label={t('卓')}>
    {tables.length > 1 && <button type="button" className={styles.arrow} disabled={busy || current === 0} onClick={() => onLook(current - 1)} aria-label={t('前の卓')}><GameIcon name="back" /></button>}
    <ol className={styles.chips}>
      {tables.map((table, index) => {
        const seated = table.players.filter(Boolean).length;
        const label = t('卓{n}', { n: index + 1 }) + '・' + t(table.status === 'playing' ? '対戦中' : seated === 2 ? '満席' : seated ? '1人待ち' : 'あいている');
        return <li key={index}>
          <button type="button" className={styles.chip} data-current={index === current || undefined} data-status={table.status}
            aria-current={index === current || undefined} aria-label={label} title={label} disabled={busy && index !== current} onClick={() => index !== current && onLook(index)}>
            <b>{index + 1}</b>
            {tournament?.has(index) && <GameIcon name="trophy" className={styles.trophy} />}
            {table.status === 'playing'
              ? <GameIcon name="sword" className={styles.sword} />
              : <span className={styles.seats} aria-hidden="true">{table.players.map((player, side) => <i key={side} data-taken={player ? player.cpu ? 'cpu' : 'person' : undefined} />)}</span>}
          </button>
        </li>;
      })}
    </ol>
    {tables.length > 1 && <button type="button" className={styles.arrow} data-next disabled={busy || current === tables.length - 1} onClick={() => onLook(current + 1)} aria-label={t('次の卓')}><GameIcon name="back" /></button>}
    {owner && !compact && <span className={styles.owner}>
      {tables.length > 1 && <button type="button" className={styles.edit} disabled={busy || !removable} onClick={onRemove} aria-label={t('最後の卓を片付ける')} title={t('最後の卓を片付ける')}><span aria-hidden="true">−</span></button>}
      <button type="button" className={styles.edit} disabled={busy || tables.length >= MAX_TABLES} onClick={onAdd} aria-label={t('卓を増やす')} title={t('卓を増やす')}><GameIcon name="plus" /></button>
    </span>}
  </nav>;
}
