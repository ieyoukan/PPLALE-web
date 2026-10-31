'use client';

// プロフィールの共有ボタン。ルームのURLのままでも渡せるよう、短いリンクをDiscord・X・端末の共有へ出す。
import { useEffect, useState } from 'react';
import { profileShareUrl } from '@/lib/game/social';
import { DiscordMark, GameIcon } from '@/components/shared/ui/GameIcon';
import styles from './Social.module.css';

type Done = 'discord' | 'link' | 'failed' | '';

/** Shown at the top of a profile, so it is never below the fold. `mine`: the player's own, worded as an invitation. */
export function ProfileShare({ uid, name, mine }: { uid: string; name: string; mine: boolean }) {
  const [url, setUrl] = useState(''), [canShare, setCanShare] = useState(false), [done, setDone] = useState<Done>('');
  useEffect(() => { setUrl(profileShareUrl(uid)); setCanShare(typeof navigator.share === 'function'); }, [uid]);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(''), 2400);
    return () => clearTimeout(timer);
  }, [done]);
  const words = mine ? `ぷぷりえーるでフレンドになろう！「${name}」` : `ぷぷりえーるの「${name}」`;
  const copy = async (what: Exclude<Done, 'failed' | ''>, text: string) => {
    try { await navigator.clipboard.writeText(text); setDone(what); } catch { setDone('failed'); }
  };
  const post = `https://x.com/intent/post?${new URLSearchParams({ text: `${words}\n#ぷぷりえーる`, url })}`;
  const check = <i className={styles.copiedDot}><GameIcon name="check" /></i>;
  return <div className={styles.share} data-mine={mine || undefined} role="group" aria-label="プロフィールを共有">
    <button type="button" className={styles.shareLink} disabled={!url} onClick={() => void copy('link', url)} aria-label="プロフィールのリンクをコピー" title={url}>
      <GameIcon name="link" /><span>{url.replace(/^https?:\/\//, '')}</span>{done === 'link' && check}
    </button>
    <button type="button" className={styles.shareTile} disabled={!url} onClick={() => void copy('discord', `${words}\n${url}`)} aria-label="Discordに貼るメッセージをコピー" title="Discord"><DiscordMark />{done === 'discord' && check}</button>
    <a className={styles.shareTile} href={url ? post : undefined} target="_blank" rel="noopener noreferrer" aria-label="Xにポスト" title="X"><b className={styles.xMark}>𝕏</b></a>
    {canShare && <button type="button" className={styles.shareTile} onClick={() => { navigator.share({ title: `${name} | ぷぷりえーる`, text: words, url }).catch(() => {}); }} aria-label="ほかのアプリで共有" title="共有"><GameIcon name="send" /></button>}
    {done && <span className={styles.srOnly} role="status">{done === 'link' ? 'リンクをコピーしました' : done === 'discord' ? 'Discordに貼るメッセージをコピーしました' : 'コピーできませんでした'}</span>}
  </div>;
}
