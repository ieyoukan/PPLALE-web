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
import { CPU_PATH, roomHref } from '@/lib/game/sessionStore';
import { abandonFreeMatch, cancelFreeMatch, keepSeat, pollFreeMatch, RoomRequestError, roomServerUrl, startFreeMatch } from '@/lib/game/room/client';
import { DeckSelect, UnusableDecks, useDeckChoices } from '../DeckSelect';
import { NameField, usePlayerName } from './RoomEntrance';
import { BattleCompanion } from './BattleCompanion';
import { MatchDeckPreview } from './MatchDeckPreview';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { PlazaIcon } from '../plaza/PlazaIcon';
import styles from './Room.module.css';
import { useGameNotifications } from '../notifications/GameNotifications';
import { useRoomPreparation } from './useRoomPreparation';
import { PreparationProgress } from '../MatchPreparation';

type Search = { token: string; name: string; deck: Deck; at: number };

export function FreeMatch() {
  const { replace } = useRouter();
  const { notify } = useGameNotifications();
  const { user, signInWithGoogle } = useAuth();
  const [name, setName, nameReady] = usePlayerName();
  const { choices, saved } = useDeckChoices(freeMatchRules, 'フリーマッチ');
  const [selected, setSelected] = useState('');
  const chosen = usableChoice(choices, selected);
  const previewDeck = chosen && chosen.source !== 'random' ? chosen.deck(0) : null;
  const [search, setSearch] = useState<Search | null>(null);
  const preparation = useRoomPreparation(search?.deck ?? previewDeck, freeMatchRules);
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

  async function start() {
    if (!nameReady || !chosen || search || preparation.busy) return;
    try { await preparation.prepare(); } catch (failure) { setError(failure instanceof Error ? failure.message : '対戦を準備できませんでした'); return; }
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
        notify('matched', `${result.roomId}:1`);
        matched.current = true;
        keepSeat(result.roomId, result.key);
        replace(roomHref(result.roomId));
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
  }, [search, replace, notify]);

  async function cancel() {
    if (!search || cancelling) return;
    stopping.current = true;
    setCancelling(true);
    setError('');
    try {
      const result = await cancelFreeMatch(search.token);
      // Pairing and cancellation are ordered by the server. An already paired game wins the race.
      if (result.status === 'matched') {
        notify('matched', `${result.roomId}:1`);
        matched.current = true;
        keepSeat(result.roomId, result.key);
        replace(roomHref(result.roomId));
      } else {
        currentSearch.current = null;
        setSearch(null);
      }
    } catch {
      stopping.current = false;
      setError('キャンセルできませんでした。接続を確認して、もう一度お試しください。');
    } finally { setCancelling(false); }
  }

  // In the launchpad, whose heading already says フリーマッチ.
  return <div className={`${styles.stack} ${styles.padScreen}`}>
    <p className={styles.matchIntro}>デッキを選んで、いま遊びたい人と対戦しよう。</p>
    <div className={styles.matchGrid}>
      <BattleCompanion />
      <OrnateFrame as="section" size="sm" className={styles.matchPanel} aria-label="フリーマッチ">
        {!roomServerUrl && <p role="alert" className={styles.error}>対戦サーバーが設定されていないため、フリーマッチは使えません。</p>}
        {search ? <div className={styles.freeWaiting}>
          <div className={styles.searchSignal} aria-hidden="true"><i /><i /><i /></div>
          <p role="status">{cancelling ? '検索をキャンセルしています…' : '対戦相手を探しています…'}</p>
          <MatchDeckPreview name={search.deck.name} deck={search.deck} />
          <p className={styles.note} role="timer" aria-live="off">待ち時間 {Math.floor(elapsed / 60)}分{elapsed % 60}秒</p>
          <p className={styles.note}>見つかると自動で対戦が始まります。</p>
          <button className={styles.smallButton} disabled={cancelling} onClick={() => void cancel()}>検索をキャンセル</button>
        </div> : <>
          <NameField name={name} onChange={setName} publicName disabled={!nameReady} />
          <label className={styles.field}>使うデッキ
            <DeckSelect choices={choices} chosen={chosen} onChange={setSelected} />
          </label>
          {chosen && <MatchDeckPreview name={chosen.name} deck={previewDeck} />}
          <UnusableDecks choices={choices} className={styles.note} />
          <OrnateFrame as="button" size="line" className={`${styles.cardButton} ${styles.matchStart}`} disabled={preparation.busy || !chosen || !roomServerUrl || !nameReady} onClick={() => void start()}><span data-ui-title>{preparation.busy ? '対戦を準備中…' : 'このデッキで対戦相手を探す'}</span> <span aria-hidden="true">›</span></OrnateFrame>
          <PreparationProgress progress={preparation.progress} />
          {!user ? <button className={styles.matchLogin} onClick={() => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}>ログインして保存済みデッキを使う</button>
            : <p className={styles.note}>{saved.loading ? 'デッキを読み込み中…' : `${saved.decks.length}件の保存済みデッキ`} · <Link href="/build">デッキを編集する</Link></p>}
        </>}
        <details className={styles.matchRules}>
          <summary>対戦ルールを確認</summary>
          <p>{describeRoomRules(freeMatchRules)}</p>
          <p>観戦中は両者の未公開の手札を伏せます。終了後はデッキを含むリプレイを公開します。</p>
          <p>接続の切断が1分以上続くと、切断した側の負けになります。</p>
        </details>
        {saved.error && <p role="alert" className={styles.error}>{saved.error}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </OrnateFrame>
    </div>
    {!search && <div className={styles.row}><Link href={CPU_PATH} className={styles.textLink}><PlazaIcon name="cpu" />CPU対戦で遊ぶ</Link></div>}
  </div>;
}
