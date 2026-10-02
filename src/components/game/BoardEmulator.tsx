'use client';
import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { applyCommand, canAttack, costOf, cpuCommand, maxPp, newGame, other, restoreGame, sandboxRules, skillsFor } from '@pplale/game-core';
import type { Command, GameState, Side } from '@pplale/game-core';
import { demoDeck, displayCards, gameCatalog } from '@/lib/game/catalog';
import { GameCard } from './GameCard';
import { GameSetup } from './GameSetup';
import styles from './BoardEmulator.module.css';
type Mode = 'cpu' | 'hotseat';
type Session = {
    game: GameState;
    error: string;
    history: GameState[];
};
type Action = {
    type: 'command';
    command: Command;
    test: boolean;
} | {
    type: 'load';
    game: GameState;
} | {
    type: 'undo';
};
const STORAGE_KEY = 'pplale-game-session-v2';
function reducer(session: Session, action: Action): Session {
    if (action.type === 'load')
        return { game: action.game, error: '', history: [] };
    if (action.type === 'undo') {
        const previous = session.history.at(-1);
        return previous ? { game: previous, error: '', history: session.history.slice(0, -1) } : session;
    }
    const result = applyCommand(session.game, action.command, gameCatalog, action.test);
    if (result.error)
        return { ...session, error: result.error };
    return { game: result.state, error: '', history: [...session.history.slice(-19), session.game] };
}
function DeckStack({ side, kind, ids, thresholds, onClick }: {
    side: Side;
    kind: 'yojo' | 'sweet' | 'nap' | 'exile';
    ids: string[];
    thresholds: number[];
    onClick: () => void;
}) {
    const label = kind === 'yojo' ? '幼女デッキ' : kind === 'sweet' ? 'お菓子デッキ' : kind === 'nap' ? 'お昼寝場所' : '除外';
    return <button type="button" className={`${styles.deckZone} ${kind === 'sweet' ? styles.sweetDeck : ''}`} onClick={onClick} aria-label={`${side === 0 ? 'あなた' : '相手'}の${label} ${ids.length}枚`}>
    <span className={styles.stack}>{ids.map((uid, index) => <span className={styles.stackCard} key={uid} style={{ transform: `translate(${index * .22}px, ${-index * 1.15}px)`, zIndex: index }}/>)}{!ids.length && <span className={styles.emptyStack}>EMPTY</span>}</span>
    <span className={styles.deckCaption}>{label}<strong>{ids.length}<small>枚</small></strong></span>
    {kind === 'sweet' && <span className={styles.thresholds}>{[10, 5].map(value => <span key={value} className={thresholds.includes(value) ? styles.reached : ''} aria-label={`${value}ポイントのドロー${thresholds.includes(value) ? '済み' : '未達'}`}><i />{value}</span>)}</span>}
  </button>;
}
export default function BoardEmulator() {
    const [session, dispatch] = useReducer(reducer, undefined, () => ({ game: newGame([{ ...demoDeck, name: 'あなた' }, { ...demoDeck, name: 'CPU' }], gameCatalog, sandboxRules, 42), error: '', history: [] }));
    const { game, error, history } = session;
    const [mode, setMode] = useState<Mode>('cpu');
    const [ready, setReady] = useState(false);
    const [setup, setSetup] = useState(true);
    const [view, setView] = useState<Side>(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [attacker, setAttacker] = useState<string | null>(null);
    const [hovered, setHovered] = useState<string | null>(null);
    const [inspect, setInspect] = useState<string | null>(null);
    const [zone, setZone] = useState<{
        side: Side;
        kind: 'nap' | 'exile';
    } | null>(null);
    const [skills, setSkills] = useState<Side | null>(null);
    const [logs, setLogs] = useState(false);
    const [paused, setPaused] = useState(false);
    const [saveError, setSaveError] = useState('');
    const container = useRef<HTMLDivElement>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const choiceIsOurs = game.pending && (mode === 'hotseat' || game.pending.task.actor === 0);
    const dialogOpen = setup || !!inspect || !!zone || skills !== null || !!choiceIsOurs;
    const act = useCallback((command: Command) => { dispatch({ type: 'command', command, test: mode === 'hotseat' }); setSelected(null); setAttacker(null); setHovered(null); }, [mode]);
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                const restored = restoreGame(saved.game, gameCatalog);
                if (restored) {
                    dispatch({ type: 'load', game: restored });
                    setMode(saved.mode === 'hotseat' ? 'hotseat' : 'cpu');
                    setSetup(false);
                }
            }
        }
        catch {
            setSaveError('前回の対戦を復元できませんでした');
        }
        setReady(true);
    }, []);
    useEffect(() => { if (!ready)
        return; try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ game, mode }));
    }
    catch {
        setSaveError('このブラウザに対戦を保存できません');
    } }, [ready, game, mode]);
    useEffect(() => { if (mode === 'hotseat')
        setView(game.pending?.task.actor ?? game.active); }, [game.active, game.pending, mode]);
    useEffect(() => {
        if (!ready || mode !== 'cpu' || setup || paused || game.winner !== null)
            return;
        if ((game.pending?.task.actor ?? game.active) !== 1)
            return;
        const timer = window.setTimeout(() => { const command = cpuCommand(game, gameCatalog); if (command)
            act(command); }, 850);
        return () => window.clearTimeout(timer);
    }, [ready, mode, setup, paused, game, act]);
    useEffect(() => { const element = dialog.current; if (!element)
        return; if (dialogOpen && !element.open)
        element.showModal();
    else if (!dialogOpen && element.open)
        element.close(); }, [dialogOpen]);
    function closeDialog() { if (choiceIsOurs)
        return; setSetup(false); setInspect(null); setZone(null); setSkills(null); }
    function play(uid: string, slot?: number) { act({ type: 'play', actor: view, uid, slot }); }
    const p = game.players[view];
    const controllable = mode === 'hotseat' || game.active === 0;
    const playEnabled = controllable && game.active === view && !game.pending && game.winner === null;
    const previewUid = hovered ?? selected;
    const previewCard = previewUid ? game.cards[previewUid] : null;
    function attackAvailable(side: Side, uid: string) { return canAttack(game, side, uid, 'leader', gameCatalog) || game.players[other(side)].field.some(target => canAttack(game, side, uid, target, gameCatalog)); }
    function clickField(side: Side, uid?: string, slot?: number) {
        if (attacker && side !== view && uid) {
            act({ type: 'attack', actor: view, uid: attacker, target: uid });
            return;
        }
        if (selected && side === view && !uid && gameCatalog[game.cards[selected].cardId].type === 'yojo') {
            play(selected, slot);
            return;
        }
        if (uid) {
            if (side === view && playEnabled && attackAvailable(side, uid)) {
                setAttacker(attacker === uid ? null : uid);
                setSelected(null);
            }
            setInspect(uid);
        }
    }
    function renderPlayer(side: Side) {
        const player = game.players[side];
        const isNear = side === view;
        return <section key={side} className={`${styles.playerSide} ${isNear ? styles.near : styles.far}`} aria-label={side === 0 ? 'あなたの盤面' : '相手の盤面'}>
      <div className={styles.leaderArea}>
        <button className={styles.avatar} onClick={() => setSkills(side)} aria-label={`${side === 0 ? 'あなた' : '相手'}のスキル`}><GameCard id={player.playable}/></button>
        <div className={styles.leaderInfo}><span>{isNear ? 'YOU' : mode === 'cpu' ? 'CPU' : 'PLAYER 2'} · {player.turns} TURN</span><strong>{displayCards[player.playable]?.name}</strong></div>
        <button className={`${styles.health} ${attacker && side !== view && canAttack(game, view, attacker, 'leader', gameCatalog) ? styles.targetable : ''}`} onClick={() => { if (attacker && side !== view)
            act({ type: 'attack', actor: view, uid: attacker, target: 'leader' }); }} aria-label={`${side === 0 ? 'あなた' : '相手'}のお菓子ポイント ${player.points}`}><span>お菓子</span><b>{player.points}</b><small> / {player.maxPoints}</small></button>
        {player.shield && <span className={styles.shieldIndicator}>パンケーキ保護</span>}
        <div className={styles.ppDisplay}><span>PP</span><strong>{player.pp}<small> / {maxPp(game, side)}</small></strong><div className={styles.crystals}>{Array.from({ length: Math.min(maxPp(game, side), 15) }, (_, i) => <i key={i} className={i < player.pp ? styles.filled : ''}/>)}</div>{player.ppBonus !== 0 && <span className={styles.whiteMarble} aria-label={`追加PP ${player.ppBonus}`}>{player.ppBonus > 0 ? '+' : ''}{player.ppBonus}</span>}</div>
      </div>
      <div className={styles.field}><span className={styles.fieldLabel}>Field</span>{Array.from({ length: 7 }, (_, slot) => {
                const uid = player.field.find(id => game.cards[id].slot === slot), card = uid ? game.cards[uid] : null;
                const validTarget = attacker && uid && side !== view && canAttack(game, view, attacker, uid, gameCatalog);
                const placeable = selected && isNear && !uid && playEnabled && gameCatalog[game.cards[selected].cardId].type === 'yojo';
                return <button key={slot} className={`${styles.fieldSlot} ${card ? styles.occupied : ''} ${validTarget || placeable ? styles.targetable : ''} ${uid === attacker ? styles.attacking : ''} ${card?.exhausted ? styles.exhausted : ''}`} aria-label={`${side === 0 ? 'あなた' : '相手'}の場 ${slot + 1} ${card ? displayCards[card.cardId].name : '空き'}`} onClick={() => clickField(side, uid, slot)} onDragOver={event => { if (isNear && !uid)
                    event.preventDefault(); }} onDrop={event => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'); if (isNear && !uid && p.hand.includes(id) && gameCatalog[game.cards[id].cardId].type === 'yojo')
                    play(id, slot); }}>
          {card ? <><GameCard id={card.cardId} instance={card} stats/>{!card.exhausted && attackAvailable(side, uid!) && <span className={styles.readyGem}/>}<span className={styles.keywordBadges}>{card.keywords.map((k, i) => <i key={`${k}-${i}`}>{({ charge: '突撃', fast: '早食い', taunt: '挑発', guard: '防衛', pierce: '貫通', immobile: '行動不能', noEat: '食不可', effectImmune: '効果耐性' } as const)[k]}</i>)}{card.shield&&<i>ダメージ無効×1</i>}</span></> : <span className={styles.slotNumber}>{slot + 1}</span>}
        </button>;
            })}</div>
      <div className={styles.deckYojo}><DeckStack side={side} kind="yojo" ids={player.yojo} thresholds={[]} onClick={() => { if (mode === 'hotseat')
            act({ type: 'draw', actor: side, deck: 'yojo' }); }}/></div>
      <div className={styles.deckSweet}><DeckStack side={side} kind="sweet" ids={player.sweet} thresholds={player.milestones} onClick={() => { if (mode === 'hotseat')
            act({ type: 'draw', actor: side, deck: 'sweet' }); }}/></div>
      <div className={styles.discards}>{(['nap', 'exile'] as const).map(kind => <button key={kind} onClick={() => setZone({ side, kind })}>{kind === 'nap' ? 'お昼寝場所' : '除外'}<b>{player[kind].length}</b></button>)}</div>
      {!isNear && <div className={styles.opponentHand} aria-label={`相手の手札 ${player.hand.length}枚`}>{player.hand.map((id, i) => game.cards[id].revealed ? <button className={styles.hiddenCard} key={id} aria-label={`相手の公開手札 ${displayCards[game.cards[id].cardId].name}`} onClick={() => setInspect(id)}><GameCard id={game.cards[id].cardId}/></button> : <span className={styles.hiddenCard} key={id} style={{ transform: `rotate(${(i - (player.hand.length - 1) / 2) * 2}deg)` }}/>)}<span>{player.hand.length}枚</span></div>}
    </section>;
    }
    return <div className={styles.emulator} ref={container}>
    <header className={styles.toolbar}><Link href="/" className={styles.home}>ぷぷりえーる<span>CARD TABLE</span></Link><span className={styles.mode}>いちご · 通常プレイアブル<span>テストルール</span></span><div className={styles.tools}><button onClick={() => setSetup(true)}>新しい対戦</button><button onClick={() => { setMode(mode === 'cpu' ? 'hotseat' : 'cpu'); setView(0); setAttacker(null); setSelected(null); setHovered(null); }}>{mode === 'cpu' ? '両側を操作' : 'CPUに任せる'}</button>{mode === 'cpu' ? <button onClick={() => setPaused(!paused)}>{paused ? 'CPU再開' : 'CPU一時停止'}</button> : <><button onClick={() => setView(other(view))}>反対側を見る</button><button disabled={!history.length} onClick={() => { dispatch({ type: 'undo' }); setSelected(null); setHovered(null); setAttacker(null); }}>一手戻す</button></>}<button onClick={() => setLogs(!logs)}>履歴</button><button onClick={() => { if (document.fullscreenElement)
        void document.exitFullscreen();
    else
        void container.current?.requestFullscreen().catch(() => { }); }}>全画面</button></div></header>
    <div className={styles.tableViewport}><div className={styles.table}>
      <div className={styles.mat}><div className={styles.logoLayer}/>{([0, 1] as Side[]).map(renderPlayer)}</div>
      <div className={styles.turnControl}><span>{game.winner !== null ? '対戦終了' : game.active === view ? 'あなたのターン' : mode === 'cpu' ? 'CPUのターン' : '相手のターン'}</span><button disabled={!playEnabled} onClick={() => act({ type: 'end', actor: game.active })}>ターン<span>終了</span></button>{game.winner !== null && <button onClick={() => setSetup(true)}>もう一度</button>}</div>
      <div className={styles.handArea} onDragOver={e => { if (selected && gameCatalog[game.cards[selected].cardId].type === 'sweet')
        e.preventDefault(); }}>
        <div className={styles.handMeta}><span>HAND <b>{p.hand.length}</b></span>{selected && <button onClick={() => { setSelected(null); setHovered(null); }}>選択をやめる</button>}</div>
        <div className={styles.hand}>{p.hand.map((uid, index) => {
            const card = game.cards[uid], cost = costOf(game, uid, gameCatalog, view), allowed = playEnabled && cost <= p.pp;
            const offset = index - (p.hand.length - 1) / 2;
            return <button key={uid} draggable={allowed} className={`${styles.handCard} ${allowed ? styles.playableHand : ''} ${selected === uid ? styles.selectedHand : ''}`} style={{ '--angle': `${Math.max(-15, Math.min(15, offset * 3))}deg`, '--lift': `${Math.min(22, Math.abs(offset) * 4)}px`, '--overlap': `${Math.min(70, Math.max(20, (p.hand.length - 5) * 9))}px`, zIndex: index } as CSSProperties} aria-label={`手札 ${displayCards[card.cardId].name} コスト${cost}`} onMouseEnter={() => setHovered(uid)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(uid)} onBlur={() => setHovered(null)} onClick={() => { setSelected(selected === uid ? null : uid); setAttacker(null); }} onDragStart={event => { event.dataTransfer.setData('text/plain', uid); setSelected(uid); setAttacker(null); }} onDragEnd={() => setHovered(null)}>
            <GameCard id={card.cardId}/><span className={styles.cost}>{cost}</span>{card.revealed && <span className={styles.revealed}>公開</span>}
          </button>;
        })}</div>
      </div>
      {previewCard && <aside className={styles.preview}><div className={styles.previewImage}><GameCard id={previewCard.cardId}/></div><div><h3>{displayCards[previewCard.cardId].name}</h3><p>{displayCards[previewCard.cardId].effect}</p>{selected === previewCard.uid && <><button disabled={!playEnabled || costOf(game, previewCard.uid, gameCatalog, view) > p.pp} onClick={() => play(previewCard.uid)}>{gameCatalog[previewCard.cardId].type === 'yojo' ? '場に出す' : 'お菓子を使う'}</button>{previewCard.cardId === 's_24' && !previewCard.revealed && <button onClick={() => act({ type: 'reveal', actor: view, uid: previewCard.uid })}>公開する</button>}</>}</div></aside>}
      {attacker && !inspect && <div className={styles.attackHint}>攻撃する幼女か、お菓子ポイントを選んでください<button onClick={() => setAttacker(null)}>取消</button></div>}
      {game.winner !== null && <div className={styles.result}><span>{game.winner === 'draw' ? 'DRAW' : mode === 'hotseat' ? 'WINNER' : game.winner === 0 ? 'VICTORY' : 'DEFEAT'}</span><p>{game.winner === 'draw' ? '引き分け' : `${game.players[game.winner].name}の勝利`}</p><button onClick={() => setSetup(true)}>次の対戦へ</button></div>}
    </div></div>
    <footer className={styles.status} role="status">{error || saveError || game.log.at(-1)}{mode === 'hotseat' && <span>両側操作：山札クリックでドロー · カードクリックでおはじきを調整</span>}</footer>
    {logs && <aside className={styles.log}><button onClick={() => setLogs(false)}>閉じる ×</button><h2>対戦の履歴</h2>{game.log.map((line, i) => <p key={`${i}-${line}`}>{line}</p>)}</aside>}
    <dialog className={styles.dialog} ref={dialog} onCancel={event => { event.preventDefault(); closeDialog(); }} onClick={event => { if (event.target === dialog.current)
        closeDialog(); }}>
      {setup ? <GameSetup onClose={() => setSetup(false)} onStart={(state, newMode) => { dispatch({ type: 'load', game: state }); setMode(newMode); setView(0); setPaused(false); setSetup(false); setSelected(null); setHovered(null); setAttacker(null); setInspect(null); setZone(null); setSkills(null); }}/> : choiceIsOurs && game.pending ? <div className={styles.choiceContent}><span className={styles.eyebrow}>CARD EFFECT</span><h2>{game.pending.prompt}</h2><p>{game.players[game.pending.task.actor].name}の選択</p><div className={styles.choiceList}>{game.pending.options.map(option => { const card = game.cards[option.id]; return <button key={option.id} onClick={() => act({ type: 'choose', actor: game.pending!.task.actor, option: option.id })}>{card && <span className={styles.choiceImage}><GameCard id={card.cardId}/></span>}<span>{option.label}</span></button>; })}</div></div> : inspect ? <div className={styles.inspectContent}><button className={styles.close} onClick={() => setInspect(null)} aria-label="閉じる">×</button><div className={styles.inspectImage}><GameCard id={game.cards[inspect].cardId} instance={game.cards[inspect]} stats/></div><div><h2>{displayCards[game.cards[inspect].cardId].name}</h2><p>{displayCards[game.cards[inspect].cardId].effect}</p>{attacker === inspect && <button className={styles.startButton} onClick={() => setInspect(null)}>攻撃する対象を選ぶ →</button>}{mode === 'hotseat' && game.players.some(player => player.field.includes(inspect)) && <div className={styles.testControls}><h3>ダメージのおはじき</h3><button onClick={() => act({ type: 'adjust', actor: game.players[0].field.includes(inspect) ? 0 : 1, resource: 'damage', delta: -1, uid: inspect })}>−1</button><b>{game.cards[inspect].damage}</b><button onClick={() => act({ type: 'adjust', actor: game.players[0].field.includes(inspect) ? 0 : 1, resource: 'damage', delta: 1, uid: inspect })}>＋1</button></div>}</div></div> : skills !== null ? <div className={styles.skillsContent}><button className={styles.close} onClick={() => setSkills(null)} aria-label="閉じる">×</button><h2>{displayCards[game.players[skills].playable].name}のスキル</h2><details className={styles.ruleSettings}><summary>スキルの効果を確認</summary><p style={{ whiteSpace: 'pre-wrap' }}>{displayCards[game.players[skills].playable].effect}</p></details>{skillsFor(game.players[skills].playable).map((skill, index) => <button className={styles.skillButton} key={index} disabled={game.active !== skills || (mode === 'cpu' && skills === 1) || game.players[skills].skills[index] <= 0 || game.players[skills].pp < skill.cost} onClick={() => { act({ type: 'skill', actor: skills, index }); setSkills(null); }}><b>{skill.cost} PP</b><span>{skill.name}</span><small>残り{game.players[skills].skills[index]}回</small></button>)}{mode === 'hotseat' && <div className={styles.testControls}>{(['points', 'pp', 'ppBonus'] as const).map(resource => <div key={resource}><h3>{resource === 'points' ? 'お菓子ポイント' : resource === 'pp' ? '現在PP' : '追加PPのおはじき'}</h3><button onClick={() => act({ type: 'adjust', actor: skills, resource, delta: -1 })}>−1</button><b>{game.players[skills][resource]}</b><button onClick={() => act({ type: 'adjust', actor: skills, resource, delta: 1 })}>＋1</button></div>)}</div>}</div> : zone ? <div className={styles.zoneContent}><button className={styles.close} onClick={() => setZone(null)} aria-label="閉じる">×</button><h2>{zone.kind === 'nap' ? 'お昼寝場所' : '除外'}（{game.players[zone.side][zone.kind].length}枚）</h2><div className={styles.zoneCards}>{game.players[zone.side][zone.kind].map(uid => <div key={uid}><GameCard id={game.cards[uid].cardId}/></div>)}</div></div> : null}
    </dialog>
  </div>;
}
