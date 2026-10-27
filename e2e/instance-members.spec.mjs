import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

// Exercise the real member list and social hook with accepted and pending friendship updates.
test('only accepted friends are grouped as friends, and profiles are the only member action', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const { outputFiles } = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {InstanceMembers} from './src/components/game/plaza/InstanceMembers';
      createRoot(document.getElementById('root')).render(<InstanceMembers room={window.fixture.room} />);`,
      resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, jsx: 'automatic', outdir: '.cache/instance-members-fixture', platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_ROOM_SERVER_URL': 'undefined' },
    plugins: [{ name: 'social-fixture', setup(builder) {
      builder.onResolve({ filter: /^(@\/lib\/auth|@\/lib\/game\/social|next\/link|next\/image)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'jsx', resolveDir: process.cwd(), contents:
        args.path === '@/lib/auth' ? 'export const useAuth = () => ({user: {uid: "self"}});'
          : args.path === '@/lib/game/social' ? `export const readProfile = async uid => ({uid, iconCardId: 'p_1'});
            export const respondFriend = async () => {};
            export function watchSocial(uid, receive) {
              const update = () => receive([...window.fixture.players]);
              update(); window.addEventListener('friends-updated', update);
              return () => window.removeEventListener('friends-updated', update);
            }`
            : args.path === 'next/link' ? `import React from 'react'; export default function Link({prefetch, ...props}) {return <a {...props} />;}`
              : `import React from 'react'; export default function Image({fill, unoptimized, fetchPriority, ...props}) {return <img {...props} />;}` }));
    } }],
  });
  const css = outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
  const script = outputFiles.find(file => file.path.endsWith('.js')).text;
  const room = { me: 'me', owner: 'me', members: [
    { id: 'me', name: 'あなた', profileId: 'self', online: true },
    { id: 'friend', name: 'フレンドさん', profileId: 'friend-user', online: true, seat: 0 },
    { id: 'pending', name: '申請中さん', profileId: 'pending-user', online: true },
    { id: 'guest', name: 'ゲストさん', online: false },
  ] };
  const player = (uid, status) => ({ profile: { uid }, friendship: { id: uid, members: ['self', uid], requestedBy: 'self', status } });
  await page.addInitScript(fixture => { window.fixture = fixture; }, { room, players: [player('friend-user', 'accepted'), player('pending-user', 'pending')] });
  await page.route('**/instance-members-fixture', route => route.fulfill({ contentType: 'text/html', body: `<html><style>${css}</style><body><div id="root"></div><script>${script.replaceAll('</script', '<\\/script')}</script></body></html>` }));
  await page.goto('/instance-members-fixture');
  const friends = page.getByRole('region', { name: 'フレンド', exact: true });
  const others = page.getByRole('region', { name: 'ほかの人', exact: true });
  await expect(friends.getByRole('listitem')).toHaveCount(1);
  await expect(friends.getByRole('link')).toHaveAttribute('href', '/game/profile/?id=friend-user');
  await expect(others.getByRole('listitem')).toHaveCount(2);
  await expect(others).toContainText('申請中さん');
  await expect(others).toContainText('再接続中');
  await expect(page.getByRole('button')).toHaveCount(0);
  await page.evaluate(() => { window.fixture.players[1].friendship.status = 'accepted'; window.dispatchEvent(new Event('friends-updated')); });
  await expect(friends.getByRole('listitem')).toHaveCount(2);
  await expect(others.getByRole('listitem')).toHaveCount(1);
  expect(errors).toEqual([]);
});
