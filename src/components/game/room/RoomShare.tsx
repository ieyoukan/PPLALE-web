'use client';

import { useEffect, useState } from 'react';
import { describeRoomRules } from '@pplale/game-core/room';
import type { RoomRules } from '@pplale/game-core/room';
import { ROOM_PATH, roomHref, watchHref } from '@/lib/game/sessionStore';
import styles from './Room.module.css';

/** The words an invitation is made of; the link opens the room's page, where the friend joins. */
export function invitation(id: string, rules: RoomRules, origin: string) {
  const url = `${origin}${roomHref(ROOM_PATH, id)}`;
  const lines = ['ぷぷりえーるのルームマッチ、対戦相手を募集中！', `ルームID：${id}`, describeRoomRules(rules)];
  return {
    url,
    /** Opens the board for someone who only watches (rooms that allow it). */
    watch: `${origin}${watchHref(id)}`,
    /** X adds the link itself, so its text goes without it. */
    post: `https://x.com/intent/post?${new URLSearchParams({ text: `${lines.join('\n')}\n#ぷぷりえーる`, url })}`,
    /** Discord shows the id as code (easy to copy) and unfolds the link below it. */
    discord: `**ぷぷりえーる ルームマッチ募集**\nルームID：\`${id}\`\n${describeRoomRules(rules)}\n${url}`,
    plain: [...lines, url].join('\n'),
  };
}

/** Ways to invite someone: the id, the link, a post on X, a message for Discord, the device's share sheet. */
export function RoomShare({ id, rules }: { id: string; rules: RoomRules }) {
  const [copied, setCopied] = useState('');
  // The share sheet exists on phones and some desktops; known only in the browser.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => { setCanShare(typeof navigator.share === 'function'); }, []);
  const invite = invitation(id, rules, typeof window === 'undefined' ? '' : window.location.origin);
  const copy = (what: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => setCopied(what), () => setCopied('コピーできませんでした'));
  };
  return <>
    <div className={styles.row}>
      <button className={styles.secondary} onClick={() => copy('ルームIDをコピーしました', id)}>IDをコピー</button>
      <button className={styles.secondary} onClick={() => copy('リンクをコピーしました', invite.url)}>リンクをコピー</button>
      <button className={styles.secondary} onClick={() => copy('Discordに貼り付けられます', invite.discord)}>Discord用にコピー</button>
      <a className={styles.secondary} href={invite.post} target="_blank" rel="noopener noreferrer">Xで募集</a>
      {rules.spectators && <button className={styles.secondary} onClick={() => copy('観戦用のリンクをコピーしました', invite.watch)}>観戦リンクをコピー</button>}
      {canShare && <button className={styles.secondary} onClick={() => { navigator.share({ text: invite.plain }).catch(() => {}); }}>共有…</button>}
    </div>
    <p className={styles.note} role="status">{copied || 'リンクを開くか、「ルームへ入る」でIDを入力すると参加できます。'}</p>
  </>;
}
