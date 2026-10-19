import type { Metadata } from "next";
import { site } from "@/lib/site";
import { siteBodyFont, siteTitleFont } from "./fonts";
import "./reset.css";
import "./globals.css";
import "./brand.css";
import DarkModeProvider from './DarkModeProvider';
import { SettingsProvider } from './SettingsProvider';
import { AuthProvider } from '@/lib/auth';
import { SpeedInsights } from "@vercel/speed-insights/next"

// Vercel環境かどうかを判定
const isVercel = process.env.VERCEL === '1';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  applicationName: site.name,
  keywords: [site.name, site.fullName, "PPLALE", "VRChat", "カードゲーム", "ルール", "CPU対戦", "デッキ構築", "2Pick"],
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
    title: site.title,
    description: site.description,
    url: site.url,
    siteName: site.name,
    images: [
      {
        url: "/ogp.png",
        width: 1200,
        height: 630,
        alt: site.fullName,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
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
    <html lang="ja" className={`${siteBodyFont.variable} ${siteTitleFont.variable}`} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#e8c8c8" />
        
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
        
      </head>
      <body
        className={`${siteBodyFont.className} antialiased`}
        data-site-ui
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
