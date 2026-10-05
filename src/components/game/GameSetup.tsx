'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cpuLevels, cpuProfiles, sandboxRules, validateDeck } from '@pplale/game-core';
import type { CpuLevel, GameState, Side } from '@pplale/game-core';
import { cpuServerUrl, learningConsent } from '@/lib/game/cpuServer';
import { createMatch, randomSeed } from '@/lib/game/match';
import { sideLabel } from '@/lib/game/sessionStore';
import type { Levels, MatchSetup, Mode } from '@/lib/game/sessionStore';
import { useAuth } from '@/lib/auth';
import { demoDeck, gameCatalog } from '@/lib/game/catalog';
import type { SavedGameDeck } from '@/lib/game/savedDecks';
import styles from './BoardEmulator.module.css';
const modeNames: Record<Mode, string> = { cpu: 'CPUと対戦', watch: 'CPU同士を観戦', hotseat: '両側を操作' };
/** Mode (among `modes`), CPU levels and decks for a new match (the rules are fixed). Used by the preparation pages. */
export function GameSetup({ modes, onStart }: {
    modes: Mode[];
    onStart: (match: { game: GameState; seed: number; setup: MatchSetup; mode: Mode; levels: Levels }) => void;
}) {
    const { user, signInWithGoogle } = useAuth();
    const [decks, setDecks] = useState<SavedGameDeck[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState(['demo', 'demo']);
    const [mode, setMode] = useState<Mode>(modes[0]);
    const [levels, setLevels] = useState<Levels>(['normal', 'normal']);
    const setLevel = (side: Side, level: CpuLevel) => setLevels(previous => side === 0 ? [level, previous[1]] : [previous[0], level]);
    // Matches against さいきょう are sent to the CPU server for its training: asked once per browser.
    const collects = !!cpuServerUrl && mode === 'cpu' && levels[1] === 'master';
    const [agreed, setAgreed] = useState(false);
    const [asking, setAsking] = useState(false);
    // localStorage is only available in the browser, after the first render.
    useEffect(() => { setAgreed(learningConsent.given()); }, []);
    const agree = (value: boolean) => {
        learningConsent.set(value);
        setAgreed(value);
        setAsking(false);
    };
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
    function start(consented = agreed) {
        if (collects && !consented) {
            setAsking(true);
            return;
        }
        const pick = (index: number) => selected[index] === 'demo' ? demoDeck : decks.find(d => d.id === selected[index])?.deck;
        const a = pick(0), b = pick(1);
        if (!a || !b)
            return;
        const errors = [...validateDeck(a, gameCatalog), ...validateDeck(b, gameCatalog)];
        if (errors.length) {
            setError(errors.join(' / '));
            return;
        }
        try {
            const setup: MatchSetup = { decks: [a, b], rules: { ...sandboxRules } };
            const seed = randomSeed();
            onStart({ game: createMatch(setup, mode, seed), seed, setup, mode, levels });
        }
        catch (error) {
            setError(error instanceof Error ? error.message : '開始できません');
        }
    }
    return <div className={styles.setupContent}>
    <div className={styles.setupModes}>
      {modes.map(id => <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{modeNames[id]}</button>)}
    </div>
    {/* One row per CPU side: the opponent against you, both sides when watching. */}
    {(mode === 'watch' ? [0, 1] as Side[] : mode === 'cpu' ? [1] as Side[] : []).map(side => <div key={side} className={styles.setupModes} role="group" aria-label={mode === 'watch' ? `${sideLabel(mode, side)}の強さ` : 'CPUの強さ'}>
      {mode === 'watch' && <span className={styles.setupModeLabel}>{sideLabel(mode, side)}</span>}
      {cpuLevels.map(id => <button key={id} aria-pressed={levels[side] === id} title={cpuProfiles[id].description} onClick={() => setLevel(side, id)}>{cpuProfiles[id].name}</button>)}
    </div>)}
    {collects && agreed && <p className={styles.help}>さいきょうとの対戦の記録は、CPUの学習のために匿名で送られます。 <button className={styles.textButton} onClick={() => agree(false)}>送るのをやめる</button></p>}
    {/* Laid out like the table: the far side's deck on top, the near side's at the bottom. */}
    <div className={styles.deckTable}>{(mode === 'watch' ? [0, 1] : [1, 0]).map((side, row) => <label key={side} className={row === 0 ? styles.deckFar : styles.deckNear}>
      <span>{mode === 'watch' ? `${sideLabel(mode, side as Side)}のデッキ` : side === 0 ? 'あなたのデッキ' : '相手のデッキ'}<small>{row === 0 ? '奥' : '手前'}</small></span>
      <select value={selected[side]} onChange={event => setSelected(previous => previous.map((value, index) => index === side ? event.target.value : value))}><option value="demo">いちごのおためしデッキ（20 / 10）</option>{decks.map(d => <option key={d.id} value={d.id} disabled={!!d.errors.length}>{d.deck.name}{d.errors.length ? '（使用不可）' : `（${d.deck.yojo.length} / ${d.deck.sweet.length}）`}</option>)}</select>
    </label>)}<i aria-hidden="true">VS</i></div>
    {!user ? <button className={styles.secondaryButton} onClick={() => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}>Googleでログインして保存済みデッキを使う</button> : <p className={styles.help}>{loading ? 'デッキを読み込み中…' : `${decks.length}件の保存済みデッキ`} · <Link href="/build">デッキを編集する</Link></p>}
    {decks.some(d => d.errors.length > 0) && <details className={styles.ruleSettings}><summary>使用できないデッキの理由</summary>{decks.filter(d => d.errors.length).map(d => <p key={d.id}>{d.deck.name}：{d.errors.join(' / ')}</p>)}</details>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button className={styles.startButton} onClick={() => start()}>対戦をはじめる <span>→</span></button>
    {asking && <>
      <button className={styles.consentBackdrop} aria-label="閉じる" onClick={() => setAsking(false)} />
      <section className={styles.consent} role="dialog" aria-modal="true" aria-labelledby="learning-consent">
        <h2 id="learning-consent">さいきょうの学習に協力する</h2>
        <p>さいきょうは、みなさんとの対戦から学んで強くなります。さいきょうとの対戦が終わるたびに、次の記録を学習用のサーバーに送ります。</p>
        <ul>
          <li>お互いのデッキに入っているカード</li>
          <li>お互いが打った手と、勝ち負け</li>
        </ul>
        <p>名前・アカウント・デッキの名前は送りません。記録からだれの対戦かはわかりません。ログインも不要です。くわしくは<Link href="/privacy-policy" target="_blank">プライバシーポリシー</Link>をご覧ください。</p>
        <button className={styles.startButton} onClick={() => { agree(true); start(true); }}>同意して対戦をはじめる <span>→</span></button>
        <button className={styles.secondaryButton} onClick={() => setAsking(false)}>同意しない（ほかの強さを選ぶ）</button>
      </section>
    </>}
  </div>;
}
