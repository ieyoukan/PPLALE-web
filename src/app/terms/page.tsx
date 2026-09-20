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

export default function Terms() {
  return (
    <main className={css({ minH: 'screen', bgGradient: 'to-b', gradientFrom: 'pink.100', gradientTo: 'white' })}>
      <div className={`container ${css({ px: '4', py: '16' })}`}>
        <h1 className={`${darumadrop.className} ${css({ fontSize: { base: '4xl', md: '5xl' }, textAlign: 'center', mb: '16', color: 'pink.600' })}`}>
          利用規約
        </h1>

        <div className={css({ maxW: '3xl', mx: 'auto', bg: 'white', rounded: 'xl', boxShadow: 'lg', p: '8' })}>
          <section className={css({ display: 'flex', flexDirection: 'column', gap: '8' })}>
            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>1. サービスの利用</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                当サービスは、VRChatのカードゲーム「ぷぷりえーる」のデッキ構築を支援するためのツールです。
                本サービスを利用することで、以下の規約に同意したものとみなされます。
              </p>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>2. 免責事項</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                当サービスに関して、以下の事項について免責とさせていただきます：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>サービスの利用により生じたいかなる損害についても、当サービスは責任を負いません</li>
                <li>サービスの中断、停止、終了、データの消失等により生じたいかなる損害についても、当サービスは責任を負いません</li>
                <li>当サービスは予告なくサービスの内容を変更または終了する場合があります</li>
                <li>当サービスは、ユーザー間のトラブルについて一切の責任を負いません</li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>3. 禁止事項</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                以下の行為を禁止します：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>法令または公序良俗に違反する行為</li>
                <li>当サービスの運営を妨害する行為</li>
                <li>他のユーザーに迷惑をかける行為</li>
                <li>当サービスのシステムに不正アクセスする行為</li>
                <li>その他、当サービスが不適切と判断する行為</li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>4. 知的財産権</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                当サービスで使用されている画像(アバター、衣装も含む)やコンテンツの著作権は、それぞれの権利者に帰属します。
                ユーザーは、権利者の許可なく、これらのコンテンツを複製、改変、再配布することはできません。
              </p>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                権利者からの要請があった場合、当サービスは以下の対応を行います：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>該当するコンテンツの即時削除または変更</li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>5. 利用規約の変更</h2>
              <p className={css({ color: 'gray.700' })}>
                当サービスは、必要に応じて本利用規約を変更することがあります。
                変更があった場合は、本ページでお知らせします。
              </p>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>6. 準拠法</h2>
              <p className={css({ color: 'gray.700' })}>
                本利用規約の解釈にあたっては、日本法を準拠法とします。
              </p>
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