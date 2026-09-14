'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Darumadrop_One } from 'next/font/google';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';
import { useI18n } from '@/i18n/LocaleProvider';
import type { FruitType } from '@/types/card';

const darumadrop = Darumadrop_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

const officialTournaments = [
  { jaTitle: 'つぼみ杯', enTitle: 'Tsubomi Cup', jaDescription: '初心者向けの大会です。いちごカードのみを使用します。上級者は出禁もしくはハンデになりますので初めてでも勝ちやすい大会です！', enDescription: 'A beginner-friendly tournament using only Strawberry cards. Experienced players may be restricted or given a handicap.', fruits: ['strawberry'] as FruitType[], color: css({ bg: 'yellow.100', rounded: '2xl', p: '8' }) },
  { jaTitle: 'イチゴ杯', enTitle: 'Strawberry Cup', jaDescription: 'いちごカードのみを使う大会です。つぼみ杯で出禁になった人も出場できます！', enDescription: 'A tournament using only Strawberry cards. Players restricted from the Tsubomi Cup may also enter.', fruits: ['strawberry'] as FruitType[], color: css({ bg: 'red.100', rounded: '2xl', p: '8' }) },
  { jaTitle: 'ぶどう杯', enTitle: 'Grape Cup', jaDescription: 'ぶどうカードといちごカードを使う大会です。つぼみ杯より難しいけど初心者も歓迎！', enDescription: 'A tournament using Grape and Strawberry cards. It is more challenging than the Tsubomi Cup, but beginners are welcome.', fruits: ['grape', 'strawberry'] as FruitType[], color: css({ bg: 'purple.100', rounded: '2xl', p: '8' }) },
  { jaTitle: 'メロン杯', enTitle: 'Melon Cup', jaDescription: 'めろん・ぶどう・いちごカードを使う大会です。新しく追加されたメロンカードを使って推しの幼女でデッキを組んでみましょう！', enDescription: 'A tournament using Melon, Grape, and Strawberry cards. Build a deck around your favorite little girl with the newly added Melon cards.', fruits: ['melon', 'grape', 'strawberry'] as FruitType[], color: css({ bg: 'green.100', rounded: '2xl', p: '8' }) },
];

const personalTournaments = [
  { jaTitle: 'ようかん杯', enTitle: 'Yokan Cup', jaDescription: 'このサイトで2Pickゲームを使ってデッキを構築し、そのデッキで対戦する大会です。ランダムな選択肢から自分のデッキを組む独特の楽しさが味わえます。', enDescription: 'Build a deck with this site’s 2Pick draft, then use it in the tournament. Create your own strategy from randomized choices.', fruits: ['strawberry'] as FruitType[], color: css({ bg: 'indigo.100', rounded: '2xl', p: '8' }), link: '/deck/2pick?twoCardLimit=false&fruits=strawberry' },
];

export default function TournamentPage() {
  const { locale, fruitLabel } = useI18n();
  return (
    <main className={css({ minH: '100vh', w: 'full', pt: '10', pb: '12', px: '4' })}>
      <div className="container">
        <div className={css({ textAlign: 'center', mb: '12' })}>
          <h1 className={`${darumadrop.className} ${css({ fontSize: '4xl', md: { fontSize: '5xl' }, mb: '4' })}`}>
            {locale === 'ja' ? '大会について' : 'Tournaments'}
          </h1>
          <p className={css({ fontSize: 'lg', color: 'gray.700' })}>
            {locale === 'ja' ? 'レギュレーションの詳細や参加についてはDiscordを確認してください' : 'See Discord for complete rules and participation details.'}
          </p>
        </div>

        <section className={`main-background ${css({ mb: '16', p: '8', rounded: '2xl', borderWidth: '2px', borderColor: 'blue.300' })}`}>
          <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '6', textAlign: 'center', color: 'gray.800' })}`}>
            {locale === 'ja' ? '大会に参加したい方へ' : 'Want to join a tournament?'}
          </h2>
          <p className={css({ textAlign: 'center', color: 'gray.700', mb: '6', fontSize: 'base', lineHeight: 'relaxed' })}>
            {locale === 'ja' ? '大会への参加をご希望の方は、VRChatグループとDiscordサーバーに参加してください。' : 'Join the VRChat group and Discord server to take part.'}
          </p>

          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, gap: '4' })}>
            <a href="https://discord.com/invite/tjvQHMNgYc" target="_blank" rel="noopener noreferrer"
              className={`${button({ variant: 'primary', size: 'lg' })} ${css({
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3',
              })}`}>
              <Image src="/Discord-Symbol-Black.svg" alt="Discord" width={24} height={24} className={css({ filter: 'invert(1)' })} />
              {locale === 'ja' ? 'Discordサーバーに参加' : 'Join the Discord server'}
            </a>

            <a href="https://vrchat.com/home/group/grp_866c5ce6-7c41-49ce-9f60-6a1a143d7acf" target="_blank" rel="noopener noreferrer"
              className={`${button({ variant: 'primary', size: 'lg' })} ${css({
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3',
                bg: 'gray.900', _hover: { bg: 'black' },
              })}`}>
              <Image src="/VRChat-Logo-Black.png" alt="VRChat" width={24} height={24} className={css({ filter: 'invert(1)' })} />
              {locale === 'ja' ? 'VRChatグループに参加' : 'Join the VRChat group'}
            </a>
          </div>
        </section>

        <section className={css({ mb: '16' })}>
          <h2 className={`${darumadrop.className} ${css({ fontSize: '3xl', mb: '8', color: 'gray.800' })}`}>{locale === 'ja' ? '公式大会' : 'Official tournaments'}</h2>
          <div className={css({ display: 'flex', flexDirection: 'column', gap: '6' })}>
            {officialTournaments.map((tournament) => (
              <div key={tournament.enTitle} className={tournament.color}>
                <div className={css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: '4' })}>
                  <h3 className={`${darumadrop.className} ${css({ fontSize: '2xl', color: 'gray.800' })}`}>{locale === 'ja' ? tournament.jaTitle : tournament.enTitle}</h3>
                  <span className={css({ display: 'inline-block', px: '3', py: '1', bg: 'white', rounded: 'full', fontSize: 'xs', fontWeight: 'bold', color: 'gray.700' })}>{tournament.fruits.map(fruitLabel).join(' · ')}</span>
                </div>
                <p className={css({ color: 'gray.700', lineHeight: 'relaxed', fontSize: 'base' })}>{locale === 'ja' ? tournament.jaDescription : tournament.enDescription}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={css({ mb: '16' })}>
          <h2 className={`${darumadrop.className} ${css({ fontSize: '3xl', mb: '8', color: 'gray.800' })}`}>{locale === 'ja' ? '個人主催' : 'Community tournaments'}</h2>
          <div className={css({ display: 'flex', flexDirection: 'column', gap: '6' })}>
            {personalTournaments.map((tournament) => (
              <div key={tournament.enTitle} className={tournament.color}>
                <div className={css({ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: '4' })}>
                  <h3 className={`${darumadrop.className} ${css({ fontSize: '2xl', color: 'gray.800' })}`}>{locale === 'ja' ? tournament.jaTitle : tournament.enTitle}</h3>
                  <span className={css({ display: 'inline-block', px: '3', py: '1', bg: 'white', rounded: 'full', fontSize: 'xs', fontWeight: 'bold', color: 'gray.700' })}>{tournament.fruits.map(fruitLabel).join(' · ')}</span>
                </div>
                <p className={css({ color: 'gray.700', lineHeight: 'relaxed', fontSize: 'base', mb: '4' })}>{locale === 'ja' ? tournament.jaDescription : tournament.enDescription}</p>
                <Link href={tournament.link || '#'}>
                  <button className={button({ variant: 'primary', size: 'md' })}>{locale === 'ja' ? 'デッキ構築してみる' : 'Build a draft deck'}</button>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={`${darumadrop.className} ${css({ fontSize: '3xl', mb: '8', color: 'gray.800' })}`}>{locale === 'ja' ? 'その他' : 'More tools'}</h2>
          <div className={css({ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', md: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }, gap: '6' })}>
            <Link href="/build">
              <div className={`main-background ${css({
                p: '6', rounded: 'xl', cursor: 'pointer',
                transitionProperty: 'color, background-color',
              })}`}>
                <h3 className={`${darumadrop.className} ${css({ fontSize: 'xl', mb: '2' })}`}>{locale === 'ja' ? 'デッキをつくる' : 'Build a deck'}</h3>
                <p className={css({ color: 'gray.700', fontSize: 'sm' })}>{locale === 'ja' ? 'web上でもデッキを組むことができます' : 'Build and edit your deck in the browser.'}</p>
              </div>
            </Link>
            <Link href="/deck-view">
              <div className={`main-background ${css({
                p: '6', rounded: 'xl', cursor: 'pointer',
                transitionProperty: 'color, background-color',
              })}`}>
                <h3 className={`${darumadrop.className} ${css({ fontSize: 'xl', mb: '2' })}`}>{locale === 'ja' ? 'デッキのがぞうをつくる' : 'Create a deck image'}</h3>
                <p className={css({ color: 'gray.700', fontSize: 'sm' })}>{locale === 'ja' ? 'デッキコードから画像を生成できます' : 'Generate an image from deck codes.'}</p>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
