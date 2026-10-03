import Image from 'next/image';
import Link from 'next/link';
import { Darumadrop_One } from 'next/font/google';
import { css } from 'styled-system/css';

const darumadrop = Darumadrop_One({ weight: '400', subsets: ['latin'], display: 'swap' });

export default function ToolsSection() {
  return (
    <section aria-labelledby="tools-heading" className={css({ bg: 'pink.50', px: '4', py: '16', md: { py: '20' } })}>
      <div className={css({ maxW: '3xl', mx: 'auto' })}>
        <h2 id="tools-heading" className={`${darumadrop.className} ${css({
          fontSize: '4xl', textAlign: 'center', color: 'pink.700', mb: '8', md: { fontSize: '5xl' },
        })}`}>便利ツール</h2>
        <Link href="/deck-view" className={css({
          display: 'flex', alignItems: 'center', gap: '4', p: '5', minH: '32',
          bg: 'white', color: 'gray.800', rounded: '2xl', borderWidth: '2px', borderColor: 'pink.200',
          boxShadow: '0 8px 24px rgba(157, 70, 108, 0.1)',
          transition: 'transform 0.2s ease, border-color 0.2s ease',
          _hover: { transform: 'translateY(-4px)', borderColor: 'pink.400' },
          _focusVisible: { outline: '3px solid', outlineColor: 'pink.500', outlineOffset: '4px' },
          md: { gap: '6', p: '8' },
        })}>
          <Image src="/images/back-card.webp" alt="" width={66} height={96}
            className={css({ flexShrink: '0', rounded: 'md', boxShadow: 'md' })} />
          <div className={css({ flex: '1', minW: '0' })}>
            <h3 className={`${darumadrop.className} ${css({ fontSize: '2xl', color: 'pink.700', md: { fontSize: '3xl' } })}`}>
              デッキのがぞうをつくる
            </h3>
            <p className={css({ mt: '2', fontSize: 'base', lineHeight: 'relaxed' })}>
              デッキのカードを1枚の画像にまとめて、保存・シェアできます。
            </p>
          </div>
          <span aria-hidden="true" className={css({ color: 'pink.600', fontSize: '2xl', flexShrink: '0' })}>→</span>
        </Link>
      </div>
    </section>
  );
}
