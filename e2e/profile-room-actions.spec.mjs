import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

let fixture;
test.beforeAll(async () => {
  const { outputFiles } = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {ProfilePage} from './src/components/game/social/ProfilePage';
      createRoot(document.getElementById('root')).render(<ProfilePage id="target" />);`, loader: 'tsx', resolveDir: process.cwd() },
    jsx: 'automatic', bundle: true, write: false, outdir: '.cache/profile-room-fixture', format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ROOM_SERVER_URL': 'undefined' },
    plugins: [{ name: 'profile-room-services', setup(builder) {
      builder.onResolve({ filter: /^(next\/navigation|next\/link|next\/image|@\/lib\/auth|@\/lib\/game\/social|@\/lib\/game\/room\/client)$|\/(PlazaProvider|ProfileDecks|ProfileIconPicker|NotificationsPage)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
        let contents;
        if (path === 'next/navigation') contents = 'export const useSearchParams = () => new URLSearchParams();';
        else if (path === 'next/link') contents = `import React from 'react'; export default function Link({prefetch, ...props}) {return <a {...props} />;}`;
        else if (path === 'next/image') contents = `import React from 'react'; export default function Image({fill, unoptimized, fetchPriority, ...props}) {return <img {...props} style={fill ? {position:'absolute',inset:0,width:'100%',height:'100%'} : undefined} />;}`;
        else if (path === '@/lib/auth') contents = 'const user = {uid:"self"}; export const useAuth = () => ({user, loading:false});';
        else if (path === '@/lib/game/social') contents = `export const WATCHING_STALE = 180000; export const defaultProfile = () => ({});
          export const readProfile = async uid => ({uid, displayName:'ありす', comment:'いっしょに遊ぼう', iconCardId:'p_1', decks:[]});
          export const readFriendship = async () => window.fixture.friend === false ? null : {status:'accepted'};
          export const requestFriend = async () => {}; export const respondFriend = async () => {}; export const saveProfile = async p => p;`;
        else if (path === '@/lib/game/room/client') contents = `export async function readProfileLocation() {
            window.fixture.reads++; if(window.fixture.fail) throw Error('offline'); return window.fixture.location;
          }
          export const plazaKey = () => ({token:'own-member-secret'});
          export async function inviteFriend(id, member, to) { window.fixture.invites.push({id,member,to}); if(window.fixture.inviteFails) throw Error('offline'); }
          export async function askToEnter(to) { window.fixture.requests.push(to); }`;
        else if (path.endsWith('/PlazaProvider')) contents = `export const usePlaza = () => ({linked:true, id:'111111', view:window.fixture.own, go:async id => {window.fixture.joins.push(id);}});`;
        else if (path.endsWith('/ProfileDecks')) contents = 'export const DeckChooser = () => null; export const PublicDecks = () => null;';
        else if (path.endsWith('/ProfileIconPicker')) contents = 'export const ProfileIconPicker = () => null;';
        else contents = 'export const NOTIFICATIONS_PATH = "/game/notifications/";';
        return { contents, loader: 'jsx', resolveDir: process.cwd() };
      });
    } }],
  });
  fixture = { script: outputFiles.find(file => file.path.endsWith('.js')).text, css: outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n'), brand: await readFile('src/app/brand.css', 'utf8') };
});

async function mount(page, options = {}) {
  const own = { id:'111111', plaza:{ name:'あなたのルーム', visibility:'invite', creator:{profileId:'self'}, invite:'invitation', members:[] } };
  await page.addInitScript(data => { window.fixture = data; }, { own, reads:0, invites:[], requests:[], joins:[], location:{kind:'private',visibility:'invite'}, ...options });
  await page.route('**/profile-room-fixture', route => route.fulfill({ contentType:'text/html', body:`<html lang="ja"><style>${fixture.brand}\n${fixture.css}\n*{box-sizing:border-box}body{margin:24px;font-family:sans-serif;background:var(--brand-paper)}#root{container:stage / inline-size}</style><body><div id="root"></div><script>${fixture.script.replaceAll('</script','<\\/script')}</script></body></html>` }));
  await page.goto('/profile-room-fixture');
  await expect(page.getByRole('heading', {name:'ありす',exact:true})).toBeVisible();
  return page.getByRole('region', {name:'いまいるルーム',exact:true});
}

test('private location is at the upper right; sending an invitation and requesting one are distinct', async ({page}, info) => {
  const where = await mount(page);
  await expect(where).toContainText('プライベートルーム');
  const heading = await page.getByRole('heading', {name:'ありす',exact:true}).boundingBox();
  const location = await where.boundingBox();
  expect(location.x).toBeGreaterThan(heading.x + heading.width);
  expect(location.y).toBeLessThanOrEqual(heading.y);
  const invite = page.getByRole('button', {name:'ありすに招待を送る',exact:true});
  const request = where.getByRole('button', {name:'ありすにリクエストインバイト',exact:true});
  expect(await invite.locator('svg path').getAttribute('d')).not.toBe(await request.locator('svg path').getAttribute('d'));
  await page.screenshot({path:info.outputPath('profile-private-room.png')});
  await invite.click();
  expect(await page.evaluate(() => window.fixture.invites)).toEqual([{id:'111111',member:'own-member-secret',to:'target'}]);
  expect(await page.evaluate(() => window.fixture.requests)).toEqual([]);
  await request.click();
  expect(await page.evaluate(() => window.fixture.requests)).toEqual(['target']);
  await expect(where.getByRole('button', {name:'ありすにリクエストインバイトを送りました',exact:true})).toBeDisabled();
});

test('joinable location shows enter and keeps invitations aimed at the viewer’s own room', async ({page}, info) => {
  const where = await mount(page, {location:{kind:'room',room:{id:'222222',host:'ありす',status:'lobby',rules:{fruits:['strawberry'],extendedPlayable:false},plaza:{name:'ありすのお菓子ルーム',visibility:'friends',members:3}}}});
  const enter = where.getByRole('link', {name:'ありすのお菓子ルーム: 入る',exact:true});
  await expect(enter).toBeVisible();
  await expect(enter.locator('svg')).not.toHaveCount(0);
  await expect(where.getByRole('button', {name:/リクエストインバイト/})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('profile-joinable-room.png')});
  await enter.click();
  expect(await page.evaluate(() => window.fixture.joins)).toEqual(['222222']);
});

for (const options of [{location:{kind:'offline'}}, {fail:true}, {friend:false}]) test(`unavailable location displays offline without entry actions (${JSON.stringify(options)})`, async ({page}) => {
  const where = await mount(page, options);
  await expect(where).toContainText('オフライン');
  await expect(where.getByRole('button')).toHaveCount(0);
  await expect(where.getByRole('link')).toHaveCount(0);
  if (options.friend === false) expect(await page.evaluate(() => window.fixture.reads)).toBe(0);
});

test('a failed refresh clears a previously private location and its request action', async ({page}) => {
  const where = await mount(page);
  await expect(where).toContainText('プライベートルーム');
  await page.evaluate(() => {window.fixture.fail = true; document.dispatchEvent(new Event('visibilitychange'));});
  await expect(where).toContainText('オフライン');
  await expect(where.getByRole('button')).toHaveCount(0);
});

for (const visibility of ['invite', 'friends']) test(`invitations are disabled without room permission (${visibility})`, async ({page}) => {
  await mount(page, {own:{id:'111111',plaza:{visibility,creator:{profileId:'someone-else'},members:[]}}});
  await expect(page.getByRole('button', {name:'ありすに招待を送る',exact:true})).toBeDisabled();
  expect(await page.evaluate(() => window.fixture.invites)).toEqual([]);
});

test('invitation failure stays retryable and succeeds without sending an access request', async ({page}) => {
  await mount(page, {inviteFails:true});
  const invite = page.getByRole('button', {name:'ありすに招待を送る',exact:true});
  await invite.click();
  await expect(page.getByRole('alert')).toContainText('招待を送れませんでした');
  await expect(invite).toBeEnabled();
  await page.evaluate(() => {window.fixture.inviteFails = false;});
  await invite.click();
  await expect(page.getByRole('button', {name:'ありすに招待を送りました',exact:true})).toBeDisabled();
  expect(await page.evaluate(() => window.fixture.requests)).toEqual([]);
});
