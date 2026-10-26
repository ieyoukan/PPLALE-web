'use client';

// What a room asks for one choice at a time: the deck, the CPU's strength, the rules of the next match.
import { useRef, useState } from 'react';
import CardDetail from '@/components/shared/card/CardDetail';
import { cpuLevels, cpuProfiles } from '@pplale/game-core';
import type { CpuLevel } from '@pplale/game-core';
import type { RoomRules, RoomView } from '@pplale/game-core/room';
import { DECK_IMAGE_ASPECT } from '@/lib/deckImageLayout';
import type { DeckChoice } from '@/lib/game/deckSources';
import { displayCards } from '@/lib/game/catalog';
import { RulePicker } from '../RulePicker';
import { DeckCardLayout } from '@/components/shared/deck/DeckCardLayout';
import SavedDeckThumbnail from '@/components/deck/SavedDeckThumbnail';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { Avatar } from './Avatar';
import { PlazaIcon } from './PlazaIcon';
import { Sheet } from './Sheet';
import styles from './Plaza.module.css';

/** The decks there are for the room's rules: those the rules do not allow are shown, greyed, with why. */
export function DeckSheet({ choices, chosen, onChoose, onClose, signIn, loading }: {
  choices: DeckChoice[]; chosen?: DeckChoice; onChoose: (id: string) => void; onClose: () => void; signIn?: () => void; loading: boolean;
}) {
  const [preview, setPreview] = useState<DeckChoice | null>(null);
  if (preview) return <DeckContentsSheet choice={preview} onClose={() => setPreview(null)} onAction={!preview.errors.length ? () => onChoose(preview.id) : undefined} actionLabel="このデッキにする" />;
  return <Sheet title="デッキをえらぶ" onClose={onClose} wide>
    <ul className={styles.deckGrid}>{choices.map(choice => {
      const deck = choice.source === 'random' ? null : choice.deck(0);
      return <li key={choice.id}>
        <OrnateFrame as="button" size="sm" className={styles.deckTile} aria-pressed={choice.id === chosen?.id} data-unusable={!!choice.errors.length || undefined} onClick={() => setPreview(choice)} title={choice.errors.join(' / ') || undefined}>
          <div className={styles.deckTileArt} style={{ aspectRatio: DECK_IMAGE_ASPECT }}>{deck ? <SavedDeckThumbnail deck={{ id: choice.id, name: choice.name, updatedAt: null, yojoDeckIds: deck.yojo, sweetDeckIds: deck.sweet, playableCardId: deck.playable }} /> : <span className={styles.randomDeck}><PlazaIcon name="sparkle" /></span>}</div>
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

/** A fixed deck's actual cards. Random decks are only generated when ready is pressed. */
export function DeckContentsSheet({ choice, onClose, onAction, actionLabel }: { choice: DeckChoice; onClose: () => void; onAction?: () => void; actionLabel: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const deck = choice.source === 'random' ? null : choice.deck(0);
  const card = expanded ? displayCards[expanded] : null;
  return <><div style={{ display: 'contents' }} inert={!!card}><Sheet title={choice.name} onClose={onClose} wide>
    {!deck && <p className={styles.note}>おまかせデッキは、じゅんびOKを押したときにカードが決まります。</p>}
    {deck && <DeckCardLayout deck={{ yojoDeckIds: deck.yojo, sweetDeckIds: deck.sweet, playableCardId: deck.playable }} label="デッキのカード" imageOf={id => displayCards[id]?.imageUrl} nameOf={id => displayCards[id]?.name ?? id} onCardClick={(id, event) => { trigger.current = event.currentTarget; setExpanded(id); }} />}
    {!!choice.errors.length && <p className={styles.note}>{choice.errors.join(' / ')}</p>}
    {onAction && <div className={styles.sheetFoot}><OrnateFrame as="button" size="sm" className={styles.primaryButton} onClick={onAction}><PlazaIcon name="cards" /><span data-ui-title>{actionLabel}</span></OrnateFrame></div>}
  </Sheet></div>
    {card && <CardDetail card={card} onClose={() => setExpanded(null)} isInDeck={false} returnFocusRef={trigger} />}
  </>;
}

/** How strong the CPU that sits down is: one tile each, with as many stars. */
export function CpuSheet({ onChoose, onClose }: { onChoose: (level: CpuLevel) => void; onClose: () => void }) {
  return <Sheet title="CPUをえらぶ" onClose={onClose} wide>
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

/** The empty opponent seat offers a person or a CPU before choosing CPU strength. */
export function OpponentSheet({ onInvite, onCpu, onClose }: { onInvite: () => void; onCpu: () => void; onClose: () => void }) {
  return <Sheet title="対戦相手をえらぶ" onClose={onClose}>
    <div className={styles.opponentChoices}>
      <button onClick={onInvite}><PlazaIcon name="people" /><span data-ui-title>人をさそう</span></button>
      <button onClick={onCpu}><PlazaIcon name="cpu" /><span data-ui-title>CPUと対戦</span></button>
    </div>
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
      {mine ? <OrnateFrame as="button" size="sm" className={styles.primaryButton} onClick={() => onSave(rules)}><PlazaIcon name="check" /><span data-ui-title>{playing ? '次の対戦からこのルール' : 'このルールにする'}</span></OrnateFrame>
        : <span className={styles.note}>ルールを変えられるのはオーナーだけです。</span>}
    </div>
  </Sheet>;
}
