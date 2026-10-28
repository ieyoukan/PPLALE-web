import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/lib/game/social.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{ name: 'social-store', setup(builder) {
    builder.onResolve({ filter: /^(firebase\/firestore|@\/lib\/firebase|\.\/catalog|\.\/push)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents:
      path === './catalog' ? `export const displayCards={'p_1':{}};`
      : path === './push' ? `export const tellFriend=()=>{};export const tellRecruit=()=>{};`
      : path === '@/lib/firebase' ? `export const db={};export const auth={authStateReady:async()=>{},currentUser:{uid:'self'}};`
      : `export const collection=(db,name)=>name;export const query=ref=>ref;export const where=()=>{};export const limit=()=>{};export const doc=(db,kind,uid)=>kind+'/'+uid;
        export const onSnapshot=(ref,...args)=>{const callbacks=args.filter(value=>typeof value==='function');globalThis.socialFixture.set(ref,{next:callbacks[0],fail:callbacks[1]});return()=>globalThis.socialFixture.delete(ref);};` }));
  } }] });
const { watchSocial } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const relationship = { id: 'self~friend', metadata: { hasPendingWrites: false }, data: () => ({ members: ['self', 'friend'], requestedBy: 'self', status: 'accepted' }) };

async function fixture(t) {
  const updates = []; let failures = 0;
  globalThis.socialFixture = new Map();
  const stop = watchSocial('self', players => updates.push(players), () => failures++);
  t.after(() => { stop(); delete globalThis.socialFixture; });
  while (!globalThis.socialFixture.has('friendships')) await new Promise(setImmediate);
  const next = (key, data) => globalThis.socialFixture.get(key).next({ data: () => data });
  globalThis.socialFixture.get('friendships').next({ docs: [relationship] });
  return { updates, next, failures: () => failures };
}

test('presence arriving before a profile never creates a placeholder player; offline friends keep their real names', async t => {
  const f = await fixture(t);
  f.next('watching/friend', undefined);
  f.next('recruitments/friend', undefined);
  assert.deepEqual(f.updates, []);
  f.next('profiles/friend', { displayName: 'ありす', iconCardId: 'p_1' });
  assert.equal(f.updates.at(-1)[0].profile.displayName, 'ありす');
  f.next('watching/friend', undefined);
  assert.ok(f.updates.every(players => players.every(player => player.profile.displayName === 'ありす')));
  assert.equal(f.updates.at(-1)[0].roomId, undefined);
  assert.equal(f.updates.at(-1)[0].watching, undefined);
});

test('a missing or deleted profile does not leave a made-up player row', async t => {
  const f = await fixture(t);
  f.next('profiles/friend', undefined);
  assert.deepEqual(f.updates.at(-1), []);
  f.next('profiles/friend', { displayName: 'ぼぶ' });
  assert.equal(f.updates.at(-1)[0].profile.displayName, 'ぼぶ');
  f.next('profiles/friend', undefined);
  assert.deepEqual(f.updates.at(-1), []);
});

test('profile errors finish loading through the error path without inventing a name', async t => {
  const f = await fixture(t);
  globalThis.socialFixture.get('profiles/friend').fail(new Error('offline'));
  assert.equal(f.failures(), 1);
  assert.deepEqual(f.updates.at(-1), []);
});
