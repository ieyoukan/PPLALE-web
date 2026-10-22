'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { playKinds, summarizeByKind, summarizePlays } from '@pplale/game-core/performance';
import type { ClientTiming, Percentiles, PlayPerformance, PlaySummary, ServerTiming } from '@pplale/game-core/performance';
import { clearPlaySamples, performanceLog } from '@/lib/game/room/performanceLog';
import { readServerStats } from '@/lib/game/room/client';
import styles from './PlayPerformancePanel.module.css';

const labels = { roll:'サイコロ', initiative:'先攻・後攻', openingDraw:'初期ドロー', mulligan:'引き直し', keep:'手札確定', draw:'ドロー', play:'カード使用', attack:'攻撃', choose:'対象選択', skill:'スキル', exSkill:'EXスキル', acorn:'どんぐり', reveal:'カード公開', end:'ターン終了' };
const outcomes = { ok:'完了', rejected:'拒否', timeout:'応答なし', disconnected:'切断', unpresented:'表示未確認' };
const clientLabels: Record<keyof ClientTiming,string> = { inputToSend:'入力 → 送信', roundTrip:'送信 → 応答（往復）', sendToView:'送信 → 盤面受信', viewToPaint:'受信 → 盤面表示', inputToPaint:'入力 → 盤面表示' };
const serverLabels: Record<keyof ServerTiming,string> = {queue:'順番待ち', read:'状態の取得', apply:'ルール処理', store:'状態の保存', presence:'接続の確認', deliver:'配信準備', publish:'サーバー間の配信', total:'サーバー合計'};
const ms = (value?:number) => value === undefined ? '—' : `${value.toLocaleString('ja-JP',{maximumFractionDigits:1})} ms`;
function Metrics({ title, values, labels: names }: { title:string; values:Partial<Record<string,Percentiles>>; labels:Record<string,string> }) {
  return <section><h3>{title}</h3><div className={styles.scroll}><table><thead><tr><th>計測区間</th><th>中央値</th><th>p95</th><th>最大</th><th>件数</th></tr></thead><tbody>{Object.entries(names).map(([key,label]) => <tr key={key}><th scope="row">{label}</th><td>{ms(values[key]?.p50)}</td><td>{ms(values[key]?.p95)}</td><td>{ms(values[key]?.max)}</td><td>{values[key]?.count ?? 0}</td></tr>)}</tbody></table></div></section>;
}
function Summary({ summary, byKind }: {summary:PlaySummary;byKind:PlayPerformance['byKind']}) {
  return <>
    <p role="status">記録 {summary.samples} 件 · 集計対象 {summary.measured} 件 · バックグラウンド {summary.background} 件 · 未完了 {summary.samples-summary.outcomes.ok} 件</p>
    {!summary.samples && <p>ルーム対戦で操作すると、自動で記録されます。</p>}
    <Metrics title="端末から見た時間" values={summary.milliseconds} labels={clientLabels} />
    <section><h3>操作ごとの速度</h3><div className={styles.scroll}><table><thead><tr><th>操作</th><th>入力 → 表示 中央値</th><th>入力 → 表示 p95</th><th>往復 中央値</th><th>件数</th></tr></thead><tbody>{playKinds.filter(kind => byKind[kind]).map(kind => { const value=byKind[kind]!; return <tr key={kind}><th scope="row">{labels[kind]}</th><td>{ms(value.milliseconds.inputToPaint?.p50)}</td><td>{ms(value.milliseconds.inputToPaint?.p95)}</td><td>{ms(value.milliseconds.roundTrip?.p50)}</td><td>{value.measured}</td></tr>; })}</tbody></table></div></section>
    <Metrics title="サーバー処理の内訳" values={summary.server} labels={serverLabels} />
  </>;
}
export function PlayPerformancePanel() {
  const samples = useSyncExternalStore(performanceLog.subscribe,performanceLog.snapshot,performanceLog.serverSnapshot);
  const [tab,setTab] = useState<'local'|'shared'>('local');
  const [shared,setShared] = useState<PlayPerformance>();
  const [error,setError] = useState('');
  useEffect(() => {
    if (tab !== 'shared') return;
    let active=true, asking=false;
    const ask=async()=>{ if(document.hidden || asking) return; asking=true; try {const stats=await readServerStats(); if(active){setShared(stats.performance);setError(stats.performance?'':'集計はサーバー更新後に利用できます。');}} catch {if(active)setError('集計を取得できませんでした。次の更新で再試行します。');} finally {asking=false;} };
    void ask(); const timer=setInterval(ask,30_000); document.addEventListener('visibilitychange',ask);
    return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',ask);};
  },[tab]);
  const exportSamples=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,unit:'ms',samples},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='pplale-play-performance.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div className={styles.panel}>
    <div className={styles.actions}><Link href="/game/battle/">バトルへ戻る</Link><button aria-pressed={tab==='local'} onClick={()=>setTab('local')}>この端末</button><button aria-pressed={tab==='shared'} onClick={()=>setTab('shared')}>全体</button></div>
    <p>ルームで受け付けた操作から、応答・盤面表示までを自動計測します。p95は95%の操作が収まる時間です。</p>
    {tab==='local' ? <>
      <Summary summary={summarizePlays(samples)} byKind={summarizeByKind(samples)} />
      <section><h3>直近の操作</h3><div className={styles.scroll}><table><thead><tr><th>時刻</th><th>操作</th><th>結果</th><th>往復</th><th>入力 → 表示</th><th>サーバー合計</th></tr></thead><tbody>{samples.slice(-30).reverse().map((sample,index)=><tr key={index}><td>{new Date(sample.at).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}</td><th scope="row">{labels[sample.kind]}</th><td>{outcomes[sample.outcome]}{sample.background?'（背景）':''}</td><td>{ms(sample.roundTrip)}</td><td>{ms(sample.inputToPaint)}</td><td>{ms(sample.server?.total)}</td></tr>)}</tbody></table></div></section>
      <div className={styles.actions}><button disabled={!samples.length} onClick={exportSamples}>JSONを書き出す</button><button disabled={!samples.length} onClick={clearPlaySamples}>この端末の記録を消す</button></div>
      <p>このブラウザに直近200件を保存します。名前・ルームID・カード内容は記録しません。</p>
    </> : <>
      {error && <p role="status">{error}</p>}
      {shared ? <><Summary summary={shared.summary} byKind={shared.byKind} /><p>{shared.scope==='shared'?'全サーバー共通':'このサーバーのみ'} · 最大{shared.capacity}件 · 過去{shared.retentionHours}時間 · 30秒ごとに更新</p></> : !error && <p role="status">集計を読み込んでいます…</p>}
      <p>端末から届いた参考値を集計します。通信状況により記録が欠ける場合があります。</p>
    </>}
    <details><summary>数値の見かた</summary><p>「入力」は操作の受け付け時点です。「盤面表示」は更新後の描画機会で測り、演出・相手の反応待ちも含みます。実際の画面発光時刻ではありません。</p><p>往復時間にはサーバー処理も含まれます。各区間の中央値やp95を足して合計にはできません。背景になった操作と未完了の操作は速度の集計から除きます。サーバー内訳は正常に計測できた操作のみです。</p></details>
  </div>;
}
