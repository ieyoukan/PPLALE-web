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

export default function PrivacyPolicy() {
  return (
    <main className={css({ minH: 'screen', bgGradient: 'to-b', gradientFrom: 'pink.100', gradientTo: 'white' })}>
      <div className={`container ${css({ px: '4', py: '16' })}`}>
        <h1 className={`${darumadrop.className} ${css({ fontSize: { base: '4xl', md: '5xl' }, textAlign: 'center', mb: '16', color: 'pink.600' })}`}>
          プライバシーポリシー
        </h1>

        <div className={css({ maxW: '3xl', mx: 'auto', bg: 'white', rounded: 'xl', boxShadow: 'lg', p: '8' })}>
          <section className={css({ display: 'flex', flexDirection: 'column', gap: '8' })}>
            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>1. 収集する情報</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                当サービスでは、以下の情報を収集する場合があります：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>Firebaseに保存される情報：
                  <ul className={css({ listStyleType: 'disc', pl: '6', mt: '2' })}>
                    <li>Googleアカウントのメールアドレス（ログイン時）</li>
                    <li>デッキデータ（ログイン時のみ保存）</li>
                  </ul>
                </li>
                <li>クライアント側でのみ使用される情報（サーバーには保存されません）：
                  <ul className={css({ listStyleType: 'disc', pl: '6', mt: '2' })}>
                    <li>Googleアカウントのユーザー名（ログイン時の表示用）</li>
                    <li>Googleアカウントのプロフィール画像（ログイン時のアイコン表示用）</li>
                  </ul>
                </li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>2. 情報の利用目的</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                収集した情報は以下の目的で利用されます：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>ユーザー認証</li>
                <li>デッキデータの保存、共有</li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>3. 情報の管理</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                当サービスでは、収集した情報を適切に管理し、以下の取り組みを行っています：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>Firebaseのセキュリティ機能を活用した安全なデータ管理</li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>4. 情報の共有</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                当サービスでは、収集した情報を以下の場合を除き、第三者に提供することはありません：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>法令に基づく場合</li>
                <li>ユーザーの同意がある場合</li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>5. ユーザーの権利</h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                ユーザーは以下の権利を有します：
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li>自身のデータの削除要求権</li>
              </ul>
            </div>

            <div>
              <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>6. プライバシーポリシーの変更</h2>
              <p className={css({ color: 'gray.700' })}>
                当サービスは、必要に応じて本プライバシーポリシーを変更することがあります。
                変更があった場合は、本ページでお知らせします。
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