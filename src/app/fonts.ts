import './generated/site-fonts.css';
import './fonts.css';

/** 本文・フォーム。かな・漢字・英数字を同じ丸ゴシックで表示する。 */
// Font faces are generated at build time: one home subset per weight plus
// disjoint Unicode blocks for other pages and user-provided names.
export const siteBodyFont = {
  className: 'site-body-font',
  variable: 'site-body-variable',
} as const;

/** 見出し・メニュー。漢字を含む、ぷっくりしたPOP体。 */
export const siteTitleFont = {
  className: 'site-title-font',
  variable: 'site-title-variable',
} as const;
