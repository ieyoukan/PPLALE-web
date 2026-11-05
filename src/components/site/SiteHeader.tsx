'use client';

// サイト共通のヘッダー。ロゴでトップへ戻り、右側にページごとの操作（設定・ログイン・表示切り替え）を置く。
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './Site.module.css';
import { useI18n } from '@/i18n/LocaleProvider';

export function SiteHeader({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" prefetch={false} aria-label={t('トップへもどる')} className={styles.logo}>
          <Image src="/pupu_game.webp" alt="" width={500} height={281} sizes="96px" />
        </Link>
        {title && <span data-ui-title className={styles.headerTitle}>{title}</span>}
        {children && <div className={styles.headerActions}>{children}</div>}
      </div>
    </header>
  );
}
