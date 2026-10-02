'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { applyCommand, canAttack, costOf, cpuCommand, maxPp, newGame, other, restoreGame, sandboxRules, skillsFor, attackOf, hpOf } from '@pplale/game-core';
import type { Command, DeckKind, GameState, Side } from '@pplale/game-core';
import { demoDeck, displayCards, gameCatalog } from '@/lib/game/catalog';
import { GameCard } from './GameCard';
import { GameSetup } from './GameSetup';
import { Counter, DeckStack, Die, FlyingCard } from './BoardPieces';
import type { DrawFlight, ZoneKind } from './BoardPieces';
import styles from './BoardEmulator.module.css';

type Mode = 'cpu' | 'hotseat';
type Session = { game: GameState; error: string; history: GameState[] };
type Action = { type: 'command'; command: Command; test: boolean } | { type: 'load'; game: GameState } | { type: 'undo' };
type Panel = { type: 'setup' } | { type: 'inspect'; uid: string } | { type: 'skills'; side: Side } | { type: 'zone'; side: Side; kind: 'nap' | 'exile' } | { type: 'logs' } | null;
const STORAGE_KEY = 'pplale-game-session-v2';
const DRAW_DURATION = 800;
function reducer(session: Session, action: Action): Session {
  if (action.type === 'load') return { game: action.game, error: '', history: [] };
  if (action.type === 'undo') {
    const previous = session.history.at(-1);
    return previous ? { game: previous, error: '', history: session.history.slice(0, -1) } : session;
  }
  const result = applyCommand(session.game, action.command, gameCatalog, action.test);
  return result.error ? { ...session, error: result.error } : { game: result.state, error: '', history: [...session.history.slice(-19), session.game] };
}
const keywordNames = { charge: '突撃', fast: '早食い', taunt: '挑発', guard: '防衛', pierce: '貫通', immobile: '行動不能', noEat: '食不可', effectImmune: '効果耐性' } as const;

export default function BoardEmulator() {
  const [session, dispatch] = useReducer(reducer, undefined, () => ({ game: newGame([{ ...demoDeck, name: 'あなた' }, { ...demoDeck, name: 'CPU' }], gameCatalog, sandboxRules, 42), error: '', history: [] }));
  const { game, error, history } = session;
  const [mode, setMode] = useState<Mode>('cpu');
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<Panel>({ type: 'setup' });
  const [view, setView] = useState<Side>(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [attacker, setAttacker] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [rolling, setRolling] = useState(false);
  const [diceFaces, setDiceFaces] = useState<[number, number]>([1, 1]);
  const [flights, setFlights] = useState<DrawFlight[]>([]);
  const container = useRef<HTMLDivElement>(null);
  const previous = useRef(game);
  const animate = useRef(false);
  const animationTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = rolling || flights.length > 0;
  const canControl = (side: Side) => mode === 'hotseat' || side === 0;
  const ours = game.pending && canControl(game.pending.task.actor);
  const drawPending = game.pending?.task.op === 'draw';
  const setup = panel?.type === 'setup';
  const act = useCallback((command: Command) => {
    animate.current = true;
    dispatch({ type: 'command', command, test: mode === 'hotseat' });
    setSelected(null); setAttacker(null); setHovered(null);
  }, [mode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const state = restoreGame(saved.game, gameCatalog);
        if (state) { animate.current = false; dispatch({ type: 'load', game: state }); setMode(saved.mode === 'hotseat' ? 'hotseat' : 'cpu'); setPanel(null); }
        else setSaveError('前回の対戦を復元できませんでした');
      }
    } catch { setSaveError('前回の対戦を復元できませんでした'); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, mode })); }
    catch { setSaveError('このブラウザに対戦を保存できません'); }
  }, [ready, game, mode]);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = game;
    if (!animate.current || old === game || !container.current) return;
    const next: DrawFlight[] = [];
    for (const side of [0, 1] as Side[]) for (const uid of game.players[side].hand) {
      if (old.players[side].hand.includes(uid)) continue;
      const kind: DeckKind | null = old.players[side].yojo.includes(uid) ? 'yojo' : old.players[side].sweet.includes(uid) ? 'sweet' : null;
      if (!kind) continue;
      const source = container.current.querySelector(`[data-deck="${side}-${kind}"] [data-stack]`);
      const target = container.current.querySelector(`[data-hand="${uid}"]`);
      if (!source || !target) continue;
      const from = source.getBoundingClientRect(), to = target.getBoundingClientRect();
      next.push({ uid, cardId: game.cards[uid].cardId, face: side === view || game.cards[uid].revealed, turn: side !== view,
        from: { x: from.x, y: from.y, width: from.width, height: from.height }, to: { x: to.x, y: to.y, width: to.width, height: to.height } });
    }
    if (next.length) {
      setFlights(current => [...current, ...next]);
      animationTimers.current.push(setTimeout(() => setFlights(current => current.filter(f => !next.some(n => n.uid === f.uid))), DRAW_DURATION));
    }
  }, [game, view]);
  useEffect(() => () => { animationTimers.current.forEach(clearTimeout); if (rollTimer.current) clearTimeout(rollTimer.current); }, []);
  useEffect(() => {
    if (mode === 'hotseat' && game.phase === 'playing' && !busy) setView(game.pending?.task.actor ?? game.active);
  }, [mode, game.phase, game.active, game.pending, busy]);
  useEffect(() => {
    if (!ready || mode !== 'cpu' || setup || paused || busy || game.winner !== null || game.phase === 'dice') return;
    if ((game.pending?.task.actor ?? game.active) !== 1) return;
    const timer = setTimeout(() => { const command = cpuCommand(game, gameCatalog); if (command) act(command); }, 650);
    return () => clearTimeout(timer);
  }, [ready, mode, setup, paused, busy, game, act]);
  useEffect(() => {
    if (!rolling) return;
    const timer = setInterval(() => setDiceFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 85);
    return () => clearInterval(timer);
  }, [rolling]);

  function rollDice() {
    if (rolling || setup) return;
    setRolling(true);
    rollTimer.current = setTimeout(() => { act({ type: 'roll', actor: 0 }); setRolling(false); rollTimer.current = null; }, 1000);
  }
  function start(state: GameState, newMode: Mode) {
    if (rollTimer.current) clearTimeout(rollTimer.current);
    animate.current = false; setFlights([]); setRolling(false);
    dispatch({ type: 'load', game: state }); setMode(newMode); setView(0); setPaused(false); setPanel(null);
    setSelected(null); setAttacker(null); setHovered(null); setSaveError('');
  }
  const p = game.players[view];
  const playEnabled = game.phase === 'playing' && canControl(view) && game.active === view && !game.pending && !busy && !setup && game.winner === null;
  const previewUid = hovered ?? selected ?? attacker;
  const previewCard = previewUid ? game.cards[previewUid] : null;
  const pendingIds = ours ? game.pending!.options.map(option => option.id) : [];
  function choose(id: string) { if (ours && !busy) act({ type: 'choose', actor: game.pending!.task.actor, option: id }); }
  function deckReady(side: Side, kind: DeckKind) { return !!ours && !busy && !setup && drawPending && game.pending!.task.actor === side && pendingIds.includes(kind); }
  function play(uid: string, slot?: number) { act({ type: 'play', actor: view, uid, slot }); }
  function attackAvailable(side: Side, uid: string) {
    return canAttack(game, side, uid, 'leader', gameCatalog) || game.players[other(side)].field.some(target => canAttack(game, side, uid, target, gameCatalog));
  }
  function clickField(side: Side, uid: string | undefined, slot: number) {
    if (uid && pendingIds.includes(uid)) { choose(uid); return; }
    if (attacker && side !== view && uid) { act({ type: 'attack', actor: view, uid: attacker, target: uid }); return; }
    if (selected && side === view && !uid && playEnabled && gameCatalog[game.cards[selected].cardId].type === 'yojo') { play(selected, slot); return; }
    if (uid && side === view && playEnabled && attackAvailable(side, uid)) { setAttacker(attacker === uid ? null : uid); setSelected(null); return; }
    if (uid) setPanel({ type: 'inspect', uid });
  }
  function adjust(side: Side, resource: 'points' | 'ppBonus' | 'pp', delta: number) { act({ type: 'adjust', actor: side, resource, delta }); }
  function renderZone(side: Side, kind: ZoneKind, className: string) {
    const player = game.players[side], deck = kind === 'yojo' || kind === 'sweet';
    const drawing = deck && deckReady(side, kind);
    return <div className={className}><DeckStack side={side} kind={kind} ids={player[kind]} thresholds={player.milestones}
      enabled={deck ? drawing : true} drawing={drawing} onClick={() => deck ? choose(kind) : setPanel({ type: 'zone', side, kind })} /></div>;
  }
  function renderPlayer(side: Side) {
    const player = game.players[side], near = side === view;
    const test = mode === 'hotseat' && game.phase === 'playing' && !game.pending && !busy;
    const leaderTarget = !!attacker && side !== view && canAttack(game, view, attacker, 'leader', gameCatalog);
    return <section key={side} className={`${styles.playerSide} ${near ? styles.near : styles.far}`} aria-label={side === 0 ? 'あなたの盤面' : '相手の盤面'}>
      {renderZone(side, 'yojo', styles.deckYojo)}{renderZone(side, 'sweet', styles.deckSweet)}
      {renderZone(side, 'nap', styles.napZone)}{renderZone(side, 'exile', styles.exileZone)}
      <button className={styles.playableZone} onClick={() => setPanel({ type: 'skills', side })} aria-label={`${side === 0 ? 'あなた' : '相手'}のスキル`}>
        <span className={styles.playableCard}><GameCard id={player.playable} /></span>
        <span className={styles.playableName}>{displayCards[player.playable].name}</span>
      </button>
      <div className={styles.turnCounter}><Counter label="ターン数(+pp)" value={player.turns} bonus={player.ppBonus} pp={`${player.pp} / ${maxPp(game, side)}`}
        test={test} onAdjust={delta => adjust(side, 'ppBonus', delta)} onReset={() => adjust(side, 'ppBonus', -player.ppBonus)} /></div>
      <div className={styles.pointsCounter}><Counter label="お菓子ポイント" value={player.points} points target={leaderTarget} test={test}
        onClick={() => { if (leaderTarget) act({ type: 'attack', actor: view, uid: attacker!, target: 'leader' }); }}
        onAdjust={delta => adjust(side, 'points', delta)} onReset={() => adjust(side, 'points', player.maxPoints - player.points)} />
        {player.shield && <span className={styles.shieldIndicator}>パンケーキ保護</span>}
      </div>
      <div className={styles.field}><span className={styles.fieldLabel}>Field</span>{Array.from({ length: 7 }, (_, slot) => {
        const uid = player.field.find(id => game.cards[id].slot === slot), card = uid ? game.cards[uid] : null;
        const targeting = uid && (pendingIds.includes(uid) || !!attacker && side !== view && canAttack(game, view, attacker, uid, gameCatalog));
        const placing = selected && near && !uid && playEnabled && gameCatalog[game.cards[selected].cardId].type === 'yojo';
        return <button key={slot} className={`${styles.fieldSlot} ${card ? styles.occupied : ''} ${targeting || placing ? styles.targetable : ''} ${uid === attacker ? styles.attacking : ''} ${card?.exhausted ? styles.exhausted : ''}`}
          aria-label={`${side === 0 ? 'あなた' : '相手'}の場 ${slot + 1} ${card ? displayCards[card.cardId].name : '空き'}`}
          onClick={() => clickField(side, uid, slot)} onMouseEnter={() => uid && setHovered(uid)} onMouseLeave={() => setHovered(null)}
          onDragOver={event => { if (near && !uid && playEnabled) event.preventDefault(); }}
          onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); if (near && !uid && playEnabled && p.hand.includes(id) && gameCatalog[game.cards[id].cardId].type === 'yojo') play(id, slot); }}>
          {card && <><GameCard id={card.cardId} instance={card} />
            {!!(card.attackBonus || card.hpBonus) && <span className={styles.buffMarble} aria-label={`能力変化 攻撃${card.attackBonus} HP${card.hpBonus}`}>{card.attackBonus >= 0 ? '+' : ''}{card.attackBonus}/{card.hpBonus >= 0 ? '+' : ''}{card.hpBonus}</span>}
            {!card.exhausted && attackAvailable(side, uid!) && <span className={styles.readyGem} />}
            <span className={styles.keywordBadges}>{card.keywords.map((k, i) => <i key={`${k}-${i}`}>{keywordNames[k]}</i>)}{card.shield && <i>ダメージ無効×1</i>}</span>
          </>}
        </button>;
      })}</div>
      {!near && <div className={styles.opponentHand} aria-label={`相手の手札 ${player.hand.length}枚`}>
        {player.hand.map((uid, i) => <span key={uid} data-hand={uid} className={`${styles.hiddenCard} ${flights.some(f => f.uid === uid) ? styles.dealing : ''}`} style={{ '--hand-index': i } as CSSProperties}>
          {game.cards[uid].revealed && <GameCard id={game.cards[uid].cardId} />}
        </span>)}<small>{player.hand.length}枚</small>
      </div>}
    </section>;
  }
  const diceValues = rolling ? diceFaces : game.dice?.rolls ?? diceFaces;
  const directOptions = game.pending?.options.filter(option => !game.cards[option.id] || !game.players.some(player => player.field.includes(option.id) || player.hand.includes(option.id))) ?? [];
  return <div className={styles.emulator} ref={container}>
    <header className={styles.toolbar}><Link href="/" className={styles.home}>ぷぷりえーる</Link><span>いちご・通常プレイアブル</span>
      <div className={styles.tools}><button onClick={() => setPanel(panel?.type === 'setup' ? null : { type: 'setup' })}>対戦の準備</button>
        <button onClick={() => { setMode(mode === 'cpu' ? 'hotseat' : 'cpu'); setView(0); setSelected(null); setAttacker(null); setHovered(null); }}>{mode === 'cpu' ? '両側を操作' : 'CPUに任せる'}</button>
        {mode === 'cpu' ? <button onClick={() => setPaused(!paused)}>{paused ? 'CPU再開' : 'CPU一時停止'}</button> : <><button onClick={() => setView(other(view))}>反対側を見る</button><button disabled={!history.length || busy} onClick={() => { animate.current = false; dispatch({ type: 'undo' }); setSelected(null); setAttacker(null); setHovered(null); }}>一手戻す</button></>}
        <button onClick={() => setPanel(panel?.type === 'logs' ? null : { type: 'logs' })}>履歴</button>
        <button onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void container.current?.requestFullscreen().catch(() => {}); }}>全画面</button>
      </div>
    </header>
    <div className={styles.tableViewport}><div className={styles.table}>
      <div className={styles.mat}><div className={styles.logoLayer} /></div>{([0, 1] as Side[]).map(renderPlayer)}
      {(game.phase === 'dice' || game.phase === 'opening') && <div className={styles.diceArea}>
        <div className={styles.dicePair}><div><span>あなた</span><Die value={diceValues[0]} rolling={rolling} /></div><div><span>{mode === 'cpu' ? 'CPU' : '相手'}</span><Die value={diceValues[1]} rolling={rolling} /></div></div>
        {game.phase === 'dice' ? <button disabled={rolling || setup} onClick={rollDice}>{rolling ? 'ダイスを振っています…' : game.dice ? '同じ目でした・もう一度振る' : 'ダイスを振って先攻・後攻を決める'}</button> : <span>{game.rules.firstPlayer === 0 ? 'あなたが先攻' : '相手が先攻'}</span>}
      </div>}
      {game.phase === 'playing' && <div className={styles.turnControl}><span>{game.winner !== null ? '対戦終了' : game.active === view ? 'あなたのターン' : mode === 'cpu' ? 'CPUのターン' : '相手のターン'}</span>
        <button disabled={!playEnabled} onClick={() => act({ type: 'end', actor: game.active })}>ターン終了</button>
      </div>}
      {game.winner !== null && <div className={styles.result}><strong>{game.winner === 'draw' ? '引き分け' : `${game.players[game.winner].name}の勝利`}</strong><button onClick={() => setPanel({ type: 'setup' })}>次の対戦を準備する</button></div>}
    </div></div>
    <div className={styles.actionStrip} role="status">
      {game.pending ? <><span>{ours ? game.pending.prompt : `${mode === 'cpu' ? 'CPU' : '相手'}が${drawPending ? '山札から引いています' : '選択しています'}`}{game.phase === 'opening' && game.pending.task.count && `（残り${game.pending.task.count}枚）`}</span>
        {ours && !drawPending && directOptions.map(option => <button key={option.id} disabled={busy} onClick={() => choose(option.id)}>{game.cards[option.id] && <span className={styles.choiceThumb}><GameCard id={game.cards[option.id].cardId} /></span>}{option.label}</button>)}
      </> : attacker ? <><span>光っている幼女、または相手のお菓子ポイントを押して攻撃</span><button onClick={() => setAttacker(null)}>取消</button></> : game.phase === 'dice' ? <span>ダイスの目が大きい側が先攻。同じ目なら振り直します。</span> : <span>{error || saveError || game.log.at(-1)}</span>}
      {error && game.pending && <span className={styles.error}>{error}</span>}
    </div>
    <div className={styles.handDock}><div className={styles.handMeta}><span>手札 {p.hand.length}枚</span><span>{game.phase === 'opening' ? '光っている山札を押して1枚ずつ引いてください' : 'カードを押して確認・空き枠へドラッグして出す'}</span></div>
      <div className={styles.hand}>{p.hand.map((uid, index) => {
        const card = game.cards[uid], allowed = playEnabled && costOf(game, uid, gameCatalog, view) <= p.pp, offset = index - (p.hand.length - 1) / 2;
        return <button key={uid} data-hand={uid} draggable={allowed} className={`${styles.handCard} ${allowed ? styles.playableHand : ''} ${selected === uid ? styles.selectedHand : ''} ${pendingIds.includes(uid) ? styles.targetable : ''} ${flights.some(f => f.uid === uid) ? styles.dealing : ''}`}
          style={{ '--angle': `${Math.max(-14, Math.min(14, offset * 3))}deg`, '--lift': `${Math.min(20, Math.abs(offset) * 4)}px`, '--overlap': `${Math.min(76, Math.max(22, (p.hand.length - 4) * 11))}px`, zIndex: index } as CSSProperties}
          aria-label={`手札 ${displayCards[card.cardId].name}`} onMouseEnter={() => setHovered(uid)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(uid)} onBlur={() => setHovered(null)}
          onClick={() => { if (pendingIds.includes(uid)) choose(uid); else { setSelected(selected === uid ? null : uid); setAttacker(null); } }}
          onDragStart={event => { event.dataTransfer.setData('text/plain', uid); setSelected(uid); setAttacker(null); }} onDragEnd={() => setHovered(null)}>
          <GameCard id={card.cardId} />{card.revealed && <span className={styles.revealed}>公開</span>}
        </button>;
      })}</div>
      {previewCard && <aside className={styles.preview}><div className={styles.previewImage}><GameCard id={previewCard.cardId} /></div><div><h3>{displayCards[previewCard.cardId].name}</h3><p>{displayCards[previewCard.cardId].effect}</p>
        {selected === previewCard.uid && <><button disabled={!playEnabled || costOf(game, previewCard.uid, gameCatalog, view) > p.pp} onClick={() => play(previewCard.uid)}>{gameCatalog[previewCard.cardId].type === 'yojo' ? '場に出す' : 'お菓子を使う'}</button>
          {previewCard.cardId === 's_24' && !previewCard.revealed && <button disabled={!playEnabled} onClick={() => act({ type: 'reveal', actor: view, uid: previewCard.uid })}>公開する</button>}
          <button onClick={() => { setSelected(null); setHovered(null); }}>選択をやめる</button></>}
      </div></aside>}
    </div>
    {panel && <aside className={styles.drawer} aria-label={panel.type === 'setup' ? '対戦の準備' : 'カード情報'}>
      {panel.type === 'setup' ? <GameSetup onClose={() => setPanel(null)} onStart={start} /> : <><button className={styles.close} onClick={() => setPanel(null)} aria-label="パネルを閉じる">×</button>
        {panel.type === 'logs' ? <><h2>対戦の履歴</h2>{game.log.map((line, i) => <p className={styles.logLine} key={`${i}-${line}`}>{line}</p>)}</> : panel.type === 'zone' ? <><h2>{panel.kind === 'nap' ? 'お昼寝場所' : '除外カード'}（{game.players[panel.side][panel.kind].length}枚）</h2><div className={styles.zoneCards}>{game.players[panel.side][panel.kind].map(uid => <button key={uid} onClick={() => setPanel({ type: 'inspect', uid })}><GameCard id={game.cards[uid].cardId} /></button>)}</div></> : panel.type === 'inspect' ? <>
          <div className={styles.inspectImage}><GameCard id={game.cards[panel.uid].cardId} instance={game.cards[panel.uid]} /></div><h2>{displayCards[game.cards[panel.uid].cardId].name}</h2><p>{displayCards[game.cards[panel.uid].cardId].effect}</p>
          <p>攻撃 {attackOf(game.cards[panel.uid], gameCatalog)} / 残りHP {hpOf(game.cards[panel.uid], gameCatalog)}</p>
          {mode === 'hotseat' && game.players.some(player => player.field.includes(panel.uid)) && <div className={styles.testControls}><h3>ダメージのおはじき</h3>{[-1, 1].map(delta => <button key={delta} onClick={() => act({ type: 'adjust', actor: game.players[0].field.includes(panel.uid) ? 0 : 1, resource: 'damage', delta, uid: panel.uid })}>{delta < 0 ? '−1' : '＋1'}</button>)}</div>}
        </> : <><div className={styles.inspectImage}><GameCard id={game.players[panel.side].playable} /></div><h2>{displayCards[game.players[panel.side].playable].name}</h2>
          <details className={styles.ruleSettings}><summary>スキルの効果</summary><p>{displayCards[game.players[panel.side].playable].effect}</p></details>
          {skillsFor(game.players[panel.side].playable).map((skill, index) => <button className={styles.skillButton} key={index}
            disabled={game.phase !== 'playing' || game.active !== panel.side || !canControl(panel.side) || !!game.pending || busy || game.players[panel.side].skills[index] <= 0 || game.players[panel.side].pp < skill.cost}
            onClick={() => act({ type: 'skill', actor: panel.side, index })}><b>{skill.cost} PP</b><span>{skill.name}</span><small>残り{game.players[panel.side].skills[index]}回</small></button>)}
          {mode === 'hotseat' && <div className={styles.testControls}><h3>現在PP</h3><button onClick={() => adjust(panel.side, 'pp', -1)}>−1</button><b>{game.players[panel.side].pp}</b><button onClick={() => adjust(panel.side, 'pp', 1)}>＋1</button>
            <h3>テスト用の追加ドロー</h3>{(['yojo', 'sweet'] as const).map(deck => <button key={deck} disabled={!!game.pending || game.phase !== 'playing'} onClick={() => act({ type: 'draw', actor: panel.side, deck })}>{deck === 'yojo' ? '幼女' : 'お菓子'}</button>)}
          </div>}
        </>}
      </>}
    </aside>}
    <div className={styles.flightLayer}>{flights.map(flight => <FlyingCard key={flight.uid} flight={flight} />)}</div>
  </div>;
}
