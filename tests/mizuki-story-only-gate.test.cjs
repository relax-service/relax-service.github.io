'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const helper=read('lp001/schedule-eligibility.js');
const app=read('lp001/app.js');
const story=read('story/mizuki/index.html');
const eight=read('lp001/index.html');

test('only the published Mizuki story may apply this Calendar listing gate',()=>{
 assert.match(app,/storyGateEnabled\s*=\s*\/\^\\\/story\\\/mizuki/);
 assert.match(app,/function setCounselorCardEligible\(eligible\)\{\s*if\(!storyGateEnabled\) return;/);
 assert.match(app,/function updateCalendarListingEligibility\(data, now\)\{\s*if\(!storyGateEnabled\) return;/);
 assert.match(app,/if\(storyGateEnabled\) updateCalendarListingEligibility\(data, now\)/);
 assert.match(app,/if\(storyGateEnabled\) setCounselorCardEligible\(false\)/);
 assert.doesNotMatch(eight,/schedule-eligibility\.js/);
});

test('tired visitor receives one primary action and accurate conditional price without added sections',()=>{
 const fv=story.split('<header class="hero">')[1].split('</header>')[0];
 assert.match(fv,/うまく話せなくても大丈夫。今の気持ちから話せます。/);
 assert.match(fv,/初回30分 1,000円（対象の方）/);
 assert.equal((fv.match(/<a\s+class="cta"/g)||[]).length,1);
 assert.match(fv,/href="#people">話す人と料金を見る/);
 assert.doesNotMatch(fv,/class="cta secondary"/);
 // Existing complete eligibility terms remain available at purchase time.
 assert.match(story,/この相談員をStripeで初めて購入する方が対象/);
});

test('story checkout section begins hidden and shows after live schedule qualification',()=>{
 assert.match(story,/<section class="section-soft" id="people" hidden style="display:none">/);
 assert.match(story,/<article class="person" data-counselor-id="0000-3" hidden style="display:none">/);
 assert.match(story,/src="\/lp001\/schedule-eligibility\.js[^"]*"/);
 assert.match(story,/src="\/lp001\/app\.js[^"]*"/);
 assert.match(story,/data-consultant-no="0000-3"/);
 assert.match(story,/data-initial-checkout/);
 const refs=[...story.matchAll(/href="(https:\/\/buy\.stripe\.com\/[^"]+)"/g)];
 assert.equal(refs.length,3);
 for(const [_,value] of refs){
   const u=new URL(value);
   assert.equal(u.hostname,'buy.stripe.com');
   assert.ok(!u.pathname.startsWith('/test_'));
   assert.equal(u.searchParams.get('client_reference_id'),'0000-3_LP001');
 }
});

test('Calendar-based zero, active, future and corrupt data are distinguished',()=>{
 const sandbox={module:{exports:{}},console};
 vm.runInNewContext(helper,sandbox);
 const evaluate=sandbox.module.exports.evaluate;
 const now=new Date('2026-10-11T00:00:00+09:00');
 const one=(a,b)=>[{start:a,end:b}];
 assert.equal(evaluate([],now,7).eligible,false);
 assert.equal(evaluate(null,now,7).known,false);
 assert.equal(evaluate(one('2026-10-11T10:00:00+09:00','2026-10-11T11:00:00+09:00'),now,7).eligible,true);
 assert.equal(evaluate(one('2026-10-10T23:00:00+09:00','2026-10-11T01:00:00+09:00'),now,7).eligible,true);
 assert.equal(evaluate(one('2026-10-01T10:00:00+09:00','2026-10-01T11:00:00+09:00'),now,7).eligible,false);
 assert.equal(evaluate([{start:'bad',end:'bad'}],now,7).eligible,false);
});
