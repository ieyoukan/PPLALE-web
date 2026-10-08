'use client';

// 盤面エディタ: what opens beside the board in edit mode when a unit, a hand card, a pile, a playable
// or the menu is tapped. Every change is one `board.edit(...)` (see core edit.ts) and shows at once.
import { useEffect, useState } from 'react';
import { attackOf, costOf, cpuLevels, cpuProfiles, decodePosition, encodePosition, hpOf, keywords, other, skillsFor } from '@pplale/game-core';
import type { CpuLevel, Keyword, Side } from '@pplale/game-core';
import { demoDeck, displayCards, gameCatalog } from '@/lib/game/catalog';
import { deleteSaved, emptyPosition, loadSaved, savePosition } from '@/lib/game/positions';
import type { SavedPosition } from '@/lib/game/positions';
import { EDITOR_PATH } from '@/lib/game/sessionStore';
import type { ZoneKind } from '../BoardPieces';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import { keywordNames } from '../labels';
import styles from '../BoardEmulator.module.css';

const nameOf = (cardId: string) => displayCards[cardId]?.name ?? cardId;
const who = (side: Side) => side === 0 ? 'あなた' : '相手';
const playables = ['p_0', 'p_1', 'p_2', 'p_3', 'p_4', 'p_5'];

/** − value ＋ for one number. */
function Stepper({ label, value, onChange, note }: { label: string; value: number; onChange: (value: number) => void; note?: string }) {
  return <div className={styles.stepper} role="group" aria-label={label}>
    <span>{label}{note && <small>{note}</small>}</span>
    <button onClick={() => onChange(value - 1)} aria-label={`${label}を1減らす`}>−</button>
    <b>{value}</b>
    <button onClick={() => onChange(value + 1)} aria-label={`${label}を1増やす`}>＋</button>
  </div>;
}
function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return <button className={styles.editSwitch} aria-pressed={on} onClick={() => onChange(!on)}>{label}</button>;
}
function Pair({ label, value, onChange }: { label: string; value: Side; onChange: (side: Side) => void }) {
  return <div className={styles.editPair} role="group" aria-label={label}><span>{label}</span>
    {([0, 1] as Side[]).map(side => <button key={side} aria-pressed={value === side} onClick={() => onChange(side)}>{who(side)}</button>)}
  </div>;
}

/** A unit on the field: its numbers, abilities and state this turn. */
export function EditUnitPanel({ uid }: { uid: string }) {
  const { game, edit, setPanel } = useBoardContext();
  const card = game.cards[uid];
  if (!card || card.slot === null) return null;
  const change = (values: { attack?: number; hp?: number; damage?: number; keywords?: Keyword[]; fresh?: boolean; acted?: boolean; shield?: boolean; ate?: boolean }) => edit({ type: 'unit', uid, ...values });
  const toggle = (keyword: Keyword) => change({ keywords: card.keywords.includes(keyword) ? card.keywords.filter(k => k !== keyword) : [...card.keywords, keyword] });
  return <>
    <h2>{nameOf(card.cardId)}</h2>
    <div className={styles.editCard}><GameCard id={card.cardId} instance={card} abilities sizes="200px" /></div>
    <p className={styles.editNow}>攻撃 {attackOf(card, gameCatalog)} / 残りHP {hpOf(card, gameCatalog)}</p>
    <Stepper label="攻撃の変化" value={card.attackBonus} onChange={attack => change({ attack })} />
    <Stepper label="HPの変化" value={card.hpBonus} onChange={hp => change({ hp })} />
    <Stepper label="受けたダメージ" value={card.damage} onChange={damage => change({ damage })} />
    <h3>能力</h3>
    <div className={styles.editChips}>{keywords.map(k => <Switch key={k} label={keywordNames[k]} on={card.keywords.includes(k)} onChange={() => toggle(k)} />)}</div>
    <h3>このターンの状態</h3>
    <div className={styles.editChips}>
      <Switch label="出たばかり" on={card.entered === game.turn} onChange={fresh => change({ fresh })} />
      <Switch label="攻撃済み" on={card.exhausted} onChange={acted => change({ acted })} />
      <Switch label="バリア（うぃまる）" on={card.shield} onChange={shield => change({ shield })} />
      <Switch label="直前の相手ターンに食べた" on={card.ateOn === game.turn - 1} onChange={ate => change({ ate })} />
    </div>
    <div className={styles.editActions}>
      <button onClick={() => { edit({ type: 'toHand', uid }); setPanel(null); }}>手札に戻す</button>
      <button className={styles.menuLeave} onClick={() => { edit({ type: 'remove', uid }); setPanel(null); }}>場から外す</button>
    </div>
  </>;
}

export function EditHandPanel({ uid }: { uid: string }) {
  const { game, edit, setPanel } = useBoardContext();
  const card = game.cards[uid];
  const owner = ([0, 1] as Side[]).find(side => game.players[side].hand.includes(uid));
  if (!card || owner === undefined) return null;
  return <>
    <h2>{who(owner)}の手札：{nameOf(card.cardId)}</h2>
    <div className={styles.editCard}><GameCard id={card.cardId} instance={card} currentCost={costOf(game, uid, gameCatalog, owner)} sizes="200px" /></div>
    <Stepper label="コストの変化" value={card.costDelta} onChange={cost => edit({ type: 'handCard', uid, cost })} />
    <div className={styles.editChips}><Switch label="公開している" on={card.revealed} onChange={revealed => edit({ type: 'handCard', uid, revealed })} /></div>
    <div className={styles.editActions}>
      <button className={styles.menuLeave} onClick={() => { edit({ type: 'remove', uid }); setPanel(null); }}>手札から外す</button>
    </div>
  </>;
}

const pileNames: Record<ZoneKind, string> = { yojo: '幼女デッキ', sweet: 'お菓子デッキ', nap: 'お昼寝場所', exile: '除外カード' };
/** A deck (top first), the nap or the exile: add, remove, and for decks choose what is drawn next. */
export function EditPilePanel({ side, kind }: { side: Side; kind: ZoneKind }) {
  const { game, edit, setPicking } = useBoardContext();
  const cards = game.players[side][kind], deck = kind === 'yojo' || kind === 'sweet';
  return <>
    <h2>{who(side)}の{pileNames[kind]}（{cards.length}枚）</h2>
    {deck && <p className={styles.editNote}>左上が一番上（次に引くカード）です。</p>}
    <div className={styles.editActions}>
      <button onClick={() => setPicking({ side, zone: kind })}>＋ カードを加える</button>
      {deck && <button onClick={() => edit({ type: 'deck', side, kind, cardIds: [...demoDeck[kind]] })}>おためしデッキを入れる</button>}
      {deck && cards.length > 0 && <button className={styles.menuLeave} onClick={() => edit({ type: 'deck', side, kind, cardIds: [] })}>空にする</button>}
    </div>
    <ul className={styles.editPile}>{cards.map((uid, index) => <li key={uid}>
      <span className={styles.editPileCard}><GameCard id={game.cards[uid].cardId} sizes="120px" /></span>
      {deck && (index > 0
        ? <button onClick={() => edit({ type: 'toTop', uid })} aria-label={`${nameOf(game.cards[uid].cardId)}を一番上へ`}>一番上へ</button>
        : <span className={styles.editPileTop}>一番上</span>)}
      <button className={styles.menuLeave} onClick={() => edit({ type: 'remove', uid })} aria-label={`${nameOf(game.cards[uid].cardId)}を外す`}>外す</button>
    </li>)}</ul>
  </>;
}

/** A player: playable, points, turn count and PP, skill uses, and what was played earlier. */
export function EditPlayerPanel({ side }: { side: Side }) {
  const { game, edit, setPicking } = useBoardContext();
  const p = game.players[side], skills = skillsFor(p.playable);
  const change = (values: { playable?: string; points?: number; maxPoints?: number; turns?: number; ppBonus?: number; pp?: number; skills?: number[]; shield?: boolean; sweetBoost?: number }) => edit({ type: 'player', side, ...values });
  return <>
    <h2>{who(side)}</h2>
    <div className={styles.editPlayables} role="group" aria-label="プレイアブル">{playables.map(id =>
      <button key={id} aria-pressed={p.playable === id} aria-label={nameOf(id)} onClick={() => change({ playable: id })}><GameCard id={id} sizes="80px" /></button>)}
    </div>
    <Stepper label="お菓子ポイント" value={p.points} onChange={points => change({ points })} />
    <Stepper label="お菓子の最大値" value={p.maxPoints} onChange={maxPoints => change({ maxPoints })} />
    <Stepper label="ターン数" note="自分の何ターン目か" value={p.turns} onChange={turns => change({ turns })} />
    <Stepper label="最大PP" note="ターン数＋追加分" value={p.turns + p.ppBonus} onChange={max => change({ ppBonus: max - p.turns })} />
    <Stepper label="今のPP" value={p.pp} onChange={pp => change({ pp })} />
    <h3>スキルの残り回数</h3>
    {skills.map((skill, index) => <Stepper key={skill.name} label={skill.name} note={`${skill.uses}回まで`} value={p.skills[index]}
      onChange={left => change({ skills: p.skills.map((uses, i) => i === index ? left : uses) })} />)}
    <h3>お菓子の効果</h3>
    <div className={styles.editChips}><Switch label="パンケーキの守り" on={p.shield} onChange={shield => change({ shield })} /></div>
    <Stepper label="おいしくなる呪文" note="次のお菓子に重ねた回数" value={p.sweetBoost} onChange={sweetBoost => change({ sweetBoost })} />
    <h3>このゲームで手札から出したカード</h3>
    <p className={styles.editNote}>うゆち・カフェオレ・ケーキ・ソーダなど、それまでに出したカードで効果が変わるもの用です。</p>
    <div className={styles.editChips}>
      {p.played.map((cardId, index) => <button key={index} className={styles.editSwitch} title="外す"
        onClick={() => edit({ type: 'played', side, cardIds: p.played.filter((_, i) => i !== index) })}>{nameOf(cardId)} ×</button>)}
      <button className={styles.editSwitch} onClick={() => setPicking({ side, zone: 'played' })}>＋ 加える</button>
    </div>
  </>;
}

/** Whose turn, the board's name, sharing as a code, saving, and starting over. */
export function EditMenuPanel() {
  const { game, edit, session, position, canUndo, undo, setPanel, leave, animations } = useBoardContext();
  const [saved, setSaved] = useState<SavedPosition[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { setSaved(loadSaved()); }, []);
  const current = () => session.currentPosition?.() ?? emptyPosition();
  async function copy(text: string, done: string) {
    setCode(text);
    try {
      await navigator.clipboard.writeText(text);
      setMessage(done);
    } catch { setMessage('コピーできませんでした。下の欄から選んでコピーしてください'); }
  }
  function load() {
    const found = decodePosition(code);
    if (!found) return setMessage('盤面のコードが見つかりません（PPL1. から始まる文字列です）');
    animations.skipNext();
    session.replaceBoard(found);
    setMessage('コードの盤面を開きました');
  }
  return <>
    <h2>盤面エディタ</h2>
    <div className={styles.editMenu}>
      <label className={styles.editField}><span>盤面の名前</span>
        <input value={position?.title ?? ''} maxLength={80} placeholder="例：とここ＋ストラで勝てる？" onChange={event => session.setTitle(event.target.value)} />
      </label>
      <Pair label="手番" value={game.active} onChange={active => edit({ type: 'turn', active })} />
      <Pair label="先攻" value={game.rules.firstPlayer} onChange={first => edit({ type: 'turn', first })} />
      <div className={styles.menuList}>
        <button onClick={() => setPanel({ type: 'play' })}>この盤面で遊ぶ</button>
        <button onClick={() => setPanel({ type: 'analysis' })}>最善手を調べる</button>
        <button disabled={!canUndo} onClick={undo}>編集を一つ戻す</button>
        <button onClick={() => void copy(encodePosition(current()), '盤面のコードをコピーしました')}>コードをコピー</button>
        <button onClick={() => void copy(`${location.origin}${EDITOR_PATH}?${encodePosition(current())}`, '盤面のリンクをコピーしました')}>リンクをコピー</button>
        <button onClick={() => { setSaved(savePosition(current())); setMessage('このブラウザに保存しました'); }}>このブラウザに保存</button>
      </div>
      <label className={styles.editField}><span>盤面のコード（貼り付けて開けます）</span>
        <textarea value={code} rows={3} spellCheck={false} onChange={event => setCode(event.target.value)} onFocus={event => event.target.select()} />
      </label>
      <div className={styles.menuList}><button disabled={!code.trim()} onClick={load}>コードの盤面を開く</button></div>
      {message && <p className={styles.editMessage} role="status">{message}</p>}
      {saved.length > 0 && <>
        <h3>保存した盤面</h3>
        <ul className={styles.editSaved}>{saved.map(s => <li key={s.id}>
          <button onClick={() => { animations.skipNext(); session.replaceBoard(s.position); setMessage(`「${s.position.title}」を開きました`); }}>{s.position.title}</button>
          <button className={styles.menuLeave} aria-label={`${s.position.title}を削除`} onClick={() => setSaved(deleteSaved(s.id))}>削除</button>
        </li>)}</ul>
      </>}
      <div className={styles.menuList}>
        <button className={styles.menuLeave} onClick={() => { animations.skipNext(); session.replaceBoard(emptyPosition()); setMessage('盤面を空にしました'); }}>盤面を空にする</button>
        <button className={styles.menuLeave} onClick={leave}>エディタを閉じる</button>
      </div>
    </div>
  </>;
}

/** Leaves edit mode and plays from the board: both sides by hand, or the far side by a CPU. */
export function PlayPanel() {
  const { game, session, setPanel } = useBoardContext();
  const [level, setLevel] = useState<CpuLevel>('master');
  const [errors, setErrors] = useState<string[]>([]);
  const start = (as: 'hotseat' | 'cpu') => {
    const problems = session.startPlay(as, level);
    if (problems.length) setErrors(problems);
    else setPanel(null);
  };
  return <>
    <h2>この盤面で遊ぶ</h2>
    <p className={styles.editNote}>{who(game.active)}の番から始まります（{who(other(game.active))}の番にするには、メニューの「手番」を変えます）。遊んでいる途中でも、メニューから編集に戻れます。</p>
    {errors.length > 0 && <ul className={styles.editErrors} role="alert">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
    <div className={styles.menuList}>
      <button onClick={() => start('hotseat')}>両側を自分で操作する</button>
      <button onClick={() => start('cpu')}>相手をCPUにする（{cpuProfiles[level].name}）</button>
    </div>
    <div className={styles.editChips} role="group" aria-label="CPUの強さ">{cpuLevels.map(id =>
      <Switch key={id} label={cpuProfiles[id].name} on={level === id} onChange={() => setLevel(id)} />)}
    </div>
    <div className={styles.menuList}><button onClick={() => setPanel(null)}>編集を続ける</button></div>
  </>;
}
