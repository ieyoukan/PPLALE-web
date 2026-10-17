'use client';

import { useEffect, useRef, useState } from 'react';
import { BattleIllustration } from './BattleIllustration';
import styles from './Room.module.css';

const companions = [
  { kind: 'create', label: 'ピンクのキャラクター' },
  { kind: 'enter', label: '黄色のキャラクター' },
  { kind: 'watch', label: '緑のキャラクター' },
] as const;
type Companion = typeof companions[number]['kind'];
type Mood = 'welcome' | 'setup' | 'searching' | 'cancelling';
const COMPANION_KEY = 'pplale-battle-companion-v1';
const greetings: Record<Mood, readonly string[]> = {
  welcome: ['今日は、だれと遊ぼう？', 'お気に入りのデッキ、持ってきた？', 'おやつの時間も、対戦もいっしょに！'],
  setup: ['今日は、どんなデッキで遊ぶ？', 'お気に入りのカードといっしょに！', 'おやつの準備は、ばっちり♪'],
  searching: ['お相手を探しているよ。ちょっとひと休み♪', 'どんなデッキと出会えるかな？', '見つかったら、いっしょに出発しよう！'],
  cancelling: ['いったん、ひと休みにしよう。'],
};

/** A small lobby companion. Its selection is a local preference, independent of matchmaking. */
export function BattleCompanion({ mood = 'setup', compact = false }: { mood?: Mood; compact?: boolean }) {
  const [selected, setSelected] = useState<Companion>('create');
  const [line, setLine] = useState(0);
  const [reacting, setReacting] = useState(false);
  const reaction = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(COMPANION_KEY);
      if (companions.some(companion => companion.kind === saved)) setSelected(saved as Companion);
    } catch { /* The companion can still be selected for this visit. */ }
    return () => clearTimeout(reaction.current);
  }, []);

  function talk() {
    setLine(previous => previous + 1);
    setReacting(true);
    clearTimeout(reaction.current);
    reaction.current = setTimeout(() => setReacting(false), 650);
  }
  function choose(kind: Companion) {
    setSelected(kind);
    setLine(0);
    setReacting(false);
    try { localStorage.setItem(COMPANION_KEY, kind); } catch { /* Kept for this visit only. */ }
  }

  return <div className={styles.companion} data-companion={selected} data-compact={compact || undefined}>
    <div className={styles.companionRoom}>
      <div className={styles.companionWindow} aria-hidden="true"><i /><i /></div>
      <div className={styles.companionBubble} key={`${mood}-${line}`} aria-live="polite">{greetings[mood][line % greetings[mood].length]}</div>
      <span className={styles.roomSparkle} aria-hidden="true">✧</span>
      <span className={styles.roomHeart} aria-hidden="true">♡</span>
      <button type="button" className={styles.companionCharacter} onClick={talk} aria-label="キャラクターに話しかける" data-reacting={reacting || undefined}>
        <BattleIllustration kind={selected} sizes="(max-width: 1000px) 190px, 260px" />
        {reacting && <span className={styles.companionReaction} aria-hidden="true">♥</span>}
      </button>
      <span className={styles.companionHint}>タップして話しかける</span>
    </div>
    <div className={styles.companionChoices} role="group" aria-label="案内役を選ぶ">
      {companions.map(({ kind, label }) => <button key={kind} type="button" className={styles.companionChoice} aria-label={label} aria-pressed={selected === kind} onClick={() => choose(kind)}>
        <BattleIllustration kind={kind} sizes="56px" />
      </button>)}
    </div>
  </div>;
}
