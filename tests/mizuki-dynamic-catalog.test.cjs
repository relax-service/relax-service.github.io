'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');

const html=fs.readFileSync('story/mizuki/index.html','utf8');
const config=fs.readFileSync('lp001/lp-config.js','utf8');
const source=fs.readFileSync('story/mizuki/counselor-catalog.js','utf8');

assert.equal((html.match(/data-counselor-id="0000-3"/g)||[]).length,1);
assert.equal((html.match(/href="https:\/\/buy\.stripe\.com\//g)||[]).length,3,'Umetsu production Stripe unchanged');
assert.ok(html.includes('id="initial-ticket-form"'));
assert.ok(html.includes('data-consultant-no="0000-3"'));
assert.ok(html.includes('id="dynamic-catalog-status"'));
assert.ok(html.includes('/story/mizuki/counselor-catalog.js'));
assert.match(config,/catalog:\s*\{\s*statusUrl: ''/,'catalog endpoint disabled until GAS company QA');

class Element {
  constructor(tag) {this.tag=tag;this.children=[];this.dataset={};this.style={};this.attrs={};this.className='';this.textContent='';this.parent=null;this.src='';}
  appendChild(node){
    if(node.tag==='fragment'){for(const child of [...node.children])this.appendChild(child);node.children=[];return node;}
    node.parent=this;this.children.push(node);return node;
  }
  setAttribute(k,v){this.attrs[k]=v;if(k==='data-catalog-generated')this.dataset.catalogGenerated=v;}
  remove(){if(!this.parent)return;const siblings=this.parent.children;const pos=siblings.indexOf(this);if(pos>=0)siblings.splice(pos,1);this.parent=null;}
  querySelectorAll(selector){
    if(selector==='[data-catalog-generated="true"]')return this.children.filter(x=>x.dataset.catalogGenerated==='true');
    if(selector==='.person[data-counselor-id]')return this.children.filter(x=>x.className==='person'&&x.dataset.counselorId);
    throw Error('Unsupported mock selector: '+selector);
  }
}
const container=new Element('div');
const umetsu=new Element('article');umetsu.className='person';umetsu.dataset.counselorId='0000-3';container.appendChild(umetsu);
const status=new Element('p');
const window={LP_CONFIG:{catalog:{statusUrl:'https://script.google.com/macros/s/MockQA123/exec',segment:'mizuki'}}};
let nextRefresh=null;
window.setInterval=(fn,ms)=>{assert.equal(ms,60000);nextRefresh=fn;return 1;};
let payload={};
const head=new Element('head');
head.appendChild=function(tag){
  Element.prototype.appendChild.call(this,tag);
  const callback=new URL(tag.src).searchParams.get('callback');
  assert.match(callback,/^__relaxCatalog_[A-Za-z0-9_]+$/);
  window[callback](payload);
  return tag;
};
const document={
  querySelector:q=>q==='#people .counselors'?container:null,
  getElementById:id=>id==='dynamic-catalog-status'?status:null,
  createElement:tag=>new Element(tag),
  createDocumentFragment:()=>new Element('fragment'),
  head,hidden:false,addEventListener:()=>{}
};
const ctx={document,window,URL,console,
  setTimeout:()=>1,clearTimeout:()=>{},Intl,Date,Math,Promise,Set,Number};
function person(id,name,provider,link){
 return {
   consultantNo:id,displayName:name,roleLabel:'話し手',intro:'気持ちを聞きます',
   imagePath:'/assets/images/ohira.png',audioPath:'/assets/audio/ohira.mp3',
   profileUrl:'https://www.relax-s.com/counselor.html',
   minutePrice:150,checkoutProvider:provider,checkoutUrl:link,
   slots:[{start:new Date(Date.now()+60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()}]
 };
}
const asData=(members,ok=true)=>({
  schema:'relax-public-catalog-v1',ok,segment:'mizuki',refreshedAt:new Date().toISOString(),counselors:members
});
const ohira=person('0099','大平 ゆりこ','stores','https://relax-s.stores.jp/?category_id=valid');
const third=person('0111','登録された3人目','stripe','https://buy.stripe.com/testModeBlock');
const umetsuInMaster=person('0000-3','梅津','stripe','https://buy.stripe.com/liveOne');
payload=asData([umetsuInMaster,ohira]);
new vm.Script(source).runInNewContext(ctx,{timeout:3000});
async function settle(){await new Promise(resolve=>setImmediate(resolve));}
const dynamic=()=>container.children.filter(x=>x.dataset.catalogGenerated==='true');
(async()=>{
 await settle();
 assert.equal(dynamic().length,1,'only Oohira dynamic, Umetsu never duplicated');
 assert.equal(container.children[0],umetsu,'legacy Umetsu stays');
 assert.equal(dynamic()[0].dataset.counselorId,'0099');

 third.checkoutUrl='https://buy.stripe.com/liveCheckout123';
 payload=asData([umetsuInMaster,ohira,third]);
 nextRefresh();await settle();
 assert.equal(dynamic().length,2,'3rd member added by data only; no code changes');
 assert.deepEqual(dynamic().map(x=>x.dataset.counselorId),['0099','0111']);
 assert.equal(container.children[0],umetsu);

 const evil=person('0133','悪意ある変更','stores','https://relax-s.stores.jp.evil.com/x');
 payload=asData([ohira,third,evil]);nextRefresh();await settle();
 assert.equal(dynamic().length,2,'bad checkout host is rejected');

 const zero=person('0177','予定ゼロ','stores','https://relax-s.stores.jp/items/valid');
 zero.slots=[];
 payload=asData([zero]);nextRefresh();await settle();
 assert.equal(dynamic().length,0,'no future waiting slot => no checkout card');

 payload=asData([ohira],false);nextRefresh();await settle();
 assert.equal(dynamic().length,0,'backend failure removes purchase cards');
 assert.match(status.textContent,/取得できません/);

 payload=asData([ohira]);payload.refreshedAt=new Date(Date.now()-6*60000).toISOString();
 nextRefresh();await settle();
 assert.equal(dynamic().length,0,'stale data cannot sell');

 payload=asData([ohira]);nextRefresh();await settle();
 assert.equal(dynamic().length,1,'fresh recovery');
 console.log('MIZUKI_DYNAMIC_CATALOG_QA_PASS: zero-code third member, rejected false payments, no-slot stop, recovery; legacy Umetsu untouched');
})().catch(e=>{console.error(e);process.exitCode=1;});
