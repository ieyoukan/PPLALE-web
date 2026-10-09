'use client';

// The 盤面エディタ tab: where a board to edit comes from (a new one, the one in progress, a saved one,
// a code). The editing itself happens on the board page, in its edit mode.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { decodePosition } from '@pplale/game-core';
import type { Position } from '@pplale/game-core';
import { deleteSaved, emptyPosition, loadSaved, openInEditor } from '@/lib/game/positions';
import type { SavedPosition } from '@/lib/game/positions';
import { EDITOR_PATH, PLAY_PATH, readSession } from '@/lib/game/sessionStore';
import styles from './EditorLobby.module.css';
import { effectPositions } from '@/lib/game/effectPositions';

export default function EditorLobby() {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedPosition[]>([]);
  const [inProgress, setInProgress] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function open(position: Position) {
    try {
      openInEditor(position);
      router.push(PLAY_PATH);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'この盤面は開けません'); }
  }
  useEffect(() => {
    // A shared link (?PPL1.…) goes straight to the board.
    const shared = decodePosition(window.location.search);
    if (shared) {
      window.history.replaceState(null, '', EDITOR_PATH);
      return open(shared);
    }
    setSaved(loadSaved());
    setInProgress(readSession()?.editing === true);
    // Once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className={styles.lobby}>
    <p className={styles.lead}>対戦の盤面の上で、好きなカードを場や手札に置いて、その盤面から遊べます。このターンに勝てるか、どう動くのがよいかも調べられます。</p>
    <div className={styles.doors}>
      {inProgress && <button className={styles.primary} onClick={() => router.push(PLAY_PATH)}><b>編集のつづき</b><small>前回の盤面を開く</small></button>}
      <button className={inProgress ? '' : styles.primary} onClick={() => open(emptyPosition())}><b>新しい盤面を作る</b><small>何もない盤面から</small></button>
    </div>
    <section>
      <h2>カード効果を試す盤面</h2>
      <div className={styles.doors}>{effectPositions.map(position => <button key={position.title} onClick={() => open(position)}>
        <b>{position.title}</b><small>{position.note}</small>
      </button>)}</div>
    </section>
    {saved.length > 0 && <section>
      <h2>保存した盤面</h2>
      <ul className={styles.saved}>{saved.map(s => <li key={s.id}>
        <button onClick={() => open(s.position)}><b>{s.position.title}</b><small>{new Date(s.savedAt).toLocaleString('ja-JP')}</small></button>
        <button className={styles.remove} aria-label={`${s.position.title}を削除`} onClick={() => setSaved(deleteSaved(s.id))}>削除</button>
      </li>)}</ul>
    </section>}
    <section>
      <h2>コードから開く</h2>
      <textarea value={code} rows={3} spellCheck={false} placeholder="PPL1. から始まる盤面のコードを貼り付ける" aria-label="盤面のコード" onChange={event => setCode(event.target.value)} />
      <button disabled={!code.trim()} onClick={() => {
        const found = decodePosition(code);
        if (found) open(found);
        else setError('盤面のコードが見つかりません（PPL1. から始まる文字列です）');
      }}>この盤面を開く</button>
    </section>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
}
