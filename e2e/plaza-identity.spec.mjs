import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

let fixture;
test.beforeAll(async () => {
  const { outputFiles } = await build({
    stdin: { contents: `import React,{useEffect} from 'react';import{createRoot}from'react-dom/client';
      import{PlazaProvider,usePlaza}from'./src/components/game/plaza/PlazaProvider';
      function Probe(){const plaza=usePlaza();useEffect(()=>{void plaza.enter('123456');},[plaza.enter]);
        return <><output data-view>{JSON.stringify(plaza.view)}</output><button onClick={()=>plaza.create('public')}>create</button></>}
      createRoot(document.getElementById('root')).render(<PlazaProvider><Probe/></PlazaProvider>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, jsx: 'automatic', outdir: '.cache/plaza-identity', platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ROOM_SERVER_URL': '"http://rooms.test"' },
    plugins: [{ name: 'identity-fixture', setup(builder) {
      builder.onResolve({ filter: /^(?:@\/lib\/auth|next\/navigation|@\/lib\/game\/social|\.\/historyIdentity|\.\.\/notifications\/GameNotifications)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', resolveDir: process.cwd(), contents:
        path === '@/lib/auth' ? `import{useSyncExternalStore}from'react';const subscribe=f=>{window.addEventListener('auth-change',f);return()=>window.removeEventListener('auth-change',f)};export function useAuth(){return useSyncExternalStore(subscribe,()=>window.auth)}`
        : path === 'next/navigation' ? `const router={push:path=>window.routes.push(path),replace:path=>window.routes.push(path)};export const useRouter=()=>router;export const usePathname=()=>'/game/room/123456/';`
        : path === './historyIdentity' ? `export const historyHeaders=async()=>window.auth.user?{'x-test-user':window.auth.user.uid}:{};`
        : path === '@/lib/game/social' ? `export const WATCHING_BEAT=30000;export const publishPresence=async()=>{};`
        : `const notify=()=>{};export const useGameNotifications=()=>({notify});` }));
    } }],
  });
  fixture = `<html><body><div id="root"></div><script>${outputFiles.find(file => file.path.endsWith('.js')).text.replaceAll('</script', '<\\/script')}</script></body></html>`;
});

async function mount(page, { signedIn = true, memberUid = 'alice', denied = false, closed = false, holdFirstJoin = false } = {}) {
  let serial = 0, revision = 0, releaseJoin;
  const messages = [], sockets = new Map();
  const member = (id, uid) => ({ id, name: uid || 'ゲスト', ...(uid && { profileId: uid }), online: true });
  let members = [member('old', memberUid), member('friend', 'friend')], owner = 'old';
  const initialCreator = { name: memberUid || 'ゲスト', ...(memberUid && { profileId: memberUid }) };
  const entries = new Map([['old-token', { id: '123456', me: 'old' }]]);
  const view = (id, me) => ({ id, version: ++revision, status: 'lobby', match: 0, seat: 0, spectators: 0, players: [null, null], game: null, last: null, resigned: null,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true },
    plaza: { name: 'ルーム', me, owner, visibility: 'invite', invite: 'invitation', creator: initialCreator, members } });
  await page.addInitScript(signedIn => {
    window.auth = { user: signedIn ? { uid: 'alice' } : null, loading: false }; window.routes = [];
    localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: '123456', rooms: { '123456': { token: 'old-token', invite: 'invitation', at: 1 } } }));
  }, signedIn);
  await page.route('http://rooms.test/rooms**', async route => {
    const request = route.request(), uid = request.headers()['x-test-user'];
    const creating = new URL(request.url()).pathname === '/rooms';
    messages.push({ action: creating ? 'create' : 'join', uid: uid ?? null, body: request.postDataJSON() });
    if (!creating && holdFirstJoin && serial === 0) await new Promise(resolve => { releaseJoin = resolve; });
    if (!creating && (denied || closed)) return route.fulfill({ status: closed ? 410 : 404, json: { error: '入れません' } });
    const me = `new-${++serial}`, token = `token-${serial}`, id = creating ? '654321' : '123456';
    if (creating) { members = []; owner = me; }
    members.push(member(me, uid)); entries.set(token, { id, me });
    await route.fulfill({ json: { token, view: view(id, me) } });
  });
  await page.routeWebSocket(/rooms.test\/rooms\/\d+\/socket/, socket => {
    let entry;
    socket.onMessage(bytes => {
      const message = JSON.parse(String(bytes));
      if (message.type === 'hello') {
        entry = entries.get(message.token); sockets.set(entry.me, socket);
        socket.send(JSON.stringify({ type: 'view', view: view(entry.id, entry.me) }));
      }
      if (message.type === 'action') {
        messages.push({ action: message.action.action, member: entry.me });
        if (message.action.action === 'leave') {
          members = members.filter(member => member.id !== entry.me);
          if (owner === entry.me) owner = null;
        }
        socket.send(JSON.stringify({ type: 'result', n: message.n }));
      }
    });
  });
  await page.route('**/plaza-identity-fixture', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.goto('/plaza-identity-fixture');
  return { messages, sockets, release: () => releaseJoin() };
}
const current = page => page.locator('[data-view]').evaluate(element => JSON.parse(element.textContent));
const auth = (page, uid) => page.evaluate(uid => { window.auth = { user: uid ? { uid } : null, loading: false }; window.dispatchEvent(new Event('auth-change')); }, uid);

for (const next of [null, 'bob']) test(`identity change leaves the former member before admitting ${next ?? 'a guest'}`, async ({ page }) => {
  const { messages } = await mount(page);
  await expect.poll(async () => (await current(page))?.plaza.me).toBe('old');
  await auth(page, next);
  await expect.poll(async () => (await current(page))?.plaza.me).toBe('new-1');
  const now = await current(page);
  expect(messages.map(message => message.action)).toEqual(['leave', 'join']);
  expect(now.plaza.members.some(member => member.id === 'old')).toBe(false);
  expect(now.plaza.members.find(member => member.id === now.plaza.me).profileId ?? null).toBe(next);
  expect(now.plaza.owner).toBe(null);
  expect(now.plaza.creator.profileId).toBe('alice');
  expect(messages[1].body.rejoin).toBeUndefined();
  expect(messages[1].uid).toBe(next);
});

test('a saved signed-in member cannot survive a guest reload; repeated renders do not re-enter again', async ({ page }) => {
  const { messages } = await mount(page, { signedIn: false });
  await expect.poll(async () => (await current(page))?.plaza.me).toBe('new-1');
  await auth(page, null);
  expect((await current(page)).plaza.members.some(member => member.profileId === 'alice')).toBe(false);
  expect(messages.map(message => message.action)).toEqual(['leave', 'join']);
});

test('guest sign-in enters as a new verified member', async ({ page }) => {
  const { messages } = await mount(page, { signedIn: false, memberUid: null });
  await expect.poll(async () => (await current(page))?.plaza.me).toBe('old');
  await auth(page, 'alice');
  await expect.poll(async () => (await current(page))?.plaza.me).toBe('new-1');
  expect((await current(page)).plaza.members.find(member => member.id === 'new-1').profileId).toBe('alice');
  expect(messages.map(message => message.action)).toEqual(['leave', 'join']);
});

for (const reason of ['denied', 'closed']) test(`logout creates an owned home when the old room is ${reason}`, async ({ page }) => {
  const { messages } = await mount(page, { [reason]: true });
  await expect.poll(async () => (await current(page))?.plaza.me).toBe('old');
  await auth(page, null);
  await expect.poll(async () => (await current(page))?.id).toBe('654321');
  const now = await current(page);
  expect(now.plaza.owner).toBe(now.plaza.me);
  expect(messages.map(message => message.action)).toEqual(['leave', 'join', 'create']);
  expect(await page.evaluate(() => window.routes)).toContain('/game/room/654321/');
});


test('switching accounts while the guest entry is in flight settles on the latest account', async ({ page }) => {
  const { messages, release } = await mount(page, { holdFirstJoin: true });
  await expect.poll(async () => (await current(page))?.plaza.me).toBe('old');
  await auth(page, null);
  await expect.poll(() => messages.some(message => message.action === 'join')).toBe(true);
  await auth(page, 'bob');
  release();
  await expect.poll(async () => { const view = await current(page); return view?.plaza.members.find(member => member.id === view.plaza.me)?.profileId; }).toBe('bob');
  expect(messages.map(message => message.action)).toEqual(['leave', 'join', 'leave', 'join']);
});
