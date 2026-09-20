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

const avatar = [
  {
    Name: '【オリジナル３Dモデル】mia -ミア-',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://sisters.booth.pm/items/2908226',
  },
  {
    Name: '【VRアバター「こぎちゅね姉妹」',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://sisters.booth.pm/items/1105122',
  },
  {
    Name: 'original 3D model 「cocoa-ココア-」',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://sisters.booth.pm/items/3639280',
  },
  {
    Name: 'オリジナル３Dモデル「ぽんとちゅね pon&chune」 #chibi_kemo',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://booth.pm/ja/items/5335595',
  },
  {
    Name: 'original 3D model 「ましゅ -mashu-」',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://booth.pm/ja/items/3878174',
  },
  {
    Name: 'オリジナル3Dモデル「たま-tama-」',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://booth.pm/ja/items/2991523',
  },
  {
    Name: 'オリジナル３Dモデル「ぱたにゃこ　patanyako」',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://sisters.booth.pm/items/5129661',
  },
  {
    Name: 'Original 3D Model ［nero -ネロ-］',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://booth.pm/ja/items/3436014',
  },
  {
    Name: 'オリジナル3Dモデル『アズキ』',
    Credit: '©えも研',
    Link: 'https://booth.pm/ja/items/6654988',
  },
  {
    Name: 'オリジナル3Dモデル『クララ』',
    Credit: '©えも研',
    Link: 'https://emolab.booth.pm/items/5484178',
  },
  {
    Name: 'オリジナル３Dモデル「てまり temari」',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://booth.pm/ja/items/4962906',
  },
  {
    Name: 'オリジナル3Ｄモデル 紫苑_Sion',
    Credit: '©Lemiel_atelier',
    Link: 'https://booth.pm/ja/items/3987778',
  },
  
];

const clothes = [
  {
    Name: '着せ替えデータ「テディベアエプロンドレス」',
    Credit: '「Hamuketsu/はむけつ」©Sisters!',
    Link: 'https://sisters.booth.pm/items/1829886',
  },
  {
    Name: '【15アバター対応】WiccaMaid【VRChat】',
    Credit: '#NookNook',
    Link: 'https://osatoubox.booth.pm/items/6148778',
  },
  {
    Name: '【ましゅちゃん対応】みるきぃロリータ',
    Credit: '@AnomaNice',
    Link: 'https://anomanice.booth.pm/items/4112140',
  },
  {
    Name: 'Lepus hair うさぎ座ヘア【VRChat】',
    Credit: '©VAlice',
    Link: 'https://booth.pm/ja/items/5618066',
  },
  {
    Name: '【15アバター対応】Urban Rabbit',
    Credit: 'PLUMARIUM',
    Link: 'https://booth.pm/ja/items/4658833',
  },
  {
    Name: 'ゆるふわ ツインテール VRC用',
    Credit: '©#Ene_Collection',
    Link: 'https://booth.pm/ja/items/3999987',
  },
  
]

export default function Credits() {
  return (
    <main className={css({ minH: 'screen', bgGradient: 'to-b', gradientFrom: 'pink.100', gradientTo: 'white' })}>
      <div className={`container ${css({ px: '4', py: '16' })}`}>
        <h1 className={`${darumadrop.className} ${css({ fontSize: { base: '4xl', md: '5xl' }, textAlign: 'center', mb: '16', color: 'pink.600' })}`}>
          クレジット
        </h1>

        <div className={css({ maxW: '3xl', mx: 'auto', bg: 'white', rounded: 'xl', boxShadow: 'lg', p: '8' })}>
          <div className={css({ mb: '8', p: '4', bg: 'gray.50', rounded: 'lg' })}>
            <p className={css({ fontSize: 'sm', color: 'gray.600', lineHeight: 'relaxed' })}>
              すべてのゲーム内アセットは元の所有者に帰属します。<br />
              本ゲームは非営利目的で制作されており、すべての権利は各権利者に帰属します。
            </p>
            <p className={css({ fontSize: 'sm', color: 'gray.600', lineHeight: 'relaxed' })}>
              また、本サイトで使用しているすべてのカード画像はVRChatカードゲーム「ぷぷりえーる」のものです。
            </p>
          </div>

          <section className={css({ mb: '8' })}>
            <h2 className={`${darumadrop.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}>使用素材</h2>
            <div className={css({ display: 'flex', flexDirection: 'column', gap: '4' })}>
              <div className={css({ borderBottomWidth: '1px', pb: '4' })}>
                <h3 className={css({ fontWeight: 'bold', fontSize: 'lg', mb: '2' })}>アバター</h3>
                {avatar.map((avatar, idx) => (
                <p className={css({ fontSize: 'sm', mb: '3', lineHeight: 'relaxed' })} key={idx}>
                  {/* ここにアバターのクレジット情報を記載 */}
                  アバター名: {avatar.Name}<br/>
                  クレジット: {avatar.Credit}<br />
                  リンク: <a href={avatar.Link} target="_blank" className={css({ color: 'blue.500', _hover: { color: 'blue.600' } })} rel="noopener noreferrer">{avatar.Link}</a><br />
                </p>
                ))}
              </div>

              <div className={css({ borderBottomWidth: '1px', pb: '4' })}>
                <h3 className={css({ fontWeight: 'bold', fontSize: 'lg', mb: '2' })}>衣装</h3>
                {clothes.map((clothes, idx) => (
                <p className={css({ fontSize: 'sm', mb: '2', lineHeight: 'relaxed' })} key={idx}>
                  {/* ここに衣装のクレジット情報を記載 */}
                  衣装名: {clothes.Name}<br />
                  クレジット: {clothes.Credit}<br />
                  リンク: <a href={clothes.Link} target="_blank" className={css({ color: 'blue.500', _hover: { color: 'blue.600' } })} rel="noopener noreferrer">{clothes.Link}</a><br />
                </p>
                ))}
              </div>
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