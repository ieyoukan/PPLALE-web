'use client';

// 盤面エディタ: put any card anywhere, set points / PP / skill uses and whose turn it is, then play from
// there (both sides, or against the CPU) and ask for the best move. A board is shared as a code.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { checkPosition, cpuLevels, cpuProfiles, decodePosition, encodePosition, keywords, scriptOf, skillsFor } from '@pplale/game-core';
import type { CpuLevel, Instance, Keyword, Position, PositionHandCard, PositionSide, PositionUnit, Side } from '@pplale/game-core';
import { demoDeck, displayCards, gameCatalog } from '@/lib/game/catalog';
import { deleteSaved, emptyPosition, loadDraft, loadSaved, saveDraft, savePosition, startPosition } from '@/lib/game/positions';
import type { SavedPosition } from '@/lib/game/positions';
import { EDITOR_PATH, PLAY_PATH } from '@/lib/game/sessionStore';
import { GameCard } from '../GameCard';
import { keywordNames } from '../labels';
import styles from './BoardEditor.module.css';

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${from + i}`);
const yojoPool = [...range(0, 30).map(n => `y_${n}`), 'yt_0', 'yt_1', 'token_cat', 'token_pudding'];
const sweetPool = range(0, 27).map(n => `s_${n}`);
const playables = range(0, 5).map(n => `p_${n}`);
const FIELD_SIZE = 7;

type Zone = 'field' | 'hand' | 'nap' | 'yojo' | 'sweet' | 'played';
const zoneNames: Record<Exclude<Zone, 'field'>, string> = { hand: '手札', nap: 'お昼寝場所', yojo: '幼女デッキ（上から）', sweet: 'お菓子デッキ（上から）', played: 'このゲームで手札から出したカード' };
const poolOf = (zone: Zone) => zone === 'field' || zone === 'yojo' ? yojoPool : zone === 'sweet' ? sweetPool : [...yojoPool, ...sweetPool];
type Selection = { side: Side; zone: 'field'; slot: number } | { side: Side; zone: 'hand'; index: number };
type Picking = { side: Side; zone: Zone; slot?: number };
const sideName = (side: Side) => side === 0 ? '手前（あなた）' : '奥（相手）';
const handId = (card: string | PositionHandCard) => typeof card === 'string' ? card : card.id;
const nameOf = (id: string) => displayCards[id]?.name ?? id;

/** A unit as the board draws it, for the markers (damage, changes, keywords) on the card. */
function preview(u: PositionUnit): Instance {
  return {
    uid: '', cardId: u.id, attackBonus: u.attack ?? 0, hpBonus: u.hp ?? 0, damage: u.damage ?? 0, costDelta: 0, temporaryCost: 0,
    keywords: u.keywords ?? [...(scriptOf(u.id).keywords ?? [])], shield: !!u.shield, slot: null, entered: 0, exhausted: !!u.acted, ateOn: -1, revealed: false, links: [],
  };
}

function NumberField({ label, value, min = 0, max = 99, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label className={styles.number}>
    <span>{label}</span>
    <input type="number" inputMode="numeric" value={value} min={min} max={max}
      onChange={event => onChange(Math.max(min, Math.min(max, Math.trunc(Number(event.target.value) || 0))))} />
  </label>;
}

export default function BoardEditor() {
  const router = useRouter();
  const [position, setPosition] = useState<Position>(emptyPosition);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const [saved, setSaved] = useState<SavedPosition[]>([]);
  const [level, setLevel] = useState<CpuLevel>('master');
  const [codeText, setCodeText] = useState('');
  const [message, setMessage] = useState('');

  // The browser keeps the board being edited; a shared link (?PPL1.…) replaces it. The link is read
  // once per mount: the address is cleaned right away, and effects may run twice in development.
  const link = useRef<string | null>(null);
  useEffect(() => {
    link.current ??= window.location.search;
    const shared = decodePosition(link.current);
    if (shared) window.history.replaceState(null, '', EDITOR_PATH);
    setPosition(shared ?? loadDraft() ?? emptyPosition());
    setSaved(loadSaved());
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) saveDraft(position); }, [loaded, position]);

  const update = (change: (draft: Position) => void) => setPosition(previous => {
    const draft = structuredClone(previous);
    change(draft);
    return draft;
  });
  const updateSide = (side: Side, change: (p: PositionSide) => void) => update(draft => change(draft.players[side]));
  const errors = checkPosition(position, gameCatalog);

  function add(id: string) {
    if (!picking) return;
    const { side, zone, slot } = picking;
    updateSide(side, p => {
      if (zone === 'field') {
        while (p.field.length <= slot!) p.field.push(null);
        p.field[slot!] = { id };
      } else if (zone === 'played') p.played = [...(p.played ?? []), id];
      else (p[zone] as (string | PositionHandCard)[]).push(id);
    });
    // One card for a slot; a pile can take several in a row.
    if (zone === 'field') {
      setPicking(null);
      setSelected({ side, zone: 'field', slot: slot! });
    }
  }

  function play(mode: 'hotseat' | 'cpu') {
    try {
      startPosition(position, mode, ['master', level]);
      router.push(PLAY_PATH);
    } catch (error) { setMessage(error instanceof Error ? error.message : '始められません'); }
  }
  async function copy(text: string, done: string) {
    setCodeText(text);
    try {
      await navigator.clipboard.writeText(text);
      setMessage(done);
    } catch { setMessage('コピーできませんでした。下の欄から選んでコピーしてください'); }
  }
  function load() {
    const found = decodePosition(codeText);
    if (!found) return setMessage('盤面のコードが見つかりません（PPL1. から始まる文字列を貼り付けてください）');
    setPosition(found);
    setSelected(null);
    setMessage('コードの盤面を読み込みました');
  }

  if (!loaded) return <div aria-busy="true" />;
  return <div className={styles.editor}>
    <section className={styles.top}>
      <label className={styles.title}><span>盤面の名前</span>
        <input value={position.title ?? ''} maxLength={80} placeholder="例：とここ＋ストラで勝てる？" onChange={event => update(d => { d.title = event.target.value || undefined; })} />
      </label>
      <Toggle label="手番" value={position.active} onChange={side => update(d => { d.active = side; })} />
      <Toggle label="先攻" value={position.first} onChange={side => update(d => { d.first = side; })} />
      <label className={styles.memo}><span>メモ（どう動くのが正解か、気になったことなど）</span>
        <textarea value={position.note ?? ''} maxLength={2000} rows={2} onChange={event => update(d => { d.note = event.target.value || undefined; })} />
      </label>
    </section>

    {([1, 0] as Side[]).map(side => <SideEditor key={side} side={side} active={position.active === side} p={position.players[side]}
      selected={selected?.side === side ? selected : null}
      onSelect={setSelected} onPick={setPicking} onChange={change => updateSide(side, change)} />)}

    <section className={styles.actions}>
      {errors.length > 0 && <ul className={styles.errors} role="alert">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
      <div className={styles.buttons}>
        <button className={styles.primary} disabled={errors.length > 0} onClick={() => play('hotseat')}>両側を操作して遊ぶ</button>
        <span className={styles.cpu}>
          <button className={styles.primary} disabled={errors.length > 0} onClick={() => play('cpu')}>奥をCPUにして遊ぶ</button>
          <select value={level} aria-label="CPUの強さ" onChange={event => setLevel(event.target.value as CpuLevel)}>
            {cpuLevels.map(id => <option key={id} value={id}>{cpuProfiles[id].name}</option>)}
          </select>
        </span>
      </div>
      <p className={styles.help}>遊んでいる途中、メニューの「最善手を調べる」で、このターンに勝てるか（詰み）と CPU のおすすめの手順を見られます。</p>
      <div className={styles.buttons}>
        <button onClick={() => void copy(encodePosition(position), '盤面のコードをコピーしました')}>コードをコピー</button>
        <button onClick={() => void copy(`${location.origin}${EDITOR_PATH}?${encodePosition(position)}`, '盤面のリンクをコピーしました')}>リンクをコピー</button>
        <button onClick={() => { setSaved(savePosition(position)); setMessage('このブラウザに保存しました'); }}>保存</button>
        <button onClick={() => { setPosition(emptyPosition()); setSelected(null); }}>空にする</button>
      </div>
      <label className={styles.code}><span>盤面のコード（貼り付けて読み込めます）</span>
        <textarea value={codeText} rows={3} spellCheck={false} onChange={event => setCodeText(event.target.value)} onFocus={event => event.target.select()} />
      </label>
      <div className={styles.buttons}><button disabled={!codeText.trim()} onClick={load}>コードを読み込む</button></div>
      {message && <p className={styles.message} role="status">{message}</p>}
      {saved.length > 0 && <div className={styles.saved}>
        <h3>保存した盤面</h3>
        <ul>{saved.map(s => <li key={s.id}>
          <button onClick={() => { setPosition(s.position); setSelected(null); setMessage(`「${s.position.title}」を開きました`); }}>{s.position.title}</button>
          <small>{new Date(s.savedAt).toLocaleString('ja-JP')}</small>
          <button className={styles.remove} aria-label={`${s.position.title}を削除`} onClick={() => setSaved(deleteSaved(s.id))}>削除</button>
        </li>)}</ul>
      </div>}
    </section>

    {picking && <CardPicker title={picking.zone === 'field' ? `${sideName(picking.side)}の場` : `${sideName(picking.side)}の${zoneNames[picking.zone]}`}
      pool={poolOf(picking.zone)} single={picking.zone === 'field'} onAdd={add} onClose={() => setPicking(null)} />}
  </div>;
}

function Toggle({ label, value, onChange }: { label: string; value: Side; onChange: (side: Side) => void }) {
  return <div className={styles.toggle} role="group" aria-label={label}><span>{label}</span>
    {([0, 1] as Side[]).map(side => <button key={side} aria-pressed={value === side} onClick={() => onChange(side)}>{side === 0 ? '手前' : '奥'}</button>)}
  </div>;
}

function SideEditor({ side, active, p, selected, onSelect, onPick, onChange }: {
  side: Side; active: boolean; p: PositionSide; selected: Selection | null;
  onSelect: (selection: Selection | null) => void; onPick: (picking: Picking) => void; onChange: (change: (p: PositionSide) => void) => void;
}) {
  const skills = skillsFor(p.playable);
  const slots = Array.from({ length: FIELD_SIZE }, (_, slot) => p.field[slot] ?? null);
  const unit = selected?.zone === 'field' ? p.field[selected.slot] : null;
  const handCard = selected?.zone === 'hand' ? p.hand[selected.index] : null;
  return <section className={`${styles.side} ${active ? styles.activeSide : ''}`} aria-label={sideName(side)}>
    <h2>{sideName(side)}{active && <span className={styles.turnBadge}>手番</span>}</h2>
    <div className={styles.status}>
      <label className={styles.number}><span>プレイアブル</span>
        <select value={p.playable} onChange={event => onChange(d => { d.playable = event.target.value; d.skills = undefined; })}>
          {playables.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
        </select>
      </label>
      <NumberField label="お菓子" value={p.points} onChange={v => onChange(d => { d.points = v; })} />
      <NumberField label="最大" value={p.maxPoints} min={1} onChange={v => onChange(d => { d.maxPoints = v; })} />
      <NumberField label="ターン目" value={p.turns} onChange={v => onChange(d => { d.turns = v; })} />
      <NumberField label="PP" value={p.pp} max={12} onChange={v => onChange(d => { d.pp = v; })} />
      <NumberField label="最大PP" value={p.maxPp} max={12} onChange={v => onChange(d => { d.maxPp = v; })} />
      {skills.map((skill, i) => <NumberField key={skill.name} label={`${i === 0 ? '共通' : `固有${i}`}「${skill.name}」残り`} value={p.skills?.[i] ?? skill.uses} max={skill.uses}
        onChange={v => onChange(d => { d.skills = skills.map((s, j) => j === i ? v : d.skills?.[j] ?? s.uses); })} />)}
      <label className={styles.check}><input type="checkbox" checked={!!p.shield} onChange={event => onChange(d => { d.shield = event.target.checked || undefined; })} />パンケーキの守り</label>
      <NumberField label="おいしくなる呪文" value={p.sweetBoost ?? 0} max={9} onChange={v => onChange(d => { d.sweetBoost = v || undefined; })} />
    </div>

    <h3>場</h3>
    <div className={styles.field}>{slots.map((u, slot) => u
      ? <button key={slot} className={`${styles.card} ${selected?.zone === 'field' && selected.slot === slot ? styles.chosen : ''}`} aria-label={`${slot + 1}番目 ${nameOf(u.id)}`}
          onClick={() => onSelect({ side, zone: 'field', slot })}>
          <GameCard id={u.id} instance={preview(u)} stats abilities sizes="110px" />
          {u.fresh && <span className={styles.flag}>出たばかり</span>}
          {u.acted && <span className={styles.flag}>攻撃済み</span>}
        </button>
      : <button key={slot} className={styles.empty} aria-label={`${slot + 1}番目に置く`} onClick={() => onPick({ side, zone: 'field', slot })}>＋</button>)}
    </div>
    {unit && selected?.zone === 'field' && <UnitEditor unit={unit}
      onChange={change => onChange(d => { change(d.field[selected.slot]!); })}
      onToHand={() => { onChange(d => { d.hand.push(unit.id); d.field[selected.slot] = null; }); onSelect(null); }}
      onRemove={() => { onChange(d => { d.field[selected.slot] = null; }); onSelect(null); }} />}

    <h3>手札</h3>
    <div className={styles.hand}>
      {p.hand.map((card, index) => <button key={index} className={`${styles.card} ${selected?.zone === 'hand' && selected.index === index ? styles.chosen : ''}`} aria-label={`手札 ${nameOf(handId(card))}`}
        onClick={() => onSelect({ side, zone: 'hand', index })}>
        <GameCard id={handId(card)} currentCost={typeof card === 'string' || !card.cost ? undefined : Math.max(0, (gameCatalog[card.id]?.cost ?? 0) + card.cost)} sizes="110px" />
        {typeof card !== 'string' && card.revealed && <span className={styles.flag}>公開</span>}
      </button>)}
      <button className={styles.empty} aria-label="手札に加える" onClick={() => onPick({ side, zone: 'hand' })}>＋</button>
    </div>
    {handCard && selected?.zone === 'hand' && <div className={styles.detail}>
      <b>{nameOf(handId(handCard))}</b>
      <NumberField label="コストの変化" value={typeof handCard === 'string' ? 0 : handCard.cost ?? 0} min={-9} max={9}
        onChange={v => onChange(d => { const c = d.hand[selected.index]; d.hand[selected.index] = { id: handId(c), ...(typeof c !== 'string' && c.revealed && { revealed: true }), ...(v && { cost: v }) }; })} />
      <label className={styles.check}><input type="checkbox" checked={typeof handCard !== 'string' && !!handCard.revealed}
        onChange={event => onChange(d => { const c = d.hand[selected.index]; d.hand[selected.index] = { id: handId(c), ...(typeof c !== 'string' && c.cost && { cost: c.cost }), ...(event.target.checked && { revealed: true }) }; })} />公開している</label>
      <button className={styles.remove} onClick={() => { onChange(d => { d.hand.splice(selected.index, 1); }); onSelect(null); }}>手札から外す</button>
    </div>}

    {(['nap', 'yojo', 'sweet', 'played'] as const).map(zone => {
      const list = zone === 'played' ? p.played ?? [] : p[zone];
      return <Pile key={zone} title={zoneNames[zone]} ids={list} onAdd={() => onPick({ side, zone })}
        onRemove={index => onChange(d => { if (zone === 'played') d.played = (d.played ?? []).filter((_, i) => i !== index); else d[zone].splice(index, 1); })}
        extra={zone === 'yojo' || zone === 'sweet' ? <button onClick={() => onChange(d => { d[zone] = [...demoDeck[zone]]; })}>おためしデッキを入れる</button> : null} />;
    })}
  </section>;
}

function UnitEditor({ unit, onChange, onToHand, onRemove }: { unit: PositionUnit; onChange: (change: (u: PositionUnit) => void) => void; onToHand: () => void; onRemove: () => void }) {
  const owned = unit.keywords ?? [...(scriptOf(unit.id).keywords ?? [])];
  const set = <K extends keyof PositionUnit>(key: K, value: PositionUnit[K]) => onChange(u => { if (value) u[key] = value; else delete u[key]; });
  const toggle = (keyword: Keyword) => onChange(u => { u.keywords = owned.includes(keyword) ? owned.filter(k => k !== keyword) : [...owned, keyword]; });
  return <div className={styles.detail}>
    <b>{nameOf(unit.id)}</b>
    <NumberField label="攻撃の変化" value={unit.attack ?? 0} min={-20} max={20} onChange={v => set('attack', v)} />
    <NumberField label="HPの変化" value={unit.hp ?? 0} min={-20} max={20} onChange={v => set('hp', v)} />
    <NumberField label="受けたダメージ" value={unit.damage ?? 0} max={30} onChange={v => set('damage', v)} />
    <div className={styles.keywords} role="group" aria-label="能力">{keywords.map(k =>
      <button key={k} aria-pressed={owned.includes(k)} onClick={() => toggle(k)}>{keywordNames[k]}</button>)}
    </div>
    <label className={styles.check}><input type="checkbox" checked={!!unit.fresh} onChange={event => set('fresh', event.target.checked)} />このターンに出たばかり</label>
    <label className={styles.check}><input type="checkbox" checked={!!unit.acted} onChange={event => set('acted', event.target.checked)} />このターンは攻撃済み</label>
    <label className={styles.check}><input type="checkbox" checked={!!unit.shield} onChange={event => set('shield', event.target.checked)} />1度だけダメージを0にする（うぃまる）</label>
    <label className={styles.check}><input type="checkbox" checked={!!unit.ate} onChange={event => set('ate', event.target.checked)} />直前の相手ターンにお菓子を食べた</label>
    <div className={styles.buttons}>
      <button onClick={onToHand}>手札に戻す</button>
      <button className={styles.remove} onClick={onRemove}>場から外す</button>
    </div>
  </div>;
}

function Pile({ title, ids, onAdd, onRemove, extra }: { title: string; ids: string[]; onAdd: () => void; onRemove: (index: number) => void; extra: ReactNode }) {
  return <div className={styles.pile}>
    <h3>{title}<small>{ids.length}枚</small></h3>
    <ul>
      {ids.map((id, index) => <li key={index}><button title="外す" onClick={() => onRemove(index)}>{nameOf(id)} <span aria-hidden="true">×</span></button></li>)}
      <li><button className={styles.add} onClick={onAdd}>＋ 追加</button></li>
      {extra && <li>{extra}</li>}
    </ul>
  </div>;
}

function CardPicker({ title, pool, single, onAdd, onClose }: { title: string; pool: string[]; single: boolean; onAdd: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const shown = pool.filter(id => nameOf(id).includes(query.trim()));
  return <div className={styles.picker} role="dialog" aria-modal="true" aria-label={`${title}に置くカード`} onClick={onClose}>
    <div className={styles.sheet} onClick={event => event.stopPropagation()}>
      <header>
        <h2>{title}に置くカード</h2>
        <input value={query} placeholder="名前でさがす" aria-label="名前でさがす" autoFocus onChange={event => setQuery(event.target.value)} />
        <button onClick={onClose}>{single ? 'やめる' : '閉じる'}</button>
      </header>
      {!single && added.length > 0 && <p className={styles.help}>追加：{added.map(nameOf).join('、')}</p>}
      <ul className={styles.grid}>{shown.map(id => <li key={id}>
        <button className={styles.card} aria-label={nameOf(id)} onClick={() => { onAdd(id); setAdded(previous => [...previous, id]); }}>
          <GameCard id={id} sizes="110px" />
        </button>
      </li>)}</ul>
    </div>
  </div>;
}
