'use client';

import '@/app/panda.css';

import { siteTitleFont } from '@/app/fonts';
import Link from 'next/link';
import { css } from 'styled-system/css';
import { Bi } from '@/i18n/Bi';

export default function Contact() {
  return (
    <main className={css({ minH: 'screen', bgGradient: 'to-b', gradientFrom: 'pink.100', gradientTo: 'white' })}>
      <div className={`container ${css({ px: '4', py: '16' })}`}>
        <h1 className={`${siteTitleFont.className} ${css({ fontSize: { base: '4xl', md: '5xl' }, textAlign: 'center', mb: '16', color: 'pink.600' })}`}>
          <Bi ja="お問い合わせ" en="Contact" />
        </h1>

        <div className={css({ maxW: '3xl', mx: 'auto', bg: 'white', rounded: 'xl', boxShadow: 'lg', p: '8' })}>
          <section className={css({ display: 'flex', flexDirection: 'column', gap: '8' })}>
            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="ぷぷりえーるについて" en="About PPLALE" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="ぷぷりえーるの運営やカード、ゲームルールについてのお問い合わせは、以下の方法でお願いします：" en="For questions about PPLALE events, cards or game rules, please contact us here:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>VRChat: <Bi ja="ぷぷりえーるグループに参加してください。" en="Join the PPLALE group." /></li>
                <li>Twitter: </li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="デッキビルダーについて" en="About this website" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="このデッキビルダー（Webアプリ）についてのお問い合わせは、以下の方法でお願いします：" en="For questions about this website (the web app), please contact us here:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>GitHub: <a href="https://github.com/ieyoukan" className={css({ color: 'blue.500', _hover: { color: 'blue.600' } })} target="_blank" rel="noopener noreferrer">https://github.com/ieyoukan</a></li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="お問い合わせの際の注意" en="Before you contact us" /></h2>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li><Bi ja="お問い合わせの内容を具体的にお知らせください" en="Please describe your question in detail" /></li>
                <li><Bi ja="不具合の報告の場合は、発生時の状況や再現手順があると助かります" en="For bug reports, what happened and how to reproduce it helps a lot" /></li>
                <li><Bi ja="ご要望やご提案も大歓迎です" en="Requests and suggestions are very welcome" /></li>
              </ul>
            </div>
          </section>

          <div className={css({ textAlign: 'center', mt: '8' })}>
            <Link
              href="/"
              className={css({ display: 'inline-block', bg: 'pink.500', color: 'white', px: '6', py: '2', rounded: 'full', transitionProperty: 'color, background-color, border-color, text-decoration-color, fill, stroke', _hover: { bg: 'pink.600' } })}
            >
              <Bi ja="トップページに戻る" en="Back to the top page" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}