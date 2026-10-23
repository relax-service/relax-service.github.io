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
function fixture(){
 let now=Date.parse('2026-10-24T12:00:00Z'),serial=0,refresh;
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
 return {person,data,reply,tick,dynamic,requests,status,refresh:()=>refresh(),
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
test('failed refresh cannot be resurrected by an older expiry callback',async()=>{const f=fixture();await f.reply(f.data(f.person(20000)));f.refresh();await f.tick(8000);assert.equal(f.dynamic().length,0);await f.tick(12000);assert.equal(f.dynamic().length,0);f.assertLegacy();});
test('fresh data recovers normally after automatic expiry',async()=>{const f=fixture();await f.reply(f.data(f.person(2000)));await f.tick(2000);f.refresh();await f.reply(f.data(f.person()));assert.equal(f.dynamic().length,1);f.assertLegacy();});
(async()=>{for(const [name,fn] of cases){await fn();console.log('PASS '+name);}console.log('MIZUKI_CATALOG_EXPIRY_PASS: '+cases.length+' cases; synthetic clock and network only');})().catch(e=>{console.error(e);process.exitCode=1;});
