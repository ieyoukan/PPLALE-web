'use client';

import { attackOf, costOf, hpOf } from '@pplale/game-core';
import { gameCatalog } from '@/lib/game/catalog';
import { useBoardContext } from '../board/BoardContext';
import { GameCard } from '../GameCard';
import styles from '../BoardEmulator.module.css';

/**
 * Enlarged card with current stats; in same-device play, damage marbles can be adjusted. 閉じる sits
 * beside the card, where the buttons of a hand card chosen in play are.
 */
export function InspectPanel({ uid }: { uid: string }) {
  const { game, mode, act, setPanel } = useBoardContext();
  const card = game.cards[uid];
  const owner = ([0, 1] as const).find(side => game.players[side].hand.includes(uid) || game.players[side].field.includes(uid));
  const inHand = owner !== undefined && game.players[owner].hand.includes(uid);
  const onField = owner !== undefined && game.players[owner].field.includes(uid);
  return <>
    <div className={styles.inspectImage}>
      <GameCard id={card.cardId} instance={card} sizes="(max-width: 700px) 90vw, 560px" abilities currentCost={inHand ? costOf(game, uid, gameCatalog, owner) : undefined} />
    </div>
    <div className={styles.inspectSide}>
    <div className={styles.inspectActions}>
      <p>攻撃 {attackOf(card, gameCatalog)} / 残りHP {hpOf(card, gameCatalog)}</p>
      {mode === 'hotseat' && onField && <div className={styles.testControls}>
        <h3>ダメージのおはじき</h3>
        {[-1, 1].map(delta => <button key={delta} onClick={() => act({ type: 'adjust', actor: owner, resource: 'damage', delta, uid })}>{delta < 0 ? '−1' : '＋1'}</button>)}
      </div>}
    </div>
    <div className={styles.cardSelectionActions}><button onClick={() => setPanel(null)}>閉じる</button></div>
    </div>
  </>;
}
