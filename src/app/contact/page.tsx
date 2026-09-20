'use client';

import React from 'react';
import { Darumadrop_One } from 'next/font/google';
import Link from 'next/link';
import { css } from 'styled-system/css';

const darumadrop = Darumadrop_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

export default function Contact() {
  return (
    <main className={css({ minH: 'screen', bgGradient: 'to-b', gradientFrom: 'pink.100', gradientTo: 'white' })}>
      <div className={`container ${css({ px: '4', py: '16' })}`}>
        <h1 className={`${darumadrop.className} ${css({ fontSize: { base: '4xl', md: '5xl' }, textAlign: 'center', mb: '16', color: 'pink.600' })}`}>
          お問い合わせ
        </h1>

        <div className={css({ maxW: '3xl', mx: 'auto', bg: 'white', rounded: 'xl', boxShadow: 'lg', p: '8' })}>
          <section className={css({ display: 'flex', flexDirection: 'column', gap: '8' })}>
            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>ぷぷりえーるについて</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                ぷぷりえーるの運営やカード、ゲームルールについてのお問い合わせは、以下の方法でお願いします：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>VRChat: ぷぷりえーるグループに参加してください。</li>
                <li>Twitter: </li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>デッキビルダーについて</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                このデッキビルダー（Webアプリ）についてのお問い合わせは、以下の方法でお願いします：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>GitHub: <a href="https://github.com/ieyoukan" className={css({ color: 'blue.500', _hover: { color: 'blue.600' } })} target="_blank" rel="noopener noreferrer">https://github.com/ieyoukan</a></li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>お問い合わせの際の注意</h2>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>お問い合わせの内容を具体的にお知らせください</li>
                <li>不具合の報告の場合は、発生時の状況や再現手順があると助かります</li>
                <li>ご要望やご提案も大歓迎です</li>
              </ul>
            </div>
          </section>

          <div className={css({ textAlign: 'center', mt: '8' })}>
            <Link
              href="/"
              className={css({ display: 'inline-block', bg: 'pink.500', color: 'white', px: '6', py: '2', rounded: 'full', transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke', _hover: { bg: 'pink.600' } })}
            >
              トップページに戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}