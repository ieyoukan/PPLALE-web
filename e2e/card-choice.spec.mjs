import {test,expect} from '@playwright/test';
import {arena,hand,field,run} from '../packages/game-core/tests/helpers.mjs';
const key='pplale-game-session-v2';
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).game,key);
async function load(page,game){
  await page.goto('/robots.txt');
  await page.evaluate(({key,game})=>localStorage.setItem(key,JSON.stringify({game,mode:'hotseat',level:'easy'})),{key,game});
  await page.goto('/game/play/');await expect(page.locator('[data-table]')).toBeVisible({timeout:20000});
  await page.addStyleTag({content:'nextjs-portal{display:none}'});
}
const card=(page,uid)=>page.locator(`[data-hand-list] [data-hand="${uid}"]`);
const pick=locator=>locator.evaluate(element=>element.click());
const choices=page=>page.getByRole('group',{name:'カードを選んで確定'});

test('discard is reversible and a single choice changes only after confirmation',async({page})=>{
  const game=arena({me:{hand:['y_5','y_17','y_4']}}),[source,a,b]=hand(game);
  await load(page,game);await card(page,source).click();await page.getByRole('button',{name:'場に出す',exact:true}).click();
  await expect(choices(page)).toBeVisible();const before=await saved(page);
  await card(page,a).click();await expect(card(page,a)).toHaveAttribute('aria-pressed','true');
  await expect(card(page,a).getByText('✓ お昼寝予定',{exact:true})).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await card(page,a).click();await expect(card(page,a)).toHaveAttribute('aria-pressed','false');
  await expect(page.getByRole('button',{name:'お昼寝に送る（0枚）',exact:true})).toBeDisabled();
  await card(page,a).click();await card(page,b).click();await expect(card(page,a)).toHaveAttribute('aria-pressed','false');
  await page.getByRole('button',{name:'お昼寝に送る（1枚）',exact:true}).evaluate(button=>{button.click();button.click();});
  await expect.poll(async()=>(await saved(page)).players[0].nap).toContain(b);
  const after=await saved(page);expect(after.players[0].hand).toContain(a);expect(after.pending.task.op).toBe('draw');await expect(page.locator('[data-readable] [role="alert"]')).toHaveCount(0);
});

for(const viewport of [{width:1280,height:860},{width:844,height:390}])test(`hand-limit exiles are selected together and can be changed at ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  const game=run(arena({me:{hand:Array(11).fill('y_17')}}),{type:'end',actor:0}),[a,b,c]=hand(game);
  await load(page,game);await expect(choices(page)).toBeVisible();const before=await saved(page);
  await pick(card(page,a));await expect(page.getByRole('button',{name:'除外する（1枚）',exact:true})).toBeDisabled();
  await pick(card(page,b));await pick(card(page,a));await pick(card(page,c));
  expect(await saved(page)).toEqual(before);
  await page.screenshot({path:`/tmp/pplale-card-choice-hand-${viewport.width}.png`});
  await page.getByRole('button',{name:'除外する（2枚）',exact:true}).click();
  await expect.poll(async()=>(await saved(page)).players[0].exile.length).toBe(2);
  const after=await saved(page);expect(after.players[0].exile).toEqual([b,c]);expect(after.players[0].hand).toHaveLength(9);
});

test('exiling cards from a nap uses the same reversible selection and completion',async({page})=>{
  const game=arena({me:{field:['y_91']},foe:{nap:['y_17','y_4','y_1','y_9']}}),[a,b]=game.players[1].nap;
  await load(page,game);await page.locator(`[data-unit="${field(game)[0]}"]`).click();
  await page.locator('[data-leader="1"] button').first().click();await expect(choices(page)).toBeVisible();
  const before=await saved(page),option=uid=>page.locator(`[data-choice-card="${uid}"]`);
  await option(a).click();await option(a).click();await expect(option(a)).toHaveAttribute('aria-pressed','false');
  await option(a).click();await option(b).click();expect(await saved(page)).toEqual(before);
  await page.screenshot({path:'/tmp/pplale-card-choice-nap.png'});
  await page.getByRole('button',{name:'除外する（2枚）',exact:true}).click();
  await expect.poll(async()=>(await saved(page)).players[1].exile.length).toBe(2);
  expect((await saved(page)).players[1].exile).toEqual([a,b]);
});

test('optional cat discards can choose zero or several without committing when tapped',async({page})=>{
  const game=arena({me:{hand:['y_101','token_cat','token_cat','token_cat']}}),[source,a,b]=hand(game);
  await load(page,game);await card(page,source).click();await page.getByRole('button',{name:'場に出す',exact:true}).click();
  await expect(page.getByRole('button',{name:'選ばずに完了',exact:true})).toBeEnabled();const before=await saved(page);
  await pick(card(page,a));await pick(card(page,b));expect(await saved(page)).toEqual(before);
  await page.getByRole('button',{name:'お昼寝に送る（2枚）',exact:true}).click();
  await expect.poll(async()=>(await saved(page)).players[0].nap.length).toBe(2);
  const after=await saved(page);expect(after.players[0].nap).toEqual([a,b]);expect(after.cards[source].attackBonus).toBe(2);
  await load(page,game);await card(page,source).click();await page.getByRole('button',{name:'場に出す',exact:true}).click();
  await page.getByRole('button',{name:'選ばずに完了',exact:true}).click();await expect(choices(page)).toBeHidden();
  expect((await saved(page)).players[0].nap).toHaveLength(0);
});

test('English uses the shared translated selection controls',async({page,context})=>{
  await context.addCookies([{name:'pplale-locale',value:'en',url:'http://localhost:3000'}]);
  const game=run(arena({me:{hand:Array(11).fill('y_17')}}),{type:'end',actor:0}),[a,b]=hand(game);
  await load(page,game);
  await expect(page.getByRole('group',{name:'Choose cards and confirm'})).toBeVisible();
  await pick(card(page,a));await pick(card(page,b));
  await expect(card(page,a).getByText('✓ To exile',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Exile (2)',exact:true}).click();
  await expect.poll(async()=>(await saved(page)).players[0].exile.length).toBe(2);
});
