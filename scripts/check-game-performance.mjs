import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/check-game-performance.mjs <production URL> <output JSON>');
const origin = new URL(target).origin;
const output = process.argv[3] ?? 'docs/performance-2026-10-16.json';
const browser = await chromium.launch();
const runs = [];
try {
  for (const width of [1280, 375]) for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 860 : 812 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const resources = new Map();
    const jobs = [];
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin !== origin || !/\.(js|css)$/.test(url.pathname) || resources.has(url.pathname)) return;
      resources.set(url.pathname, null);
      jobs.push(response.body().then(body => { resources.set(url.pathname, { kind: url.pathname.endsWith('.js') ? 'js' : 'css', bytes: body.length, gzipBytes: gzipSync(body).length }); }).catch(() => {}));
    });
    await page.goto(origin + '/game/', { waitUntil: 'networkidle' });
    await page.getByRole('navigation', { name: 'ゲームメニュー' }).waitFor();
    await page.waitForTimeout(1000);
    await Promise.all(jobs);
    if (await page.locator('script[data-nextjs-dev-overlay]').count()) throw new Error('Measure a production build served with next start.');
    const view = await page.evaluate(() => ({
      lcpMs: window.__lcp,
      canonical: document.querySelector('link[rel=canonical]')?.getAttribute('href'),
      externalStylesheets: [...document.querySelectorAll('link[rel=stylesheet]')].map(el => el.href),
      inlineCss: [...document.querySelectorAll('style')].map(el => el.textContent).join('\n'),
      images: [...document.images].map(el => ({ width: el.naturalWidth, displayWidth: el.getBoundingClientRect().width, path: el.currentSrc.replace(location.origin, '') })),
    }));
    await page.addScriptTag({ content: axe });
    const a11y = await page.evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
      return { violations: result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })) })), incomplete: result.incomplete.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })) })), passes: result.passes.length };
    });
    const values = [...resources.values()].filter(Boolean);
    const { inlineCss, ...summary } = view;
    runs.push({ width, run, ...summary, jsGzipBytes: values.filter(r => r.kind === 'js').reduce((sum, r) => sum + r.gzipBytes, 0), jsFiles: values.filter(r => r.kind === 'js').length, cssGzipBytes: values.filter(r => r.kind === 'css').reduce((sum, r) => sum + r.gzipBytes, 0), inlineCssGzipBytes: gzipSync(inlineCss).length, a11y });
    console.log(JSON.stringify(runs.at(-1)));
    await context.close();
  }
  const report = { measuredAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), includesUncommittedChanges: true, next: require('next/package.json').version, axe: require('axe-core/package.json').version, chromium: browser.version(), conditions: { build: 'npm run build (Turbopack)', origin, deviceScaleFactor: 1, freshContextPerRun: true, login: false, savedData: false, networkThrottling: 'none', cpuThrottling: 'none', gzip: 'Node gzipSync on unique same-origin JS responses and concatenated inline CSS', caution: 'Local measurements; no historical baseline or production deployment comparison' }, runs };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  if (runs.some(run => run.a11y.violations.length)) process.exitCode = 1;
} finally { await browser.close(); }
