import AppShell from './AppShell';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { getRequestLocale } from '@/i18n/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  if (locale === 'ja') return {};

  const title = 'PPLALE Deck Builder';
  const description = 'Build, draft, import, export, and share decks for the PPLALE card game.';
  return {
    title,
    description,
    keywords: ['PPLALE', 'VRChat', 'card game', 'deck builder', '2Pick'],
    openGraph: {
      title,
      description,
      url: 'https://pplale.vercel.app',
      siteName: title,
      images: [{ url: '/ogp.png', width: 1200, height: 630, alt: title }],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/ogp.png'],
    },
  };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const locale = await getRequestLocale();

  return (
    <LocaleProvider initialLocale={locale}>
      <div lang={locale}>
        <AppShell>{children}</AppShell>
      </div>
    </LocaleProvider>
  );
}
