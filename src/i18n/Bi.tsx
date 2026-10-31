// 静的な文の二か国語表示（サーバーコンポーネントでも使える）。両方の言語をHTMLに入れ、<html data-locale>（ルートの
// レイアウトの先頭のスクリプトが描画前に決める）に合わせてCSSで片方だけを見せる。読み込み後に文字が切り替わらない。
import type { ElementType, ReactNode } from 'react';

/** `as`: the element of each language (span for words inside a line, div or p for blocks). */
export function Bi({ ja, en, as: Tag = 'span' }: { ja: ReactNode; en: ReactNode; as?: ElementType }) {
  return <><Tag data-lang="ja" lang="ja">{ja}</Tag><Tag data-lang="en" lang="en">{en}</Tag></>;
}
