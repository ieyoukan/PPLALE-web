import Link from 'next/link';
import Image from 'next/image';
import { homeTitleFont } from './homeFont';
import { css } from 'styled-system/css';
import styles from './HeroSection.module.css';

const cardButtons = [
  { title: 'ぷぷりえーるとは', lines: ['ぷぷりえーる', 'とは'], href: '/about', img: '/images/back-card.webp' },
  { title: 'ゲームをプレイ', lines: ['ゲームを', 'プレイ'], href: '/game', img: '/images/back-card.webp' },
  { title: 'デッキをつくる', lines: ['デッキを', 'つくる'], href: '/build', img: '/images/back-card.webp' },
];

export default function HeroSection() {
  return (
    <section aria-label="ぷぷりえーるを遊ぶ" className={css({ position: 'relative', minH: '100svh' })}>
      <div className={css({ position: 'absolute', inset: '0' })}>
        <Image
          src="/top.jpg"
          alt=""
          fill
          loading="eager"
          sizes="100vw"
          placeholder="blur"
          blurDataURL="data:image/jpeg;base64,/9j/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAJABADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABAID/8QAJRAAAAQFAgcAAAAAAAAAAAAAAQIDBAAFERIxBiE0NVFyc7HB/8QAFQEBAQAAAAAAAAAAAAAAAAAAAQL/xAAWEQEBAQAAAAAAAAAAAAAAAAABADH/2gAMAwEAAhEDEQA/AMZaxlzpVJM6NXIBcclRpkMxc8I2YLWpJ2uA3IXcSFKPQMYgel+dJdpvUM1jxyHi+xZsLf/Z"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />
        <div className={css({ position: 'absolute', inset: '0' })}></div>
      </div>

      <div className={css({
        position: 'relative', zIndex: '10', minH: '100svh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '6', pt: '20', pb: '12', px: '4', md: { gap: '8' },
      })}>
        <h1
          className={css({ w: '80vw', maxW: '400px' })}
        >
          <Image src="/pupu_game.webp" alt="お菓子争奪戦争ぷぷりえーる" width={500} height={281}
            className={css({ w: 'full', h: 'auto' })} sizes="(max-width: 500px) 80vw, 400px" loading="eager" fetchPriority="high" />
        </h1>

        <nav
          aria-label="メニュー"
          className={css({
            display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            w: 'full', maxW: '640px', gap: '2.5', md: { gap: '6' },
          })}
        >
          {cardButtons.map((btn) => (
            <div
              key={btn.href}
              className={`${styles.card} ${css({ minW: '0', position: 'relative' })}`}
            >
              <Link href={btn.href} prefetch={false} aria-label={btn.title} className={css({
                display: 'block', position: 'relative', aspectRatio: '220 / 320',
                rounded: 'xl', boxShadow: '0 12px 24px rgba(45, 20, 45, 0.35)',
                _focusVisible: { outline: '3px solid white', outlineOffset: '6px' },
              })}>
                <Image src={btn.img} alt="" fill sizes="(max-width: 640px) 32vw, 260px"
                  style={{ objectFit: 'cover', borderRadius: '0.75rem' }} loading="eager" />
                <span aria-hidden="true" className={`${homeTitleFont.className} ${css({
                  position: 'absolute', inset: '0', zIndex: '10',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  bg: 'black/30', rounded: 'xl', fontWeight: 'normal',
                  fontSize: 'clamp(15px, 4.2vw, 30px)', color: 'white', px: '1', textAlign: 'center',
                  lineHeight: '1.4', textShadow: '0 2px 6px rgba(0, 0, 0, 0.6)',
                })}`}>
                  {btn.lines.map(line => <span key={line}>{line}</span>)}
                </span>
              </Link>
            </div>
          ))}
        </nav>
      </div>
    </section>
  );
}
