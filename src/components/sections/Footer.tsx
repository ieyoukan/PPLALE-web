import Link from 'next/link';
import { css } from 'styled-system/css';
import { Bi } from '@/i18n/Bi';

const links = [
  { href: '/community', ja: 'コミュニティ', en: 'Community' },
  { href: '/privacy-policy', ja: 'プライバシーポリシー', en: 'Privacy Policy' },
  { href: '/terms', ja: '利用規約', en: 'Terms of Use' },
  { href: '/credits', ja: 'クレジット', en: 'Credits' },
  { href: '/contact', ja: 'お問い合わせ', en: 'Contact' },
];

// サイト共通のフッター。ココア色の帯に、桜色の水玉で区切ったリンクを並べる。
export default function Footer() {
  return (
    <footer className={css({ py: '3', px: '4', w: 'full', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1', bg: 'var(--brand-cocoa-deep)', textAlign: 'center' })}>
      <div className={css({ fontSize: 'xs', color: 'var(--brand-cream)' })}>© 2025 ぷぷりえーる</div>
      <nav className={css({ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '3', rowGap: '1', fontSize: 'xs' })}>
        {links.map((link, index) => (
          <span key={link.href} className={css({ display: 'inline-flex', alignItems: 'center', gap: '3' })}>
            {index > 0 && <span aria-hidden="true" className={css({ color: 'var(--brand-pink)' })}>•</span>}
            <Link href={link.href} prefetch={false} className={css({ color: 'var(--brand-cream)', _hover: { color: 'var(--brand-vanilla)' }, transitionProperty: 'color' })}>
              <Bi ja={link.ja} en={link.en} />
            </Link>
          </span>
        ))}
      </nav>
    </footer>
  );
}
