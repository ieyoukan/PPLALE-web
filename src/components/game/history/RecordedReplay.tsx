'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { MatchRecording } from '@pplale/game-core/history';
import type { Side } from '@pplale/game-core';
import { readRecording } from '@/lib/game/room/client';
import { useAuth } from '@/lib/auth';
import { MatchDetail, matchReasons } from './MatchHistory';
import { HistoryDialog } from './HistoryDialog';
import { keywordNames } from '../labels';
import { RecordedCard } from './RecordedCard';
import { RecordedAssessment } from './RecordedAssessment';
import styles from './History.module.css';

/** Playback consumes authoritative frames only: no AI, rules execution or match requests. */
export function RecordedReplay() {
  const id = useSearchParams().get('id');
  const { user, loading } = useAuth();
  if (loading) return <main className={styles.replayPage} role="status">認証を確認しています…</main>;
  return <IdentityReplay key={`${id}:${user?.uid ?? 'guest'}`} id={id} />;
}

function IdentityReplay({ id }: { id: string | null }) {
  const [recording, setRecording] = useState<MatchRecording | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id || !/^[\da-f-]{36}$/.test(id)) { setError('リプレイが見つかりません'); return; }
    let current = true;
    readRecording(id).then(value => {
      if (current) {
        if (value.format !== 1 || !value.match.complete || !value.frames.length) setError('この対戦の完全なリプレイは保存されていません');
        else setRecording(value);
      }
    }, (failure: unknown) => { if (current) setError(failure instanceof Error ? failure.message : 'リプレイを読み込めませんでした'); });
    return () => { current = false; };
  }, [id]);
  if (!recording) return <main className={styles.replayPage}><section className={styles.history} role="status"><h1>リプレイ</h1><p>{error || 'リプレイを読み込んでいます…'}</p><Link href="/game/battle/history/">対戦履歴へ戻る</Link></section></main>;
  return <Player key={recording.match.id} recording={recording} />;
}

function Player({ recording }: { recording: MatchRecording }) {
  const { frames, match, catalogs } = recording;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<Side>(match.seat);
  const [detail, setDetail] = useState(false);
  const [inspect, setInspect] = useState<string[] | null>(null);
  const [logs, setLogs] = useState(false);
  const controls = useRef<HTMLDivElement>(null);
  const frame = frames[index], state = frame.state, last = index === frames.length - 1;
  const catalog = catalogs[frame.catalogId];
  const previous = frames[Math.max(0, index - 1)].state;
  const command = frame.command;
  const selection = command?.type === 'choose' ? previous.pending?.options.find(option => option.id === command.option)?.label : null;
  useEffect(() => {
    if (!playing || detail || inspect || logs) return;
    if (last) { setPlaying(false); return; }
    const timer = setTimeout(() => setIndex(previous => Math.min(frames.length - 1, previous + 1)), 1500 / speed);
    return () => clearTimeout(timer);
  }, [playing, index, last, speed, frames.length, detail, inspect, logs]);
  function seek(next: number) { setPlaying(false); setIndex(Math.max(0, Math.min(frames.length - 1, next))); }
  function turn(direction: -1 | 1) {
    for (let at = index + direction; at >= 0 && at < frames.length; at += direction) {
      if (frames[at].state.turn !== state.turn) { seek(at); return; }
    }
    seek(direction === -1 ? 0 : frames.length - 1);
  }
  function exportRecording() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(recording)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `pplale-replay-${match.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function card(uid: string, field = false) {
    const instance = state.cards[uid], value = frame.presentation.cards[uid];
    if (!instance) return null;
    return <button key={uid} data-recorded-uid={uid} data-action={command && 'uid' in command && command.uid === uid ? command.type : undefined} className={`${styles.replayCard} ${field ? styles.fieldCard : ''}`} data-acted={field && instance.exhausted || undefined} onClick={() => setInspect([uid])} aria-label={`${catalog[instance.cardId]?.name ?? instance.cardId}を確認`}>
      <RecordedCard id={instance.cardId} catalog={catalog} sizes="(max-width: 600px) 70px, 110px" />
      {field && value && <span className={styles.cardStats}><b>{value.attack}</b><b>{value.hp}</b></span>}
      {instance.damage > 0 && <i className={styles.cardDamage}>−{instance.damage}</i>}
    </button>;
  }
  function side(seat: Side) {
    const player = state.players[seat];
    return <section className={styles.replaySide} data-active={state.active === seat || undefined} aria-label={`${match.players[seat].name}の盤面`}>
      <header className={styles.playerHeading}>
        <div className={styles.leader}><RecordedCard id={player.playable} catalog={catalog} sizes="85px" /></div>
        <div><strong>{match.players[seat].name}</strong><span>{catalog[player.playable]?.name ?? player.playable}</span></div>
        <div className={styles.resources}><span>お菓子 <b>{player.points}</b> / {player.maxPoints}</span><span>PP <b>{player.pp}</b> / {frame.presentation.ppMaximum[seat]}</span></div>
      </header>
      <div className={styles.hand} aria-label={`${match.players[seat].name}の手札`}>{player.hand.map(uid => card(uid))}<small>手札 {player.hand.length}枚</small></div>
      <div className={styles.field} aria-label="場">{Array.from({ length: 7 }, (_, slot) => {
        const uid = player.field.find(uid => state.cards[uid].slot === slot);
        return <div key={slot} className={styles.slot}>{uid ? card(uid, true) : <span aria-hidden="true">✧</span>}</div>;
      })}</div>
      <div className={styles.piles}>{([['yojo', '幼女デッキ'], ['sweet', 'お菓子デッキ'], ['nap', 'お昼寝'], ['exile', '除外']] as const).map(([kind, name]) =>
        <button key={kind} onClick={() => setInspect(player[kind])}>{name}<b>{player[kind].length}</b></button>)}
        <span>{player.turns}ターン目</span>
      </div>
    </section>;
  }
  return <main className={styles.replayPage} data-playing={playing || undefined}>
    <header className={styles.replayHeading}><Link href="/game/battle/history/" aria-label="リプレイを閉じる">‹ 対戦履歴</Link><h1>リプレイ</h1><button onClick={() => setDetail(true)}>詳細・デッキ</button></header>
    <div className={styles.replayTable}>
      {side((1 - view) as Side)}
      <div className={styles.timelineNotice} role="status" aria-live={playing ? 'off' : 'polite'}>
        {(state.phase === 'dice' || state.phase === 'initiative' || frame.command?.type === 'roll') && <div className={styles.recordedDice}>{state.dice?.rolls.map((value, side) => <span key={side}>{match.players[side].name} <b>{value ?? '？'}</b></span>)}</div>}
        <p>{last ? `${match.winner === null ? '対戦は中断しました' : `${match.players[match.winner].name}の勝ち`} · ${matchReasons[match.reason]}` : state.log.at(-1) ?? '対戦開始'}</p>
        {state.effectRoll?.revision === state.revision && <span>🎲 {state.effectRoll.value}</span>}
        {selection && command && <small>{match.players[command.actor].name}：{selection}</small>}
        {state.pending && <small>{state.pending.prompt}</small>}
      </div>
      {side(view)}
    </div>
    <div className={styles.playback} ref={controls} aria-label="リプレイ操作">
      <RecordedAssessment frames={frames} index={index} view={view} names={[match.players[0].name, match.players[1].name]} />
      <input type="range" min={0} max={frames.length - 1} value={index} aria-label="再生位置" onChange={event => seek(Number(event.target.value))} />
      <div className={styles.playbackButtons}>
        <button onClick={() => seek(0)} disabled={index === 0} aria-label="最初へ">⏮</button>
        <button onClick={() => seek(index - 1)} disabled={index === 0} aria-label="一手戻る">‹</button>
        <button className={styles.play} aria-label={playing ? '一時停止' : '再生する'} onClick={() => { if (last) setIndex(0); setPlaying(previous => !previous); }}>{playing ? 'Ⅱ' : '▶'}</button>
        <button onClick={() => seek(index + 1)} disabled={last} aria-label="一手進む">›</button>
        <button onClick={() => seek(frames.length - 1)} disabled={last} aria-label="最後へ">⏭</button>
        <output aria-live="off">{index} / {frames.length - 1}手</output>
        <select aria-label="再生速度" value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[0.5, 1, 2, 4].map(value => <option key={value} value={value}>{value}倍速</option>)}</select>
      </div>
      <div className={styles.playbackExtra}><button onClick={() => turn(-1)}>前のターン</button><button onClick={() => turn(1)}>次のターン</button><button onClick={() => setView(previous => (1 - previous) as Side)}>視点切替</button><button onClick={() => setLogs(true)}>ログ</button><button onClick={exportRecording}>記録を保存</button></div>
    </div>
    {detail && <MatchDetail recording={recording} onClose={() => setDetail(false)} />}
    {inspect && <HistoryDialog label="カードの確認" onClose={() => setInspect(null)}>
      <header className={styles.heading}><h2>カードの確認</h2><button onClick={() => setInspect(null)} aria-label="カードの確認を閉じる">×</button></header>
      {!inspect.length ? <p className={styles.empty}>カードはありません</p> : <div className={styles.inspectCards}>{inspect.map(uid => {
        const instance = state.cards[uid], definition = catalog[instance.cardId], value = frame.presentation.cards[uid];
        return <article key={uid}><div className={styles.inspectedCard}><RecordedCard id={instance.cardId} catalog={catalog} sizes="180px" /></div><div><h3>{definition?.name ?? instance.cardId}</h3><p>{definition?.effect}</p>
          <p>コスト {value?.cost} · 攻撃 {value?.attack} · HP {value?.hp}</p><p>{instance.keywords.map(keyword => keywordNames[keyword]).join(' · ')}</p></div></article>;
      })}</div>}
    </HistoryDialog>}
    {logs && <HistoryDialog label="対戦ログ" onClose={() => setLogs(false)}><header className={styles.heading}><h2>対戦ログ</h2><button onClick={() => setLogs(false)}>×</button></header><ol className={styles.logs}>{state.log.map((line, index) => <li key={index}>{line}</li>)}</ol></HistoryDialog>}
  </main>;
}
