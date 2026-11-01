'use client';

// 盤面エディタ on the table itself: the strip that says the board is being edited, and the card
// picker that opens when an empty slot, a hand's ＋ or a pile's ＋ is tapped.
import { useState } from 'react';
import { implementedCard } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { fruitNames } from '@pplale/game-core/room';
import { displayCards } from '@/lib/game/catalog';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import { useBoardContext } from '../board/BoardContext';
import type { Picking } from '../board/useBoard';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

const yojoPool = Object.values(displayCards).filter(c => c.type === 'yojo' && implementedCard(c.id)).map(c => c.id);
const sweetPool = Object.values(displayCards).filter(c => c.type === 'sweet' && implementedCard(c.id)).map(c => c.id);
const poolOf = (zone: Picking['zone']) => zone === 'field' || zone === 'yojo' ? yojoPool : zone === 'sweet' ? sweetPool : [...yojoPool, ...sweetPool];
const places: Record<Picking['zone'], string> = { field: '場', hand: '手札', nap: 'お昼寝場所', exile: '除外カード', yojo: '幼女デッキ', sweet: 'お菓子デッキ', played: 'このゲームで出したカード' };
const who = (side: Side) => side === 0 ? 'あなた' : '相手';

/** Shown while editing, beside the table: that the board is being edited, and whose turn it is set to. */
export function EditBar() {
  const { game, editing, edit } = useBoardContext();
  const { t } = useI18n();
  if (!editing) return null;
  return <div className={styles.editBar} role="toolbar" aria-label={t('盤面エディタ')}>
    <b>{t('編集モード')}</b>
    <span className={styles.editBarHint}>{t('場・手札・山札・プレイアブルを押して変える')}</span>
    <span className={styles.editBarTurn} role="group" aria-label={t('手番')}><span>{t('手番')}</span>
      {([0, 1] as Side[]).map(side => <button key={side} aria-pressed={game.active === side} onClick={() => edit({ type: 'turn', active: side })}>{t(who(side))}</button>)}
    </span>
  </div>;
}

/** Shown while playing a board that can be edited: back to edit mode from the position on the table. */
export function EditButton() {
  const { game, mode, editing, position, remote, replaying, busy, editBoard } = useBoardContext();
  const { t } = useI18n();
  if (editing || remote || replaying || game.phase !== 'playing' || !(position || mode === 'hotseat')) return null;
  return <button className={styles.editToggle} disabled={busy} onClick={editBoard}>✎ {t('編集')}</button>;
}

/** Every card that may go to the place being filled; a tap puts it there. */
export function CardPicker() {
  const { game, picking, setPicking, edit } = useBoardContext();
  const [query, setQuery] = useState('');
  const [fruit, setFruit] = useState('all');
  const [added, setAdded] = useState<string[]>([]);
  const { t } = useI18n();
  const cardName = useCardName();
  if (!picking) return null;
  const { side, zone, slot } = picking, single = zone === 'field';
  const close = () => { setPicking(null); setQuery(''); setFruit('all'); setAdded([]); };
  function add(cardId: string) {
    if (zone === 'played') edit({ type: 'played', side, cardIds: [...game.players[side].played, cardId] });
    else edit({ type: 'add', side, zone, cardId, slot });
    if (!single) return setAdded(previous => [...previous, cardId]);
    close();
  }
  const name = (cardId: string) => cardName(cardId, displayCards[cardId]?.name ?? cardId);
  const title = t('{who}の{place}に置くカード', { who: t(who(side)), place: t(places[zone]) });
  const shown = poolOf(zone).filter(cardId => name(cardId).includes(query.trim()) && (fruit === 'all' || displayCards[cardId]?.fruit === fruit));
  return <div className={styles.picker} role="dialog" aria-modal="true" aria-label={title} onClick={close}>
    <div className={styles.pickerSheet} onClick={event => event.stopPropagation()}>
      <header>
        <h2>{title}</h2>
        <input value={query} placeholder={t('名前でさがす')} aria-label={t('名前でさがす')} onChange={event => setQuery(event.target.value)} />
        <select aria-label={t('フルーツで絞る')} value={fruit} onChange={event => setFruit(event.target.value)}>
          <option value="all">{t('すべて')}</option><option value="strawberry">{t('いちご')}</option><option value="grape">{t('ぶどう')}</option><option value="melon">{t('メロン')}</option><option value="orange">{t('オレンジ')}</option>
        </select>
        <button onClick={close}>{t(single ? 'やめる' : '閉じる')}</button>
      </header>
      {added.length > 0 && <p>{t('加えたカード：{cards}', { cards: added.map(name).join(t('、')) })}</p>}
      <ul>{shown.map(cardId => <li key={cardId}>
        <button aria-label={t('{name}（{note}）', { name: name(cardId), note: t(fruitNames[displayCards[cardId]?.fruit as keyof typeof fruitNames] ?? 'トークン') })} onClick={() => add(cardId)}><GameCard id={cardId} sizes="130px" /></button>
      </li>)}</ul>
    </div>
  </div>;
}
