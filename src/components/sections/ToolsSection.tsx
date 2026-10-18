import Image from 'next/image';
import Link from 'next/link';
import { Darumadrop_One } from 'next/font/google';
import { css } from 'styled-system/css';

const darumadrop = Darumadrop_One({ weight: '400', subsets: ['latin'], display: 'swap' });

const destinations = [
  { href: '/game', title: 'ブラウザで対戦', description: 'CPUと練習したり、ルームで友達と遊んだり。', image: '/images/fruits/いちご.webp' },
  { href: '/build', title: 'デッキをつくる', description: 'カードを探して、推しのデッキを保存・シェア。', image: '/images/back-card.webp' },
  { href: '/deck/2pick', title: '2Pickであそぶ', description: '2つの候補からカードを選んで、デッキをつくろう。', image: '/images/back-card.webp' },
  { href: '/tournament', title: '大会をチェック', description: '大会情報や参加方法はこちら。', image: '/images/fruits/いちご.webp' },
  { href: '/deck-view', title: 'デッキのがぞうをつくる', description: 'カードを1枚の画像にまとめて、保存・シェア。', image: '/images/back-card.webp' },
];

export default function ToolsSection() {
  return (
    <section aria-labelledby="tools-heading" className={css({ bg: 'pink.50', px: '4', py: '16', md: { py: '20' } })}>
      <div className={css({ maxW: '5xl', mx: 'auto' })}>
        <h2 id="tools-heading" className={`${darumadrop.className} ${css({
          fontSize: '4xl', textAlign: 'center', color: 'pink.700', mb: '8', md: { fontSize: '5xl' },
        })}`}>もっと、ぷぷりえーる</h2>
        <div className={css({ display: 'grid', gap: '4', md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } })}>
          {destinations.map(destination => (
            <Link key={destination.href} href={destination.href} className={css({
              display: 'flex', alignItems: 'center', gap: '4', p: '5', minH: '32',
              bg: 'white', color: 'gray.800', rounded: '2xl', borderWidth: '2px', borderColor: 'pink.200',
              boxShadow: '0 8px 24px rgba(157, 70, 108, 0.1)',
              transition: 'transform 0.2s ease, border-color 0.2s ease',
              _hover: { transform: 'translateY(-4px)', borderColor: 'pink.400' },
              _focusVisible: { outline: '3px solid', outlineColor: 'pink.500', outlineOffset: '4px' },
            })}>
              <Image src={destination.image} alt="" width={55} height={80}
                className={css({ flexShrink: '0', rounded: 'md', objectFit: 'contain' })} />
              <div className={css({ flex: '1', minW: '0' })}>
                <h3 className={`${darumadrop.className} ${css({ fontSize: '2xl', color: 'pink.700' })}`}>
                  {destination.title}
                </h3>
                <p className={css({ mt: '2', fontSize: 'sm', lineHeight: 'relaxed' })}>
                  {destination.description}
                </p>
              </div>
              <span aria-hidden="true" className={css({ color: 'pink.600', fontSize: '2xl', flexShrink: '0' })}>→</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
