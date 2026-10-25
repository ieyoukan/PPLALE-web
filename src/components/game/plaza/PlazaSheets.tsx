'use client';

// What a room asks for one choice at a time: the deck, the CPU's strength, the rules of the next match.
import { useState } from 'react';
import { cpuLevels, cpuProfiles } from '@pplale/game-core';
import type { CpuLevel } from '@pplale/game-core';
import type { RoomRules, RoomView } from '@pplale/game-core/room';
import type { DeckChoice } from '@/lib/game/deckSources';
import { RulePicker } from '../RulePicker';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { Avatar } from './Avatar';
import { PlazaIcon } from './PlazaIcon';
import { Sheet } from './Sheet';
import styles from './Plaza.module.css';

/** The decks there are for the room's rules: those the rules do not allow are shown, greyed, with why. */
export function DeckSheet({ choices, chosen, onChoose, onClose, signIn, loading }: {
  choices: DeckChoice[]; chosen?: DeckChoice; onChoose: (id: string) => void; onClose: () => void; signIn?: () => void; loading: boolean;
}) {
  return <Sheet title="デッキをえらぶ" onClose={onClose} wide>
    <ul className={styles.deckGrid}>{choices.map(choice => {
      const playable = choice.source === 'random' ? null : choice.deck(0).playable;
      return <li key={choice.id}>
        <OrnateFrame as="button" size="sm" className={styles.deckTile} aria-pressed={choice.id === chosen?.id} disabled={!!choice.errors.length} onClick={() => onChoose(choice.id)} title={choice.errors.join(' / ') || undefined}>
          <span className={styles.deckTileArt}>{playable ? <Avatar card={playable} size={75} /> : <span className={styles.randomDeck}><PlazaIcon name="sparkle" /></span>}</span>
          <b>{choice.name}</b>
          <small>{choice.errors.length ? 'このルールでは使えない' : choice.note}</small>
          {choice.id === chosen?.id && <span className={styles.tileCheck}><PlazaIcon name="check" /></span>}
        </OrnateFrame>
      </li>;
    })}</ul>
    <div className={styles.sheetFoot}>
      {signIn && <button className={styles.softButton} onClick={signIn}>ログインして保存したデッキを使う</button>}
      {loading && <span className={styles.note}>デッキを読み込み中…</span>}
      <a className={styles.softButton} href="/build" target="_blank" rel="noopener noreferrer"><PlazaIcon name="pen" />デッキを作る</a>
    </div>
  </Sheet>;
}

/** How strong the CPU that sits down is: one tile each, with as many stars. */
export function CpuSheet({ onChoose, onClose }: { onChoose: (level: CpuLevel) => void; onClose: () => void }) {
  return <Sheet title="CPUを呼ぶ" onClose={onClose} wide>
    <ul className={styles.cpuGrid}>{cpuLevels.map((level, index) => <li key={level}>
      <OrnateFrame as="button" size="sm" className={styles.cpuTile} data-level={level} onClick={() => onChoose(level)}>
        <Avatar cpu size={72} />
        <b data-ui-title>{cpuProfiles[level].name}</b>
        <span className={styles.stars} aria-label={`強さ${index + 1}`}>{cpuLevels.map((_, star) => <PlazaIcon key={star} name="star" className={star <= index ? styles.starOn : styles.starOff} />)}</span>
      </OrnateFrame>
    </li>)}</ul>
    <p className={styles.note}>CPUのデッキは、このルームのルールに合うおまかせデッキです。</p>
  </Sheet>;
}

const TURNS = [undefined, 120, 180, 300] as const;
/** The rules of the next match: the owner changes them, everyone else sees them. */
export function RulesSheet({ view, onSave, onClose }: { view: RoomView; onSave: (rules: RoomRules) => void; onClose: () => void }) {
  const plaza = view.plaza!, mine = plaza.owner === plaza.me;
  const [rules, setRules] = useState<RoomRules>(plaza.nextRules ?? view.rules);
  const playing = view.status === 'playing';
  return <Sheet title={mine ? 'ルールをかえる' : 'このルームのルール'} onClose={onClose} wide>
    <div className={mine ? undefined : styles.readOnly} inert={!mine}>
      <RulePicker rules={rules} onChange={next => setRules(current => ({ ...current, ...next }))} compact />
      <div className={styles.turnChoice} role="radiogroup" aria-label="1ターンの時間">
        <PlazaIcon name="timer" />
        {TURNS.map(seconds => <button key={seconds ?? 0} role="radio" aria-checked={rules.turnSeconds === seconds} onClick={() => setRules(current => ({ ...current, turnSeconds: seconds }))}>{seconds ? `${seconds / 60}分` : '∞'}</button>)}
      </div>
    </div>
    <div className={styles.sheetFoot}>
      {mine ? <button className={styles.primaryButton} onClick={() => onSave(rules)}><PlazaIcon name="check" /><span data-ui-title>{playing ? '次の対戦からこのルール' : 'このルールにする'}</span></button>
        : <span className={styles.note}>ルールを変えられるのはオーナーだけです。</span>}
    </div>
  </Sheet>;
}
