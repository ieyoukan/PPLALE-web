'use client';

// 対戦前の机に置く盤面。対戦と同じ部品を使って空の状態を描き、対戦開始時に実際の盤面へ引き継ぐ。
import Image from 'next/image';
import { memo } from 'react';
import { sandboxRules } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { Counter, DeckStack } from '../BoardPieces';
import type { ZoneKind } from '../BoardPieces';
import board from '../BoardEmulator.module.css';

const zones: [ZoneKind, string][] = [['yojo', board.deckYojo], ['sweet', board.deckSweet], ['nap', board.napZone], ['exile', board.exileZone]];
const nothing = () => {};

export const BoardSurface = memo(function BoardSurface({ className }: { className?: string }) {
  return <div className={`${board.table} ${className ?? ''}`} aria-hidden="true" inert>
    <div className={board.mat}><div className={board.logoLayer}>
      {Array.from({ length: 8 }, (_, index) => <Image key={index} src="/images/game/cafe-logo.svg" alt="" width={1568} height={882} unoptimized className={board.matLogo} />)}
    </div></div>
    {([0, 1] as Side[]).map(side => <section key={side} className={`${board.playerSide} ${side === 0 ? board.near : board.far}`}>
      {zones.map(([kind, place]) => <div key={kind} className={place}><DeckStack side={side} kind={kind} ids={[]} enabled={false} onClick={nothing} /></div>)}
      <div className={board.playableZone} />
      <div className={board.turnCounter}><Counter label="ターン数(+pp)" value={0} pp="0 / 0" test={false} onAdjust={nothing} onReset={nothing} /></div>
      <div className={board.pointsCounter}><Counter label="お菓子ポイント" value={sandboxRules.initialPoints} points test={false} onAdjust={nothing} onReset={nothing} /></div>
      <div className={board.field}>{Array.from({ length: 7 }, (_, slot) => <span key={slot} className={board.fieldSlot} />)}</div>
    </section>)}
  </div>;
});
