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

/** docs/game-rules.md を本文から表示する。冒頭の作業メモと他の開発文書へのリンクは除く。 */
export async function loadRules() {
  const markdown = (await readFile(source, 'utf8'))
    .replace(/^[\S\s]*?(?=^## )/m, '')
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
