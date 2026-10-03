'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cpuLevels, cpuProfiles, newGame, sandboxRules, validateDeck } from '@pplale/game-core';
import type { CpuLevel, GameState, Rules } from '@pplale/game-core';
import { useAuth } from '@/lib/auth';
import { demoDeck, gameCatalog } from '@/lib/game/catalog';
import type { SavedGameDeck } from '@/lib/game/savedDecks';
import styles from './BoardEmulator.module.css';
export function GameSetup({ onStart, onClose }: {
    onStart: (game: GameState, mode: 'cpu' | 'hotseat', level: CpuLevel) => void;
    onClose: () => void;
}) {
    const { user, signInWithGoogle } = useAuth();
    const [decks, setDecks] = useState<SavedGameDeck[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(['demo', 'demo']);
    const [mode, setMode] = useState<'cpu' | 'hotseat'>('cpu');
    const [level, setLevel] = useState<CpuLevel>('normal');
    const [rules, setRules] = useState<Rules>({ ...sandboxRules });
    useEffect(() => {
        let active = true;
        setDecks([]);
        setSelected(['demo', 'demo']);
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        import('@/lib/game/savedDecks').then(({ loadGameDecks }) => loadGameDecks(user.uid)).then(result => { if (active)
            setDecks(result); }).catch(() => { if (active)
            setError('保存済みデッキを読み込めませんでした。接続とログイン状態を確認してください。'); }).finally(() => { if (active)
            setLoading(false); });
        return () => { active = false; };
    }, [user]);
    function start() {
        const pick = (index: number) => selected[index] === 'demo' ? demoDeck : decks.find(d => d.id === selected[index])?.deck;
        const a = pick(0), b = pick(1);
        if (!a || !b)
            return;
        const errors = [...validateDeck(a, gameCatalog), ...validateDeck(b, gameCatalog)];
        if (errors.length) {
            setError(errors.join(' / '));
            return;
        }
        const random = new Uint32Array(1);
        crypto.getRandomValues(random);
        try {
            onStart(newGame([{ ...a, name: `あなた · ${a.name}` }, { ...b, name: `${mode === 'cpu' ? 'CPU' : '相手'} · ${b.name}` }], gameCatalog, rules, random[0]), mode, level);
        }
        catch (error) {
            setError(error instanceof Error ? error.message : '開始できません');
        }
    }
    const fields = [['initialYojo', '先攻の初期手札枚数', 0, 20], ['initialPoints', '初期お菓子ポイント', 1, 30]] as const;
    return <div className={styles.setupContent}>
    <div className={styles.dialogHeading}><div><h2>対戦の準備</h2></div><button onClick={onClose} aria-label="閉じる">×</button></div>
    <div className={styles.setupModes}><button aria-pressed={mode === 'cpu'} onClick={() => setMode('cpu')}>CPUと対戦</button><button aria-pressed={mode === 'hotseat'} onClick={() => setMode('hotseat')}>両側を操作</button></div>
    {mode === 'cpu' && <div className={styles.setupModes} role="group" aria-label="CPUの強さ">{cpuLevels.map(id => <button key={id} aria-pressed={level === id} title={cpuProfiles[id].description} onClick={() => setLevel(id)}>{cpuProfiles[id].name}</button>)}</div>}
    <div className={styles.deckSelectors}>{[0, 1].map(side => <label key={side}>{side === 0 ? 'あなたのデッキ' : '相手のデッキ'}<select value={selected[side]} onChange={event => setSelected(previous => previous.map((value, index) => index === side ? event.target.value : value))}><option value="demo">いちごのおためしデッキ（20 / 10）</option>{decks.map(d => <option key={d.id} value={d.id} disabled={!!d.errors.length}>{d.deck.name}{d.errors.length ? '（使用不可）' : `（${d.deck.yojo.length} / ${d.deck.sweet.length}）`}</option>)}</select></label>)}</div>
    {!user ? <button className={styles.secondaryButton} onClick={() => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}>Googleでログインして保存済みデッキを使う</button> : <p className={styles.help}>{loading ? 'デッキを読み込み中…' : `${decks.length}件の保存済みデッキ`} · <Link href="/build">デッキを編集する</Link></p>}
    {decks.some(d => d.errors.length > 0) && <details className={styles.ruleSettings}><summary>使用できないデッキの理由</summary>{decks.filter(d => d.errors.length).map(d => <p key={d.id}>{d.deck.name}：{d.errors.join(' / ')}</p>)}</details>}
    <details className={styles.ruleSettings}><summary>テスト用の基本ルール設定</summary><p>PP上限は12、デッキ切れによる敗北はありません。突撃は登場直後に幼女へ、早食いは幼女・お菓子へ攻撃できます。防衛がいる場合は貫通がない限り防衛持ちへの攻撃に限ります。</p><div className={styles.ruleGrid}>{fields.map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} value={rules[key]} onChange={event => setRules(previous => ({ ...previous, [key]: Math.max(min, Math.min(max, Number(event.target.value) || min)) }))}/></label>)}</div></details>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button className={styles.startButton} onClick={start}>デッキをセットする <span>→</span></button>
  </div>;
}
