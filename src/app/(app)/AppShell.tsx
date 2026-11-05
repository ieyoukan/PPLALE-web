'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import SettingsButton from '@/components/ui/SideMenu';
import FireBaseLogin from '@/components/ui/FireBaseLogin';
import { useI18n } from '@/i18n/LocaleProvider';
import { css } from 'styled-system/css';
import { SiteHeader } from '@/components/site/SiteHeader';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const is2Pick = pathname === '/deck/2pick';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <SiteHeader title={is2Pick ? t('2Pick構築') : t('デッキ構築')}>
        <SettingsButton />
        <FireBaseLogin />
      </SiteHeader>
      <main className={css({ minH: 'calc(100vh - 60px)', bg: { base: 'var(--brand-dots) 0 0 / 20px 20px, var(--brand-vanilla-wash)', _dark: 'transparent' } })}>{children}</main>
    </>
  );
}
