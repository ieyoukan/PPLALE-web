import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

let fixture;
test.beforeAll(async () => {
  const { outputFiles } = await build({ stdin: { contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{Finale}from'./src/components/game/table/Finale';import{OpeningDie}from'./src/components/game/OpeningDie';
    import{NotificationSound}from'./src/lib/game/notificationSound';
    window.sound=new NotificationSound();window.sound.unlock();
    function App(){const[value,setValue]=useState(3),[rolling,setRolling]=useState(false);return window.fixtureName?<Finale/>:<><OpeningDie value={value} rolling={rolling} interactive label="検証" onRoll={()=>{setValue(6);setRolling(true)}}/><button onClick={()=>{setValue(4);setRolling(false)}}>止める</button></>}
    createRoot(document.getElementById('stage')).render(<App/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, jsx: 'automatic', outdir: '.cache/display-die', platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'board', setup(builder) {
      builder.onResolve({ filter: /BoardContext$/ }, () => ({ path: 'board', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const useBoardContext=()=>({game:{winner:0,rules:{firstPlayer:0}},names:[window.fixtureName,'相手'],view:0,mode:'hotseat',animations:{finale:'verdict',advanceFinale(){}}});` }));
    } }],
  });
  const css = outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
  const script = outputFiles.find(file => file.path.endsWith('.js')).text;
  fixture = `<html><style>${css}*{box-sizing:border-box}body{margin:0}#stage{width:100vw;height:100vh;container:stage / size}button{cursor:pointer}</style><body><div id="stage"></div><script>${script.replaceAll('</script','<\\/script')}</script></body></html>`;
});
async function open(page, name) {
  await page.addInitScript(name => { window.fixtureName = name; }, name);
  await page.route('**/display-die-fixture', route => route.fulfill({ contentType: 'text/html', body: fixture }));
  await page.goto('/display-die-fixture');
}
for (const width of [1280, 390]) test(`long winner names fit the verdict (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  const name = 'とてもながいプレイヤーの名前Hogehogehogehoge';
  await open(page, name);
  const text = page.getByRole('button').getByText(`${name}の勝ち`, { exact: true });
  await expect(text).toBeVisible();
  const bounds = await text.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);
});
test('the die renders while moving, rests without WebGL work, and never creates audio without activation', async ({ page }) => {
  const warnings = [];
  page.on('console', message => { if (/AudioContext.*not allowed|PCFSoftShadowMap.*removed/.test(message.text())) warnings.push(message.text()); });
  await page.addInitScript(() => {
    window.draws = 0;
    const original = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args) { window.draws++;return original.apply(this,args); };
  });
  await open(page, '');
  await expect(page.getByRole('button', { name: '検証のサイコロを振る', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.draws)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.sound.context)).toBeNull();
  await page.waitForTimeout(300);
  const still = await page.evaluate(() => window.draws);
  await page.waitForTimeout(300);expect(await page.evaluate(() => window.draws)).toBe(still);
  await page.getByRole('button', { name: '検証のサイコロを振る', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.draws)).toBeGreaterThan(still);
  await page.getByRole('button', { name: '止める', exact: true }).click();
  await page.waitForTimeout(300);const settled = await page.evaluate(() => window.draws);
  await page.waitForTimeout(300);expect(await page.evaluate(() => window.draws)).toBe(settled);
  expect(warnings).toEqual([]);
});
