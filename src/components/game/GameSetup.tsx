'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cpuLevels, cpuProfiles, defaultMatchRules, sandboxRules } from '@pplale/game-core';
import type { CpuLevel, GameState, MatchRules, Side } from '@pplale/game-core';
import { cpuServerUrl, learningConsent } from '@/lib/game/cpuServer';
import { usableChoice } from '@/lib/game/deckSources';
import { createMatch, randomSeed } from '@/lib/game/match';
import { DECKS_PATH, savedMatchRules, sideLabel } from '@/lib/game/sessionStore';
import type { Levels, MatchSetup, Mode } from '@/lib/game/sessionStore';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/LocaleProvider';
import { DeckSelect, UnusableDecks, useDeckChoices } from './DeckSelect';
import { RulePicker } from './RulePicker';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import styles from './GameSetupControls.module.css';
import layout from './GameSetup.module.css';
const modeNames: Record<Mode, string> = { cpu: 'CPUと対戦', watch: 'CPU同士を観戦', hotseat: '両側を操作', room: 'ルームマッチ', puzzle: 'リーサルパズル' };
/**
 * Mode (among `modes`), CPU levels, the rules (which cards the decks may use) and both decks for a
 * new match; how the game itself is played is fixed. Used by the preparation pages.
 */
export function GameSetup({ modes, onStart }: {
    modes: Mode[];
    onStart: (match: { game: GameState; seed: number; setup: MatchSetup; mode: Mode; levels: Levels }) => void | Promise<void>;
}) {
    const { user, signInWithGoogle } = useAuth();
    const { t, gameText } = useI18n();
    const [error, setError] = useState('');
    const [starting, setStarting] = useState(false);
    const startingRef = useRef(false);
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
    async function start(consented = agreed) {
        if (startingRef.current) return;
        if (collects && !consented) {
            setAsking(true);
            return;
        }
        const [a, b] = chosen;
        if (!a || !b)
            return;
        startingRef.current = true;
        setStarting(true);
        setError('');
        try {
            // A deck made on demand (おまかせ) is made here, one per side; the rematch plays the same two again.
            const setup: MatchSetup = { decks: [a.deck(randomSeed()), b.deck(randomSeed())], rules: { ...sandboxRules }, matchRules: rules };
            const seed = randomSeed();
            await onStart({ game: createMatch(setup, mode, seed), seed, setup, mode, levels });
        }
        catch (error) {
            setError(error instanceof Error ? error.message : '開始できません');
        }
        finally { startingRef.current = false; setStarting(false); }
    }
    return <div className={layout.content} data-mode={mode} data-learning={collects && agreed || undefined}>
    <div className={`${styles.setupModes} ${layout.modes}`} data-landscape-action>
      {modes.map(id => <button key={id} data-ui-title aria-pressed={mode === id} onClick={() => setMode(id)}>{t(modeNames[id])}</button>)}
    </div>
    {/* One row per CPU side: the opponent against you, both sides when watching. */}
    {(mode === 'watch' ? [0, 1] as Side[] : mode === 'cpu' ? [1] as Side[] : []).map(side => <div key={side} className={`${styles.setupModes} ${layout.modes} ${layout.levelButtons}`} data-landscape-action role="group" aria-label={mode === 'watch' ? t('{side}の強さ', { side: t(sideLabel(mode, side)) }) : t('CPUの強さ')}>
      {mode === 'watch' && <span className={styles.setupModeLabel}>{t(sideLabel(mode, side))}</span>}
      {cpuLevels.map(id => <button key={id} aria-pressed={levels[side] === id} title={gameText(cpuProfiles[id].description)} onClick={() => setLevel(side, id)}>{gameText(cpuProfiles[id].name)}</button>)}
    </div>)}
    {collects && agreed && <p className={`${styles.help} ${layout.learning}`}><span>{t('CPU学習用の匿名記録を送信中')}</span><button className={styles.textButton} onClick={() => agree(false)}>{t('送るのをやめる')}</button></p>}
    {/* Which cards both decks may use; the selectors below only let a deck that fits be chosen. */}
    <OrnateFrame as="section" size="sm" faint className={`${styles.setupRules} ${layout.rulesInline}`} aria-label={t('対戦のルール')}>
      <RulePicker rules={rules} onChange={next => { setRules(next); setError(''); }} compact />
    </OrnateFrame>
    {/* The opponent's deck first, then this player's (when watching, CPU 1 then CPU 2). */}
    <OrnateFrame size="sm" className={`${styles.deckTable} ${layout.decks}`}>{(mode === 'watch' ? [0, 1] : [1, 0]).map(side => <label key={side}>
      <span data-ui-title>{mode === 'watch' ? t('{name}のデッキ', { name: t(sideLabel(mode, side as Side)) }) : t(side === 0 ? 'あなたのデッキ' : '相手のデッキ')}</span>
      <DeckSelect choices={choices} chosen={chosen[side]} onChange={id => setSelected(previous => previous.map((value, index) => index === side ? id : value))} />
    </label>)}</OrnateFrame>
    {!user ? <button className={`${styles.secondaryButton} ${layout.login}`} onClick={() => { signInWithGoogle().catch(() => setError('ログインできませんでした')); }}>{t('Googleでログインして保存済みデッキを使う')}</button> : <p className={`${styles.help}`}>{saved.loading ? t('デッキを読み込み中…') : t('{count}件の保存済みデッキ', { count: saved.decks.length })} · <Link href={DECKS_PATH}>{t('デッキを編集する')}</Link></p>}
    <UnusableDecks choices={choices} className={styles.ruleSettings} />
    {saved.error && <p role="alert" className={styles.error}>{t(saved.error)}</p>}
    {error && <p role="alert" className={styles.error}>{gameText(error)}</p>}
    <OrnateFrame as="button" size="line" data-ui-title data-landscape-action className={`${styles.startButton} ${layout.start}`} disabled={starting || chosen.some(choice => !choice)} aria-busy={starting} onClick={() => void start()}>{t(starting ? '対戦を準備中…' : '対戦をはじめる')} <span>→</span></OrnateFrame>
    {asking && <>
      <button className={styles.consentBackdrop} aria-label={t('閉じる')} onClick={() => setAsking(false)} />
      <OrnateFrame as="section" className={styles.consent} role="dialog" aria-modal="true" aria-labelledby="learning-consent">
        <h2 id="learning-consent">{t('さいきょうの学習に協力する')}</h2>
        <p>{t('さいきょうは、みなさんとの対戦から学んで強くなります。さいきょうとの対戦が終わるたびに、次の記録を学習用のサーバーに送ります。')}</p>
        <ul>
          <li>{t('お互いのデッキに入っているカード')}</li>
          <li>{t('お互いが打った手と、勝ち負け')}</li>
        </ul>
        <p>{t('名前・アカウント・デッキの名前は送りません。記録からだれの対戦かはわかりません。ログインも不要です。くわしくは')}<Link href="/privacy-policy" target="_blank">{t('プライバシーポリシー')}</Link>{t('をご覧ください。')}</p>
        <OrnateFrame as="button" size="line" data-ui-title className={styles.startButton} onClick={() => { agree(true); start(true); }}>{t('同意して対戦をはじめる')} <span>→</span></OrnateFrame>
        <button className={styles.secondaryButton} onClick={() => setAsking(false)}>{t('同意しない（ほかの強さを選ぶ）')}</button>
      </OrnateFrame>
    </>}
  </div>;
}
