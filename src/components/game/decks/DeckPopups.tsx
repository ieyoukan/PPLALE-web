'use client';

// デッキ一覧から開くポップアップ：すぐ使う（DeckQuick）、確認・共有（DeckConfirm）、新しく作る（NewDeckSheet）。
// どれも×か外側で閉じ、確認・共有は開いた元（DeckQuickか編成）へ戻る。
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type { MatchRules } from '@pplale/game-core';
import { useI18n } from '@/i18n/LocaleProvider';
import { DECK_LIMITS, deckCode, deckProblems, deleteDeck, parseDeckCode, saveDeck } from '@/lib/game/deckStore';
import type { DeckDraft, StoredDeck } from '@/lib/game/deckStore';
import { DeckCardLayout } from '@/components/shared/deck/DeckCardLayout';
import CardDetail from '@/components/shared/card/CardDetail';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import type { CardInfo } from '@/types/card';
import { CardBack, CardImage, CostCurve, FruitChips, fruitsOfDeck } from './deckParts';
import type { Cards } from './deckParts';
import styles from './Decks.module.css';

/**
 * Over the whole launchpad (drawn into its backdrop, inside the scaled stage): framed, closed by its × (the
 * same as the room's sheets), the backdrop or Escape. Focus stays inside; the launchpad's own keys wait.
 */
export function DeckDialog({ label, onClose, className, children }: { label: string; onClose: () => void; className?: string; children: ReactNode }) {
  const { t } = useI18n();
  const panel = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.querySelector<HTMLElement>('[data-launchpad]')); }, []);
  useEffect(() => {
    if (!host) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('[data-autofocus], button, input')?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, [host]);
  if (!host) return null;
  return createPortal(<div className={styles.backdrop} onClick={event => { event.stopPropagation(); onClose(); }} data-plaza-sheet onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') {
      const focusable = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input') ?? []), first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <OrnateFrame ref={panel} className={`${styles.dialog} ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={label} onClick={event => event.stopPropagation()}>
      <button type="button" className={styles.close} onClick={onClose} aria-label={t('閉じる')}><GameIcon name="close" /></button>
      {children}
    </OrnateFrame>
  </div>, host);
}

function useCopied() {
  const [copied, setCopied] = useState(''), [failed, setFailed] = useState(false);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(''), 2000); return () => clearTimeout(timer); }, [copied]);
  const copy = (key: string, text: string) => navigator.clipboard.writeText(text).then(() => { setCopied(key); setFailed(false); }, () => setFailed(true));
  return { copied, failed, copy };
}

/**
 * For a match or VRChat, at once: the deck codes to copy, its playable (changed here, not in the editor),
 * its name, its costs, and deleting it. 編成する opens the editor; 確認・共有 the whole deck.
 */
export function DeckQuick({ deck, uid, cards, rules, onEdit, onConfirm, onClose, onDeleted }: {
  deck: StoredDeck; uid: string | null; cards: Cards; rules?: MatchRules;
  onEdit: () => void; onConfirm: () => void; onClose: () => void; onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(deck.name), [choosing, setChoosing] = useState(false);
  const [deleting, setDeleting] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const { copied, failed, copy } = useCopied();
  const save = (change: Partial<DeckDraft>) => {
    setBusy(true); setError('');
    saveDeck(uid, { ...deck, ...change }).catch(() => setError(t('保存できませんでした'))).finally(() => setBusy(false));
  };
  const rename = () => { if (name.trim() !== deck.name) save({ name }); };
  const problems = deckProblems(deck, rules), complete = deck.yojo.length === DECK_LIMITS.yojo && deck.sweet.length === DECK_LIMITS.sweet && !!deck.playable;
  const playable = deck.playable ? cards.byId.get(deck.playable) : undefined;
  const codeRow = (key: 'yojo' | 'sweet', label: string) => {
    const code = deckCode(deck[key]), short = deck[key].length < DECK_LIMITS[key];
    return <div className={styles.codeRow}>
      <span className={styles.codeLabel} data-kind={key}><i />{label}<small data-short={short || undefined}>{deck[key].length}/{DECK_LIMITS[key]}</small></span>
      <code>{code || '—'}</code>
      <button type="button" className={styles.softButton} data-done={copied === key || undefined} disabled={!code} onClick={() => void copy(key, code)}><GameIcon name={copied === key ? 'check' : 'link'} />{copied === key ? t('コピーしました') : t('コピー')}</button>
    </div>;
  };
  return <DeckDialog label={deck.name || t('無名のデッキ')} onClose={onClose} className={styles.quick}>
    <div className={styles.quickPlayable}>
      <button type="button" className={styles.playableButton} aria-expanded={choosing} onClick={() => setChoosing(value => !value)} aria-label={t('プレイアブルを変える')}>
        {playable ? <CardImage card={playable} sizes="220px" eager /> : <span className={styles.emptyCard}><GameIcon name="plus" /></span>}
        <span className={styles.swap}><GameIcon name="refresh" />{t('変える')}</span>
      </button>
    </div>
    <div className={styles.quickMain}>
      <label className={styles.nameField}><GameIcon name="pen" /><input value={name} maxLength={200} aria-label={t('デッキの名前')} placeholder={t('無名のデッキ')} onChange={event => setName(event.target.value)} onBlur={rename} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur(); }} /></label>
      <div className={styles.quickTags}>
        <FruitChips fruits={fruitsOfDeck([...deck.yojo, ...deck.sweet], cards)} />
        {rules && complete && <span className={problems.length ? styles.misfits : styles.fits}>{problems.length ? t('このルーム×') : <><GameIcon name="check" />{t('このルームOK')}</>}</span>}
      </div>
      {choosing ? <div className={styles.playables} role="group" aria-label={t('プレイアブルを選ぶ')}>
        {cards.playable.map(card => <button key={card.id} type="button" aria-pressed={card.id === deck.playable} disabled={busy} onClick={() => { setChoosing(false); if (card.id !== deck.playable) save({ playable: card.id }); }} aria-label={card.name}>
          <CardImage card={card} sizes="130px" />{card.version === 'beta' && <span className={styles.exp}>ExP</span>}
        </button>)}
      </div> : <>
        {codeRow('yojo', t('幼女デッキ'))}
        {codeRow('sweet', t('お菓子デッキ'))}
        <div className={styles.quickCurves}>
          <div><small className={styles.curveLabel} data-kind="yojo"><i />{t('幼女のコスト')}</small><CostCurve ids={deck.yojo} cards={cards} kind="yojo" /></div>
          <div><small className={styles.curveLabel} data-kind="sweet"><i />{t('お菓子のコスト')}</small><CostCurve ids={deck.sweet} cards={cards} kind="sweet" /></div>
        </div>
      </>}
      {(error || failed) && <p className={styles.error} role="alert">{error || t('コピーできませんでした')}</p>}
      <div className={styles.quickActions}>
        <OrnateFrame as="button" size="line" className={styles.mainButton} onClick={onEdit} data-autofocus><GameIcon name="cards" /><span data-ui-title>{t('編成する')}</span></OrnateFrame>
        <button type="button" className={styles.softButton} onClick={onConfirm}><GameIcon name="eye" />{t('確認・共有')}</button>
        {deleting ? <span className={styles.confirmDelete} role="group" aria-label={t('削除の確認')}>{t('消しますか？')}
          <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => { setBusy(true); deleteDeck(uid, deck.id).then(onDeleted, () => { setError(t('削除できませんでした')); setBusy(false); }); }}>{t('消す')}</button>
          <button type="button" className={styles.softButton} onClick={() => setDeleting(false)}>{t('やめる')}</button>
        </span> : <button type="button" className={`${styles.softButton} ${styles.deleteButton}`} onClick={() => setDeleting(true)}><GameIcon name="close" />{t('削除')}</button>}
      </div>
    </div>
  </DeckDialog>;
}

/** The share link: a signed-in player's deck by its id; a guest's deck carries its cards (the site opens both). */
function shareUrl(deck: DeckDraft, uid: string | null) {
  const origin = window.location.origin;
  if (uid && deck.id) return `${origin}/deck/${uid}/${deck.id}`;
  const query = new URLSearchParams({ yojo: deck.yojo.join(','), sweet: deck.sweet.join(','), ...(deck.playable && { playable: deck.playable }) });
  return `${origin}/deck/local/${deck.id ?? 'shared'}?${query}`;
}

/** The whole deck as its OGP image lays it out; a card opens large with its text. Sharing: link, X, image and codes. */
export function DeckConfirm({ deck, uid, cards, onClose }: { deck: DeckDraft; uid: string | null; cards: Cards; onClose: () => void }) {
  const { t, locale } = useI18n();
  const [card, setCard] = useState<CardInfo | null>(null), [imaging, setImaging] = useState(false);
  const trigger = useRef<HTMLElement | null>(null), titleId = useId();
  const { copied, failed, copy } = useCopied();
  const title = deck.name || t('無名のデッキ');
  const codes = () => [`${t('幼女デッキ')}: ${deckCode(deck.yojo)}`, `${t('お菓子デッキ')}: ${deckCode(deck.sweet)}`, ...(deck.playable ? [`${t('プレイアブル')}: ${deck.playable.replace(/\D/g, '')}`] : [])].join('\n');
  const post = () => `https://x.com/intent/post?${new URLSearchParams({ text: locale === 'ja' ? `ぷぷりえーるのデッキ「${title}」\n#ぷぷりえーる` : `My PPLALE deck "${title}"\n#ぷぷりえーる`, url: shareUrl(deck, uid) })}`;
  const image = async () => {
    setImaging(true);
    try {
      const { generateDeckImageDataUrl } = await import('@/components/deck/DeckImagePreview');
      const of = (id: string) => cards.byId.get(id);
      const url = await generateDeckImageDataUrl(deck.yojo.map(of).filter(Boolean) as CardInfo[], deck.sweet.map(of).filter(Boolean) as CardInfo[], deck.playable ? of(deck.playable) ?? null : null);
      const link = document.createElement('a'); link.href = url; link.download = `${title}.png`; link.click();
    } finally { setImaging(false); }
  };
  return <DeckDialog label={title} onClose={onClose} className={styles.confirm}>
    <div className={styles.confirmImage} onContextMenu={event => event.preventDefault()}>
      <div className={styles.confirmLayout}>
        <DeckCardLayout deck={{ yojoDeckIds: deck.yojo, sweetDeckIds: deck.sweet, playableCardId: deck.playable }} label={title}
          imageOf={id => cards.byId.get(id)?.imageUrl} nameOf={id => cards.byId.get(id)?.name ?? id}
          onCardClick={(id, event) => { trigger.current = event.currentTarget; setCard(cards.byId.get(id) ?? null); }} />
        <span className={styles.hashtag} aria-hidden="true">#ぷぷりえーる</span>
      </div>
    </div>
    <div className={styles.shareBar}>
      <b id={titleId} data-ui-title>{title}</b>
      <span className={styles.shareButtons} role="group" aria-labelledby={titleId}>
        <button type="button" className={styles.softButton} data-done={copied === 'link' || undefined} onClick={() => void copy('link', shareUrl(deck, uid))}><GameIcon name={copied === 'link' ? 'check' : 'link'} />{t('リンク')}</button>
        <a className={styles.softButton} href={post()} target="_blank" rel="noopener noreferrer"><b className={styles.xMark}>𝕏</b>{t('ポスト')}</a>
        <button type="button" className={styles.softButton} disabled={imaging} onClick={() => void image()}><GameIcon name="cards" />{imaging ? t('画像生成中...') : t('画像')}</button>
        <button type="button" className={styles.softButton} data-done={copied === 'codes' || undefined} onClick={() => void copy('codes', codes())}><GameIcon name={copied === 'codes' ? 'check' : 'grid'} />{t('コード')}</button>
      </span>
    </div>
    {failed && <p className={styles.error} role="alert">{t('コピーできませんでした')}</p>}
    {card && <CardDetail card={card} details onClose={() => setCard(null)} isInDeck={false} returnFocusRef={trigger} />}
  </DeckDialog>;
}

/** How to start: empty, おまかせ (the room's rules), a deck code, or 2Pick (the site's draft, in another tab). No fruits to choose: the deck shows its own. */
export function NewDeckSheet({ onStart, onClose }: { onStart: (how: 'empty' | 'random' | DeckDraft) => void; onClose: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState<{ yojo: string; sweet: string; playable: string } | null>(null);
  if (code) {
    const yojo = parseDeckCode(code.yojo, 'yojo'), sweet = parseDeckCode(code.sweet, 'sweet'), playable = parseDeckCode(code.playable, 'playable')[0] ?? null;
    return <DeckDialog label={t('デッキコードから作る')} onClose={onClose} className={styles.newSheet}>
      <h3 data-ui-title className={styles.sheetTitle}>{t('デッキコードから作る')}</h3>
      <form className={styles.codeForm} onSubmit={event => { event.preventDefault(); onStart({ name: t('あたらしいデッキ'), yojo: yojo.slice(0, DECK_LIMITS.yojo), sweet: sweet.slice(0, DECK_LIMITS.sweet), playable }); }}>
        <label><span>{t('幼女デッキ')}<small>{yojo.length}/{DECK_LIMITS.yojo}</small></span><input value={code.yojo} onChange={event => setCode({ ...code, yojo: event.target.value })} placeholder="0,1,1,3,…" inputMode="numeric" data-autofocus /></label>
        <label><span>{t('お菓子デッキ')}<small>{sweet.length}/{DECK_LIMITS.sweet}</small></span><input value={code.sweet} onChange={event => setCode({ ...code, sweet: event.target.value })} placeholder="6,6,7,…" inputMode="numeric" /></label>
        <label><span>{t('プレイアブル')}</span><input value={code.playable} onChange={event => setCode({ ...code, playable: event.target.value })} placeholder="1" inputMode="numeric" /></label>
        <div className={styles.quickActions}>
          <button type="button" className={styles.softButton} onClick={() => setCode(null)}><GameIcon name="back" />{t('戻る')}</button>
          <OrnateFrame as="button" size="line" className={styles.mainButton} disabled={!yojo.length && !sweet.length}><GameIcon name="check" /><span data-ui-title>{t('読み込む')}</span></OrnateFrame>
        </div>
      </form>
    </DeckDialog>;
  }
  return <DeckDialog label={t('どこから作る？')} onClose={onClose} className={styles.newSheet}>
    <h3 data-ui-title className={styles.sheetTitle}>{t('どこから作る？')}</h3>
    <div className={styles.starts}>
      <button type="button" className={styles.start} onClick={() => onStart('empty')} data-autofocus><span className={styles.startArt}><span className={styles.dashedCard}><GameIcon name="plus" /></span></span><b data-ui-title>{t('からっぽ')}</b><small>{t('1枚ずつ選ぶ')}</small></button>
      <button type="button" className={styles.start} onClick={() => onStart('random')}><span className={styles.startArt}><CardBack /><GameIcon name="sparkle" className={styles.startGlyph} /></span><b data-ui-title>{t('おまかせ')}</b><small>{t('ルームのルールで自動')}</small></button>
      <button type="button" className={styles.start} onClick={() => setCode({ yojo: '', sweet: '', playable: '' })}><span className={styles.startArt}><span className={styles.dashedCard}><GameIcon name="link" /></span></span><b data-ui-title>{t('デッキコード')}</b><small>{t('貼りつけて読み込む')}</small></button>
      <a className={styles.start} href="/deck/2pick" target="_blank" rel="noopener"><span className={styles.startArt}><span className={styles.dashedCard}><GameIcon name="cards" /></span></span><b data-ui-title>2Pick</b><small>{t('2枚から選ぶ（別タブ）')}</small></a>
    </div>
  </DeckDialog>;
}
