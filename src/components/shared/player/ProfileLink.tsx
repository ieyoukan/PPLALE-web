import Link from 'next/link';
import type { ReactNode } from 'react';

/** Self always has an entry point, including guests: the own profile handles sign-in.
 * Other guests have no public profile, so their portrait remains plain content. */
export function ProfileLink({ self, profileId, className, label, children }: {
  self?: boolean; profileId?: string; className?: string; label?: string; children: ReactNode;
}) {
  const href = self ? '/game/profile/' : profileId ? `/game/profile/?id=${encodeURIComponent(profileId)}` : null;
  return href ? <Link href={href} prefetch={false} className={className} aria-label={label}>{children}</Link>
    : <span className={className}>{children}</span>;
}
