'use client';

import { useState } from 'react';
import type { RoomView } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { inviteFriend, plazaKey } from '@/lib/game/room/client';
import { canInviteFriends } from '@/lib/game/room/invitations';
import { GameIcon } from '@/components/shared/ui/GameIcon';

/** One invitation button for profiles and the share sheet: permission, submission and feedback. */
export function InviteFriendButton({ view, connected, uid, name }: { view: RoomView | null; connected: boolean; uid: string; name: string }) {
  const { user } = useAuth();
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  const room = view?.plaza;
  const member = view && plazaKey(view.id)?.token;
  const alreadyHere = room?.members.some(member => member.profileId === uid);
  const mayInvite = !!room && !!member && connected && !alreadyHere && canInviteFriends(room, user?.uid);
  async function invite() {
    if (!view || !member || !mayInvite) return;
    setState('busy');
    try { await inviteFriend(view.id, member, uid); setState('sent'); }
    catch { setState('failed'); }
  }
  return <>
    <button type="button" data-state={state} disabled={!mayInvite || state === 'busy' || state === 'sent'} onClick={() => void invite()}
      aria-label={state === 'sent' ? `${name}に招待を送りました` : `${name}に招待を送る`}
      title={alreadyHere ? '同じルームにいます' : !mayInvite ? '招待できるルームに入ると送れます' : undefined}>
      <GameIcon name={state === 'sent' ? 'check' : 'letter'} />{state === 'sent' ? '送信済み' : state === 'busy' ? '送信中…' : '招待を送る'}
    </button>
    {state === 'failed' && <span role="alert">招待を送れませんでした。もう一度お試しください</span>}
  </>;
}
