'use client';

// The board of the match as it lies on the table before anyone plays: the same mat, piles, counters
// and field as the board (BoardEmulator's own pieces and styles), empty, with seat 0's half nearest.
// Only to be looked at: the room's table tilts it in 3D, and the match's board takes over at the start.
import Image from 'next/image';
import { sandboxRules } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { Counter, DeckStack } from '../BoardPieces';
import type { ZoneKind } from '../BoardPieces';
import board from '../BoardEmulator.module.css';

const zones: [ZoneKind, string][] = [['yojo', board.deckYojo], ['sweet', board.deckSweet], ['nap', board.napZone], ['exile', board.exileZone]];
const nothing = () => {};

export function BoardSurface({ className }: { className?: string }) {
  return <div className={`${board.table} ${className ?? ''}`} aria-hidden="true" inert>
    <div className={board.mat}><div className={board.logoLayer}>
      {Array.from({ length: 8 }, (_, index) => <Image key={index} src="https://rp2.alfred511.top/huggingface/images/game/cafe-logo.svg" alt="" width={1568} height={882} unoptimized className={board.matLogo} />)}
    </div></div>
    {([0, 1] as Side[]).map(side => <section key={side} className={`${board.playerSide} ${side === 0 ? board.near : board.far}`}>
      {zones.map(([kind, place]) => <div key={kind} className={place}><DeckStack side={side} kind={kind} ids={[]} enabled={false} onClick={nothing} /></div>)}
      <div className={board.playableZone} />
      <div className={board.turnCounter}><Counter label="ターン数(+pp)" value={0} pp="0 / 0" test={false} onAdjust={nothing} onReset={nothing} /></div>
      <div className={board.pointsCounter}><Counter label="お菓子ポイント" value={sandboxRules.initialPoints} points test={false} onAdjust={nothing} onReset={nothing} /></div>
      <div className={board.field}>{Array.from({ length: 7 }, (_, slot) => <span key={slot} className={board.fieldSlot} />)}</div>
    </section>)}
  </div>;
}
