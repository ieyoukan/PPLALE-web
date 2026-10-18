import { Mochiy_Pop_One, Zen_Maru_Gothic } from 'next/font/google';

// かな・漢字・英数字を同じ丸ゴシックで表示する。
export const homeFont = Zen_Maru_Gothic({
  weight: ['500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});

// ぷっくりした見出し用のPOP体。漢字も含めて配信する。
export const homeTitleFont = Mochiy_Pop_One({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-home-title',
});
