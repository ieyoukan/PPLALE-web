import Link from 'next/link';
import type { ReactNode } from 'react';

/** 自分はゲストでもプロフィールを開ける。ほかのゲストには公開プロフィールのリンクを作らない。 */
export function ProfileLink({ self, profileId, className, label, children }: {
  self?: boolean; profileId?: string; className?: string; label?: string; children: ReactNode;
}) {
  const href = self ? '/game/profile/' : profileId ? `/game/profile/?id=${encodeURIComponent(profileId)}` : null;
  return href ? <Link href={href} prefetch={false} className={className} aria-label={label}>{children}</Link>
    : <span className={className}>{children}</span>;
}
