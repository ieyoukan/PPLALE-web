'use client';

// 旧2席ルームの準備画面。ルール・招待・デッキを表示し、席がない人には入室の意思を確認する。
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { usableChoice } from '@/lib/game/deckSources';
import { randomSeed } from '@/lib/game/match';
import { describeRoomRules } from '@pplale/game-core/room';
import type { RoomView } from '@pplale/game-core/room';
import { BATTLE_PATH, DECKS_PATH, watchHref } from '@/lib/game/sessionStore';
import { DeckSelect, UnusableDecks, useDeckChoices } from '../DeckSelect';
import { NameField, usePlayerName } from './PlayerNameField';
import { RecruitmentButton } from '../social/RecruitmentButton';
import { RoomShare } from './RoomShare';
import type { Room } from './useRoom';
import { useRoomPreparation } from './useRoomPreparation';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './Room.module.css';
import { PreparationProgress } from '../MatchPreparation';

export function RoomLobby({ room }: { room: Room }) {
  const { stage, info, view, error } = room;
  const { t, gameText } = useI18n();
  const [name, setName, nameReady] = usePlayerName();
  const [joining, setJoining] = useState(false);
  // A match is on (or just over): the same page shows its board.
  const onBoard = stage === 'seated' && (view?.status === 'playing' || view?.status === 'finished');

  const back = <Link href={BATTLE_PATH} className={styles.secondary}>{t('ルームを探す')}</Link>;
  if (stage === 'gone' || view?.status === 'closed') return <section className={styles.panel}>
    <h2>{t(stage === 'gone' ? 'ルームが見つかりません' : 'このルームは解散しました')}</h2>
    <p>{t('ルームIDをもう一度確かめるか、新しいルームを作ってください。')}</p>
    <div className={styles.row}>{back}</div>
  </section>;
  if (stage === 'visitor' && info) return <section className={styles.panel}>
    <div className={styles.roomId}><small>ROOM ID</small><output>{info.id}</output></div>
    <h2>{t('{name}さんのルーム', { name: info.host })}</h2>
    <p className={styles.rules}>{gameText(describeRoomRules(info.rules))}</p>
    {info.open ? <>
      <NameField name={name} onChange={setName} disabled={!nameReady} />
      <button className={styles.primary} disabled={joining || !nameReady} onClick={() => { setJoining(true); void room.join(name).finally(() => setJoining(false)); }}>{t(joining ? '参加中…' : 'このルームに入る')}</button>
    </> : <p>{t('このルームは満員です（対戦中、または2人そろっています）。')}</p>}
    {error && <p role="alert" className={styles.error}>{gameText(error)}</p>}
    <div className={styles.row}>{info.spectators && <Link href={watchHref(info.id)} className={styles.secondary}>{t('観戦する')}</Link>}{back}</div>
  </section>;
  if (stage !== 'seated' || !view || onBoard) return <section className={styles.panel} aria-busy="true">
    <p>{error ? gameText(error) : t('ルームを読み込み中…')}</p>
    {error && <div className={styles.row}>{back}</div>}
  </section>;
  return <Waiting room={room} view={view} />;
}

/** Both seats choose a deck and say they are ready; the match starts when both are. */
function Waiting({ room, view }: { room: Room; view: RoomView }) {
  const router = useRouter();
  const { user, signInWithGoogle } = useAuth();
  const { t, gameText, nameText } = useI18n();
  const me = view.players[view.seat]!, foe = view.players[view.seat === 0 ? 1 : 0];
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The decks of every source, checked against this room's rules; the server checks the one sent again.
  const { choices, saved } = useDeckChoices(view.rules, 'このルーム');
  const chosen = usableChoice(choices, selected);
  const preparation = useRoomPreparation(chosen && chosen.source !== 'random' ? chosen.deck(0) : null, view.rules);

  const ask = (work: Promise<void>) => {
    setBusy(true);
    setError('');
    work.catch((failure: unknown) => setError(failure instanceof Error ? failure.message : '送れませんでした')).finally(() => setBusy(false));
  };
  const seat = (label: string, player: typeof foe) => player
    ? <div className={`${styles.seat} ${player.ready ? styles.seatReady : ''}`}><small>{label}</small><b>{nameText(player.name)}</b><span>{t(!player.online && player !== me ? '接続が切れています' : player.ready ? '準備OK' : 'デッキを選んでいます')}</span></div>
    : <div className={`${styles.seat} ${styles.seatEmpty}`}><small>{label}</small><b>{t('募集中')}</b><span>{t('相手が入るのを待っています')}</span></div>;

  return <div className={styles.stack}>
    {!room.linked && <p className={`${styles.server} ${styles.serverDown}`} role="status"><i className={styles.dot} />{t('ルームサーバーに再接続しています…')}</p>}
    <section className={styles.panel}>
      <div className={styles.roomId}><small>ROOM ID</small><output aria-label={t('ルームID {id}', { id: view.id })}>{view.id}</output></div>
      <p className={styles.rules}>{gameText(describeRoomRules(view.rules))}</p>
      {view.rules.spectators && <p className={styles.note}>{t('観戦している人には、2人の手札が両方とも見えます。')}{view.spectators > 0 && t('いま{count}人が観戦しています。', { count: view.spectators })}</p>}
      {!foe && <p className={styles.note}>{t('この画面を閉じたまま10分たつと、ルームは解散します。')}</p>}
      {(!foe || view.rules.spectators) && <RoomShare id={view.id} rules={view.rules} />}
      {view.seat === 0 && !foe && <RecruitmentButton roomId={view.id} hostProfileId={view.players[0]?.profileId} />}
    </section>
    <section className={styles.panel}>
      <div className={styles.seats}>{seat(t('あなた'), me)}{seat(t('相手'), foe)}</div>
      {me.ready ? <>
        <p>{t('「{deck}」で準備OK。', { deck: t(me.deck ?? '') })}{t(foe ? foe.ready ? 'まもなく始まります…' : '相手の準備を待っています。' : '相手が入るのを待っています。')}</p>
        <div className={styles.row}><button className={styles.secondary} disabled={busy} onClick={() => ask(room.send({ action: 'unready' }))}>{t('デッキを選びなおす')}</button></div>
      </> : <>
        <label className={styles.field}>{t('使うデッキ')}
          <DeckSelect choices={choices} chosen={chosen} onChange={setSelected} />
        </label>
        {!user ? <div className={styles.row}><button className={styles.secondary} onClick={() => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}>{t('Googleでログインして保存済みデッキを使う')}</button></div>
          : <p className={styles.note}>{saved.loading ? t('デッキを読み込み中…') : t('{count}件の保存済みデッキ', { count: saved.decks.length })} · <Link href={DECKS_PATH}>{t('デッキを編集する')}</Link></p>}
        <UnusableDecks choices={choices} className={styles.note} />
        {/* A deck made on demand (おまかせ) is made when it is sent: choosing again makes another. */}
        <button className={styles.primary} disabled={busy || !chosen} onClick={() => { if (chosen) { const deck = chosen.deck(randomSeed()); ask(preparation.prepare().then(() => room.send({ action: 'ready', deck }))); } }}>{t(preparation.busy ? '対戦を準備中…' : 'このデッキで準備OK')}</button>
        <PreparationProgress progress={preparation.progress} />
      </>}
      {saved.error && <p role="alert" className={styles.error}>{t(saved.error)}</p>}
      {error && <p role="alert" className={styles.error}>{gameText(error)}</p>}
    </section>
    <button className={styles.danger} disabled={busy} onClick={() => { setBusy(true); void room.leave().then(() => router.push(BATTLE_PATH)); }}>{t(view.seat === 0 ? 'ルームを解散する' : 'ルームを出る')}</button>
  </div>;
}
