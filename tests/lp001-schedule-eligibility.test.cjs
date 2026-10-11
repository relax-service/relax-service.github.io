'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluate}=require('../lp001/schedule-eligibility.js');

const now='2026-10-10T21:00:00+09:00';
function slot(start,end,extra={}){return {start,end,...extra};}

test('missing new backend property means UNKNOWN, not zero',()=>{
  assert.deepEqual(evaluate(undefined,now,7),{known:false,eligible:false,count:0});
  assert.deepEqual(evaluate(null,now,7),{known:false,eligible:false,count:0});
});

test('empty calendar slots means hide counselor card',()=>{
  assert.deepEqual(evaluate([],now,7),{known:true,eligible:false,count:0});
});

test('a future waiting slot within seven days means show',()=>{
  const x=evaluate([slot('2026-10-14T19:00:00+09:00','2026-10-15T02:00:00+09:00')],now,7);
  assert.deepEqual(x,{known:true,eligible:true,count:1});
});

test('current 20:00-22:00 slot is eligible at 21:00',()=>{
  assert.equal(evaluate([slot('2026-10-10T20:00:00+09:00','2026-10-10T22:00:00+09:00')],now,7).eligible,true);
});

test('ended slot is no longer eligible',()=>{
  assert.equal(evaluate([slot('2026-10-10T18:00:00+09:00','2026-10-10T20:00:00+09:00')],now,7).eligible,false);
});

test('slots farther away than seven days are outside display window',()=>{
  assert.equal(evaluate([slot('2026-10-20T20:00:00+09:00','2026-10-20T21:00:00+09:00')],now,7).eligible,false);
});

test('cancelled and invalid events cannot qualify',()=>{
  const slots=[
    slot('2026-10-14T19:00:00+09:00','2026-10-14T20:00:00+09:00',{status:'cancelled'}),
    slot('bad','2026-10-11T22:00:00+09:00'),
    slot('2026-10-11T22:00:00+09:00','2026-10-11T21:00:00+09:00')
  ];
  assert.equal(evaluate(slots,now,7).eligible,false);
});

test('LINE WORKS OFF does not affect independent calendar eligibility',()=>{
  const response={online:false,state:'終了',week_slots:[],calendar_slots:[
    slot('2026-10-10T20:00:00+09:00','2026-10-10T22:00:00+09:00')
  ]};
  assert.equal(evaluate(response.calendar_slots,now,7).eligible,true);
  assert.equal(evaluate(response.week_slots,now,7).eligible,false);
});

test('after adding a future slot, same counselor is eligible again',()=>{
  assert.equal(evaluate([],now,7).eligible,false);
  assert.equal(evaluate([slot('2026-10-11T22:00:00+09:00','2026-10-11T23:00:00+09:00')],now,7).eligible,true);
});

test('empty slots because backend was unreachable are NOT treated as confirmed zero',()=>{
  assert.equal(evaluate(undefined,now,7).known,false);
});
