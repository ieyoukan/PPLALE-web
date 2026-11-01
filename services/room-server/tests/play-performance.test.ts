import test from 'node:test';
import assert from 'node:assert/strict';
import type { ServerMessage } from '@pplale/game-core/room';
import type { PlaySample } from '@pplale/game-core/performance';
import { memoryBackend } from '../src/backend.ts';
import { commandTiming } from '../src/latency.ts';
import { playPerformance } from '../src/play-performance.ts';
import { serve, shared, startedMatch, connect, deck } from './helpers.ts';

const sample:PlaySample={kind:'attack',at:Math.floor(Date.now()/60000)*60000,outcome:'ok',background:false,inputToPaint:50};
test('shared diagnostics are bounded, expire, and survive a different backend connection',async t=>{
  const data=shared(),a=await data.open(),b=await data.open();t.after(async()=>{await a.close();await b.close();});
  await a.appendPerformance(Array.from({length:2200},(_,i)=>({...sample,inputToPaint:i})));
  assert.equal((await b.readPerformance()).length,2048);
  const metrics=playPerformance(b);t.after(()=>metrics.close());
  await a.appendPerformance([{...sample,at:Date.now()-25*3600000}]);
  const snapshot=await metrics.snapshot();assert.equal(snapshot.summary.samples,2047);assert.equal(snapshot.summary.milliseconds.inputToPaint?.max,2199);
});
test('a blocked diagnostic write has bounded memory and does not hold new records or reads',async t=>{
  const gate=Promise.withResolvers<void>(),backend=memoryBackend();let writes=0;
  const metrics=playPerformance({...backend,async appendPerformance(batch){writes++;await gate.promise;await backend.appendPerformance(batch);}});
  t.after(()=>{gate.resolve();metrics.close();});
  metrics.record(sample);const flush=metrics.flush();
  for(let i=0;i<1000;i++)metrics.record(sample);
  assert.equal((await metrics.snapshot()).summary.samples,0);
  gate.resolve();await flush;await metrics.flush();assert.equal(writes,2);assert.equal((await metrics.snapshot()).summary.samples,257);
});
test('a stalled Redis read times out and does not accumulate more read requests',async t=>{
  const gate=Promise.withResolvers<PlaySample[]>();let reads=0;
  const metrics=playPerformance({...memoryBackend(),readPerformance(){reads++;return gate.promise;}});t.after(()=>{gate.resolve([]);metrics.close();});
  assert.equal((await metrics.snapshot()).summary.samples,0);assert.equal((await metrics.snapshot()).summary.samples,0);assert.equal(reads,1);
});
test('only issued ACKs on the same seated socket produce one sanitized shared sample',async t=>{
  const served=await serve();t.after(()=>served.close());
  const {sockets,command,id,host}=await startedMatch(served,served,true);
  const issued=new Promise<Extract<ServerMessage,{type:'result'}>>(resolve=>sockets[0].socket.on('message',raw=>{const m=JSON.parse(String(raw)) as ServerMessage;if(m.type==='result'&&m.timing)resolve(m);}));
  await command(0,{type:'openingDraw',actor:0,deck:'yojo'});const ack=await issued;
  assert.ok(ack.revision !== undefined && ack.revision>0);assert.ok(ack.timing);assert.deepEqual(Object.keys(ack.timing).sort(),Object.keys(commandTiming()).sort());
  const report={n:ack.n,background:false,inputToSend:1,roundTrip:50,sendToView:40,viewToPaint:10,inputToPaint:51,name:'secret',room:id,kind:'end',server:{total:0}};
  const watcher=await connect(served,id,null);await watcher.until(v=>!!v.watching);
  watcher.socket.send(JSON.stringify({type:'performance',reports:[report]}));
  const other=await connect(served,id,host.token);await other.until(v=>!!v.game);
  other.socket.send(JSON.stringify({type:'performance',reports:[report]}));
  sockets[0].socket.send(JSON.stringify({type:'performance',reports:[{...report,inputToPaint:999},report,report]}));
  await new Promise(resolve=>setTimeout(resolve,1150));
  const stored=await served.backend.readPerformance();assert.equal(stored.length,1);assert.equal(stored[0].kind,'openingDraw');assert.deepEqual(stored[0].server,ack.timing);
  const text=JSON.stringify(stored);assert.ok(!text.includes('secret'));assert.ok(!text.includes(id));assert.ok(!text.includes('"n":'));
  assert.equal((await served.server.stats()).performance?.summary.measured,1);
  await watcher.close();
  await other.close();
});

test('plaza ACK timing includes completed presence, delivery and publish',async t=>{
  const backend=memoryBackend();
  const served=await serve({data:{open:()=>({...backend,async publish(...args:Parameters<typeof backend.publish>){await new Promise(resolve=>setTimeout(resolve,15));return backend.publish(...args);}})}});
  t.after(()=>served.close());
  const made=await served.call<import('@pplale/game-core/room').Entered>('/rooms',{name:'検証',rules:{fruits:['strawberry'],extendedPlayable:false},plaza:{visibility:'invite'}});
  const {view,token}=made.data;
  const joined=await served.call<import('@pplale/game-core/room').Entered>(`/rooms/${view.id}/join`,{name:'相手',plaza:true,invite:view.plaza!.invite});
  const a=await connect(served,view.id,token),b=await connect(served,view.id,joined.data.token);
  await Promise.all([a.until(v=>!!v.plaza),b.until(v=>!!v.plaza)]);
  for(const [client,seat] of [[a,0],[b,1]] as const)assert.equal(await client.act({action:'sit',seat}),undefined);
  for(const client of [a,b])assert.equal(await client.act({action:'ready',deck}),undefined);
  await a.until(v=>v.game?.phase==='dice');
  const issued=new Promise<Extract<ServerMessage,{type:'result'}>>(resolve=>a.socket.on('message',raw=>{const m=JSON.parse(String(raw)) as ServerMessage;if(m.type==='result'&&m.timing)resolve(m);}));
  assert.equal(await a.act({action:'command',command:{type:'roll',actor:0},revision:a.latest().game!.revision}),undefined);
  const ack=await issued;
  assert.ok(ack.timing!.publish>=14,JSON.stringify(ack.timing));assert.ok(ack.timing!.total>=ack.timing!.publish);
  assert.ok(ack.timing!.total>=ack.timing!.read+ack.timing!.apply+ack.timing!.store);
});
