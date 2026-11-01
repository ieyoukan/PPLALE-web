'use client';

import { availablePpMaximum, other } from '@pplale/game-core';
import type { Side } from '@pplale/game-core';
import { useI18n } from '@/i18n/LocaleProvider';
import { useBoardContext } from '../board/BoardContext';
import { PpPanel } from '../BoardPieces';
import { RoundActionButton } from '@/components/shared/ui/ornament/RoundActionButton';
import actionStyles from './TurnControl.module.css';
import { TurnClock } from './TurnClock';
import styles from '../BoardEmulator.module.css';

/** A label on two lines: the line break of the text (`\n`) becomes a <br />. */
const twoLines = (text: string) => text.split('\n').flatMap((line, index) => index ? [<br key={index} />, line] : [line]);

/** Both PP gauges and the end-turn button. */
export function TurnControl() {
  const { game, view, me, names, portraits, playEnabled, remote, act, editing, setPanel } = useBoardContext();
  const { t } = useI18n();
  // Present from the start (disabled until the first turn), so the table never changes width.
  const mine = game.phase !== 'playing' || game.active === view;
  const orderFor = (side: Side) => game.phase === 'dice' || game.phase === 'initiative'
    ? undefined : side === game.rules.firstPlayer ? 'first' as const : 'second' as const;
  return <div className={styles.turnControl}>
    <PpPanel side={other(view)} name={t(names[other(view)])} portrait={portraits[other(view)]} order={orderFor(other(view))} current={game.players[other(view)].pp} maximum={availablePpMaximum(game, other(view))} own={false} />
    {editing
      ? <RoundActionButton tone="sage" className={`${actionStyles.action} ${actionStyles.play}`} onClick={() => setPanel({ type: 'play' })}>{twoLines(t('この盤面で\n遊ぶ'))}</RoundActionButton>
      : <RoundActionButton tone={mine ? 'pink' : 'muted'} className={actionStyles.action} disabled={!playEnabled} onClick={() => act({ type: 'end', actor: game.active })}>
        {remote?.watching && !remote.recorded ? t('観戦中') : twoLines(t(mine ? 'ターン\n終了' : '相手の\nターン'))}
      </RoundActionButton>}
    {remote?.turnClock && remote.turnClock.turn === game.turn && game.winner === null && <TurnClock clock={remote.turnClock} />}
    <PpPanel side={view} name={t(names[view])} portrait={portraits[view]} order={orderFor(view)} current={me.pp} maximum={availablePpMaximum(game, view)} own />
  </div>;
}
