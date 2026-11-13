'use client';

import '@/app/panda.css';

import { SitePage, SitePanel } from '@/components/site/SitePage';
import { Bi } from '@/i18n/Bi';

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
    <SitePage ja="クレジット" en="Credits">
      <SitePanel prose>
          <div>
            <p>
              <Bi
                ja={<>すべてのゲーム内アセットは元の所有者に帰属します。<br />本ゲームは非営利目的で制作されており、すべての権利は各権利者に帰属します。</>}
                en={<>All in-game assets belong to their original owners.<br />This game is made on a non-commercial basis, and all rights belong to their respective holders.</>}
              />
            </p>
            <p>
              <Bi
                ja="また、本サイトで使用しているすべてのカード画像はVRChatカードゲーム「ぷぷりえーる」のものです。"
                en="All card images used on this site are from PPLALE, a card game played in VRChat."
              />
            </p>
          </div>

          <section>
            <h2><Bi ja="使用素材" en="Assets used" /></h2>
            <div>
              <div>
                <h3><Bi ja="アバター" en="Avatars" /></h3>
                {avatar.map((avatar, idx) => (
                <p key={idx}>
                  {/* ここにアバターのクレジット情報を記載 */}
                  <Bi ja="アバター名" en="Avatar" />: {avatar.Name}<br/>
                  <Bi ja="クレジット" en="Credit" />: {avatar.Credit}<br />
                  <Bi ja="リンク" en="Link" />: <a href={avatar.Link} target="_blank" rel="noopener noreferrer">{avatar.Link}</a><br />
                </p>
                ))}
              </div>

              <div>
                <h3><Bi ja="衣装" en="Outfits" /></h3>
                {clothes.map((clothes, idx) => (
                <p key={idx}>
                  {/* ここに衣装のクレジット情報を記載 */}
                  <Bi ja="衣装名" en="Outfit" />: {clothes.Name}<br />
                  <Bi ja="クレジット" en="Credit" />: {clothes.Credit}<br />
                  <Bi ja="リンク" en="Link" />: <a href={clothes.Link} target="_blank" rel="noopener noreferrer">{clothes.Link}</a><br />
                </p>
                ))}
              </div>
            </div>
          </section>

      </SitePanel>
    </SitePage>
  );
} 