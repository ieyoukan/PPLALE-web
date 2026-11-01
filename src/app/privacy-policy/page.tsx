'use client';

import '@/app/panda.css';

import { siteTitleFont } from '@/app/fonts';
import Link from 'next/link';
import { css } from 'styled-system/css';
import { Bi } from '@/i18n/Bi';

export default function PrivacyPolicy() {
  return (
    <main className={css({ minH: 'screen', bgGradient: 'to-b', gradientFrom: 'pink.100', gradientTo: 'white' })}>
      <div className={`container ${css({ px: '4', py: '16' })}`}>
        <h1 className={`${siteTitleFont.className} ${css({ fontSize: { base: '4xl', md: '5xl' }, textAlign: 'center', mb: '16', color: 'pink.600' })}`}>
          <Bi ja="プライバシーポリシー" en="Privacy Policy" />
        </h1>

        <div className={css({ maxW: '3xl', mx: 'auto', bg: 'white', rounded: 'xl', boxShadow: 'lg', p: '8' })}>
          <p data-lang="en" lang="en" className={css({ color: 'gray.700', fontSize: 'sm', mb: '8' })}>
            This English translation is provided for convenience. The Japanese text is the governing version.
          </p>
          <section className={css({ display: 'flex', flexDirection: 'column', gap: '8' })}>
            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="1. 収集する情報" en="1. Information we collect" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="当サービスでは、以下の情報を収集する場合があります：" en="The service may collect the following information:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li><Bi ja="Firebaseに保存される情報：" en="Information stored in Firebase:" />
                  <ul className={css({ listStyleType: 'disc', pl: '6', mt: '2' })}>
                    <li><Bi ja="Googleアカウントのメールアドレス（ログイン時）" en="The email address of your Google account (when you sign in)" /></li>
                    <li><Bi ja="デッキデータ（ログイン時のみ保存）" en="Deck data (saved only when you are signed in)" /></li>
                  </ul>
                </li>
                <li><Bi ja="対戦サーバーに一時的に保存される情報（ゲームのルームを利用した場合）：" en="Information kept temporarily on the match server (when you use game rooms):" />
                  <ul className={css({ listStyleType: 'disc', pl: '6', mt: '2' })}>
                    <li><Bi ja="入力した名前（対戦相手に表示されます）、使用したデッキ、対戦の進行状況" en="The name you enter (shown to other players), the deck you use and the progress of the match" /></li>
                    <li><Bi ja="ログイン中は公開プロフィールのIDと名前を使います。Googleアカウントの名前・メールアドレス・写真を対戦相手に表示することはありません" en="When you are signed in, your public profile ID and name are used. The name, email address and photo of your Google account are never shown to other players" /></li>
                    <li><Bi ja="対戦を進めるためだけに使い、ルームを使わなくなってから12時間で削除します" en="It is used only to run the match and is deleted 12 hours after the room is last used" /></li>
                    <li><Bi ja="ルーム内チャットの本文・送信者・送信時刻を、最新50件までルームの状態として保存します。別ルームや対戦のリプレイには引き継ぎません" en="The text, sender and time of the latest 50 chat messages in a room are kept as part of the room. They are not carried over to other rooms or match replays" /></li>
                    <li><Bi ja="送信元のIPアドレスは、連続した操作を制限するために一時的に使い、保存しません" en="Your IP address is used briefly to limit rapid repeated actions and is not stored" /></li>
                  </ul>
                </li>
                <li><Bi ja="CPUの学習用サーバーに保存される情報（ゲームで「さいきょう」のCPUと対戦し、送信に同意した場合のみ）：" en="Information stored on the CPU training server (only when you play the strongest CPU in the game and agree to send it):" />
                  <ul className={css({ listStyleType: 'disc', pl: '6', mt: '2' })}>
                    <li><Bi ja="対戦の記録（お互いのデッキに入っているカード、お互いが打った手、勝敗、受け取った日付）" en="Match records (the cards in both decks, the moves both players made, the result and the date received)" /></li>
                    <li><Bi ja="名前、アカウントの情報、デッキの名前は含まれません。ログインしていなくても同じ内容です" en="They do not include names, account information or deck names. The content is the same whether or not you are signed in" /></li>
                    <li><Bi ja="送信元のIPアドレスは、連続した送信を制限するために一時的に使い、記録には保存しません" en="Your IP address is used briefly to limit rapid repeated sending and is not stored in the records" /></li>
                  </ul>
                </li>
                <li><Bi ja="クライアント側でのみ使用される情報（サーバーには保存されません）：" en="Information used only in your browser (not stored on any server):" />
                  <ul className={css({ listStyleType: 'disc', pl: '6', mt: '2' })}>
                    <li><Bi ja="Googleアカウントのユーザー名（ログイン時の表示用）" en="The user name of your Google account (shown while you are signed in)" /></li>
                    <li><Bi ja="Googleアカウントのプロフィール画像（ログイン時のアイコン表示用）" en="The profile picture of your Google account (shown as your icon while you are signed in)" /></li>
                  </ul>
                </li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="2. 情報の利用目的" en="2. How we use information" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="収集した情報は以下の目的で利用されます：" en="The information collected is used for:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li><Bi ja="ユーザー認証" en="Signing you in" /></li>
                <li><Bi ja="デッキデータの保存、共有" en="Saving and sharing deck data" /></li>
                <li><Bi ja="ゲームのCPUの学習と、その強さの計測" en="Training the game's CPU opponents and measuring their strength" /></li>
                <li><Bi ja="ゲームのルームへの参加、ルーム内チャット、対戦の進行" en="Joining game rooms, room chat and running matches" /></li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="3. 情報の管理" en="3. How we manage information" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="当サービスでは、収集した情報を適切に管理し、以下の取り組みを行っています：" en="The service manages the information it collects with care, including:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li><Bi ja="Firebaseのセキュリティ機能を活用した安全なデータ管理" en="Secure data management using Firebase's security features" /></li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="4. 情報の共有" en="4. Sharing information" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="当サービスでは、収集した情報を以下の場合を除き、第三者に提供することはありません：" en="The service does not provide the information it collects to third parties except:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li><Bi ja="法令に基づく場合" en="When required by law" /></li>
                <li><Bi ja="ユーザーの同意がある場合" en="When you have given your consent" /></li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="5. ユーザーの権利" en="5. Your rights" /></h2>
              <p className={css({ color: 'gray.700', mb: '4' })}>
                <Bi ja="ユーザーは以下の権利を有します：" en="You have the following rights:" />
              </p>
              <ul className={css({ listStyleType: 'disc', pl: '6', color: 'gray.700', display: 'flex', flexDirection: 'column', gap: '2' })}>
                <li><Bi ja="自身のデータの削除要求権" en="The right to ask for your data to be deleted" /></li>
                <li><Bi ja="対戦の記録の送信は、ゲームの準備画面からいつでもやめられます。すでに送られた記録は、だれの対戦かを区別できないため、個別に取り出して削除することはできません" en="You can stop sending match records at any time from the game's setup screen. Records already sent cannot be identified as yours, so they cannot be found and deleted individually" /></li>
              </ul>
            </div>

            <div>
              <h2 className={`${siteTitleFont.className} ${css({ fontSize: '2xl', mb: '4', color: 'pink.500' })}`}><Bi ja="6. プライバシーポリシーの変更" en="6. Changes to this policy" /></h2>
              <p className={css({ color: 'gray.700' })}>
                <Bi
                  ja="当サービスは、必要に応じて本プライバシーポリシーを変更することがあります。 変更があった場合は、本ページでお知らせします。"
                  en="The service may change this privacy policy when necessary. Any changes will be announced on this page."
                />
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
