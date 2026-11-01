import {test,expect} from '@playwright/test';
import {arena,hand} from '../packages/game-core/tests/helpers.mjs';
const key='pplale-game-session-v2';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,key);
async function load(page,game){
  await page.goto('/robots.txt');await page.evaluate(({key,game})=>localStorage.setItem(key,JSON.stringify({game,mode:'hotseat',level:'easy'})),{key,game});
  await page.goto('/game/play/');await expect(page.locator('[data-table]')).toBeVisible({timeout:20000});
  await page.addStyleTag({content:'nextjs-portal{display:none}'});
}
const resource=(page,side,key)=>page.locator(`[data-pp="${side}"] [data-resource="${key}"]`);

test('zero counts stay hidden; playing Uyuchi adds only the own counter without moving end turn',async({page})=>{
  const game=arena({me:{hand:['y_2']}});game.players[1].played=['y_2','y_2','s_0'];
  await load(page,game);await expect(page.locator('[data-pp="0"] [data-player-counters]')).toHaveCount(0);
  await expect(resource(page,1,'uyuchi')).toContainText('2');await expect(resource(page,1,'sweets')).toContainText('1');
  const end=page.getByRole('button',{name:/ターン\s*終了/}),before=await end.boundingBox();
  await page.locator(`[data-hand="${hand(game)[0]}"]`).click();await page.getByRole('button',{name:'場に出す',exact:true}).click();
  await expect(resource(page,0,'uyuchi')).toContainText('1');await expect(resource(page,1,'uyuchi')).toContainText('2');
  await expect(resource(page,0,'sweets')).toHaveCount(0);
  const after=await end.boundingBox();expect(Math.abs(after.y-before.y)).toBeLessThan(1);
  await resource(page,0,'uyuchi').click();await expect(page.getByRole('heading',{name:'カードのカウント',exact:true})).toBeVisible();
});

for(const viewport of [{width:1280,height:860},{width:844,height:390},{width:390,height:844},{width:320,height:568},{width:568,height:320}])test(`counters stay with their player and remain visible at ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  const game=arena({me:{playable:'p_6'},foe:{playable:'p_6'}});
  for(const [side,player] of game.players.entries()){
    player.played=[...Array(side?2:5).fill('y_2'),...Array(side?3:7).fill('s_0')];player.mochidaLeft=side?4:9;player.mp=side?6:12;
  }
  await load(page,game);
  for(const [side,values] of [[0,{uyuchi:5,sweets:7,mochida:9,mp:12}],[1,{uyuchi:2,sweets:3,mochida:4,mp:6}]]){
    for(const [kind,value]of Object.entries(values)){
      const counter=resource(page,side,kind);await expect(counter).toBeVisible();await expect(counter.locator('b')).toContainText(String(value));
      const bounds=await counter.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height);
      expect(await counter.locator('b').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
      const visible=()=>counter.evaluate(element=>{const r=element.getBoundingClientRect();return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
      await expect.poll(visible).toBe(true);
    }
  }
  await expect(page.locator('[data-table] [class*="fieldCounts"], [data-table] [class*="mpBadge"]')).toHaveCount(0);
  await page.screenshot({path:`/tmp/pplale-player-counters-${viewport.width}.png`});
  await resource(page,1,'mp').click();await expect(page.getByRole('dialog',{name:'スキル',exact:true})).toBeVisible();
});

test('spent MP remains visible at zero and opens the correct skills',async({page})=>{
  const game=arena({me:{playable:'p_6'}});game.players[0].mp=0;game.players[0].skillHistory=[2];
  await load(page,game);await expect(resource(page,0,'mp').locator('b')).toHaveText('0/20');
  await resource(page,0,'mp').click();await expect(page.getByRole('dialog',{name:'スキル',exact:true})).toBeVisible();
  expect((await saved(page)).players[0].mp).toBe(0);
});

test('strawberry type added to Uyuchi counts on play and survives reload',async({page})=>{
  const game=arena({me:{hand:['y_72']}}),uid=hand(game)[0];
  game.cards[uid].fruitTypes=['strawberry'];game.players[0].played=Array(4).fill('y_2');
  await load(page,game);await expect(resource(page,0,'uyuchi').locator('b')).toHaveText('4');
  await page.locator(`[data-hand="${uid}"]`).click();await page.getByRole('button',{name:'場に出す',exact:true}).click();
  await expect(resource(page,0,'uyuchi').locator('b')).toHaveText('5');
  await page.reload();await expect(resource(page,0,'uyuchi').locator('b')).toHaveText('5');
});
