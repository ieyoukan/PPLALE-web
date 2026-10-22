import {test,expect} from '@playwright/test';
import {summarizePlays,summarizeByKind} from '../packages/game-core/dist/performance.js';
const base=process.env.PPLALE_ROOM_TEST_URL;
test.skip(!base,'set PPLALE_ROOM_TEST_URL to the built app');
const at=Math.floor(Date.now()/60000)*60000;
const sample={kind:'attack',at,outcome:'ok',background:false,inputToPaint:300,roundTrip:100,sendToView:90,viewToPaint:200,inputToSend:10};
test('the diagnostic screen separates foreground success, background and failures on mobile',async({page})=>{
  await page.route('**/stats',route=>route.abort());
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(samples=>localStorage.setItem('pplale-room-performance-v1',JSON.stringify(samples)),[sample,{...sample,background:true,inputToPaint:99999},{...sample,outcome:'timeout',inputToPaint:undefined}]);
  await page.goto(`${base}/game/performance/`);
  await expect(page.getByRole('status')).toHaveText('記録 3 件 · 集計対象 1 件 · バックグラウンド 1 件 · 未完了 1 件');
  await expect(page.getByRole('row').filter({hasText:'入力 → 盤面表示'}).first()).toContainText('300 ms');
  await expect(page.getByRole('row').filter({hasText:'応答なし'})).toBeAttached();
  await page.getByRole('button',{name:'全体',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('集計を取得できません');
  await page.getByRole('button',{name:'この端末',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('記録 3 件');
  await page.screenshot({path:'/tmp/pplale-play-performance-mobile.png'});
});
test('the shared tab displays aggregate data without exposing local rows',async({page})=>{
  const samples=[sample];
  await page.route('**/stats',route=>route.fulfill({json:{performance:{capacity:2048,retentionHours:24,scope:'shared',summary:summarizePlays(samples),byKind:summarizeByKind(samples)}}}));
  await page.goto(`${base}/game/performance/`);await page.getByRole('button',{name:'全体',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('記録 1 件');
  await expect(page.getByText('全サーバー共通',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'直近の操作'})).toHaveCount(0);
});
