import { Mochiy_Pop_One, Zen_Maru_Gothic } from 'next/font/google';

/** 本文・フォーム。かな・漢字・英数字を同じ丸ゴシックで表示する。 */
export const siteBodyFont = Zen_Maru_Gothic({
  weight: ['500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-site-body',
});

/** 見出し・メニュー。漢字を含む、ぷっくりしたPOP体。 */
export const siteTitleFont = Mochiy_Pop_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-site-title',
});
