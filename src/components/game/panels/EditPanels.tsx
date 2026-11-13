'use client';

// 盤面エディタ: what opens beside the board in edit mode when a unit, a hand card, a pile, a playable
// or the menu is tapped. Every change is one `board.edit(...)` (see core edit.ts) and shows at once.
import { useEffect, useState } from 'react';
import { attackOf, costOf, cpuLevels, cpuProfiles, decodePosition, encodePosition, exSkillInfo, extendedPlayables, hpOf, keywords, other, playableMp, playableSkills, playableView } from '@pplale/game-core';
import type { BoardEdit, CpuLevel, ExSkillId, Keyword, Side } from '@pplale/game-core';
import type { Fruit } from '@pplale/game-core/room';
import { fruitNames, fruits } from '@pplale/game-core/room';
import { demoDeck, displayCards, gameCatalog } from '@/lib/game/catalog';
import { deleteSaved, emptyPosition, loadSaved, savePosition } from '@/lib/game/positions';
import type { SavedPosition } from '@/lib/game/positions';
import { EDITOR_PATH } from '@/lib/game/sessionStore';
import type { ZoneKind } from '../BoardPieces';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import { keywordNames } from '../labels';
import styles from '../BoardEmulator.module.css';
import { useI18n } from '@/i18n/LocaleProvider';
import { useCardName } from '@/i18n/useCardName';

/** The words of the panels in the reader's language: card names, 「あなた / 相手」 and the fruits. */
function useWords() {
  const i18n = useI18n(), cardName = useCardName();
  return {
    ...i18n,
    nameOf: (cardId: string) => cardName(cardId, displayCards[cardId]?.name ?? cardId),
    who: (side: Side) => i18n.t(side === 0 ? 'あなた' : '相手'),
    fruitName: (fruit: Fruit) => i18n.locale === 'en' ? i18n.fruitLabel(fruit) : fruitNames[fruit],
  };
}
/** Every playable the engine can play: the six normal ones, then the 拡張プレイアブル (ExP). */
const playables = Object.keys(playableSkills);

/** − value ＋ for one number. */
function Stepper({ label, value, onChange, note }: { label: string; value: number; onChange: (value: number) => void; note?: string }) {
  const { t } = useI18n();
  return <div className={styles.stepper} role="group" aria-label={label}>
    <span>{label}{note && <small>{note}</small>}</span>
    <button onClick={() => onChange(value - 1)} aria-label={t('{name}を{n}減らす', { name: label, n: 1 })}>−</button>
    <b>{value}</b>
    <button onClick={() => onChange(value + 1)} aria-label={t('{name}を{n}増やす', { name: label, n: 1 })}>＋</button>
  </div>;
}
function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return <button className={styles.editSwitch} aria-pressed={on} onClick={() => onChange(!on)}>{label}</button>;
}
function Pair({ label, value, onChange }: { label: string; value: Side; onChange: (side: Side) => void }) {
  const { who } = useWords();
  return <div className={styles.editPair} role="group" aria-label={label}><span>{label}</span>
    {([0, 1] as Side[]).map(side => <button key={side} aria-pressed={value === side} onClick={() => onChange(side)}>{who(side)}</button>)}
  </div>;
}

/** A unit on the field: its numbers, abilities and state this turn. */
export function EditUnitPanel({ uid }: { uid: string }) {
  const { game, edit, setPanel } = useBoardContext();
  const { t, nameOf, fruitName } = useWords();
  const card = game.cards[uid];
  if (!card || card.slot === null) return null;
  const change = (values: Omit<Extract<BoardEdit, { type: 'unit' }>, 'type' | 'uid'>) => edit({ type: 'unit', uid, ...values });
  const toggle = (keyword: Keyword) => change({ keywords: card.keywords.includes(keyword) ? card.keywords.filter(k => k !== keyword) : [...card.keywords, keyword] });
  return <>
    <h2>{nameOf(card.cardId)}</h2>
    <div className={styles.editCard}><GameCard id={card.cardId} instance={card} abilities sizes="200px" /></div>
    <p className={styles.editNow}>{t('攻撃 {attack} / 残りHP {hp}', { attack: attackOf(card, gameCatalog), hp: hpOf(card, gameCatalog) })}</p>
    <Stepper label={t('攻撃の変化')} value={card.attackBonus} onChange={attack => change({ attack })} />
    <Stepper label={t('HPの変化')} value={card.hpBonus} onChange={hp => change({ hp })} />
    <Stepper label={t('受けたダメージ')} value={card.damage} onChange={damage => change({ damage })} />
    <h3>{t('能力')}</h3>
    <div className={styles.editChips}>{keywords.map(k => <Switch key={k} label={t(keywordNames[k])} on={card.keywords.includes(k)} onChange={() => toggle(k)} />)}</div>
    {card.keywords.includes('evade') && <Stepper label={t('おにごっこ成功条件（1d6≧）')} value={card.evasion ?? 5} onChange={evasion => change({ evasion })} />}
    {card.keywords.includes('hide') && <Switch label={t('かくれんぼ有効中')} on={!!card.hiding} onChange={hiding => change({ hiding })} />}
    <Switch label={t('カード効果を失っている')} on={!!card.silenced} onChange={silenced => change({ silenced })} />
    <h3>{t('追加のフルーツタイプ')}</h3>
    <div className={styles.editChips}>{fruits.map(fruit => <Switch key={fruit} label={fruitName(fruit)} on={!!card.fruitTypes?.includes(fruit)} onChange={on => change({ fruitTypes: on ? [...(card.fruitTypes ?? []), fruit] : (card.fruitTypes ?? []).filter(f => f !== fruit) })} />)}</div>
    <h3>{t('このターンの状態')}</h3>
    <div className={styles.editChips}>
      <Switch label={t('出たばかり')} on={card.entered === game.turn} onChange={fresh => change({ fresh })} />
      <Switch label={t('攻撃済み')} on={card.exhausted} onChange={acted => change({ acted })} />
      <Switch label={t('バリア（うぃまる）')} on={card.shield} onChange={shield => change({ shield })} />
      <Switch label={t('直前の相手ターンに食べた')} on={card.ateOn === game.turn - 1} onChange={ate => change({ ate })} />
    </div>
    <Stepper label={t('行動不能の残りターン')} note={t('今のターンを含む。0でなし')} value={card.immobileUntil === undefined ? 0 : Math.max(0, card.immobileUntil - game.turn + 1)}
      onChange={immobileTurns => change({ immobileTurns: Math.max(0, immobileTurns) })} />
    <div className={styles.editActions}>
      <button onClick={() => { edit({ type: 'toHand', uid }); setPanel(null); }}>{t('手札に戻す')}</button>
      <button className={styles.menuLeave} onClick={() => { edit({ type: 'remove', uid }); setPanel(null); }}>{t('場から外す')}</button>
    </div>
  </>;
}

export function EditHandPanel({ uid }: { uid: string }) {
  const { game, edit, setPanel } = useBoardContext();
  const card = game.cards[uid];
  const owner = ([0, 1] as Side[]).find(side => game.players[side].hand.includes(uid));
  const { t, nameOf, who, fruitName } = useWords();
  if (!card || owner === undefined) return null;
  return <>
    <h2>{t('{owner}の手札：{name}', { owner: who(owner), name: nameOf(card.cardId) })}</h2>
    <div className={styles.editCard}><GameCard id={card.cardId} instance={card} currentCost={costOf(game, uid, gameCatalog, owner)} sizes="200px" /></div>
    <Stepper label={t('コストの変化')} value={card.costDelta} onChange={cost => edit({ type: 'handCard', uid, cost })} />
    <div className={styles.editChips}><Switch label={t('公開している')} on={card.revealed} onChange={revealed => edit({ type: 'handCard', uid, revealed })} /></div>
    <h3>{t('追加のフルーツタイプ')}</h3>
    <div className={styles.editChips}>{fruits.map(fruit => <Switch key={fruit} label={fruitName(fruit)} on={!!card.fruitTypes?.includes(fruit)} onChange={on => edit({ type: 'handCard', uid, fruitTypes: on ? [...(card.fruitTypes ?? []), fruit] : (card.fruitTypes ?? []).filter(f => f !== fruit) })} />)}</div>
    <div className={styles.editActions}>
      <button className={styles.menuLeave} onClick={() => { edit({ type: 'remove', uid }); setPanel(null); }}>{t('手札から外す')}</button>
    </div>
  </>;
}

const pileNames: Record<ZoneKind, string> = { yojo: '幼女デッキ', sweet: 'お菓子デッキ', nap: 'お昼寝場所', exile: '除外カード' };
/** A deck (top first), the nap or the exile: add, remove, and for decks choose what is drawn next. */
export function EditPilePanel({ side, kind }: { side: Side; kind: ZoneKind }) {
  const { game, edit, setPicking } = useBoardContext();
  const cards = game.players[side][kind], deck = kind === 'yojo' || kind === 'sweet';
  const { t, nameOf, who } = useWords();
  return <>
    <h2>{t('{owner}の{zone}（{n}枚）', { owner: who(side), zone: t(pileNames[kind]), n: cards.length })}</h2>
    {deck && <p className={styles.editNote}>{t('左上が一番上（次に引くカード）です。')}</p>}
    <div className={styles.editActions}>
      <button onClick={() => setPicking({ side, zone: kind })}>{t('＋ カードを加える')}</button>
      {deck && <button onClick={() => edit({ type: 'deck', side, kind, cardIds: [...demoDeck[kind]] })}>{t('おためしデッキを入れる')}</button>}
      {deck && cards.length > 0 && <button className={styles.menuLeave} onClick={() => edit({ type: 'deck', side, kind, cardIds: [] })}>{t('空にする')}</button>}
    </div>
    <ul className={styles.editPile}>{cards.map((uid, index) => <li key={uid}>
      <span className={styles.editPileCard}><GameCard id={game.cards[uid].cardId} sizes="120px" /></span>
      {deck && (index > 0
        ? <button onClick={() => edit({ type: 'toTop', uid })} aria-label={t('{name}を一番上へ', { name: nameOf(game.cards[uid].cardId) })}>{t('一番上へ')}</button>
        : <span className={styles.editPileTop}>{t('一番上')}</span>)}
      <button className={styles.menuLeave} onClick={() => edit({ type: 'remove', uid })} aria-label={t('{name}を外す', { name: nameOf(game.cards[uid].cardId) })}>{t('外す')}</button>
    </li>)}</ul>
  </>;
}

/** A player: playable, points, turn count and PP, skill uses, and what was played earlier. */
export function EditPlayerPanel({ side }: { side: Side }) {
  const { game, edit, setPicking } = useBoardContext();
  const p = game.players[side], { skills } = playableView(game, side, gameCatalog), mp = playableMp[p.playable];
  const change = (values: Omit<Extract<BoardEdit, { type: 'player' }>, 'type' | 'side'>) => edit({ type: 'player', side, ...values });
  const { t, gameText, nameOf, who } = useWords();
  return <>
    <h2>{who(side)}</h2>
    <div className={styles.editPlayables} role="group" aria-label={t('プレイアブル')}>{playables.map(id =>
      <button key={id} aria-pressed={p.playable === id} aria-label={extendedPlayables.includes(id) ? t('{name}（拡張）', { name: nameOf(id) }) : nameOf(id)} data-extended={extendedPlayables.includes(id) || undefined}
        onClick={() => change({ playable: id })}><GameCard id={id} sizes="80px" /></button>)}
    </div>
    <Stepper label={t('お菓子ポイント')} value={p.points} onChange={points => change({ points })} />
    <Stepper label={t('お菓子の最大値')} value={p.maxPoints} onChange={maxPoints => change({ maxPoints })} />
    {/* Like the start of a turn, the PP is filled to the new maximum; 今のPP below lowers it. */}
    <Stepper label={t('ターン数')} note={t('自分の何ターン目か')} value={p.turns} onChange={turns => change({ turns, pp: turns + p.ppBonus })} />
    <Stepper label={t('最大PP')} note={t('ターン数＋追加分')} value={p.turns + p.ppBonus} onChange={max => change({ ppBonus: max - p.turns, pp: max })} />
    <Stepper label={t('今のPP')} value={p.pp} onChange={pp => change({ pp })} />
    {mp && <Stepper label="MP" note={t('{n}まで', { n: mp.max })} value={p.mp ?? 0} onChange={value => change({ mp: value })} />}
    <h3>{t('スキルの残り回数')}</h3>
    {/* A skill without a use limit (しゅれい) has nothing to count; a limit a passive raised (いのまこ) is the one shown. */}
    {skills.map((skill, index) => skill.limit === null
      ? <p key={skill.name} className={styles.editNote}>{t('{name}：回数制限なし', { name: gameText(skill.name) })}</p>
      : <Stepper key={skill.name} label={gameText(skill.name)} note={t('{n}回まで', { n: skill.limit })} value={p.skills[index]}
        onChange={left => change({ skills: p.skills.map((uses, i) => i === index ? left : uses) })} />)}
    <h3>{t('スキルを使った履歴')}</h3>
    <div className={styles.editChips}>{skills.map((skill, index) => <Switch key={skill.name} label={t('{name}を使用済み', { name: gameText(skill.name) })} on={!!p.skillHistory?.includes(index)} onChange={on => change({ skillHistory: on ? [...(p.skillHistory ?? []), index] : (p.skillHistory ?? []).filter(i => i !== index) })} />)}</div>
    <h3>{t('Exスキル')}</h3>
    {(Object.keys(exSkillInfo) as ExSkillId[]).map(id => <div key={id}>
      <Switch label={gameText(exSkillInfo[id].name)} on={!!p.exSkills?.[id]} onChange={on => {
        const exSkills = { ...p.exSkills };
        if (on) exSkills[id] = { uses: id === 'healing' ? 3 : id === 'abyss' ? 2 : 1 };
        else delete exSkills[id];
        change({ exSkills });
      }} />
      {p.exSkills?.[id] && !['alice', 'dagger', 'smoke'].includes(id) && <Stepper label={t('{name}の残り回数', { name: gameText(exSkillInfo[id].name) })} value={p.exSkills[id]!.uses} onChange={uses => change({ exSkills: { ...p.exSkills, [id]: { ...p.exSkills![id], uses: Math.max(0, uses) } } })} />}
    </div>)}
    <h3>{t('カードのカウント')}</h3>
    <Stepper label={t('アイスカウント')} value={p.ice ?? 0} onChange={ice => change({ ice })} />
    <Stepper label={t('どんぐりカウント')} value={p.acorns ?? 0} onChange={acorns => change({ acorns })} />
    <Stepper label={t('場を離れたもちだの数')} value={p.mochidaLeft ?? 0} onChange={mochidaLeft => change({ mochidaLeft })} />
    <Stepper label={t('次の通常ドローをスキップ')} value={p.skipDraw ?? 0} onChange={skipDraw => change({ skipDraw })} />
    <h3>{t('お菓子の効果')}</h3>
    <div className={styles.editChips}><Switch label={t('パンケーキの守り')} on={p.shield} onChange={shield => change({ shield })} /></div>
    <Stepper label={t('おいしくなる呪文')} note={t('次のお菓子に重ねた回数')} value={p.sweetBoost} onChange={sweetBoost => change({ sweetBoost })} />
    <h3>{t('このゲームで手札から出したカード')}</h3>
    <p className={styles.editNote}>{t('うゆち・カフェオレ・ケーキ・ソーダなど、それまでに出したカードで効果が変わるもの用です。')}</p>
    <div className={styles.editChips}>
      {p.played.map((cardId, index) => <button key={index} className={styles.editSwitch} title={t('外す')}
        onClick={() => edit({ type: 'played', side, cardIds: p.played.filter((_, i) => i !== index) })}>{nameOf(cardId)} ×</button>)}
      <button className={styles.editSwitch} onClick={() => setPicking({ side, zone: 'played' })}>{t('＋ 加える')}</button>
    </div>
  </>;
}

/** Whose turn, the board's name, sharing as a code, saving, and starting over. */
export function EditMenuPanel() {
  const { game, edit, session, position, canUndo, undo, setPanel, leave, animations } = useBoardContext();
  const [saved, setSaved] = useState<SavedPosition[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const { t } = useI18n();
  useEffect(() => { setSaved(loadSaved()); }, []);
  const current = () => session.currentPosition?.() ?? emptyPosition();
  async function copy(text: string, done: string) {
    setCode(text);
    try {
      await navigator.clipboard.writeText(text);
      setMessage(done);
    } catch { setMessage(t('コピーできませんでした。下の欄から選んでコピーしてください')); }
  }
  function load() {
    const found = decodePosition(code);
    if (!found) return setMessage(t('盤面のコードが見つかりません（PPL1. から始まる文字列です）'));
    animations.skipNext();
    session.replaceBoard(found);
    setMessage(t('コードの盤面を開きました'));
  }
  return <>
    <h2>{t('盤面エディタ')}</h2>
    <div className={styles.editMenu}>
      <label className={styles.editField}><span>{t('盤面の名前')}</span>
        <input value={position?.title ?? ''} maxLength={80} placeholder={t('例：とここ＋ストラで勝てる？')} onChange={event => session.setTitle(event.target.value)} />
      </label>
      <Pair label={t('手番')} value={game.active} onChange={active => edit({ type: 'turn', active })} />
      <Pair label={t('先攻')} value={game.rules.firstPlayer} onChange={first => edit({ type: 'turn', first })} />
      <div className={styles.menuList}>
        <button onClick={() => setPanel({ type: 'play' })}>{t('この盤面で遊ぶ')}</button>
        <button onClick={() => setPanel({ type: 'analysis' })}>{t('最善手を調べる')}</button>
        <button disabled={!canUndo} onClick={undo}>{t('編集を一つ戻す')}</button>
        <button onClick={() => void copy(encodePosition(current()), t('盤面のコードをコピーしました'))}>{t('コードをコピー')}</button>
        <button onClick={() => void copy(`${location.origin}${EDITOR_PATH}?${encodePosition(current())}`, t('盤面のリンクをコピーしました'))}>{t('リンクをコピー')}</button>
        <button onClick={() => { setSaved(savePosition(current())); setMessage(t('このブラウザに保存しました')); }}>{t('このブラウザに保存')}</button>
      </div>
      <label className={styles.editField}><span>{t('盤面のコード（貼り付けて開けます）')}</span>
        <textarea value={code} rows={3} spellCheck={false} onChange={event => setCode(event.target.value)} onFocus={event => event.target.select()} />
      </label>
      <div className={styles.menuList}><button disabled={!code.trim()} onClick={load}>{t('コードの盤面を開く')}</button></div>
      {message && <p className={styles.editMessage} role="status">{message}</p>}
      {saved.length > 0 && <>
        <h3>{t('保存した盤面')}</h3>
        <ul className={styles.editSaved}>{saved.map(s => <li key={s.id}>
          <button onClick={() => { animations.skipNext(); session.replaceBoard(s.position); setMessage(t('「{title}」を開きました', { title: t(s.position.title ?? '') })); }}>{t(s.position.title ?? '')}</button>
          <button className={styles.menuLeave} aria-label={t('{title}を削除', { title: t(s.position.title ?? '') })} onClick={() => setSaved(deleteSaved(s.id))}>{t('削除')}</button>
        </li>)}</ul>
      </>}
      <div className={styles.menuList}>
        <button className={styles.menuLeave} onClick={() => { animations.skipNext(); session.replaceBoard(emptyPosition()); setMessage(t('盤面を空にしました')); }}>{t('盤面を空にする')}</button>
        <button className={styles.menuLeave} onClick={leave}>{t('エディタをやめる')}</button>
      </div>
    </div>
  </>;
}

/** Leaves edit mode and plays from the board: both sides by hand, or the far side by a CPU. */
export function PlayPanel() {
  const { game, session, setPanel } = useBoardContext();
  const [level, setLevel] = useState<CpuLevel>('master');
  const [errors, setErrors] = useState<string[]>([]);
  const { t, gameText, who } = useWords();
  const start = (as: 'hotseat' | 'cpu') => {
    const problems = session.startPlay(as, level);
    if (problems.length) setErrors(problems);
    else setPanel(null);
  };
  return <>
    <h2>{t('この盤面で遊ぶ')}</h2>
    <p className={styles.editNote}>{t('{first}の番から始まります（{other}の番にするには、メニューの「手番」を変えます）。遊んでいる途中でも、メニューから編集に戻れます。', { first: who(game.active), other: who(other(game.active)) })}</p>
    {errors.length > 0 && <ul className={styles.editErrors} role="alert">{errors.map(e => <li key={e}>{gameText(e)}</li>)}</ul>}
    <div className={styles.menuList}>
      <button onClick={() => start('hotseat')}>{t('両側を自分で操作する')}</button>
      <button onClick={() => start('cpu')}>{t('相手をCPUにする（{level}）', { level: gameText(cpuProfiles[level].name) })}</button>
    </div>
    <div className={styles.editChips} role="group" aria-label={t('CPUの強さ')}>{cpuLevels.map(id =>
      <Switch key={id} label={gameText(cpuProfiles[id].name)} on={level === id} onChange={() => setLevel(id)} />)}
    </div>
  </>;
}
