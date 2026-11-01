'use client';

import '@/app/panda.css';

import { siteTitleFont } from '@/app/fonts';
import Link from 'next/link';
import { css } from 'styled-system/css';
import { Bi } from '@/i18n/Bi';

export default function Terms() {
  return (
    <main className={css({ minH: 'screen', bgGradient: 'to-b', gradientFrom: 'pink.100', gradientTo: 'white' })}>
      <div className={`container ${css({ px: '4', py: '16' })}`}>
        <h1 className={`${siteTitleFont.className} ${css({ fontSize: { base: '4xl', md: '5xl' }, textAlign: 'center', mb: '16', color: 'pink.600' })}`}>
          <Bi ja="利用規約" en="Terms of Use" />
        </h1>

        <div className={css({ maxW: '3xl', mx: 'auto', bg: 'white', rounded: 'xl', boxShadow: 'lg', p: '8' })}>
          <p data-lang="en" lang="en" className={css({ color: 'gray.700', fontSize: 'sm', mb: '8' })}>
            This English translation is provided for convenience. The Japanese text is the governing version.
          </p>
          <section className={css({ display: 'flex', flexDirection: 'column', gap: '8' })}>
            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="1. サービスの利用" en="1. Use of the service" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi
                  ja="当サービスは、VRChatのカードゲーム「ぷぷりえーる」のデッキ構築を支援するためのツールです。 本サービスを利用することで、以下の規約に同意したものとみなされます。"
                  en="This service is a tool for building decks for PPLALE, a card game played in VRChat. By using this service, you are deemed to have agreed to the following terms."
                />
              </p>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="2. 免責事項" en="2. Disclaimer" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="当サービスに関して、以下の事項について免責とさせていただきます：" en="This service accepts no liability for the following:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li><Bi ja="サービスの利用により生じたいかなる損害についても、当サービスは責任を負いません" en="Any damage arising from the use of the service" /></li>
                <li><Bi ja="サービスの中断、停止、終了、データの消失等により生じたいかなる損害についても、当サービスは責任を負いません" en="Any damage arising from the interruption, suspension or end of the service, or from the loss of data" /></li>
                <li><Bi ja="当サービスは予告なくサービスの内容を変更または終了する場合があります" en="The service may be changed or ended without notice" /></li>
                <li><Bi ja="当サービスは、ユーザー間のトラブルについて一切の責任を負いません" en="Any dispute between users" /></li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="3. 禁止事項" en="3. Prohibited conduct" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="以下の行為を禁止します：" en="The following are prohibited:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li><Bi ja="法令または公序良俗に違反する行為" en="Acts that violate the law or public order and morals" /></li>
                <li><Bi ja="当サービスの運営を妨害する行為" en="Acts that interfere with the operation of the service" /></li>
                <li><Bi ja="他のユーザーに迷惑をかける行為" en="Acts that cause trouble for other users" /></li>
                <li><Bi ja="当サービスのシステムに不正アクセスする行為" en="Unauthorized access to the service's systems" /></li>
                <li><Bi ja="その他、当サービスが不適切と判断する行為" en="Any other acts the service considers inappropriate" /></li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="4. 知的財産権" en="4. Intellectual property" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi
                  ja="当サービスで使用されている画像(アバター、衣装も含む)やコンテンツの著作権は、それぞれの権利者に帰属します。 ユーザーは、権利者の許可なく、これらのコンテンツを複製、改変、再配布することはできません。"
                  en="The copyright in the images (including avatars and outfits) and other content used in this service belongs to their respective owners. Users may not copy, modify or redistribute this content without the owner's permission."
                />
              </p>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="権利者からの要請があった場合、当サービスは以下の対応を行います：" en="At the request of a rights holder, the service will:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li><Bi ja="該当するコンテンツの即時削除または変更" en="Promptly remove or change the content concerned" /></li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="5. 利用規約の変更" en="5. Changes to these terms" /></h2>
              <p className={css({ color: 'gray.700' })}>
                <Bi
                  ja="当サービスは、必要に応じて本利用規約を変更することがあります。 変更があった場合は、本ページでお知らせします。"
                  en="The service may change these terms when necessary. Any changes will be announced on this page."
                />
              </p>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="6. 準拠法" en="6. Governing law" /></h2>
              <p className={css({ color: 'gray.700' })}>
                <Bi ja="本利用規約の解釈にあたっては、日本法を準拠法とします。" en="These terms are governed by and interpreted under the laws of Japan." />
              </p>
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