'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cpuLevels, cpuProfiles, defaultMatchRules, fruitNames, sandboxRules } from '@pplale/game-core';
import type { CpuLevel, GameState, MatchRules, Side } from '@pplale/game-core';
import { cpuServerUrl, learningConsent } from '@/lib/game/cpuServer';
import { usableChoice } from '@/lib/game/deckSources';
import { createMatch, randomSeed } from '@/lib/game/match';
import { savedMatchRules, sideLabel } from '@/lib/game/sessionStore';
import type { Levels, MatchSetup, Mode } from '@/lib/game/sessionStore';
import { useAuth } from '@/lib/auth';
import { DeckSelect, UnusableDecks, useDeckChoices } from './DeckSelect';
import { RulePicker } from './RulePicker';
import styles from './BoardEmulator.module.css';
import layout from './GameSetup.module.css';
const modeNames: Record<Mode, string> = { cpu: 'CPUと対戦', watch: 'CPU同士を観戦', hotseat: '両側を操作', room: 'ルームマッチ' };
/**
 * Mode (among `modes`), CPU levels, the rules (which cards the decks may use) and both decks for a
 * new match; how the game itself is played is fixed. Used by the preparation pages.
 */
export function GameSetup({ modes, onStart }: {
    modes: Mode[];
    onStart: (match: { game: GameState; seed: number; setup: MatchSetup; mode: Mode; levels: Levels }) => void;
}) {
    const { user, signInWithGoogle } = useAuth();
    const [error, setError] = useState('');
    const [rulesOpen, setRulesOpen] = useState(false);
    // Both decks follow the same rules. Each side keeps its pick while the rules allow it; else it gets the first deck that fits.
    const [rules, setRules] = useState<MatchRules>(defaultMatchRules);
    const { choices, saved } = useDeckChoices(rules, 'この対戦');
    const [selected, setSelected] = useState(['', '']);
    const chosen = selected.map(id => usableChoice(choices, id));
    const [mode, setMode] = useState<Mode>(modes[0]);
    const [levels, setLevels] = useState<Levels>(['normal', 'normal']);
    const setLevel = (side: Side, level: CpuLevel) => setLevels(previous => side === 0 ? [level, previous[1]] : [previous[0], level]);
    // Matches against さいきょう are sent to the CPU server for its training: asked once per browser.
    const collects = !!cpuServerUrl && mode === 'cpu' && levels[1] === 'master';
    const [agreed, setAgreed] = useState(false);
    const [asking, setAsking] = useState(false);
    // localStorage is only available in the browser, after the first render. The last match's rules are offered again.
    useEffect(() => {
        setAgreed(learningConsent.given());
        const last = savedMatchRules();
        if (last) setRules(last);
    }, []);
    const agree = (value: boolean) => {
        learningConsent.set(value);
        setAgreed(value);
        setAsking(false);
    };
    function start(consented = agreed) {
        if (collects && !consented) {
            setAsking(true);
            return;
        }
        const [a, b] = chosen;
        if (!a || !b)
            return;
        try {
            // A deck made on demand (おまかせ) is made here, one per side; the rematch plays the same two again.
            const setup: MatchSetup = { decks: [a.deck(randomSeed()), b.deck(randomSeed())], rules: { ...sandboxRules }, matchRules: rules };
            const seed = randomSeed();
            onStart({ game: createMatch(setup, mode, seed), seed, setup, mode, levels });
        }
        catch (error) {
            setError(error instanceof Error ? error.message : '開始できません');
        }
    }
    return <div className={layout.content} data-mode={mode} data-learning={collects && agreed || undefined}>
    <div className={`${styles.setupModes} ${layout.modes}`}>
      {modes.map(id => <button key={id} data-ui-title aria-pressed={mode === id} onClick={() => setMode(id)}>{modeNames[id]}</button>)}
    </div>
    {/* One row per CPU side: the opponent against you, both sides when watching. */}
    {(mode === 'watch' ? [0, 1] as Side[] : mode === 'cpu' ? [1] as Side[] : []).map(side => <div key={side} className={`${styles.setupModes} ${layout.modes} ${layout.levelButtons}`} role="group" aria-label={mode === 'watch' ? `${sideLabel(mode, side)}の強さ` : 'CPUの強さ'}>
      {mode === 'watch' && <span className={styles.setupModeLabel}>{sideLabel(mode, side)}</span>}
      {cpuLevels.map(id => <button key={id} aria-pressed={levels[side] === id} title={cpuProfiles[id].description} onClick={() => setLevel(side, id)}>{cpuProfiles[id].name}</button>)}
    </div>)}
    {(mode === 'watch' || mode === 'cpu') && <div className={layout.watchLevels}>{(mode === 'watch' ? [0, 1] as const : [1] as const).map(side => <label key={side}>
      <span>{mode === 'cpu' ? 'CPU' : sideLabel(mode, side)}<span className={layout.levelSuffix}>の強さ</span></span>
      <select aria-label={`${mode === 'cpu' ? 'CPU' : sideLabel(mode, side)}の強さ`} value={levels[side]} onChange={event => setLevel(side, event.target.value as CpuLevel)}>
        {cpuLevels.map(id => <option key={id} value={id}>{cpuProfiles[id].name}</option>)}
      </select>
    </label>)}</div>}
    {collects && agreed && <p className={`${styles.help} ${layout.help} ${layout.learning}`}><span>CPU学習用の匿名記録を送信中</span><button className={styles.textButton} onClick={() => agree(false)}>送るのをやめる</button></p>}
    {/* Which cards both decks may use; the selectors below only let a deck that fits be chosen. */}
    <section className={`${styles.setupRules} ${layout.rulesInline}`} aria-label="対戦のルール">
      <h2>ルール<small>おたがいのデッキに使えるカード</small></h2>
      <RulePicker rules={rules} onChange={next => { setRules(next); setError(''); }} />
    </section>
    <button className={layout.rulesTrigger} aria-haspopup="dialog" onClick={() => setRulesOpen(true)}>
      <b>ルール</b><span>{rules.fruits.map(fruit => fruitNames[fruit]).join('・')} ／ {rules.extendedPlayable ? '通常・ExP' : '通常'}</span><span aria-hidden="true">›</span>
    </button>
    {rulesOpen && <RulesDialog rules={rules} onChange={next => { setRules(next); setError(''); }} onClose={() => setRulesOpen(false)} />}
    {/* Laid out like the table: the far side's deck on top, the near side's at the bottom. */}
    <div className={`${styles.deckTable} ${layout.decks}`}>{(mode === 'watch' ? [0, 1] : [1, 0]).map((side, row) => <label key={side} className={row === 0 ? styles.deckFar : styles.deckNear}>
      <span>{mode === 'watch' ? `${sideLabel(mode, side as Side)}のデッキ` : side === 0 ? 'あなたのデッキ' : '相手のデッキ'}<small>{row === 0 ? '奥' : '手前'}</small></span>
      <DeckSelect choices={choices} chosen={chosen[side]} onChange={id => setSelected(previous => previous.map((value, index) => index === side ? id : value))} />
    </label>)}<i aria-hidden="true">VS</i></div>
    {!user ? <button className={`${styles.secondaryButton} ${layout.login}`} onClick={() => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}>Googleでログインして保存済みデッキを使う</button> : <p className={`${styles.help} ${layout.help}`}>{saved.loading ? 'デッキを読み込み中…' : `${saved.decks.length}件の保存済みデッキ`} · <Link href="/build">デッキを編集する</Link></p>}
    <UnusableDecks choices={choices} className={styles.ruleSettings} />
    {saved.error && <p role="alert" className={styles.error}>{saved.error}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <button data-ui-title className={`${styles.startButton} ${layout.start}`} disabled={chosen.some(choice => !choice)} onClick={() => start()}>対戦をはじめる <span>→</span></button>
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
        <button data-ui-title className={styles.startButton} onClick={() => { agree(true); start(true); }}>同意して対戦をはじめる <span>→</span></button>
        <button className={styles.secondaryButton} onClick={() => setAsking(false)}>同意しない（ほかの強さを選ぶ）</button>
      </section>
    </>}
  </div>;
}

/** The full rule picker is one tap away without making the phone's home page taller. */
function RulesDialog({ rules, onChange, onClose }: { rules: MatchRules; onChange: (rules: MatchRules) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className={layout.rulesDialog} aria-label="対戦のルール" onClose={event => { if (!event.currentTarget.open) onClose(); }}>
    <header><h2>対戦のルール</h2><button onClick={onClose} aria-label="ルールを閉じる">×</button></header>
    <RulePicker rules={rules} onChange={onChange} compact />
    <button className={layout.done} onClick={onClose}>このルールであそぶ</button>
  </dialog>;
}
