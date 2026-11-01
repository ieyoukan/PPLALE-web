'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { HistoryEntry, HistoryPage, MatchDetails } from '@pplale/game-core/history';
import type { Deck } from '@pplale/game-core';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';
import { BATTLE_PATH } from '@/lib/game/sessionStore';
import { favoriteMatch, readMatchHistory, readMatchDetail } from '@/lib/game/room/client';
import { HistoryDialog } from './HistoryDialog';
import { CardArtwork } from '@/components/shared/card/CardArtwork';
import styles from './History.module.css';

export const matchReasons = { normal: '通常決着', resign: '投了', disconnect: '切断', leave: '退出', abandoned: '中断' };
export const matchDate = (at: number, locale: 'ja' | 'en' = 'ja') => new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(at);
const countCards = (ids: string[]) => Array.from(ids.reduce((map, id) => map.set(id, (map.get(id) ?? 0) + 1), new Map<string, number>()));

function MemoryIcon() {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="6" y="4" width="22" height="25" rx="5" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="2" /><path d="M10 4v25M3 10h6M3 17h6M3 24h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="m19 10 1.7 3.4 3.8.6-2.8 2.6.7 3.8-3.4-1.8-3.4 1.8.7-3.8-2.8-2.6 3.8-.6L19 10Z" fill="currentColor" /></svg>;
}

function StarIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z" /></svg>;
}

export function MatchHistory() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  // Identity owns the entire subtree, including open dialogs and pending requests.
  // React discards it in the same render that receives the auth change.
  if (loading) return <section className={styles.album} role="status">{t('認証を確認しています…')}</section>;
  return <IdentityHistory key={user?.uid ?? 'guest'} />;
}

function IdentityHistory() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { locale, t, gameText } = useI18n();
  const [favorites, setFavorites] = useState(false);
  const [page, setPage] = useState<HistoryPage>({ entries: [], cursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<MatchDetails | null>(null);
  const request = useRef(0);
  const refresh = useCallback(async (cursor?: string) => {
    const current = ++request.current;
    setLoading(true); setError('');
    try {
      const next = await readMatchHistory(cursor, favorites);
      if (current !== request.current) return;
      setPage(previous => ({ ...next, entries: cursor ? [...previous.entries, ...next.entries] : next.entries }));
    } catch (failure) { if (current === request.current) setError(failure instanceof Error ? failure.message : '履歴を読み込めませんでした'); }
    finally { if (current === request.current) setLoading(false); }
  }, [favorites]);
  useEffect(() => {
    if (authLoading) return;
    setPage({ entries: [], cursor: null });
    void refresh();
    // This is a request generation counter, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { request.current++; };
  }, [refresh, authLoading, user?.uid]);

  async function favorite(entry: HistoryEntry) {
    if (busy) return;
    setBusy(entry.id); setError('');
    try {
      await favoriteMatch(entry.id, !entry.favorite);
      setPage(previous => ({ ...previous, entries: previous.entries.flatMap(item => item.id !== entry.id ? [item] : favorites && entry.favorite ? [] : [{ ...item, favorite: !entry.favorite }]) }));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'お気に入りを変更できませんでした'); }
    finally { setBusy(null); }
  }
  async function openDetail(entry: HistoryEntry) {
    if (busy) return;
    setBusy(entry.id); setError('');
    try { setDetail(await readMatchDetail(entry.id)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '詳細を読み込めませんでした'); }
    finally { setBusy(null); }
  }

  // In the launchpad, whose heading (対戦履歴) and back button stand above it.
  return <section className={styles.album} aria-label={t('対戦履歴')}>
    <div className={styles.tabs} role="tablist" aria-label={t('履歴の種類')}>
      <button id="history-all" role="tab" aria-selected={!favorites} aria-controls="history-list" onClick={() => setFavorites(false)}><span aria-hidden="true">◷</span> {t('一覧')}</button>
      <button id="history-favorites" role="tab" aria-label={t('★ お気に入り')} aria-selected={favorites} aria-controls="history-list" onClick={() => setFavorites(true)}><StarIcon /> {t('お気に入り')}</button>
    </div>
    {error && <div className={styles.error} role="alert">{gameText(error)}<button onClick={() => void refresh()}>{t('再読み込み')}</button></div>}
    <div id="history-list" role="tabpanel" aria-labelledby={favorites ? 'history-favorites' : 'history-all'} className={styles.list} aria-busy={loading}>
      {!page.entries.length ? <div className={styles.empty} role="status" data-loading={loading || undefined} data-error={!loading && !!error || undefined}><span className={styles.emptyIcon} aria-hidden="true">{loading ? <MemoryIcon /> : favorites ? <StarIcon /> : <MemoryIcon />}</span>
        <p>{t(loading ? '履歴を読み込んでいます…' : error ? '接続を確認して、もう一度お試しください。' : favorites ? 'お気に入りの対戦を、ここに。' : 'はじめての思い出は、次の対戦から。')}</p>
        {!loading && !error && !favorites && <Link className={styles.emptyLink} href={BATTLE_PATH}>{t('対戦にいく')} <span aria-hidden="true">→</span></Link>}</div>
        : page.entries.map(entry => {
          const foe = entry.players[1 - entry.seat];
          const result = entry.winner === null ? '中断' : entry.winner === entry.seat ? 'WIN' : 'LOSE';
          return <article key={entry.id} className={styles.entry} data-result={result}>
            <button className={styles.star} aria-label={t(entry.favorite ? '{name}との対戦をお気に入りから外す' : '{name}との対戦をお気に入りにする', { name: foe.name })} aria-pressed={entry.favorite} disabled={busy !== null} onClick={() => void favorite(entry)}>
              <StarIcon />
            </button>
            <div className={styles.avatar} aria-hidden="true"><CardArtwork id={foe.deck.playable} sizes="64px" /></div>
            <button className={styles.matchInfo} onClick={() => void openDetail(entry)} disabled={busy !== null} aria-label={t('{name}との対戦の詳細', { name: foe.name })}>
              <span className={styles.matchMode} data-mode={entry.mode}>{t(entry.mode === 'free' ? 'フリーマッチ' : 'ルームマッチ')}</span>
              <strong>{foe.name}</strong><span>{foe.playableName ? gameText(foe.playableName) : foe.deck.name}</span>
              <time dateTime={new Date(entry.endedAt).toISOString()}>{matchDate(entry.endedAt, locale)}</time>
            </button>
            <b className={styles.verdict} data-result={result}><span aria-hidden="true">{result === 'WIN' ? '♛' : result === 'LOSE' ? '✧' : '―'}</span>{t(result)}</b>
            <div className={styles.entryActions}>
              <button onClick={() => router.push(`/game/replay/?id=${entry.id}`)} disabled={!entry.complete}>{t('リプレイ')} <span aria-hidden="true">▶</span></button>
              <button onClick={() => void openDetail(entry)} disabled={busy !== null}>{t('詳細・デッキ')}</button>
            </div>
          </article>;
        })}
    </div>
    {page.cursor && <button className={styles.more} disabled={loading} onClick={() => void refresh(page.cursor!)}>{t(loading ? '読み込み中…' : 'もっと見る')}</button>}
    {!authLoading && !user && <footer className={styles.footer}>
      <button onClick={() => void signInWithGoogle().catch(() => setError('ログインできませんでした'))}>{t('ログインして、この端末の履歴を引き継ぐ')}</button>
    </footer>}
    {detail && <MatchDetail recording={detail} onClose={() => setDetail(null)} />}
  </section>;
}

export function MatchDetail({ recording, onClose }: { recording: MatchDetails; onClose: () => void }) {
  const [side, setSide] = useState(recording.match.seat);
  const { locale, t } = useI18n();
  const { match, catalog } = recording;
  const seconds = Math.floor((match.endedAt - match.startedAt) / 1000);
  return <HistoryDialog label={t('対戦の詳細')} onClose={onClose}>
    <header className={styles.heading}><h2>{t('対戦の詳細')}</h2><button onClick={onClose} aria-label={t('詳細を閉じる')}>×</button></header>
    <div className={styles.opponents}>{match.players.map((player, index) => <div key={index} className={styles.detailPlayer} data-winner={match.winner === index || undefined}>
      <span className={styles.avatar} aria-hidden="true"><CardArtwork id={player.deck.playable} catalog={catalog} sizes="72px" /></span>
      <span>{player.profileId ? <Link href={`/game/profile/?id=${encodeURIComponent(player.profileId)}`}>{player.name}</Link> : player.name}</span>
      {match.winner === index && <b className={styles.winnerLabel}>WIN</b>}
    </div>)}<span className={styles.versus} aria-hidden="true">vs</span></div>
    <dl className={styles.facts}><div><dt>{t('日時')}</dt><dd>{matchDate(match.endedAt, locale)}</dd></div><div><dt>{t('決着')}</dt><dd>{t(matchReasons[match.reason])}</dd></div>
      <div><dt>{t('ターン')}</dt><dd>{match.turns}</dd></div><div><dt>{t('対戦時間')}</dt><dd>{t('{minutes}分{seconds}秒', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 })}</dd></div>
      <div><dt>{t('お菓子ポイント')}</dt><dd>{match.points.join(' − ')}</dd></div></dl>
    <div className={styles.tabs} role="group" aria-label={t('表示するデッキ')}>{match.players.map((player, index) => <button key={index} aria-pressed={side === index} onClick={() => setSide(index as 0 | 1)}>{match.watching ? t('{name}のデッキ', { name: player.name }) : t(index === match.seat ? '自分のデッキ' : '相手のデッキ')}</button>)}</div>
    <RecordedDeck deck={match.players[side].deck} catalog={catalog} />
    {match.complete && <Link className={styles.more} href={`/game/replay/?id=${match.id}`}>{t('リプレイを見る ▶')}</Link>}
  </HistoryDialog>;
}

export function RecordedDeck({ deck, catalog }: { deck: Deck; catalog: MatchDetails['catalog'] }) {
  const { t } = useI18n();
  const cardName = useCardName();
  return <div className={styles.deck}><h3>{deck.name}</h3>{[['プレイアブル', [deck.playable]], ['幼女', deck.yojo], ['お菓子', deck.sweet]].map(([label, ids]) => <section key={label as string}>
    <h4>{t(label as string)} <small>{t('{count}枚', { count: (ids as string[]).length })}</small></h4><div className={styles.deckCards}>{countCards(ids as string[]).map(([id, count]) => <div key={id}>
      <div className={styles.deckCard}><CardArtwork id={id} catalog={catalog} sizes="(max-width: 600px) 85px, 120px" /><b>×{count}</b></div><small>{catalog[id] ? cardName(id, catalog[id].name) : id}</small>
    </div>)}</div></section>)}</div>;
}
