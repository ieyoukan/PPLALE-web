// Compare production builds with the same room, camera flight and 4x CPU slowdown.
// Usage: node scripts/measure-room-rendering.mjs http://localhost:3001 report.json
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { arena } from '../packages/game-core/tests/helpers.mjs';
import { viewFor } from '../packages/game-core/dist/index.js';

const [target, output] = process.argv.slice(2);
if (!target || !output) throw new Error('Usage: node scripts/measure-room-rendering.mjs <production origin> <report.json>');
const origin = new URL(target).origin;
const runs = [];
const repetitions = Number(process.env.PPLALE_PERF_RUNS || 3);
const metrics = async cdp => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]));
const sampleFrames = page => page.evaluate(() => new Promise(resolve => {
  let previous = performance.now(); const start = previous, intervals = [];
  const sample = now => {
    intervals.push(now - previous); previous = now;
    if (now - start < 1800) requestAnimationFrame(sample); else resolve(intervals);
  };
  requestAnimationFrame(sample);
}));

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) for (let run = 1; run <= repetitions; run++) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
    const errors = [], resources = new Map(), jobs = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin !== origin || !/\.(js|css)$/.test(url.pathname) || resources.has(url.pathname)) return;
      resources.set(url.pathname, null);
      jobs.push(response.body().then(body => resources.set(url.pathname, { kind: url.pathname.endsWith('.js') ? 'js' : 'css', bytes: body.length, gzipBytes: gzipSync(body).length })).catch(() => {}));
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let version = 0, socket;
    const game = arena({ me: { hand: ['y_0'] }, foe: { hand: ['y_1'] } });
    const view = playing => ({ id: '123456', version: ++version, status: playing ? 'playing' : 'lobby', match: 1, matchId: 'rendering-benchmark', seat: 0, spectators: 0,
      rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, last: null, resigned: null,
      players: [0, 1].map(side => ({ member: side ? 'friend' : 'me', name: side ? 'フレンド' : 'あなた', online: true, ready: playing })), game: playing ? viewFor(game, 0) : null,
      plaza: { name: '性能検証のルーム', visibility: 'invite', me: 'me', owner: 'me', creator: { name: 'あなた' }, invite: 'test', members: [{ id: 'me', name: 'あなた', online: true }, { id: 'friend', name: 'フレンド', online: true }] } });
    await page.addInitScript(() => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: '123456', rooms: { '123456': { token: 'test', at: Date.now() } } })));
    await page.routeWebSocket(/\/rooms\/123456\/socket/, ws => {
      socket = ws;
      ws.onMessage(bytes => { if (JSON.parse(String(bytes)).type === 'hello') ws.send(JSON.stringify({ type: 'view', view: view(false) })); });
    });
    await page.goto(`${origin}/game/room/123456/`);
    await page.locator('[data-room-camera="lobby"]').waitFor({ timeout: 30000 });
    if (await page.locator('nextjs-portal').count()) throw new Error('Measure next start, not next dev.');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');
    await page.locator('[data-room-board-projection] img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: output.replace(/\.json$/, `-${viewport.width}-${run}-lobby.png`), animations: 'disabled' });
    await Promise.all(jobs);
    const initialMetrics = await metrics(cdp);
    const initialResources = [...resources.values()].filter(Boolean);
    const initial = {
      jsGzipBytes: initialResources.filter(resource => resource.kind === 'js').reduce((sum, resource) => sum + resource.gzipBytes, 0),
      jsFiles: initialResources.filter(resource => resource.kind === 'js').length,
      ...await page.evaluate(() => ({ resourceBytes: performance.getEntriesByType('resource').reduce((sum, resource) => sum + resource.encodedBodySize, 0), resourceCount: performance.getEntriesByType('resource').length, domElements: document.querySelectorAll('*').length })),
    };
    const trace = [];
    cdp.on('Tracing.dataCollected', ({ value }) => trace.push(...value));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame', transferMode: 'ReportEvents' });
    const before = await metrics(cdp), frames = sampleFrames(page);
    socket.send(JSON.stringify({ type: 'view', view: view(true) }));
    await page.locator('[data-room-camera="match"]').waitFor();
    const intervals = (await frames).slice(1).sort((a, b) => a - b);
    const after = await metrics(cdp);
    const ended = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end'); await ended;
    const events = {};
    for (const event of trace) if (event.ph === 'X' && event.dur && /^(RasterTask|Paint|Layout|UpdateLayoutTree|ImageDecodeTask)$/.test(event.name)) {
      const entry = events[event.name] ??= { count: 0, ms: 0 }; entry.count++; entry.ms += event.dur / 1000;
    }
    const summary = { viewport, run, initial,
      camera: { callbacks: intervals.length, p95IntervalMs: intervals[Math.floor(intervals.length * .95)], maxIntervalMs: intervals.at(-1), mainThreadMs: (after.TaskDuration - before.TaskDuration) * 1000, events },
      startupMainThreadMs: initialMetrics.TaskDuration * 1000, errors };
    runs.push(summary); console.log(JSON.stringify(summary));
    if (errors.length) throw new Error(errors.join('\n'));
  } finally { await browser.close(); }
}
const report = { measuredAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  includesUncommittedChanges: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  conditions: { origin, build: 'next start', cpuSlowdown: 4, deviceScaleFactor: 1, networkThrottling: 'none', freshBrowserPerRun: true, serviceWorkers: 'blocked', roomTransport: 'mocked with the same public game state',
    caution: 'Local headless Chromium. Frame callbacks are not presented FPS; raster milliseconds sum work across threads and are not elapsed time.' }, runs };
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
