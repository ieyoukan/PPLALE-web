import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@pplale/game-core'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pplale.vercel.app',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'pple.vr2.info',
        pathname: '/**',
      }
    ],
    unoptimized: false,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 160, 192, 256, 384],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1年
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  experimental: {
    optimizePackageImports: ['framer-motion'],
  },
  serverExternalPackages: ['@vercel/og', 'sharp'],
  outputFileTracingIncludes: { '/about': ['./docs/game-rules.md'], '/api/og/**': ['./public/og-cards/**/*.png'], '/api/og/profile/**': ['./public/images/token/**/*.webp', './public/og-cards/profile-bg.jpg'], '/api/og/room/**': ['./public/images/game/logo.webp', './public/images/game/fruits/*.webp'] },
  // 本番環境用の設定
  assetPrefix: '',
  basePath: '',
  // 動的ルーティングの設定
  trailingSlash: true,
  compress: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
      {
        source: '/game-assets/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/puzzle-previews/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/fonts/generated/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // The service worker must be checked for updates on every load.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
  // Links to a room from before rooms had their own address (`?id=`): every room is /game/room/<id>/ now.
  async redirects() {
    const room = { type: 'query' as const, key: 'id', value: '(?<id>\\d{6})' };
    return ['/game/room', '/game/battle/room'].map(source => ({ source, has: [room], destination: '/game/room/:id/', permanent: false }));
  },
  turbopack: {
    resolveAlias: {
      '@': './src',
      'styled-system': './styled-system',
    },
  },
};

export default config;
