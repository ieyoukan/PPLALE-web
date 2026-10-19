import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './RulesDoc.module.css';

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
  return (
    <div className={styles.doc}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => <h2 id={headingId(String(children))}>{children}</h2>,
          table: ({ children }) => <div className={styles.tableWrap}><table>{children}</table></div>,
        }}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
