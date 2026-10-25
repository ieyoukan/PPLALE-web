'use client';

// Inviting people: friends meet in Discord, so pasting there comes first. The link carries the
// invitation secret only where the player may hand it out; in a friends' room the link is enough.
import { useEffect, useState } from 'react';
import type { RoomView } from '@pplale/game-core/room';
import { invitedVisibility } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { FriendInvites } from './FriendInvites';
import { DiscordMark, PlazaIcon } from './PlazaIcon';
import { OrnateFrame } from '../ornament/OrnateFrame';
import { Sheet } from './Sheet';
import { invitation, plazaLink } from './share';
import { usePlaza } from './PlazaProvider';
import { visibilityInfo } from './visibility';
import styles from './Plaza.module.css';

export function ShareSheet({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const plaza = view.plaza!, { send } = usePlaza(), { user } = useAuth();
  const [origin, setOrigin] = useState(''), [canShare, setCanShare] = useState(false);
  const [done, setDone] = useState<string>('');
  useEffect(() => { setOrigin(window.location.origin); setCanShare(typeof navigator.share === 'function'); }, []);
  const invited = invitedVisibility(plaza.visibility), mayShare = !invited || !!plaza.invite;
  const url = plazaLink(origin, view), words = invitation(view, url);
  const copy = (what: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => setDone(what), () => setDone('コピーできませんでした'));
  };
  const info = visibilityInfo[plaza.visibility];
  return <Sheet title="ルームにさそう" onClose={onClose}>
    {mayShare ? <>
      <OrnateFrame as="button" size="sm" tone="cream" className={styles.discordButton} onClick={() => copy('discord', words.discord)}>
        <DiscordMark /><span><b data-ui-title>Discordに貼る</b><small>メッセージをコピーします</small></span>
        {done === 'discord' && <span className={styles.copied}><PlazaIcon name="check" /></span>}
      </OrnateFrame>
      <div className={styles.shareRow}>
        <button className={styles.shareTile} onClick={() => copy('link', url)}><PlazaIcon name="link" /><span>リンク</span>{done === 'link' && <i className={styles.copiedDot}><PlazaIcon name="check" /></i>}</button>
        <a className={styles.shareTile} href={words.post} target="_blank" rel="noopener noreferrer"><b className={styles.xMark}>𝕏</b><span>ポスト</span></a>
        {canShare && <button className={styles.shareTile} onClick={() => { navigator.share({ text: words.plain }).catch(() => {}); }}><PlazaIcon name="send" /><span>共有</span></button>}
      </div>
      <p className={styles.shareNote}><PlazaIcon name={info.icon} />{plaza.visibility === 'friends' ? `${plaza.creator.name}のフレンドだけが入れます` : plaza.visibility === 'friendsPlus' ? 'ルームにいる人のフレンドが入れます' : invited ? 'このリンクを知っている人が入れます' : 'リンクを開いた人はだれでも入れます'}</p>
      {invited && <button className={styles.textButton} onClick={() => { void send({ action: 'renewInvite' }).then(() => setDone('renewed')); }}><PlazaIcon name="refresh" />{done === 'renewed' ? '新しいリンクにしました（前のリンクは使えません）' : 'リンクを作り直す'}</button>}
    </> : <p className={styles.shareNote}><PlazaIcon name="crown" />このルームに招待できるのはオーナーだけです。</p>}
    {/* A friend invited by name comes in where that lets them in: an invited room, or one they may enter anyway (told by a notification). */}
    {mayShare && user && (plaza.visibility !== 'friends' || plaza.creator.profileId === user.uid) && <FriendInvites uid={user.uid} view={view} />}
    {done === 'コピーできませんでした' && <p className={styles.note} role="alert">{done}</p>}
    <p className={styles.srOnly} role="status">{done === 'discord' ? 'Discordに貼るメッセージをコピーしました' : done === 'link' ? 'リンクをコピーしました' : ''}</p>
  </Sheet>;
}
