'use client';

// ランチパッドの「デッキ」：保存したデッキの一覧。デッキを押すと、詳細の画面ではなく、対戦やVRChatで
// すぐ使うためのポップアップ（コード・プレイアブル・名前・コストカーブ・削除）が開く。そこから編成と、
// OGPと同じ配置の確認・共有へ進む。
import { useEffect, useState } from 'react';
import type { MatchRules } from '@pplale/game-core';
import { randomDeck } from '@pplale/game-core';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/i18n/LocaleProvider';
import { gameCatalog } from '@/lib/game/catalog';
import { DECK_LIMITS, clearFocus, deckProblems, peekFocus, setDraft } from '@/lib/game/deckStore';
import type { DeckDraft, StoredDeck } from '@/lib/game/deckStore';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { usePlaza } from '../plaza/PlazaProvider';
import { useLaunchpad } from '../launchpad/LaunchpadContext';
import type { Place } from '../launchpad/places';
import { CardBack, CardImage, byCost, fruitColors, fruitsOfDeck, useCards } from './deckParts';
import { DeckConfirm, DeckQuick, NewDeckSheet } from './DeckPopups';
import { useDecks } from './useDecks';
import styles from './Decks.module.css';

type Open = { kind: 'deck' | 'confirm'; id: string } | { kind: 'new' } | null;

/** The rules of the room the player is in (decks are checked against them), if any. */
export function useRoomRules(): { rules?: MatchRules; name?: string } {
  const { view } = usePlaza();
  return view?.plaza ? { rules: view.rules, name: view.plaza.name } : {};
}

export function DecksPage({ place }: { place: Place }) {
  const { t, locale } = useI18n();
  const { user, signInWithGoogle } = useAuth();
  const { decks, loading, failed, uid } = useDecks();
  const cards = useCards();
  const { openAt } = useLaunchpad();
  const room = useRoomRules();
  // Opened for a deck (from a seat), to make one, or back from saving one: that popup first.
  const [open, setOpen] = useState<Open>(() => {
    const saved = peekFocus();
    return saved ? { kind: 'deck', id: saved } : place.id === 'new' ? { kind: 'new' } : place.id ? { kind: 'deck', id: place.id } : null;
  });
  useEffect(clearFocus, []);
  const deckOf = (id: string) => decks.find(deck => deck.id === id);
  const edit = (deck: DeckDraft) => {
    if (deck.id) openAt({ section: 'deckEditor', id: deck.id, ...(place.from && { from: place.from }) });
    else { setDraft(deck); openAt({ section: 'deckEditor', id: 'draft', ...(place.from && { from: place.from }) }); }
  };
  const start = (how: 'empty' | 'random' | DeckDraft) => {
    const name = t('あたらしいデッキ');
    if (how === 'empty') edit({ name, yojo: [], sweet: [], playable: null });
    else if (how === 'random') {
      const made = randomDeck(room.rules ?? { fruits: ['strawberry'], extendedPlayable: false }, gameCatalog, Date.now() % 2147483647);
      edit(made ? { name: t('おまかせデッキ'), yojo: made.yojo, sweet: made.sweet, playable: made.playable } : { name, yojo: [], sweet: [], playable: null });
    } else edit(how);
  };
  const usable = decks.filter(deck => !deckProblems(deck, room.rules).length).length;
  const shown = open && open.kind !== 'new' ? deckOf(open.id) : undefined;
  return <section className={styles.list} aria-label={t('マイデッキ')}>
    <header className={styles.listHead}>
      <h3 data-ui-title>{t('マイデッキ')}</h3>
      {!loading && <small>{decks.length}</small>}
      {room.rules && !loading && <span className={styles.ruleNote}><GameIcon name="pin" />{locale === 'ja' ? `${room.name}で使える ${usable}` : `${usable} usable in ${room.name}`}</span>}
      {!user && <span className={styles.guestNote}>{t('このブラウザに保存されます')}<button type="button" onClick={() => void signInWithGoogle().catch(() => {})}><GameIcon name="heart" />{t('ログイン')}</button></span>}
    </header>
    {failed && <p className={styles.error} role="alert">{t('デッキを読み込めませんでした')}</p>}
    <div className={styles.decks}>
      <button type="button" className={styles.newDeck} onClick={() => setOpen({ kind: 'new' })}>
        <span className={styles.newArt}><CardBack /><GameIcon name="plus" /></span><b data-ui-title>{t('あたらしく作る')}</b>
      </button>
      {loading ? <p className={styles.loading} role="status">{t('読み込み中...')}</p>
        : decks.map((deck, index) => <DeckBox key={deck.id} deck={deck} index={index} cards={cards} rules={room.rules} onOpen={() => setOpen({ kind: 'deck', id: deck.id })} />)}
    </div>
    {open?.kind === 'new' && <NewDeckSheet onStart={start} onClose={() => setOpen(null)} />}
    {open?.kind === 'deck' && shown && <DeckQuick deck={shown} uid={uid} cards={cards} rules={room.rules} onEdit={() => edit(shown)} onConfirm={() => setOpen({ kind: 'confirm', id: shown.id })} onClose={() => setOpen(null)} onDeleted={() => setOpen(null)} />}
    {open?.kind === 'confirm' && shown && <DeckConfirm deck={shown} uid={uid} cards={cards} onClose={() => setOpen({ kind: 'deck', id: shown.id })} />}
  </section>;
}

/** A deck as a box of three: its playable in front, then its first 幼女 and お菓子. A bar shows how far an unfinished one is. */
function DeckBox({ deck, index, cards, rules, onOpen }: { deck: StoredDeck; index: number; cards: ReturnType<typeof useCards>; rules?: MatchRules; onOpen: () => void }) {
  const { t } = useI18n();
  const order = byCost(cards), complete = deck.yojo.length === DECK_LIMITS.yojo && deck.sweet.length === DECK_LIMITS.sweet && !!deck.playable;
  const fit = !deckProblems(deck, rules).length;
  const fan = [[...deck.sweet].sort(order)[0], [...deck.yojo].sort(order)[0], deck.playable ?? undefined];
  const fruits = fruitsOfDeck([...deck.yojo, ...deck.sweet], cards);
  return <OrnateFrame as="button" size="sm" className={styles.deckBox} style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }} data-unusable={(rules && complete && !fit) || undefined} onClick={onOpen} aria-label={deck.name || t('無名のデッキ')}>
    <span className={styles.fan}>{fan.map((id, slot) => <span key={slot} className={styles.fanCard}>{id ? <CardImage card={cards.byId.get(id)} sizes="110px" /> : <span className={styles.emptyCard} />}</span>)}</span>
    <b data-ui-title className={styles.deckName}>{deck.name || t('無名のデッキ')}</b>
    <span className={styles.deckMeta}>
      {fruits.map(fruit => <i key={fruit} className={styles.dot} style={{ background: fruitColors[fruit] }} />)}
      {!complete ? <span className={styles.progress} title={t('作りかけ')}><i><span style={{ width: `${deck.yojo.length / DECK_LIMITS.yojo * 100}%` }} /></i><i data-kind="sweet"><span style={{ width: `${deck.sweet.length / DECK_LIMITS.sweet * 100}%` }} /></i></span>
        : rules ? <span className={fit ? styles.fits : styles.misfits}>{fit ? <><GameIcon name="check" />{t('このルームOK')}</> : t('このルーム×')}</span> : null}
    </span>
  </OrnateFrame>;
}
