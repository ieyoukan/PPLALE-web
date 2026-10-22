import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const bundle = async file => {
  const result = await build({entryPoints:[new URL(file,import.meta.url).pathname],bundle:true,format:'esm',platform:'node',write:false});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const { playTiming } = await bundle('../src/lib/game/room/playTiming.ts');
const { parsePlayReport, summarizePlays, parseServerTiming } = await bundle('../packages/game-core/src/performance.ts');
const server = {queue:1,read:2,apply:3,store:4,presence:5,deliver:6,publish:7,total:28};
test('view, acknowledgement and presentation are measured independently on one monotonic clock',()=>{
  let now=10;const samples=[],reports=[]; const timing=playTiming(sample=>samples.push(sample),report=>reports.push(report),()=>now);
  timing.begin(1,'attack',2,0);
  now=60;timing.received(2);
  now=80;timing.acknowledged(1,{revision:2,timing:server});
  assert.equal(samples.length,0,'ACK is not a painted board');
  now=500;timing.presented(2);
  assert.deepEqual({...samples[0],at:0},{kind:'attack',at:0,outcome:'ok',background:false,inputToSend:10,roundTrip:70,sendToView:50,viewToPaint:440,inputToPaint:500,server});
  assert.deepEqual(reports[0],{n:1,background:false,inputToSend:10,roundTrip:70,sendToView:50,viewToPaint:440,inputToPaint:500});
  assert.equal(parsePlayReport(reports[0])?.n,1);
  timing.presented(3);timing.acknowledged(1,{});assert.equal(samples.length,1);timing.close();
});
test('paint before ACK, held hidden-hand revisions, old servers and explicit failures remain distinguishable',()=>{
  let now=0;const samples=[],reports=[];const timing=playTiming(s=>samples.push(s),r=>reports.push(r),()=>now);
  timing.begin(1,'play',2);now=10;timing.received(2);now=20;timing.presented(1);assert.equal(samples.length,0);
  now=30;timing.received(3);now=50;timing.presented(3);assert.equal(samples.length,0);
  now=60;timing.acknowledged(1,{revision:2,timing:server});assert.equal(samples[0].inputToPaint,50);assert.equal(samples[0].roundTrip,60);
  timing.begin(2,'end',4);now=70;timing.received(4);timing.acknowledged(2,{});now=80;timing.presented(4);
  assert.equal(samples[1].outcome,'ok');assert.equal(reports.length,1,'old servers never receive a new message type');
  timing.begin(3,'choose',5);timing.acknowledged(3,{error:'refused'});assert.equal(samples[2].outcome,'rejected');assert.equal(samples[2].inputToPaint,undefined);
  timing.begin(4,'choose',5);timing.failed(4,'timeout');assert.equal(samples[3].roundTrip,undefined);
  timing.begin(5,'end',5);timing.disconnect();assert.equal(samples[4].outcome,'disconnected');timing.close();
});
test('an operation that entered background is excluded even after returning to foreground',()=>{
  const document=new EventTarget();document.hidden=false;globalThis.document=document;
  let now=0;const samples=[];const timing=playTiming(s=>samples.push(s),()=>{},()=>now);
  try {timing.begin(1,'roll',1);document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));document.hidden=false;now=10;timing.received(1);timing.acknowledged(1,{revision:1,timing:server});now=20;timing.presented(1);
    assert.equal(samples[0].background,true);assert.equal(summarizePlays(samples).measured,0);
  } finally {timing.close();delete globalThis.document;}
});
test('validation rejects invalid durations and strips all identifying or invented server fields',()=>{
  const report={n:2,background:false,inputToSend:10,roundTrip:100,sendToView:80,viewToPaint:200,inputToPaint:290};
  assert.deepEqual(parsePlayReport({...report,name:'secret',room:'123456',server:{total:0}}),report);
  for(const invalid of [{roundTrip:Infinity},{roundTrip:-1},{inputToPaint:29100},{n:1.5},{sendToView:110},{background:'false'},{inputToSend:120001}])assert.equal(parsePlayReport({...report,...invalid}),null);
  assert.deepEqual(parseServerTiming({...server,name:'secret'}),server);
  assert.equal(parseServerTiming({total:0}),undefined);
  const sample={kind:'attack',at:0,outcome:'ok',background:false,inputToPaint:10,server};
  const summary=summarizePlays([sample,{...sample,inputToPaint:30},{...sample,inputToPaint:9999,background:true},{...sample,outcome:'rejected'}]);
  assert.deepEqual(summary.milliseconds.inputToPaint,{count:2,p50:10,p95:30,max:30});assert.equal(summary.samples,4);assert.equal(summary.outcomes.rejected,1);
});
test('the browser journal retains 200 samples and strips fields when saving and restoring',async()=>{
  const window=new EventTarget(),values=new Map();globalThis.window=window;globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const {recordPlaySample,performanceLog,clearPlaySamples}=await bundle('../src/lib/game/room/performanceLog.ts');
  try {
    for(let i=0;i<250;i++)recordPlaySample({kind:'attack',at:123456789,outcome:'ok',background:false,inputToPaint:i,name:'secret',room:'123456',server:{...server,card:'secret'}});
    window.dispatchEvent(new Event('pagehide'));
    const raw=values.get('pplale-room-performance-v1');assert.ok(!raw.includes('secret'));assert.ok(!raw.includes('"room"'));
    const stored=JSON.parse(raw);assert.equal(stored.length,200);assert.equal(stored[0].inputToPaint,50);assert.equal(stored[0].at%60000,0);
    assert.equal(performanceLog.snapshot().length,200);
    clearPlaySamples();assert.equal(performanceLog.snapshot().length,0);assert.equal(values.get('pplale-room-performance-v1'),'[]');
  } finally {delete globalThis.window;delete globalThis.localStorage;}
});
