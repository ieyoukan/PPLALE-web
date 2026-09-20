import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import DarkModeProvider from './DarkModeProvider';
import { SettingsProvider } from './SettingsProvider';
import { AuthProvider } from '@/lib/auth';
import { SpeedInsights } from "@vercel/speed-insights/next"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Vercel環境かどうかを判定
const isVercel = process.env.VERCEL === '1';

export const metadata: Metadata = {
  metadataBase: new URL('https://pplale.vercel.app'),
  title: "ぷぷりえーる デッキ構築",
  description: "VRChatにあるカードゲーム「ぷぷりえーる」のデッキ構築などができるwebアプリ。通常構築や2pick構築が可能で、カードの組み合わせを自由に試せます。",
  keywords: "ぷぷりえーる, VRChat, カードゲーム, デッキ構築, 2pick, カード組み合わせ",
  authors: [{ name: "ようかん" }],
  creator: "ぷぷりえ",
  publisher: "ぷぷりえ",
  verification: {
    google: "XSAPzXY5EuNxn20KpATlcrBQ7JxY39hVTm02DYJabuI",
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: "ぷぷりえーる デッキ構築",
    description: "VRChatにあるカードゲーム「ぷぷりえーる」のデッキ構築などができるwebアプリ",
    url: "https://pplale.vercel.app",
    siteName: "ぷぷりえーる デッキ構築",
    images: [
      {
        url: "/ogp.png",
        width: 1200,
        height: 630,
        alt: "ぷぷりえーる デッキ構築",
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ぷぷりえーる デッキ構築",
    description: "VRChatにあるカードゲーム「ぷぷりえーる」のデッキ構築などができるwebアプリ",
    images: ["/ogp.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <link rel="canonical" href="https://pplale.vercel.app" />
        <meta name="theme-color" content="#d889cbff" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        
        {/* パフォーマンス最適化 */}
        <link rel="preconnect" href="https://apis.google.com" />
        
        {/* Favicon設定 */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />

        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              try {
                const mode = localStorage.getItem('themeMode');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const isTopPage = window.location.pathname === '/';
                const isDark = !isTopPage && (mode === 'dark' || (mode !== 'light' && prefersDark));
                document.documentElement.classList.toggle('dark', isDark);
              } catch {}
            })();`,
          }}
        />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "ぷぷりえーる デッキ構築",
              "description": "VRChatにあるカードゲーム「ぷぷりえーる」のデッキ構築などができるwebアプリ",
              "url": "https://pplale.vercel.app",
              "applicationCategory": "Game",
              "operatingSystem": "Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "JPY"
              }
            })
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <DarkModeProvider>
            <SettingsProvider>
              <main>
                {children}
              </main>
              {isVercel && <SpeedInsights />}
            </SettingsProvider>
          </DarkModeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
