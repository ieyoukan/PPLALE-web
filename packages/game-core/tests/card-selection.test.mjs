import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingView, restoreGame, viewFor } from '../dist/index.js';
import { arena, play, hand, choose, run } from './helpers.mjs';
import { catalog } from './helpers.mjs';

test('discard metadata describes the choice without moving a card or changing its follow-up',()=>{
  let s=arena({me:{hand:['y_5','y_17','y_4']}});
  s=play(s,hand(s)[0]);const uid=hand(s)[0],before=structuredClone(s);
  const choice=pendingView(s).selection;
  assert.equal(choice.kind,'discard');assert.equal(choice.min,1);assert.equal(choice.max,1);
  assert.deepEqual(choice.candidates,hand(s));assert.deepEqual(s,before);
  const restored=restoreGame(s,catalog);assert.deepEqual(restored.pending.selection,s.pending.selection);
  const legacy=structuredClone(s);delete legacy.pending.selection;assert.equal(pendingView(legacy).selection.kind,'discard');
  assert.equal(pendingView(viewFor(s,1)).selection,undefined);
  s=choose(s,uid);assert.ok(s.players[0].nap.includes(uid));assert.equal(s.pending.task.op,'draw');
});
test('hand limit, selected dice discards and optional cat discards keep their own counts',()=>{
  let s=run(arena({me:{hand:Array(12).fill('y_17')}}),{type:'end',actor:0});
  assert.equal(pendingView(s).selection.kind,'exile');assert.equal(pendingView(s).selection.max,3);
  s=arena({me:{hand:['y_18','y_17','y_4','y_9','y_1']}});s.players[0].exSkills={dice:{uses:1}};
  s=choose(play(s,hand(s)[0]),'6');assert.equal(pendingView(s).selection.max,3);
  s=choose(s,hand(s)[0]);assert.equal(pendingView(s).selection.max,2);
  assert.equal(s.players[0].nap.length,0,'the dice effect still discards together');
  s=arena({me:{hand:['y_101','token_cat','token_cat']}});s=play(s,hand(s)[0]);
  assert.equal(pendingView(s).selection.kind,'discard');assert.equal(pendingView(s).selection.min,0);
  assert.equal(pendingView(s).selection.finish,'done');
});
test('the doughnut target is a separate choice from its discarded cost',()=>{
  let s=arena({me:{hand:['s_11','s_12'],field:['y_17']}});s=play(s,hand(s)[0]);
  assert.equal(pendingView(s).selection.kind,'discard');
  s=choose(s,hand(s)[0]);assert.equal(pendingView(s).selection,undefined);
  assert.equal(s.pending.task.op,'keyword');
});
