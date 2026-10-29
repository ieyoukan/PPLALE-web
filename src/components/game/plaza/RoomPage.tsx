'use client';

// `/game/room/<id>/`: the one link of a room. Opening it enters the room (behind the launch screen
// when the game was not open yet) and shows it; a free match or an older two-seat room under that
// id is shown the way it always was.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DEFAULT_VISIBILITY } from '@pplale/game-core/room';
import type { RoomInfo } from '@pplale/game-core/room';
import { plazaKey, readRoomInfo, seatFor } from '@/lib/game/room/client';
import { CPU_PATH } from '@/lib/game/sessionStore';
import RoomBoard from '../room/RoomBoard';
import { LaunchScreen } from './LaunchScreen';
import { useLaunchpad } from '@/components/game/launchpad/LaunchpadContext';
import { GameIcon } from '@/components/shared/ui/GameIcon';
import { RoomCreatedSheet } from './RoomManagementSheets';
import { PlazaRoom } from './PlazaRoom';
import { plazaHref, usePlaza } from './PlazaProvider';
import type { Refusal } from './PlazaProvider';
import styles from './LaunchScreen.module.css';
import plazaStyles from './Plaza.module.css';

export function RoomPage({ id }: { id: string }) {
  const params = useSearchParams(), invite = params.get('invite'), watch = params.get('watch') === '1', created = params.get('created') === '1';
  const router = useRouter(), { enter, stage, view, id: current, legacy: legacyId, goHome } = usePlaza();
  const launchpad = useLaunchpad();
  // null: not known yet. A seat kept in this browser is a two-seat room's; a link to watch may be either.
  const [kind, setKind] = useState<'plaza' | 'legacy' | null>(null);
  const [preview, setPreview] = useState<RoomInfo | null>(null);
  useEffect(() => {
    if (seatFor(id)) return setKind('legacy');
    // A room this browser is in, or was: a room to gather in.
    if (plazaKey(id) && !watch) return setKind('plaza');
    // Otherwise ask first: a two-seat room's link opens its lobby (joining it is the player's choice).
    // A room that is not told of may still be an invited one: entering decides.
    let current = true;
    readRoomInfo(id, invite).then(info => { if (current) { setPreview(info); setKind(info.plaza ? 'plaza' : 'legacy'); } }, () => { if (current) setKind('plaza'); });
    return () => { current = false; };
  }, [id, watch, invite]);
  const legacy = kind === 'legacy' || legacyId === id;
  // A room that cannot be entered (gone, closed, full, or an invitation is needed): said, then back to
  // the player's own room rather than a page with nowhere to go. Out of reach stays here (it says so).
  const refusal = stage.kind === 'refused' && stage.to === id && stage.reason !== 'offline' ? stage.reason : null;
  useEffect(() => {
    if (refusal) void goHome(reasons[refusal]);
  }, [refusal, goHome]);
  useEffect(() => {
    if (kind !== 'plaza') return;
    // The invitation's secret is kept by this browser; the address bar shows the plain link.
    void enter(id, invite).then(entered => { if (entered && (entered !== id || invite || watch)) router.replace(plazaHref(entered)); });
  }, [kind, id, invite, watch, enter, router]);

  if (legacy) return <RoomBoard id={id} watch={watch && !seatFor(id)} />;
  if (kind === null) return <LaunchScreen status="ルームに入っています" />;
  if (current === id && view) return <><PlazaRoom view={view} onMenu={launchpad.open} />
    {created && view.plaza && view.plaza.owner === view.plaza.me && <RoomCreatedSheet view={view} onClose={() => router.replace(plazaHref(id))} />}</>;
  if (stage.kind === 'refused' && (stage.to === id || stage.to === null)) return <LaunchScreen><Refused reason={stage.reason} message={stage.message} id={id} /></LaunchScreen>;
  return <LaunchScreen status="ルームに入っています" preview={preview} />;
}

const reasons: Record<Refusal, string> = {
  hidden: 'このルームは見つからないか、招待が必要です',
  closed: 'このルームは閉じました',
  full: 'このルームはいっぱいです',
  offline: 'ルームサーバーにつながりません',
  error: 'ルームに入れませんでした',
};

/** Why the room could not be entered, and where to go instead. */
export function Refused({ reason, message, id }: { reason: Refusal; message: string; id?: string }) {
  const plaza = usePlaza(), router = useRouter();
  const [busy, setBusy] = useState(false);
  const other = plaza.id && plaza.id !== id ? plaza.id : null;
  return <>
    <p className={styles.troubleText} role="alert">{reasons[reason]}{reason === 'error' && message && <small>{message}</small>}</p>
    <div className={styles.troubleActions}>
      {reason === 'offline' && <button className={plazaStyles.primaryButton} disabled={busy} onClick={() => { setBusy(true); router.refresh(); window.location.reload(); }}><GameIcon name="refresh" /><span data-ui-title>もう一度</span></button>}
      {other ? <button className={plazaStyles.primaryButton} onClick={() => { plaza.settle(); router.push(plazaHref(other)); }}><GameIcon name="back" /><span data-ui-title>もとのルームへ</span></button>
        : reason !== 'offline' && <button className={plazaStyles.primaryButton} disabled={busy} onClick={() => { setBusy(true); void plaza.create(DEFAULT_VISIBILITY); }}><GameIcon name="door" /><span data-ui-title>インバイトのルームを作る</span></button>}
      <Link className={plazaStyles.softButton} href={CPU_PATH} prefetch={false}><GameIcon name="cpu" />ひとりで遊ぶ</Link>
    </div>
  </>;
}
