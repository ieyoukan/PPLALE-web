'use client';

import { useEffect, useRef, useState } from 'react';
import { useBoardContext } from '../board/BoardContext';
import { analyze } from '../board/analysis';
import type { Analysis, AnalysisRequest, AnalysisResponse } from '../board/analysis';
import styles from '../BoardEmulator.module.css';

/** 「最善手を調べる」 for the position on the table; looked at again whenever the position changes. */
export function AnalysisPanel() {
  const { game, names, setPanel } = useBoardContext();
  const worker = useRef<Worker | null>(null), request = useRef(0);
  const [result, setResult] = useState<{ revision: number; analysis: Analysis | null } | null>(null);
  useEffect(() => {
    try {
      const instance = new Worker(new URL('../board/analysis.worker.ts', import.meta.url), { type: 'module' });
      worker.current = instance;
      return () => { instance.terminate(); worker.current = null; };
    } catch { worker.current = null; }
  }, []);
  useEffect(() => {
    const id = ++request.current, revision = game.revision;
    const instance = worker.current;
    if (!instance) {
      // Without workers the board waits for the search.
      const timer = setTimeout(() => setResult({ revision, analysis: analyze(game) }), 0);
      return () => clearTimeout(timer);
    }
    const listen = (event: MessageEvent<AnalysisResponse>) => { if (event.data.id === id) setResult({ revision, analysis: event.data.analysis }); };
    instance.addEventListener('message', listen);
    instance.postMessage({ id, game } satisfies AnalysisRequest);
    return () => instance.removeEventListener('message', listen);
  }, [game]);

  const analysis = result?.revision === game.revision ? result.analysis : undefined;
  return <>
    <h2>最善手を調べる</h2>
    <div className={styles.analysis}>
      {analysis === undefined && <p role="status">調べています…</p>}
      {analysis === null && <p>今は調べられる場面ではありません（ターン中に、手番の側が操作できるときに調べます）。</p>}
      {analysis && <>
        <p><b>{names[analysis.side]}</b>の番　勝ちやすさ <b>{Math.round((analysis.best.win) * 100)}%</b></p>
        <section>
          <h3>このターンで勝てるか（詰み）</h3>
          {analysis.lethal.status === 'win'
            ? <><p className={styles.analysisWin}>勝てます。手順：</p><ol>{analysis.lethal.steps.map((step, i) => <li key={i}>{step}</li>)}</ol></>
            : <p>{analysis.lethal.status === 'none' ? 'このターンに勝つ手順はありません。' : '手順が多すぎて、調べきれませんでした。'}</p>}
        </section>
        {analysis.lethal.status !== 'win' && <section>
          <h3>さいきょうのおすすめ</h3>
          <ol>{analysis.best.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
        </section>}
        <p className={styles.analysisNote}>相手の手札や山札の順番も含め、盤面のすべてを見て調べています。おすすめは CPU の判断で、正解とは限りません。</p>
      </>}
      <button onClick={() => setPanel({ type: 'menu' })}>メニューへ戻る</button>
    </div>
  </>;
}
