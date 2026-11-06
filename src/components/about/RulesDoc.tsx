import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// The rules text's own face (one file per weight for its kanji): scripts/generate-site-fonts.mjs, docs/performance/home-performance.md.
import '@/app/generated/rules-fonts.css';
import styles from './RulesDoc.module.css';
import RulesEnglish from './RulesEnglish';

const source = path.join(process.cwd(), 'docs/game-rules.md');

export interface RulesHeading {
  id: string;
  title: string;
}

const headingId = (title: string) => `rule-${title.match(/^\d+(?:\.\d+)?/)?.[0].replace('.', '-') ?? title}`;

/** 原典を保持し、作業メモ・未確定事項・実装文書への案内をサイトの本文から除く。 */
export async function loadRules() {
  const markdown = (await readFile(source, 'utf8'))
    .replace(/^[\S\s]*?(?=^## )/m, '')
    .replace(/^初期手札の交換でカードを山札に戻す順番・シャッフルの方法は、[^\n]*\n\n/gm, '')
    .replace(/^## 7\. 今回の資料だけでは確定しない点\n[\S\s]*?(?=^## |(?![\S\s]))/m, '')
    .replace(/\[([^\]]+)]\([^)]*\.md\)/g, '$1');
  const headings: RulesHeading[] = [...markdown.matchAll(/^## (.+)$/gm)]
    .map(([, title]) => ({ id: headingId(title), title }));
  return { markdown, headings };
}

export default function RulesDoc({ markdown }: { markdown: string }) {
  return (<>
    <RulesEnglish />
    <div className={styles.doc}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // The page's h2 is the section (ルール・裁定集); the chapters and their parts sit under it.
          h2: ({ children }) => <h3 id={headingId(String(children))}>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
          table: ({ children }) => <div className={styles.tableWrap}><table>{children}</table></div>,
        }}
      >
        {markdown}
      </Markdown>
    </div>
  </>);
}
