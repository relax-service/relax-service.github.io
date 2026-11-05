'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('story/mizuki/counselor-catalog.js','utf8');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.className='';this.textContent='';}
 appendChild(n){if(n.tag==='fragment'){for(const c of [...n.children])this.appendChild(c);return n;}n.parent=this;this.children.push(n);return n;}
 setAttribute(k,v){if(k==='data-catalog-generated')this.dataset.catalogGenerated=v;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
 querySelectorAll(s){return this.children.filter(c=>s.startsWith('[data-catalog-generated')?c.dataset.catalogGenerated==='true':c.className==='person'&&c.dataset.counselorId);}
}
const settle=()=>new Promise(r=>setImmediate(r));
function fixture(initialNow='2026-10-24T12:00:00Z'){
 let now=Date.parse(initialNow),serial=0,refresh;
 const timers=new Map(),requests=[],listeners={};
 const container=new Element('div'),legacy=new Element('article'),status=new Element('p');
 legacy.className='person';legacy.dataset.counselorId='0000-3';container.appendChild(legacy);
 const window={LP_CONFIG:{catalog:{statusUrl:'https://script.google.com/macros/s/MockQA123/exec',segment:'mizuki'}},setInterval:fn=>{refresh=fn;}};
 const head=new Element('head');head.appendChild=n=>{Element.prototype.appendChild.call(head,n);requests.push(new URL(n.src).searchParams.get('callback'));return n;};
 const document={head,hidden:false,querySelector:()=>container,getElementById:()=>status,createElement:t=>new Element(t),createDocumentFragment:()=>new Element('fragment'),addEventListener:(k,fn)=>listeners[k]=fn};
 class ClockDate extends Date{static now(){return now;}}
 const ctx={document,window,URL,Intl,Date:ClockDate,Math,Promise,Set,Number,console,
  setTimeout:(fn,ms)=>{timers.set(++serial,{at:now+ms,fn});return serial;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,ctx);
 const person=(end=3600000)=>({consultantNo:'0111',displayName:'確認用の話し手',roleLabel:'話し相手',intro:'お話を聞きます',imagePath:'/assets/images/kizashi.png',audioPath:'',profileUrl:'https://www.relax-s.com/supporter.html',minutePrice:150,checkoutProvider:'stores',checkoutUrl:'https://relax-s.stores.jp/items/verified',slots:[{start:new Date(now-1000).toISOString(),end:new Date(now+end).toISOString()}]});
 const data=(p,age=0)=>({schema:'relax-public-catalog-v1',ok:true,segment:'mizuki',refreshedAt:new Date(now-age).toISOString(),counselors:[p]});
 const reply=async(payload,index=requests.length-1)=>{assert.equal(typeof window[requests[index]],'function');window[requests[index]](payload);await settle();};
 const tick=async ms=>{const end=now+ms;for(;;){const item=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!item)break;now=item[1].at;timers.delete(item[0]);item[1].fn();await settle();}now=end;};
 const dynamic=()=>container.children.filter(c=>c.dataset.catalogGenerated==='true');
 return {person,data,reply,tick,dynamic,requests,status,callback:i=>window[requests[i]],refresh:()=>refresh(),
  resume:async ms=>{now+=ms;listeners.visibilitychange();await settle();},
  assertLegacy:()=>assert.equal(container.children[0],legacy)};
}
const descendants=n=>n.children.flatMap(c=>[c,...descendants(c)]);
const cases=[];const test=(name,fn)=>cases.push([name,fn]);
test('last slot ends without a new response: expired card and purchase disappear',async()=>{const f=fixture();await f.reply(f.data(f.person(2000)));assert.equal(f.dynamic().length,1);await f.tick(2000);assert.equal(f.dynamic().length,0);f.assertLegacy();});
test('one slot ends: next future slot and purchase remain',async()=>{const f=fixture(),p=f.person(2000);p.slots.push(...f.person(3600000).slots);await f.reply(f.data(p));await f.tick(2000);assert.equal(f.dynamic().length,1);assert.equal(descendants(f.dynamic()[0]).filter(c=>c.tag==='li').length,1);});
test('five-minute snapshot limit applies while a new request is still pending',async()=>{const f=fixture();await f.reply(f.data(f.person(),299000));f.refresh();await f.tick(1000);assert.equal(f.dynamic().length,0);assert.match(f.status.textContent,/取得できません/);});
test('exact five-minute-old response cannot restore purchase',async()=>{const f=fixture();await f.reply(f.data(f.person(),300000));assert.equal(f.dynamic().length,0);});
test('returning from a suspended tab clears stale purchase before network response',async()=>{const f=fixture();await f.reply(f.data(f.person()));await f.resume(360000);assert.equal(f.dynamic().length,0);assert.equal(f.requests.length,2);});
test('newer successful response replaces the previous expiry timer',async()=>{const f=fixture();await f.reply(f.data(f.person(2000)));await f.tick(1000);f.refresh();await f.reply(f.data(f.person()));await f.tick(1000);assert.equal(f.dynamic().length,1);});
test('failed refresh cannot be resurrected by an older expiry callback',async()=>{const f=fixture();await f.reply(f.data(f.person(60000)));f.refresh();await f.tick(20000);assert.equal(f.dynamic().length,0);await f.tick(40000);assert.equal(f.dynamic().length,0);f.assertLegacy();});
test('fresh data recovers normally after automatic expiry',async()=>{const f=fixture();await f.reply(f.data(f.person(2000)));await f.tick(2000);f.refresh();await f.reply(f.data(f.person()));assert.equal(f.dynamic().length,1);f.assertLegacy();});

test('a valid Google response after the old eight-second limit still renders',async()=>{const f=fixture(),payload=f.data(f.person());await f.tick(9430);await f.reply(payload);assert.equal(f.dynamic().length,1);f.assertLegacy();});

test('a valid response just before twenty seconds still renders',async()=>{const f=fixture(),payload=f.data(f.person());await f.tick(19999);await f.reply(payload);assert.equal(f.dynamic().length,1);});

test('twenty-second timeout ignores late data then releases its callback',async()=>{const f=fixture(),payload=f.data(f.person());await f.tick(20000);assert.match(f.status.textContent,/取得できません/);await f.tick(1000);await f.reply(payload,0);assert.equal(f.dynamic().length,0);await f.tick(59000);assert.equal(f.callback(0),undefined);assert.equal(f.requests.length,1);f.assertLegacy();});

test('an expired request cannot overwrite successful recovery',async()=>{const f=fixture(),old=f.data(f.person());old.counselors[0].displayName='古い応答';await f.tick(20000);f.refresh();const fresh=f.data(f.person());fresh.counselors[0].displayName='現在の応答';await f.reply(fresh);await f.reply(old,0);assert.equal(f.dynamic().length,1);assert.equal(descendants(f.dynamic()[0]).find(n=>n.className==='person-name').textContent,'現在の応答');});

test('a slow response cannot extend the snapshot freshness limit',async()=>{const f=fixture(),payload=f.data(f.person(),295000);await f.tick(9430);await f.reply(payload);assert.equal(f.dynamic().length,0);assert.match(f.status.textContent,/取得できません/);});

test('a slot ending during a slow request cannot create a purchase card',async()=>{const f=fixture(),payload=f.data(f.person(8000));await f.tick(9430);await f.reply(payload);assert.equal(f.dynamic().length,0);f.assertLegacy();});

const dateCases=[
 ['multi-day slot shows its actual ending date instead of the next day','2026-10-24T12:00:00Z','2026-10-24T14:00:00Z','2026-10-25T16:00:00Z','10/24(土) 23:00〜10/26(月) 01:00'],
 ['overnight slot names both dates in Japan time','2026-10-24T12:00:00Z','2026-10-24T14:00:00Z','2026-10-24T16:00:00Z','10/24(土) 23:00〜10/25(日) 01:00'],
 ['month boundary retains the actual end month','2026-10-24T12:00:00Z','2026-10-31T14:00:00Z','2026-10-31T16:00:00Z','10/31(土) 23:00〜11/1(日) 01:00'],
 ['year boundary retains the actual January date','2026-12-31T12:00:00Z','2026-12-31T14:00:00Z','2026-12-31T16:00:00Z','12/31(木) 23:00〜1/1(金) 01:00'],
 ['midnight on one date remains an unambiguous same-day range','2026-10-24T12:00:00Z','2026-10-24T15:00:00Z','2026-10-24T16:00:00Z','10/25(日) 00:00〜01:00']
];
for(const [name,now,start,end,expected] of dateCases)test(name,async()=>{const f=fixture(now),p=f.person();p.slots=[{start,end}];await f.reply(f.data(p));assert.equal(f.dynamic().length,1);assert.equal(descendants(f.dynamic()[0]).find(n=>n.tag==='li').textContent,expected);f.assertLegacy();});
(async()=>{for(const [name,fn] of cases){await fn();console.log('PASS '+name);}console.log('MIZUKI_CATALOG_EXPIRY_PASS: '+cases.length+' cases; synthetic clock and network only');})().catch(e=>{console.error(e);process.exitCode=1;});
