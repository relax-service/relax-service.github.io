'use strict';
// Read-only QA for the interim Oohira card on the already published Mizuki story.
// Never purchases, modifies Google Calendar, or posts to any service.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = fs.readFileSync('story/mizuki/index.html','utf8');
const script = fs.readFileSync('story/mizuki/ohira-schedule.js','utf8');

assert.equal((html.match(/data-counselor-id="0000-3"/g)||[]).length, 1, 'Umetsu card must remain');
assert.equal((html.match(/data-counselor-id="0099"/g)||[]).length, 1, 'Exactly one Oohira card');
assert.equal((html.match(/https:\/\/buy\.stripe\.com\//g)||[]).length, 3, 'Keep 3 production Umetsu Stripe payment links');
assert.ok(!html.includes('buy.stripe.com/test_'), 'No Stripe test link may be published');
assert.ok(html.includes('id="initial-ticket-form"'), 'Umetsu first-time checkout must be unchanged');
assert.ok(html.includes('data-consultant-no="0000-3"'), 'Umetsu checkout must retain its consultant key');
assert.match(html, /https:\/\/relax-s\.stores\.jp\/\?category_id=666c58d93cea4a0a2dd693a7/, 'Reuse official Oohira STORES category');
assert.ok(html.includes('/assets/audio/ohira.mp3'), 'Oohira voice sample');
assert.ok(html.includes('1分150円'), 'Correct counselor price and separate discount');
assert.ok(html.includes('こちらの購入には、梅津さん用のStripe初回30分割引は適用されません'), 'No false coupon claim');
assert.ok(html.includes('/story/mizuki/ohira-schedule.js?v=20261018a'));

const expected = [
 ['2026-10-18T23:00:00+09:00','10月18日（日）21:00〜23:00'],
 ['2026-10-25T00:00:00+09:00','10月24日（土）21:00〜翌0:00'],
 ['2026-10-25T23:00:00+09:00','10月25日（日）21:00〜23:00'],
 ['2026-11-01T00:00:00+09:00','10月31日（土）21:00〜翌0:00'],
 ['2026-11-08T00:00:00+09:00','11月7日（土）21:30〜翌0:00'],
 ['2026-11-08T23:00:00+09:00','11月8日（日）21:00〜23:00'],
 ['2026-11-15T00:00:00+09:00','11月14日（土）21:00〜翌0:00'],
 ['2026-11-16T00:00:00+09:00','11月15日（日）21:00〜翌0:00'],
 ['2026-11-22T00:00:00+09:00','11月21日（土）21:00〜翌0:00'],
 ['2026-11-29T00:00:00+09:00','11月28日（土）21:00〜翌0:00'],
 ['2026-11-29T23:00:00+09:00','11月29日（日）21:00〜23:00']
];
const slots = [...html.matchAll(/<li data-end-iso="([^"]+)">([^<]+)<\/li>/g)].map(x=>[x[1],x[2]]);
assert.deepEqual(slots,expected,'Calendar as-of-2026-10-18 start/end and date labels must match');
for (const [end] of slots) assert.ok(Number.isFinite(Date.parse(end)), 'valid ISO end');

// DOM minimal mock exercises stale-slot pruning and purchase-gate behavior.
// Keep the logic deterministic and independent from browser wall clock.
const rows=slots.map(([end])=>({dataset:{endIso:end},style:{}}));
const empty={style:{}}, purchase={style:{}};
const map={
 'ohira-schedule-list':{querySelectorAll:()=>rows},
 'ohira-no-upcoming':empty,
 'ohira-stores-purchase':purchase
};
let at=Date.parse('2026-10-18T20:00:00+09:00');
let scheduled;
const testDate={now:()=>at,parse:Date.parse};
vm.runInNewContext(script,{
 document:{getElementById:id=>map[id],hidden:false,addEventListener:()=>{}},
 window:{setInterval:fn=>{scheduled=fn;return 1;}},
 Date:testDate
},{timeout:2000});
assert.equal(typeof scheduled,'function');
assert.equal(purchase.style.display,'','show checkout when slots remain');
assert.equal(rows[0].style.display,'','show current next slot');
at=Date.parse('2026-10-19T00:00:00+09:00');scheduled();
assert.equal(rows[0].style.display,'none','hide expired 10/18 slot');
assert.equal(rows[1].style.display,'','retain later Oct slots');
at=Date.parse('2026-11-30T01:00:00+09:00');scheduled();
assert.equal(purchase.style.display,'none','disable conversion CTA after all slots expire');
assert.equal(empty.style.display,'','show no-upcoming warning');
assert.ok(rows.every(r=>r.style.display==='none'),'hide all past slots');

console.log('MIZUKI_OOHIRA_STATIC_STORES_SAFE_QA_PASS: 11 calendar slots, 3 existing Stripe links, expiry gate, no outbound writes');
