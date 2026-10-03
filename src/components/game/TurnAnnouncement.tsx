import type { CSSProperties } from 'react';
import { css } from 'styled-system/css';

export const TURN_NOTICE_DURATION = 1400;

/** `label` replaces the default 「あなた / あいてのターン」 (used when watching two CPUs). */
export type TurnNotice = { id: number; own: boolean; number: number; pp: number; label?: string };

export function TurnAnnouncement({ notice }: { notice: TurnNotice }) {
  return <div role="status" aria-live="polite" style={{ '--turn-tint': notice.own ? '#ffc7df' : '#c8b9ff' } as CSSProperties}
    className={css({ position: 'fixed', inset: '0', zIndex: '180', pointerEvents: 'none', display: 'grid', placeItems: 'center', overflow: 'hidden' })}>
    <div aria-hidden="true" className={css({ position: 'absolute', inset: '0', bg: 'rgba(26, 18, 40, 0.36)', animation: 'gameTurnFade 1400ms ease-out both' })} />
    <div className={css({ position: 'relative', width: '100%', textAlign: 'center', color: '#fffdf7', animation: 'gameTurnIntro 1400ms cubic-bezier(0.16, 1, 0.3, 1) both', willChange: 'transform, opacity', _motionReduce: { animation: 'gameTurnFade 1400ms ease-out both' } })}>
      <div className={css({ fontFamily: '"BoardHandwriting", "Yu Kyokasho", cursive', fontSize: 'clamp(36px, 7vw, 100px)', fontWeight: '400', lineHeight: '1.3', letterSpacing: '0.03em', WebkitTextStroke: '1px #fffdf7', whiteSpace: 'nowrap', textShadow: '0 0 12px var(--turn-tint), 0 0 38px var(--turn-tint), 0 3px 8px rgba(30,20,40,0.5)' })}>
        <span aria-hidden="true" className={css({ display: 'inline-block', fontSize: '0.42em', verticalAlign: 'middle', marginRight: '0.3em', color: 'var(--turn-tint)' })}>✿</span>
        {notice.label ?? (notice.own ? 'あなたのターン' : 'あいてのターン')}
        <span aria-hidden="true" className={css({ display: 'inline-block', fontSize: '0.42em', verticalAlign: 'middle', marginLeft: '0.3em', color: 'var(--turn-tint)' })}>✿</span>
      </div>
      <div aria-hidden="true" className={css({ height: '3px', margin: '12px auto', width: '85%', background: 'linear-gradient(90deg, transparent, var(--turn-tint) 25%, #fff 50%, var(--turn-tint) 75%, transparent)', boxShadow: '0 0 16px var(--turn-tint), 0 0 36px var(--turn-tint)', animation: 'gameTurnBeam 1400ms ease-out both', _motionReduce: { animation: 'none' } })} />
      <div className={css({ fontFamily: '"BoardHandwriting", "Yu Kyokasho", cursive', fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: '400', WebkitTextStroke: '0.4px #fffdf7', letterSpacing: '0.06em', textShadow: '0 0 12px var(--turn-tint), 0 2px 6px rgba(30,20,40,0.7)' })}>
        {notice.number}ターン目 · {notice.pp} PP
      </div>
    </div>
  </div>;
}
