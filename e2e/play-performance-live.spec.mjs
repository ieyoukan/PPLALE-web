import {test,expect} from '@playwright/test';
const base=process.env.PPLALE_ROOM_TEST_URL,server=process.env.PPLALE_ROOM_SERVER_TEST_URL;
test.skip(!base||!server,'set both PPLALE_ROOM_TEST_URL and PPLALE_ROOM_SERVER_TEST_URL');
test('two real browsers automatically measure a room action and publish the shared aggregate',async({browser,request})=>{
  test.setTimeout(60000);
  const host=await (await request.post(`${server}/rooms`,{data:{name:'計測テスト',rules:{fruits:['strawberry'],extendedPlayable:false}}})).json();
  const id=host.view.id;
  const guest=await (await request.post(`${server}/rooms/${id}/join`,{data:{name:'計測テスト2'}})).json();
  const contexts=[];
  try {
    const pages=await Promise.all([host,guest].map(async seat=>{
      const context=await browser.newContext({viewport:{width:1280,height:800}});contexts.push(context);
      await context.addInitScript(({id,seat})=>localStorage.setItem('pplale-room-seats-v2',JSON.stringify({[id]:{seat:seat.seat,token:seat.token,at:Date.now()}})),{id,seat});
      const page=await context.newPage();await page.goto(`${base}/game/battle/room/?id=${id}`);
      await page.getByRole('button',{name:'このデッキで準備OK'}).click();return page;
    }));
    for(const page of pages)await expect(page.locator('[data-table]')).toBeVisible();
    await pages[0].getByRole('button',{name:'あなたのサイコロを振る'}).click();
    await pages[1].getByRole('button',{name:'あなたのサイコロを振る'}).click();
    for(const page of pages){
      await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pplale-room-performance-v1')||'[]').filter(s=>s.kind==='roll'&&s.outcome==='ok'&&s.server).length),{timeout:10000}).toBeGreaterThan(0);
      const samples=await page.evaluate(()=>JSON.parse(localStorage.getItem('pplale-room-performance-v1')));
      expect(samples[0].roundTrip).toBeGreaterThan(0);expect(samples[0].server.total).toBeGreaterThan(0);
      expect(JSON.stringify(samples)).not.toContain(id);expect(JSON.stringify(samples)).not.toContain('計測テスト');
    }
    await expect.poll(async()=>{const response=await request.get(`${server}/stats`);return (await response.json()).performance.summary.samples;},{timeout:20000}).toBeGreaterThan(0);
  } finally {await Promise.all(contexts.map(context=>context.close()));}
});
