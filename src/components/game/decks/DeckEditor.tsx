'use client';

// デッキ編成。上のタブで幼女・お菓子を切り替え、左の一覧と右のデッキはそのタブの種類だけを出す。
// デッキはOGPと同じく1枚1枠（幼女5×4、お菓子5×2）で、同じカードは枚数ぶん並ぶ。4段がちょうど入る最大の
// 大きさを高さから決め、一覧のカードも同じ大きさにそろえる。押す・ドラッグで入れ、デッキ側から出す。
// プレイアブルはここでは扱わない（一覧のポップアップで選ぶ）。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useI18n } from '@/i18n/LocaleProvider';
import { DECK_LIMITS, canAddCard, readDraft, saveDeck, setFocus } from '@/lib/game/deckStore';
import type { DeckDraft, DeckKind } from '@/lib/game/deckStore';
import CardDetail from '@/components/shared/card/CardDetail';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import type { CardInfo } from '@/types/card';
import { useLaunchpad } from '../launchpad/LaunchpadContext';
import type { Place } from '../launchpad/places';
import { CardImage, CostCurve, byCost, fruitColors, useCards } from './deckParts';
import { DeckConfirm } from './DeckPopups';
import { useDecks } from './useDecks';
import styles from './Decks.module.css';

/** Sent when a deck made from a seat is saved: the seat chooses it (PlazaTable). `detail.id`: the saved deck. */
export const SEAT_DECK_SAVED = 'pplale-seat-deck-saved';
const GAP = 8, COSTS = [1, 2, 3, 4, 5, 6, '7+'] as const;
type Cost = typeof COSTS[number];

export function DeckEditor({ place, onClose }: { place: Place; onClose: () => void }) {
  const { t } = useI18n();
  const { decks, loading, uid } = useDecks();
  const saved = place.id === 'draft' ? readDraft() : decks.find(deck => deck.id === place.id);
  // The first version seen is kept: a list read again (after a save elsewhere) neither resets nor closes the editing.
  const [frozen, setFrozen] = useState<DeckDraft | null>(null);
  const initial = frozen ?? saved;
  if (initial) return <Editor key={place.id} initial={initial} uid={uid} place={place} onClose={onClose} onStart={setFrozen} />;
  return <p className={styles.loading} role="status">{loading ? t('読み込み中...') : t('デッキが見つかりません')}</p>;
}

function Editor({ initial, uid, place, onClose, onStart }: { initial: DeckDraft; uid: string | null; place: Place; onClose: () => void; onStart: (deck: DeckDraft) => void }) {
  const { t, fruitLabel } = useI18n();
  const cards = useCards();
  const { back, openAt } = useLaunchpad();
  const [deck, setDeck] = useState<DeckDraft>(initial);
  const [kind, setKind] = useState<DeckKind>('yojo');
  const [cost, setCost] = useState<Cost | null>(null), [query, setQuery] = useState('');
  const [arrived, setArrived] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<CardInfo | null>(null), [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState<'' | 'saving' | 'failed'>('');
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null), slotsRef = useRef<HTMLDivElement>(null), zoomFrom = useRef<HTMLElement | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onStart(initial), []);

  // The largest card for which the 20 幼女 fit in 4 rows of the panel; the deck column is exactly 5 of them wide.
  useLayoutEffect(() => {
    const element = panel.current, host = root.current;
    if (!element || !host) return;
    const fit = () => {
      const style = getComputedStyle(element), padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const head = host.querySelector<HTMLElement>('[data-deck-head]')?.offsetHeight ?? 44;
      const width = Math.max(48, Math.min(150, Math.floor((element.clientHeight - padding - head - GAP * 4) / 4 / 1.5)));
      host.style.setProperty('--cw', `${width}px`);
      host.style.setProperty('--deck-width', `${width * 5 + GAP * 4}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const add = useCallback((id: string, from?: HTMLElement | null) => {
    const card = cards.byId.get(id);
    if (!card || (card.type !== 'yojo' && card.type !== 'sweet')) return;
    setDeck(current => canAddCard(current, id) ? { ...current, [card.type]: [...current[card.type as DeckKind], id] } : current);
    setArrived(id);
    if (from) fly(from, slotsRef.current?.querySelector('[data-empty]') ?? slotsRef.current, root.current);
  }, [cards]);
  const remove = useCallback((id: string) => {
    const card = cards.byId.get(id);
    if (!card || (card.type !== 'yojo' && card.type !== 'sweet')) return;
    setDeck(current => {
      const list = current[card.type as DeckKind], at = list.lastIndexOf(id);
      return at < 0 ? current : { ...current, [card.type]: list.filter((_, index) => index !== at) };
    });
    setArrived(null);
  }, [cards]);
  const drag = useCardDrag({ root, add, remove });

  async function save() {
    setSaving('saving');
    try {
      const id = await saveDeck(uid, deck);
      if (place.from === 'seat') { window.dispatchEvent(new CustomEvent(SEAT_DECK_SAVED, { detail: { id } })); onClose(); return; }
      setFocus(id);
      if (back) back(); else openAt({ section: 'decks' });
    } catch { setSaving('failed'); }
  }

  const order = byCost(cards);
  const pool = cards[kind].filter(card => cost === null || (cost === '7+' ? card.cost >= 7 : card.cost === cost))
    .filter(card => !query.trim() || card.name.includes(query.trim()) || (card.effect ?? '').includes(query.trim()) || card.name.toLowerCase().includes(query.trim().toLowerCase()));
  const fruitsShown = [...new Set(pool.map(card => card.fruit))];
  const inDeck = deck[kind], sorted = [...inDeck].sort(order), freshAt = arrived ? sorted.lastIndexOf(arrived) : -1;
  const short = inDeck.length < DECK_LIMITS[kind];
  const count = (id: string) => inDeck.filter(card => card === id).length;

  return <div ref={root} className={styles.editor} onContextMenu={event => event.preventDefault()}>
    <div className={styles.tabRow}>
      <div className={styles.tabs} role="tablist" aria-label={t('デッキの種類')}>
        {(['yojo', 'sweet'] as const).map(option => <button key={option} type="button" role="tab" aria-selected={kind === option} onClick={() => { setKind(option); setCost(null); setArrived(null); }}>{option === 'yojo' ? t('幼女') : t('お菓子')}</button>)}
      </div>
      <label className={styles.nameField}><GameIcon name="pen" /><input value={deck.name} maxLength={200} aria-label={t('デッキの名前')} placeholder={t('無名のデッキ')} onChange={event => setDeck({ ...deck, name: event.target.value })} /></label>
      <button type="button" className={styles.softButton} onClick={() => setConfirming(true)}><GameIcon name="eye" />{t('確認')}</button>
      <OrnateFrame as="button" size="line" className={styles.mainButton} disabled={saving === 'saving'} onClick={() => void save()}><GameIcon name="check" /><span data-ui-title>{saving === 'saving' ? t('保存中…') : t('保存')}</span></OrnateFrame>
    </div>
    {saving === 'failed' && <p className={styles.error} role="alert">{t('保存できませんでした')}</p>}
    <div ref={panel} className={styles.editorPanel} role="tabpanel">
      <div className={styles.pool} data-drop="pool" data-over={drag.over === 'pool' || undefined}>
        <div className={styles.poolBar}>
          <span className={styles.costs} role="group" aria-label={t('コスト')}>{COSTS.map(value => <button key={value} type="button" aria-pressed={cost === value} onClick={() => setCost(current => current === value ? null : value)}>{value}</button>)}</span>
          <label className={styles.search}><GameIcon name="search" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('なまえ・効果')} aria-label={t('カードを探す')} /></label>
        </div>
        <div className={styles.poolGrid}>
          {fruitsShown.map(fruit => <section key={fruit} className={styles.fruitGroup} aria-label={fruitLabel(fruit)}>
            <h4 className={styles.fruitHead}><i className={styles.dot} style={{ background: fruitColors[fruit as keyof typeof fruitColors] }} />{fruitLabel(fruit)}</h4>
            <div className={styles.poolCards}>{pool.filter(card => card.fruit === fruit).sort((a, b) => order(a.id, b.id)).map(card => {
              const n = count(card.id), full = !canAddCard(deck, card.id);
              return <div key={card.id} className={styles.poolCard} data-in={n > 0 || undefined} data-full={full || undefined}>
                <button type="button" className={styles.cardButton} aria-label={`${card.name}${t('を入れる')}`} disabled={full && !n} data-drag="pool"
                  onPointerDown={event => drag.start(event, card.id, 'pool')} onClick={event => { if (!drag.consumeClick()) add(card.id, event.currentTarget); }}>
                  <CardImage card={card} sizes="150px" />
                </button>
                <span className={styles.pips} aria-label={`${n}`}>{Array.from({ length: n }, (_, index) => <i key={index} />)}</span>
                <button type="button" className={styles.zoom} aria-label={`${card.name}${t('を大きく見る')}`} onClick={event => { zoomFrom.current = event.currentTarget; setZoomed(card); }}><GameIcon name="eye" /></button>
              </div>;
            })}</div>
          </section>)}
          {!pool.length && <p className={styles.loading}>{t('見つかりませんでした')}</p>}
        </div>
      </div>
      <aside className={styles.deckColumn} data-drop="deck" data-over={drag.over === 'deck' || undefined} aria-label={kind === 'yojo' ? t('幼女デッキ') : t('お菓子デッキ')}>
        <div className={styles.deckHead} data-deck-head>
          <span className={styles.deckCount} data-short={short || undefined}>{inDeck.length}<small> / {DECK_LIMITS[kind]}</small></span>
          <CostCurve ids={inDeck} cards={cards} kind={kind} height={18} />
        </div>
        <div ref={slotsRef} className={styles.slots} data-kind={kind}>
          {Array.from({ length: DECK_LIMITS[kind] }, (_, index) => {
            const id = sorted[index];
            if (!id) return <span key={`empty-${index}`} className={styles.emptySlot} data-empty={index === sorted.length || undefined} />;
            const card = cards.byId.get(id);
            return <button key={`${id}-${index}`} type="button" className={styles.slot} data-arrive={index === freshAt || undefined} data-drag="deck" aria-label={`${card?.name ?? id}${t('をぬく')}`}
              onPointerDown={event => drag.start(event, id, 'deck')} onClick={() => { if (!drag.consumeClick()) remove(id); }}>
              <CardImage card={card} sizes="150px" />
            </button>;
          })}
        </div>
      </aside>
    </div>
    {drag.ghost}
    {zoomed && <CardDetail card={zoomed} details onClose={() => setZoomed(null)} returnFocusRef={zoomFrom}
      canAddToDeck={card => canAddCard(deck, card.id)} onAddToDeck={card => add(card.id)} isInDeck={count(zoomed.id) > 0} handleCardRemove={card => remove(card.id)} />}
    {confirming && <DeckConfirm deck={{ ...deck, playable: deck.playable }} uid={uid} cards={cards} onClose={() => setConfirming(false)} />}
  </div>;
}

/** The card picture flies from where it was chosen to the deck (moves only; no turning). */
function fly(from: HTMLElement, to: Element | null, host: HTMLElement | null) {
  const picture = from.querySelector('img');
  if (!picture || !to || !host || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = host.getBoundingClientRect(), scale = box.width / host.offsetWidth || 1;
  const a = picture.getBoundingClientRect(), b = to.getBoundingClientRect();
  const copy = picture.cloneNode() as HTMLImageElement;
  copy.className = styles.flyer;
  Object.assign(copy.style, { left: `${(a.left - box.left) / scale}px`, top: `${(a.top - box.top) / scale}px`, width: `${a.width / scale}px`, height: `${a.height / scale}px` });
  host.appendChild(copy);
  const dx = (b.left - a.left) / scale, dy = (b.top - a.top) / scale, k = b.width / a.width || 1;
  copy.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: .6 }], { duration: 360, easing: 'cubic-bezier(.5, 0, .4, 1)' }).finished.finally(() => copy.remove());
}

/**
 * Dragging a card from the list onto the deck adds it; from the deck onto the list removes it. A mouse or pen
 * drags after a few pixels; a finger first holds the card a moment, so the list still scrolls under a swipe.
 */
function useCardDrag({ root, add, remove }: { root: React.RefObject<HTMLDivElement | null>; add: (id: string) => void; remove: (id: string) => void }) {
  const [ghost, setGhost] = useState<{ src: string; x: number; y: number; width: number; height: number } | null>(null);
  const [over, setOver] = useState<'pool' | 'deck' | null>(null);
  const state = useRef<{ id: string; from: 'pool' | 'deck'; x: number; y: number; dx: number; dy: number; width: number; height: number; src: string; active: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const clicked = useRef(false);
  const local = (clientX: number, clientY: number) => {
    const host = root.current!, box = host.getBoundingClientRect(), scale = box.width / host.offsetWidth || 1;
    return { x: (clientX - box.left) / scale, y: (clientY - box.top) / scale, scale };
  };
  const dropOf = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop as 'pool' | 'deck' | undefined;

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = state.current;
      if (!drag) return;
      if (!drag.active) {
        const far = Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6;
        if (!far) return;
        // A finger that moves before the hold has ended is scrolling the list.
        if (event.pointerType === 'touch' && drag.from === 'pool') { clearTimeout(drag.timer); state.current = null; return; }
        drag.active = true;
      }
      const point = local(event.clientX, event.clientY);
      setGhost({ src: drag.src, x: point.x - drag.dx, y: point.y - drag.dy, width: drag.width, height: drag.height });
      const target = dropOf(event.clientX, event.clientY);
      setOver(target && target !== drag.from ? target : null);
    };
    const end = (event: PointerEvent) => {
      const drag = state.current;
      state.current = null;
      if (!drag) return;
      clearTimeout(drag.timer);
      setGhost(null); setOver(null);
      if (!drag.active) return;
      clicked.current = true;
      const target = event.type === 'pointerup' ? dropOf(event.clientX, event.clientY) : undefined;
      if (drag.from === 'pool' && target === 'deck') add(drag.id);
      if (drag.from === 'deck' && target === 'pool') remove(drag.id);
    };
    // While a card is held, a finger does not scroll the list underneath.
    const hold = (event: TouchEvent) => { if (state.current?.active) event.preventDefault(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('touchmove', hold, { passive: false });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); window.removeEventListener('touchmove', hold); };
  });

  return {
    over,
    start(event: ReactPointerEvent<HTMLElement>, id: string, from: 'pool' | 'deck') {
      if (event.button !== 0 || !root.current) return;
      clicked.current = false;
      const picture = event.currentTarget.querySelector('img'), box = (picture ?? event.currentTarget).getBoundingClientRect();
      const point = local(event.clientX, event.clientY), corner = local(box.left, box.top);
      const drag = { id, from, x: event.clientX, y: event.clientY, dx: point.x - corner.x, dy: point.y - corner.y, width: box.width / point.scale, height: box.height / point.scale, src: picture?.currentSrc || picture?.src || '', active: false } as NonNullable<typeof state.current>;
      if (event.pointerType === 'touch' && from === 'pool') drag.timer = setTimeout(() => { if (state.current === drag) { drag.active = true; setGhost({ src: drag.src, x: corner.x, y: corner.y, width: drag.width, height: drag.height }); } }, 260);
      state.current = drag;
    },
    /** True once after a drag: the click that ends it is not also a tap. */
    consumeClick() { const was = clicked.current; clicked.current = false; return was; },
    // The picture already shown on the card: no second request or resizing.
    // eslint-disable-next-line @next/next/no-img-element
    ghost: ghost && <img className={styles.dragGhost} src={ghost.src} alt="" draggable={false} style={{ left: ghost.x, top: ghost.y, width: ghost.width, height: ghost.height } as CSSProperties} />,
  };
}
