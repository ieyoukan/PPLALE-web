import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

/** Markdown without its marks, for structured data and plain text. */
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)]\([^)]*\)/g, '$1').replace(/<br\s*\/?>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The FAQ and rulings tables (5. ぶどう, 6. イチゴ, 6.1 ユーザー裁定) as questions and answers: what the page shows,
 * for its FAQPage structured data. A row is 「ID｜場面｜裁定」 or 「場面｜裁定」.
 */
export function rulesFaq(markdown: string): { question: string; answer: string }[] {
  const faq: { question: string; answer: string }[] = [];
  let section = '';
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^## (.+)$/);
    if (heading) { section = heading[1]; continue; }
    if (!/FAQ|裁定/.test(section)) continue;
    const cells = line.match(/^\|(.+)\|\s*$/)?.[1].split('|').map(cell => cell.trim());
    if (!cells || cells.every(cell => /^:?-+:?$/.test(cell)) || cells[0] === 'ID' || cells[0] === '場面') continue;
    const [question, answer] = cells.length >= 3 ? [`${cells[0]}：${cells[1]}`, cells[2]] : [cells[0], cells[1]];
    if (question && answer) faq.push({ question: plain(question), answer: plain(answer) });
  }
  return faq;
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
