// サイトの読み物ページの共通の器。水玉かチェック柄の背景に、ヘッダー・見出し・本文・フッターを置く。
// 見た目の基準は docs/design-system.md の「サイトのページ」。
import type { ComponentProps, ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import styles from './Site.module.css';
import Footer from '@/components/sections/Footer';
import { OrnateFrame } from '@/components/shared/ui/ornament/OrnateFrame';
import { Bi } from '@/i18n/Bi';

type Pattern = 'dots' | 'pink-dots' | 'gingham';

export function SitePage({ ja, en, pattern = 'dots', width = 'md', lead, headerActions, children }: {
  ja: string; en: string;
  pattern?: Pattern;
  /** md: reading width (legal pages). lg: wider layouts (community). */
  width?: 'md' | 'lg';
  lead?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.page} data-pattern={pattern}>
      <SiteHeader>{headerActions}</SiteHeader>
      <main className={styles.main} data-width={width}>
        <SiteTitle ja={ja} en={en} />
        {lead && <p className={styles.lead}>{lead}</p>}
        {children}
      </main>
      <Footer />
    </div>
  );
}

/** ページの見出し。下に桜色・黄色・緑の水玉を3つ並べる。 */
export function SiteTitle({ ja, en, as: Tag = 'h1' }: { ja: string; en: string; as?: 'h1' | 'h2' }) {
  return (
    <div className={styles.titleWrap}>
      <Tag className={styles.title}><Bi ja={ja} en={en} /></Tag>
      <span className={styles.titleDots} aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

/** カードの枠を手本にした飾り枠の紙面。規約などの本文は prose で見出し・段落・リストを整える。 */
export function SitePanel({ prose, className, ...rest }: { prose?: boolean } & ComponentProps<typeof OrnateFrame<'section'>>) {
  return <OrnateFrame as="section" className={`${styles.panel} ${prose ? styles.prose : ''} ${className ?? ''}`} {...rest} />;
}
