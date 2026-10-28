import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/lib/game/room/warmAssets.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'card-sources', setup(builder) {
    builder.onResolve({ filter: /matchAssets$/ }, () => ({ path: 'cards', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const prepareGameCardFormat=async()=>{};export const gameCardSource=id=>'/game-assets/cards/'+id+'.avif';` }));
  } }] });
let instance = 0;
async function fixture(t, { fail = false, onFetch } = {}) {
  const original = { window: globalThis.window, fetch: globalThis.fetch };
  t.after(() => { globalThis.window = original.window; globalThis.fetch = original.fetch; });
  const requests = [], decoded = [], active = new Set(); let maximum = 0, failure = fail;
  globalThis.fetch = async (src, options) => {
    requests.push({ src, options }); active.add(src); maximum = Math.max(maximum, active.size);
    await Promise.resolve(); onFetch?.();
    return { ok: !failure, arrayBuffer: async () => { await Promise.resolve(); active.delete(src); return new ArrayBuffer(8); } };
  };
  globalThis.window = { Image: class { async decode() { decoded.push(this.src); } removeAttribute() {} } };
  const { warmRoomCards } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text + `\n// ${instance++}`).toString('base64')}`);
  return { warmRoomCards, requests, decoded, maximum: () => maximum, recover: () => { failure = false; active.clear(); } };
}

test('background warming fetches compressed images at low priority, without decoding the whole pool', async t => {
  const f = await fixture(t), progress = [];
  await f.warmRoomCards(['a', 'b', 'c', 'a'], undefined, value => progress.push(value), false);
  assert.equal(f.requests.length, 7);
  assert.equal(f.maximum(), 4);
  assert.deepEqual(f.decoded, []);
  assert.ok(f.requests.every(({ options }) => options.priority === 'low' && options.cache === 'force-cache'));
  assert.deepEqual(progress.at(-1), { done: 7, total: 7 });
});

test('entering a match decodes only requested pictures; repeated preparation reuses completion', async t => {
  const f = await fixture(t);
  await f.warmRoomCards(['a', 'b', 'c'], undefined, undefined, false);
  await f.warmRoomCards(['a'], undefined, undefined, true);
  assert.equal(f.decoded.length, 5); // four shared board images and the revealed card
  assert.ok(f.decoded.includes('/game-assets/cards/a.avif'));
  assert.ok(!f.decoded.includes('/game-assets/cards/b.avif'));
  await f.warmRoomCards(['a'], undefined, undefined, true);
  assert.equal(f.decoded.length, 5);
  assert.equal(f.requests.length, 7);
});

test('cancelled background preparation stops its queue and can resume without refetching finished images', async t => {
  const controller = new AbortController();
  const f = await fixture(t, { onFetch: () => controller.abort() });
  await assert.rejects(f.warmRoomCards(['a', 'b'], controller.signal, undefined, false), { name: 'AbortError' });
  assert.equal(f.requests.length, 4);
  await f.warmRoomCards(['a', 'b'], undefined, undefined, false);
  assert.equal(f.requests.length, 6);
});

test('a failed background request is retriable', async t => {
  const f = await fixture(t, { fail: true });
  await assert.rejects(f.warmRoomCards([], undefined, undefined, false), /画像を準備できませんでした/);
  f.recover();
  await f.warmRoomCards([], undefined, undefined, false);
  assert.equal(f.requests.length, 8);
});
