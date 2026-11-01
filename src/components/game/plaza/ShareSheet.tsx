'use client';

// 招待リンクの共有画面。招待権限がある場合だけ秘密をリンクへ含め、フレンド制では入室権限を別途確認する。
import { useEffect, useState } from 'react';
import type { RoomView } from '@pplale/game-core/room';
import { invitedVisibility } from '@pplale/game-core/room';
import { useAuth } from '@/lib/auth';
import { canInviteFriends, canShareRoomLink } from '@/lib/game/room/invitations';
import { FriendInvites } from './FriendInvites';
import { DiscordMark, GameIcon } from '@/components/shared/ui/GameIcon';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { Sheet } from './Sheet';
import { invitation, plazaLink } from './share';
import { usePlaza } from './PlazaProvider';
import { visibilityInfo } from './visibility';
import { useI18n } from '@/i18n/LocaleProvider';
import styles from './Plaza.module.css';

export function ShareSheet({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const plaza = view.plaza!, { send } = usePlaza(), { user } = useAuth();
  const { t, gameText } = useI18n();
  const [origin, setOrigin] = useState(''), [canShare, setCanShare] = useState(false);
  const [done, setDone] = useState<string>('');
  const [posting, setPosting] = useState(false);
  useEffect(() => { setOrigin(window.location.origin); setCanShare(typeof navigator.share === 'function'); }, []);
  const invited = invitedVisibility(plaza.visibility), mayShare = canShareRoomLink(plaza);
  const url = plazaLink(origin, view), words = invitation(view, url, t, gameText);
  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setDone(what); }
    catch { setDone('コピーできませんでした'); }
  };
  const info = visibilityInfo[plaza.visibility];
  // Posting asks first: what the post will say, then X opens with it (or back to the invitation).
  if (posting) return <Sheet title={t('Xにポスト')} onClose={() => setPosting(false)}>
    <OrnateFrame size="sm" faint className={styles.postPreview}>
      <p>{words.postText}</p>
      <small>{url}</small>
    </OrnateFrame>
    <div className={styles.sheetFoot}>
      <button className={styles.softButton} onClick={() => setPosting(false)}><GameIcon name="back" />{t('もどる')}</button>
      <OrnateFrame as="a" size="line" className={styles.primaryButton} href={words.post} target="_blank" rel="noopener noreferrer" onClick={() => setPosting(false)}>
        <b className={styles.xMark}>𝕏</b><span data-ui-title>{t('ポストする')}</span>
      </OrnateFrame>
    </div>
  </Sheet>;
  return <Sheet title={t('ルームにさそう')} onClose={onClose}>
    {mayShare ? <>
      <OrnateFrame as="button" size="line" tone="cream" className={styles.discordButton} onClick={() => copy('discord', words.discord)}>
        <DiscordMark /><span><b data-ui-title>{t('Discordに貼る')}</b><small>{t('メッセージをコピーします')}</small></span>
        {done === 'discord' && <span className={styles.copied}><GameIcon name="check" /></span>}
      </OrnateFrame>
      <div className={styles.shareRow}>
        <button className={styles.shareTile} onClick={() => copy('link', url)}><GameIcon name="link" /><span>{t('リンク')}</span>{done === 'link' && <i className={styles.copiedDot}><GameIcon name="check" /></i>}</button>
        <button className={styles.shareTile} onClick={() => setPosting(true)}><b className={styles.xMark}>𝕏</b><span>{t('ポスト')}</span></button>
        {canShare && <button className={styles.shareTile} onClick={() => { navigator.share({ text: words.plain }).catch(() => {}); }}><GameIcon name="send" /><span>{t('共有')}</span></button>}
      </div>
      <p className={styles.shareNote}><GameIcon name={info.icon} />{plaza.visibility === 'friends' ? t('{name}のフレンドだけが入れます', { name: plaza.creator.name }) : t(plaza.visibility === 'friendsPlus' ? 'ルームにいる人のフレンドが入れます' : invited ? 'このリンクを知っている人が入れます' : 'リンクを開いた人はだれでも入れます')}</p>
      {invited && <button className={styles.textButton} onClick={() => { void send({ action: 'renewInvite' }).then(() => setDone('renewed')); }}><GameIcon name="refresh" />{t(done === 'renewed' ? '新しいリンクにしました（前のリンクは使えません）' : 'リンクを作り直す')}</button>}
    </> : <p className={styles.shareNote}><GameIcon name="crown" />{t('このルームに招待できるのはオーナーだけです。')}</p>}
    {/* A friend invited by name comes in where that lets them in: an invited room, or one they may enter anyway (told by a notification). */}
    {user && canInviteFriends(plaza, user.uid) && <FriendInvites uid={user.uid} view={view} />}
    {done === 'コピーできませんでした' && <p className={styles.note} role="alert">{t(done)}</p>}
    <p className={styles.srOnly} role="status">{done === 'discord' ? t('Discordに貼るメッセージをコピーしました') : done === 'link' ? t('リンクをコピーしました') : ''}</p>
  </Sheet>;
}
