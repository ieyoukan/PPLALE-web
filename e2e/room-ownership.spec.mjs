import { test, expect } from '@playwright/test';

const base = process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base, 'set PPLALE_ROOM_TEST_URL to a web app with a room server');
test.use({ reducedMotion: 'reduce' });

test('guests wait for online signed-in people before claiming an unowned room', async ({ page }) => {
  const id = '123459', requests = []; let connection;
  const view = { id, version: 1, status: 'lobby', match: 0, seat: 0, watching: true, spectators: 2,
    rules: { fruits: ['strawberry'], extendedPlayable: false, spectators: true }, players: [null, null], game: null, last: null, resigned: null,
    plaza: { name: '引き継ぎのお茶会', visibility: 'public', me: 'guest', owner: null, canClaimOwner: false, creator: { name: '作った人' },
      members: [{ id: 'guest', name: 'ゲスト', online: true }, { id: 'signed', name: 'ログイン中の人', profileId: 'test-profile', online: true }] } };
  await page.addInitScript(id => localStorage.setItem('pplale-plaza-v1', JSON.stringify({ current: id, rooms: { [id]: { token: 'test', at: Date.now() } } })), id);
  await page.routeWebSocket(/\/rooms\/123459\/socket/, socket => {
    connection = socket;
    socket.onMessage(bytes => {
      const request = JSON.parse(String(bytes));
      if (request.type === 'hello') socket.send(JSON.stringify({ type: 'view', view }));
      if (request.type !== 'action') return;
      requests.push(request.action);
      if (request.action.action === 'claim' && view.plaza.canClaimOwner) {
        view.version++; view.plaza.owner = 'guest'; view.plaza.canClaimOwner = false;
        socket.send(JSON.stringify({ type: 'view', view }));
        socket.send(JSON.stringify({ type: 'result', n: request.n }));
      }
    });
  });
  await page.goto(`${base}/game/room/${id}/`);
  const claim = page.getByRole('button', { name: 'オーナーになる', exact: true });
  await expect(claim).toBeDisabled();
  await expect(claim).toHaveAttribute('title', 'ログイン中の人が先にオーナーを引き継げます');
  expect(requests).toEqual([]);
  view.version++; view.plaza.canClaimOwner = true; view.plaza.members[1].online = false;
  connection.send(JSON.stringify({ type: 'view', view }));
  await expect(claim).toBeEnabled(); await claim.click();
  await expect(page.getByText('あなたがオーナー', { exact: true })).toBeVisible();
  expect(requests).toEqual([{ action: 'claim' }]);
});
