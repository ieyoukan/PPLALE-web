'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import SettingsButton from '@/components/ui/SideMenu';
import FireBaseLogin from '@/components/ui/FireBaseLogin';
import { useI18n } from '@/i18n/LocaleProvider';
import { css } from 'styled-system/css';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const is2Pick = pathname === '/deck/2pick';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <header className={css({
        position: 'sticky', top: '0', h: '16', zIndex: '40',
        bg: { base: 'white/95', _dark: 'gray.900/95' },
        backdropBlur: 'md', borderBottomWidth: '1px',
        borderColor: { base: 'gray.200', _dark: 'gray.700' }, boxShadow: 'sm',
      })}>
        <div className={css({
          position: 'absolute', inset: '0', backgroundImage: 'url(\'/images/baner.webp\')',
          backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
          opacity: '0.15', _dark: { opacity: '0.08' },
        })} />
        <div className={css({ position: 'relative', zIndex: '1', maxW: 'breakpoint-2xl', mx: 'auto', px: '4', h: 'full', display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '4', minW: '0' })}>
            {is2Pick ? (
              <p className={css({ fontSize: '2xl', fontWeight: 'bold' })}>{t('2Pick構築')}</p>
            ) : (
              <Link className={css({ fontSize: 'xl', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })} href="/">
                {t('ぷぷりえーる デッキ構築')}
              </Link>
            )}
          </div>
          <div className={css({ display: 'flex', alignItems: 'center', gap: '3', flexShrink: '0' })}>
            <SettingsButton />
            <FireBaseLogin />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
