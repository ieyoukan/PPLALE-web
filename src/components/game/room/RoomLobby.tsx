'use client';

// A room before its match: who is here, the rules, inviting, choosing a deck. This is the page a
// shared link opens, so someone without a seat is first asked to join.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { usableChoice } from '@/lib/game/deckSources';
import { randomSeed } from '@/lib/game/match';
import { describeRoomRules } from '@pplale/game-core/room';
import type { RoomView } from '@pplale/game-core/room';
import { BATTLE_PATH, ROOM_PLAY_PATH, roomHref, watchHref } from '@/lib/game/sessionStore';
import { DeckSelect, UnusableDecks, useDeckChoices } from '../DeckSelect';
import { NameField, usePlayerName } from './RoomEntrance';
import { RoomShare } from './RoomShare';
import { useRoom } from './useRoom';
import type { Room } from './useRoom';
import styles from './Room.module.css';

export function RoomLobby() {
  const id = useSearchParams().get('id');
  const router = useRouter();
  const room = useRoom(id);
  const { stage, info, view, error } = room;
  const [name, setName] = usePlayerName();
  const [joining, setJoining] = useState(false);
  // A match is on (or just over): its board is another page.
  const onBoard = !!id && stage === 'seated' && (view?.status === 'playing' || view?.status === 'finished');
  useEffect(() => { if (onBoard) router.replace(roomHref(ROOM_PLAY_PATH, id)); }, [onBoard, id, router]);

  const back = <Link href={BATTLE_PATH} className={styles.secondary}>バトルへ戻る</Link>;
  if (stage === 'gone' || view?.status === 'closed') return <section className={styles.panel}>
    <h2>{stage === 'gone' ? 'ルームが見つかりません' : 'このルームは解散しました'}</h2>
    <p>ルームIDをもう一度確かめるか、新しいルームを作ってください。</p>
    <div className={styles.row}>{back}</div>
  </section>;
  if (stage === 'visitor' && info) return <section className={styles.panel}>
    <div className={styles.roomId}><small>ROOM ID</small><output>{info.id}</output></div>
    <h2>{info.host}さんのルーム</h2>
    <p className={styles.rules}>{describeRoomRules(info.rules)}</p>
    {info.open ? <>
      <NameField name={name} onChange={setName} />
      <button className={styles.primary} disabled={joining} onClick={() => { setJoining(true); void room.join(name).finally(() => setJoining(false)); }}>{joining ? '参加中…' : 'このルームに入る'}</button>
    </> : <p>このルームは満員です（対戦中、または2人そろっています）。</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.row}>{info.spectators && <Link href={watchHref(info.id)} className={styles.secondary}>観戦する</Link>}{back}</div>
  </section>;
  if (stage !== 'seated' || !view || onBoard) return <section className={styles.panel} aria-busy="true">
    <p>{error || 'ルームを読み込み中…'}</p>
    {error && <div className={styles.row}>{back}</div>}
  </section>;
  return <Waiting room={room} view={view} />;
}

/** Both seats choose a deck and say they are ready; the match starts when both are. */
function Waiting({ room, view }: { room: Room; view: RoomView }) {
  const router = useRouter();
  const { user, signInWithGoogle } = useAuth();
  const me = view.players[view.seat]!, foe = view.players[view.seat === 0 ? 1 : 0];
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The decks of every source, checked against this room's rules; the server checks the one sent again.
  const { choices, saved } = useDeckChoices(view.rules, 'このルーム');
  const chosen = usableChoice(choices, selected);

  const ask = (work: Promise<void>) => {
    setBusy(true);
    setError('');
    work.catch((failure: unknown) => setError(failure instanceof Error ? failure.message : '送れませんでした')).finally(() => setBusy(false));
  };
  const seat = (label: string, player: typeof foe) => player
    ? <div className={`${styles.seat} ${player.ready ? styles.seatReady : ''}`}><small>{label}</small><b>{player.name}</b><span>{!player.online && player !== me ? '接続が切れています' : player.ready ? '準備OK' : 'デッキを選んでいます'}</span></div>
    : <div className={`${styles.seat} ${styles.seatEmpty}`}><small>{label}</small><b>募集中</b><span>相手が入るのを待っています</span></div>;

  return <div className={styles.stack}>
    {!room.linked && <p className={`${styles.server} ${styles.serverDown}`} role="status"><i className={styles.dot} />ルームサーバーに再接続しています…</p>}
    <section className={styles.panel}>
      <div className={styles.roomId}><small>ROOM ID</small><output aria-label={`ルームID ${view.id}`}>{view.id}</output></div>
      <p className={styles.rules}>{describeRoomRules(view.rules)}</p>
      {view.rules.spectators && <p className={styles.note}>観戦している人には、2人の手札が両方とも見えます。{view.spectators > 0 && `いま${view.spectators}人が観戦しています。`}</p>}
      {!foe && <p className={styles.note}>この画面を閉じたまま10分たつと、ルームは解散します。</p>}
      {(!foe || view.rules.spectators) && <RoomShare id={view.id} rules={view.rules} />}
    </section>
    <section className={styles.panel}>
      <div className={styles.seats}>{seat('あなた', me)}{seat('相手', foe)}</div>
      {me.ready ? <>
        <p>「{me.deck}」で準備OK。{foe ? foe.ready ? 'まもなく始まります…' : '相手の準備を待っています。' : '相手が入るのを待っています。'}</p>
        <div className={styles.row}><button className={styles.secondary} disabled={busy} onClick={() => ask(room.send({ action: 'unready' }))}>デッキを選びなおす</button></div>
      </> : <>
        <label className={styles.field}>使うデッキ
          <DeckSelect choices={choices} chosen={chosen} onChange={setSelected} />
        </label>
        {!user ? <div className={styles.row}><button className={styles.secondary} onClick={() => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}>Googleでログインして保存済みデッキを使う</button></div>
          : <p className={styles.note}>{saved.loading ? 'デッキを読み込み中…' : `${saved.decks.length}件の保存済みデッキ`} · <Link href="/build">デッキを編集する</Link></p>}
        <UnusableDecks choices={choices} className={styles.note} />
        {/* A deck made on demand (おまかせ) is made when it is sent: choosing again makes another. */}
        <button className={styles.primary} disabled={busy || !chosen} onClick={() => { if (chosen) ask(room.send({ action: 'ready', deck: chosen.deck(randomSeed()) })); }}>このデッキで準備OK</button>
      </>}
      {saved.error && <p role="alert" className={styles.error}>{saved.error}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>
    <button className={styles.danger} disabled={busy} onClick={() => { setBusy(true); void room.leave().then(() => router.push(BATTLE_PATH)); }}>{view.seat === 0 ? 'ルームを解散する' : 'ルームを出る'}</button>
  </div>;
}
