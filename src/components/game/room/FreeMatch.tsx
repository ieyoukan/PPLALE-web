'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Deck } from '@pplale/game-core';
import { describeRoomRules, freeMatchRules } from '@pplale/game-core/room';
import type { FreeMatchStatus } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { usableChoice } from '@/lib/game/deckSources';
import { randomSeed } from '@/lib/game/match';
import { BATTLE_PATH, HOME_PATH, ROOM_PLAY_PATH, roomHref } from '@/lib/game/sessionStore';
import { abandonFreeMatch, cancelFreeMatch, keepSeat, pollFreeMatch, RoomRequestError, roomServerUrl, startFreeMatch } from '@/lib/game/room/client';
import { DeckSelect, UnusableDecks, useDeckChoices } from '../DeckSelect';
import { NameField, usePlayerName } from './RoomEntrance';
import { BattleCompanion } from './BattleCompanion';
import { MatchDeckPreview } from './MatchDeckPreview';
import styles from './Room.module.css';

type Search = { token: string; name: string; deck: Deck; at: number };

export function FreeMatch() {
  const { replace } = useRouter();
  const { user, signInWithGoogle } = useAuth();
  const [name, setName] = usePlayerName();
  const { choices, saved } = useDeckChoices(freeMatchRules, 'フリーマッチ');
  const [selected, setSelected] = useState('');
  const chosen = usableChoice(choices, selected);
  const previewDeck = chosen && chosen.source !== 'random' ? chosen.deck(0) : null;
  const [search, setSearch] = useState<Search | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const stopping = useRef(false);
  const matched = useRef(false);
  const currentSearch = useRef<Search | null>(null);

  // Navigation may replace the router object while the search effect is running. Only leaving
  // this page (or an explicit cancel) abandons a ticket; restarting polling must keep its place.
  useEffect(() => {
    const abandon = () => {
      const current = currentSearch.current;
      if (current && !matched.current) abandonFreeMatch(current.token);
    };
    window.addEventListener('pagehide', abandon);
    return () => {
      window.removeEventListener('pagehide', abandon);
      abandon();
    };
  }, []);

  function start() {
    if (!chosen || search) return;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    stopping.current = false;
    matched.current = false;
    setError('');
    setElapsed(0);
    const next = { token, name, deck: chosen.deck(randomSeed()), at: Date.now() };
    currentSearch.current = next;
    setSearch(next);
  }

  useEffect(() => {
    if (!search) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function receive(result: FreeMatchStatus) {
      if (result.status === 'matched') {
        matched.current = true;
        keepSeat(result.roomId, result.key);
        replace(roomHref(ROOM_PLAY_PATH, result.roomId));
        return true;
      }
      if (result.status === 'cancelled') {
        currentSearch.current = null;
        setSearch(null);
        return true;
      }
      return false;
    }
    async function check(first: boolean) {
      let again = first;
      try {
        const result = await (first ? startFreeMatch(search!.token, search!.name, search!.deck) : pollFreeMatch(search!.token));
        if (!active || currentSearch.current !== search) return;
        if (stopping.current) {
          timer = setTimeout(() => { void check(first); }, 3000);
          return;
        }
        setError('');
        if (receive(result)) return;
        again = false;
      } catch (failure) {
        if (!active || currentSearch.current !== search) return;
        if (stopping.current) {
          timer = setTimeout(() => { void check(first); }, 3000);
          return;
        }
        if (failure instanceof RoomRequestError && failure.status !== 0 && failure.status !== 503 && failure.status < 500) {
          setError(failure.status === 404 ? 'サーバーがフリーマッチに対応していません。しばらく待ってからお試しください。' : failure.message);
          currentSearch.current = null;
          setSearch(null);
          return;
        }
        setError('サーバーに再接続しています。相手の検索を続けています…');
      }
      if (active) timer = setTimeout(() => { void check(again); }, 3000);
    }
    void check(true);
    const clock = setInterval(() => setElapsed(Math.floor((Date.now() - search.at) / 1000)), 1000);
    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [search, replace]);

  async function cancel() {
    if (!search || cancelling) return;
    stopping.current = true;
    setCancelling(true);
    setError('');
    try {
      const result = await cancelFreeMatch(search.token);
      // Pairing and cancellation are ordered by the server. An already paired game wins the race.
      if (result.status === 'matched') {
        matched.current = true;
        keepSeat(result.roomId, result.key);
        replace(roomHref(ROOM_PLAY_PATH, result.roomId));
      } else {
        currentSearch.current = null;
        setSearch(null);
      }
    } catch {
      stopping.current = false;
      setError('キャンセルできませんでした。接続を確認して、もう一度お試しください。');
    } finally { setCancelling(false); }
  }

  return <div className={styles.stack}>
    <header className={styles.matchHeading}>
      <h2>フリーマッチ</h2>
      <p>デッキを選んで、いま遊びたい人と対戦しよう。</p>
    </header>
    <div className={styles.matchGrid}>
      <BattleCompanion />
      <section className={`${styles.panel} ${styles.matchPanel}`} aria-label="フリーマッチ">
        {!roomServerUrl && <p role="alert" className={styles.error}>対戦サーバーが設定されていないため、フリーマッチは使えません。</p>}
        {search ? <div className={styles.freeWaiting}>
          <div className={styles.searchSignal} aria-hidden="true"><i /><i /><i /></div>
          <p role="status">{cancelling ? '検索をキャンセルしています…' : '対戦相手を探しています…'}</p>
          <MatchDeckPreview name={search.deck.name} deck={search.deck} />
          <p className={styles.note} role="timer" aria-live="off">待ち時間 {Math.floor(elapsed / 60)}分{elapsed % 60}秒</p>
          <p className={styles.note}>見つかると自動で対戦が始まります。</p>
          <button className={styles.secondary} disabled={cancelling} onClick={() => void cancel()}>検索をキャンセル</button>
        </div> : <>
          <NameField name={name} onChange={setName} />
          <label className={styles.field}>使うデッキ
            <DeckSelect choices={choices} chosen={chosen} onChange={setSelected} />
          </label>
          {chosen && <MatchDeckPreview name={chosen.name} deck={previewDeck} />}
          <UnusableDecks choices={choices} className={styles.note} />
          <button className={`${styles.primary} ${styles.matchStart}`} disabled={!chosen || !roomServerUrl} onClick={start}>このデッキで対戦相手を探す <span aria-hidden="true">›</span></button>
          {!user ? <button className={styles.matchLogin} onClick={() => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}>ログインして保存済みデッキを使う</button>
            : <p className={styles.note}>{saved.loading ? 'デッキを読み込み中…' : `${saved.decks.length}件の保存済みデッキ`} · <Link href="/build">デッキを編集する</Link></p>}
        </>}
        <details className={styles.matchRules}>
          <summary>対戦ルールを確認</summary>
          <p>{describeRoomRules(freeMatchRules)}</p>
          <p>接続の切断が1分以上続くと、切断した側の負けになります。</p>
        </details>
        {saved.error && <p role="alert" className={styles.error}>{saved.error}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </section>
    </div>
    <div className={styles.row}>
      <Link href={BATTLE_PATH} className={styles.secondary}>バトルへ戻る</Link>
      {!search && <Link href={HOME_PATH} className={styles.secondary}>CPU対戦で遊ぶ</Link>}
    </div>
  </div>;
}
