import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let bundle;
export async function openSavedDeckList(page, options = {}) {
  bundle ??= build({
    stdin: {
      contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
        import SavedDeckGrid from './src/components/deck/SavedDeckGrid';
        import { LocaleProvider } from './src/i18n/LocaleProvider';
        createRoot(document.getElementById('root')).render(<LocaleProvider initialLocale={window.__decks.locale || 'ja'}><SavedDeckGrid userId="fixture-user" /></LocaleProvider>);`,
      resolveDir: process.cwd(), loader: 'tsx',
    },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    alias: { 'styled-system/css': resolve('styled-system/css/index.mjs'), 'styled-system/recipes': resolve('styled-system/recipes/index.mjs') },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-services', setup(builder) {
      builder.onResolve({ filter: /^(firebase\/firestore|@\/lib\/firebase|next\/link)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: process.cwd(), contents: args.path === 'next/link'
        ? `import React from 'react'; export default function Link({prefetch, ...props}) { return <a {...props} data-prefetch={String(prefetch)} />; }`
        : args.path === '@/lib/firebase' ? 'export const db = {};'
          : `export const collection = () => ({}); export const doc = (...parts) => parts.at(-1);
            export const orderBy = () => ({}); export const limit = count => ({count});
            export const startAfter = cursor => ({cursor: cursor.index});
            export const query = (_, ...constraints) => Object.assign({}, ...constraints);
            export async function getDocs({count, cursor = -1}) {
              const f = window.__decks;
              f.reads.push({count, cursor});
              await new Promise(resolve => setTimeout(resolve, f.delay));
              if (f.failNext) { f.failNext = false; throw Error('Fixture read failure'); }
              const docs = f.decks.slice(cursor + 1, cursor + 1 + count).map((data, offset) => ({
                id: data.id, index: cursor + 1 + offset,
                data: () => ({...data, updatedAt: {toDate: () => new Date(data.updatedAt)}}),
              }));
              return {docs, size: docs.length};
            }
            export async function deleteDoc(id) { window.__decks.deleted.push(id); }`,
      }));
    } }],
  });
  const [{ outputFiles }, css] = await Promise.all([bundle, readFile('styled-system/styles.css', 'utf8')]);
  const fixture = { decks: makeDecks(), delay: 60, reads: [], deleted: [], ...options };
  await page.addInitScript(data => { window.__decks = data; }, fixture);
  await page.route('**/deck-list-fixture', route => route.fulfill({
    contentType: 'text/html', body: `<html lang="ja"><style>${css}</style><body style="padding:24px"><div id="root"></div><script>${outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`,
  }));
  await page.goto('/deck-list-fixture');
}

export function makeDecks() {
  return Array.from({ length: 31 }, (_, i) => ({
    id: `deck-${i}`, name: i === 30 ? '古いオレンジのデッキ' : `デッキ ${String(i).padStart(2, '0')}`,
    updatedAt: 1700000000000 - i * 86400000,
    yojoDeckIds: Array(20).fill(i === 30 ? 'y_116' : 'y_0'),
    sweetDeckIds: Array(10).fill('s_0'),
    playableCardId: i === 30 ? 'p_0' : null, is2pick: i === 30,
  }));
}
