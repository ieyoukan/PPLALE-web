import type { Metadata } from 'next';
import HomePage from '@/components/sections/HomePage';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: site.title,
  description: site.description,
  alternates: { canonical: '/' },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${site.url}/#website`,
      url: `${site.url}/`,
      name: site.name,
      alternateName: [site.fullName, 'PPLALE'],
      description: site.description,
      inLanguage: 'ja',
    },
    {
      '@type': 'WebPage',
      '@id': `${site.url}/#webpage`,
      url: `${site.url}/`,
      name: site.title,
      description: site.description,
      isPartOf: { '@id': `${site.url}/#website` },
      inLanguage: 'ja',
      about: {
        '@type': 'Game',
        name: site.fullName,
        alternateName: site.name,
        description: 'VRChatの「ロリっ子喫茶ぷぷりえ」から生まれた、幼女とお菓子のカードゲーム。',
      },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <HomePage />
    </>
  );
}
