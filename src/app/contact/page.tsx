'use client';

import '@/app/panda.css';

import { SitePage, SitePanel } from '@/components/site/SitePage';
import { Bi } from '@/i18n/Bi';
import { DISCORD_INVITE_URL } from '@/lib/communityLinks';

export default function Contact() {
  return (
    <SitePage ja="お問い合わせ" en="Contact">
      <SitePanel prose>
          <section>
            <div>
              <h2><Bi ja="ぷぷりえーるについて" en="About PPLALE" /></h2>
              <p>
                <Bi ja="ぷぷりえーるの運営やカード、ゲームルールについてのお問い合わせは、以下の方法でお願いします：" en="For questions about PPLALE events, cards or game rules, please contact us here:" />
              </p>
              <ul>
                <li>Discord: <a href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer"><Bi ja="ぷぷりえーるのサーバー" en="the PPLALE server" /></a></li>
              </ul>
            </div>

            <div>
              <h2><Bi ja="デッキビルダーについて" en="About this website" /></h2>
              <p>
                <Bi ja="このデッキビルダー（Webアプリ）についてのお問い合わせは、以下の方法でお願いします：" en="For questions about this website (the web app), please contact us here:" />
              </p>
              <ul>
                <li>GitHub: <a href="https://github.com/ieyoukan" target="_blank" rel="noopener noreferrer">https://github.com/ieyoukan</a></li>
              </ul>
            </div>

            <div>
              <h2><Bi ja="お問い合わせの際の注意" en="Before you contact us" /></h2>
              <ul>
                <li><Bi ja="お問い合わせの内容を具体的にお知らせください" en="Please describe your question in detail" /></li>
                <li><Bi ja="不具合の報告の場合は、発生時の状況や再現手順があると助かります" en="For bug reports, what happened and how to reproduce it helps a lot" /></li>
                <li><Bi ja="ご要望やご提案も大歓迎です" en="Requests and suggestions are very welcome" /></li>
              </ul>
            </div>
          </section>

      </SitePanel>
    </SitePage>
  );
}