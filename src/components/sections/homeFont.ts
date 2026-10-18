import { Zen_Maru_Gothic } from 'next/font/google';

// かな・漢字・英数字を同じ丸ゴシックで表示する。
export const homeFont = Zen_Maru_Gothic({
  weight: ['500', '700'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});
