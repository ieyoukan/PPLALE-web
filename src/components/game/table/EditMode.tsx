'use client';

// 盤面エディタ on the table itself: the strip that says the board is being edited, and the card
// picker that opens when an empty slot, a hand's ＋ or a pile's ＋ is tapped.
import { useState } from 'react';
import type { Side } from '@pplale/game-core';
import { displayCards } from '@/lib/game/catalog';
import { useBoardContext } from '../board/BoardContext';
import type { Picking } from '../board/useBoard';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const yojoPool = [...range(0, 30).map(n => `y_${n}`), 'yt_0', 'yt_1', 'token_cat', 'token_pudding'];
const sweetPool = range(0, 27).map(n => `s_${n}`);
const poolOf = (zone: Picking['zone']) => zone === 'field' || zone === 'yojo' ? yojoPool : zone === 'sweet' ? sweetPool : [...yojoPool, ...sweetPool];
const places: Record<Picking['zone'], string> = { field: '場', hand: '手札', nap: 'お昼寝場所', exile: '除外カード', yojo: '幼女デッキ', sweet: 'お菓子デッキ', played: 'このゲームで出したカード' };
const who = (side: Side) => side === 0 ? 'あなた' : '相手';

/** Shown while editing, beside the table: that the board is being edited, and whose turn it is set to. */
export function EditBar() {
  const { game, editing, edit } = useBoardContext();
  if (!editing) return null;
  return <div className={styles.editBar} role="toolbar" aria-label="盤面エディタ">
    <b>編集モード</b>
    <span className={styles.editBarHint}>場・手札・山札・プレイアブルを押して変える</span>
    <span className={styles.editBarTurn} role="group" aria-label="手番"><span>手番</span>
      {([0, 1] as Side[]).map(side => <button key={side} aria-pressed={game.active === side} onClick={() => edit({ type: 'turn', active: side })}>{who(side)}</button>)}
    </span>
  </div>;
}

/** Shown while playing a board that can be edited: back to edit mode from the position on the table. */
export function EditButton() {
  const { game, mode, editing, position, remote, replaying, busy, editBoard } = useBoardContext();
  if (editing || remote || replaying || game.phase !== 'playing' || !(position || mode === 'hotseat')) return null;
  return <button className={styles.editToggle} disabled={busy} onClick={editBoard}>✎ 編集</button>;
}

/** Every card that may go to the place being filled; a tap puts it there. */
export function CardPicker() {
  const { game, picking, setPicking, edit } = useBoardContext();
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  if (!picking) return null;
  const { side, zone, slot } = picking, single = zone === 'field';
  const close = () => { setPicking(null); setQuery(''); setAdded([]); };
  function add(cardId: string) {
    if (zone === 'played') edit({ type: 'played', side, cardIds: [...game.players[side].played, cardId] });
    else edit({ type: 'add', side, zone, cardId, slot });
    if (!single) return setAdded(previous => [...previous, cardId]);
    close();
  }
  const name = (cardId: string) => displayCards[cardId]?.name ?? cardId;
  const shown = poolOf(zone).filter(cardId => name(cardId).includes(query.trim()));
  return <div className={styles.picker} role="dialog" aria-modal="true" aria-label={`${who(side)}の${places[zone]}に置くカード`} onClick={close}>
    <div className={styles.pickerSheet} onClick={event => event.stopPropagation()}>
      <header>
        <h2>{who(side)}の{places[zone]}に置くカード</h2>
        <input value={query} placeholder="名前でさがす" aria-label="名前でさがす" onChange={event => setQuery(event.target.value)} />
        <button onClick={close}>{single ? 'やめる' : '閉じる'}</button>
      </header>
      {added.length > 0 && <p>加えたカード：{added.map(name).join('、')}</p>}
      <ul>{shown.map(cardId => <li key={cardId}>
        <button aria-label={name(cardId)} onClick={() => add(cardId)}><GameCard id={cardId} sizes="130px" /></button>
      </li>)}</ul>
    </div>
  </div>;
}
