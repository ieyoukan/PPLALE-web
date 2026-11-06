import type { Metadata } from 'next';
import AboutPage from '@/components/about/AboutPage';
import RulesDoc, { loadRules } from '@/components/about/RulesDoc';
import { site } from '@/lib/site';

// 検索・共有・AIエージェント向けの情報は docs/seo.md の「ぷぷりえーるとは」を参照。
// FAQの構造化データは置かない：HTMLとNext.jsの描画データに二重に入って重く（約80KB）、スマホのLCPを遅らせていた。
const title = 'ぷぷりえーるとは（ルール・遊び方・FAQ）| ぷぷりえーる';
const description = 'お菓子争奪戦争ぷぷりえーるのあらすじと、対戦の始め方・ターンの流れ・勝ち方、用語と能力、いちご・ぶどうのFAQ、裁定集をまとめたページです。';
const url = `${site.url}/about/`;

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: '/about',
    // The same rules as plain Markdown, for agents that read text rather than pages.
    types: { 'text/markdown': '/rules.md' },
  },
  openGraph: {
    title, description, url, siteName: site.name, locale: 'ja_JP', type: 'article',
    images: [{ url: '/ogp.png', width: 1200, height: 630, alt: site.fullName }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/ogp.png'] },
};

export default async function About() {
  const { markdown, headings } = await loadRules();
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: site.name, item: `${site.url}/` },
          { '@type': 'ListItem', position: 2, name: 'ぷぷりえーるとは', item: url },
        ],
      },
      {
        '@type': 'AboutPage',
        '@id': `${url}#webpage`,
        url, name: title, description, inLanguage: 'ja',
        isPartOf: { '@id': `${site.url}/#website` },
        about: {
          '@type': 'Game',
          name: site.fullName,
          alternateName: [site.name, 'PPLALE'],
          description: 'VRChatの「ロリっ子喫茶ぷぷりえ」から生まれた、お菓子を奪い合うカードゲーム。幼女デッキとお菓子デッキからカードを引き、PPを使ってカードを出し、相手のお菓子ポイントを先に0にしたプレイヤーの勝ち。',
          genre: 'カードゲーム',
          url: `${site.url}/`,
        },
      },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <AboutPage rulesDoc={<RulesDoc markdown={markdown} />} rulesHeadings={headings} />
    </>
  );
}
