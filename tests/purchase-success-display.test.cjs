'use strict';
// Executes the real page script with a synthetic DOM, clock and payment bridge.
// No HTTP, Stripe requests, sessions, charges, notifications or customer records.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('story/purchase-success/index.html','utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const payload=()=>({source:'relax-stripe-gas',kind:'purchase_success',ok:true,
 counselorName:'表示確認用',counselorPhone:'000-0000-0000',ticketLabel:'話し相手 30分チケット',amountLabel:'4,500円',
 expiresLabel:'2027年1月24日',receiptUrl:'https://pay.stripe.com/receipts/qa-only',invoicePdfUrl:'https://pay.stripe.com/invoice/qa-only/pdf',invoiceUrl:'https://invoice.stripe.com/i/qa-only',
 lpId:'mizuki',consultantNo:'qa-only',ticketKind:'standard',durationMinutes:30,amountJpy:4500,confirmationId:'QAOnly123'});
function fixture(query='?session_id=cs_test_QAOnly123',withAnalytics=true){
 const listeners={},timers=new Map(),nodes={},events=[],requests=[],storage=new Map();let serial=0;
 const element=id=>nodes[id]||(nodes[id]={id,hidden:id==='success',style:{},textContent:'',innerHTML:'',disabled:false,listeners:{},
  addEventListener(k,fn,options){this.listeners[k]={fn,options};},
  querySelector(s){if(s==='a.phone-call'&&this.innerHTML.includes('phone-call'))return element('phone-link');return null;}});
 const bridge=element('bridge');Object.defineProperty(bridge,'src',{set:v=>requests.push(v)});
 const document={getElementById:element,head:{appendChild:n=>requests.push(n.src)},createElement:()=>({}),addEventListener:(k,fn)=>listeners['document:'+k]=fn};
 const window={RELAX_PURCHASE_BRIDGE_CONFIG:{mode:'legacy',endpointUrl:''},addEventListener:(k,fn)=>listeners[k]=fn};if(withAnalytics)window.gtag=(...args)=>events.push(args);
 const ctx={document,window,URL,URLSearchParams,location:{search:query,origin:'https://relax-service.github.io',pathname:'/story/purchase-success/'},
 localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Date,Number,console,
 setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(script,ctx);
 const reply=(data,origin='https://script.googleusercontent.com')=>listeners.message({data,origin});
 const click=id=>{const l=element(id).listeners.click;if(l){l.fn({target:element(id)});if(l.options&&l.options.once)delete element(id).listeners.click;}};
 return {nodes,element,events,requests,window,reply,click,
  timeout:()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}},
  successful:()=>element('success').hidden===false};
}
const cases=[];const test=(name,fn)=>cases.push([name,fn]);
test('normal existing bridge payload renders payment details, phone and documents',()=>{const f=fixture();f.reply(payload());assert(f.successful());assert.match(f.element('ticket-card').innerHTML,/30分/);assert.match(f.element('phone-area').innerHTML,/href="tel:00000000000"/);assert.match(f.element('documents').innerHTML,/領収書を開く/);});
test('script and offsite document URLs never become actionable links',()=>{const f=fixture(),p=payload();p.receiptUrl='javascript:alert(1)';p.invoicePdfUrl='https://stripe.com.evil.example/invoice';p.invoiceUrl='https://evil.example/invoice';f.reply(p);assert.doesNotMatch(f.element('documents').innerHTML,/href=/);});
test('invalid PDF falls back to a safe hosted invoice',()=>{const f=fixture(),p=payload();p.invoicePdfUrl='data:text/html,unsafe';f.reply(p);assert.match(f.element('documents').innerHTML,/https:\/\/invoice.stripe.com\/i\/qa-only/);assert.doesNotMatch(f.element('documents').innerHTML,/請求書PDF/);});
test('credentials and nondefault ports are rejected for document links',()=>{const f=fixture(),p=payload();p.receiptUrl='https://attacker@pay.stripe.com/receipts/qa';p.invoicePdfUrl='https://pay.stripe.com:444/invoice';p.invoiceUrl='http://invoice.stripe.com/i/qa';f.reply(p);assert.doesNotMatch(f.element('documents').innerHTML,/href=/);});
test('string true cannot disclose contact details',()=>{const f=fixture(),p=payload();p.ok='true';f.reply(p);assert(!f.successful());assert.equal(f.element('phone-area').innerHTML,'');});
test('incomplete successful response is not shown as a confirmed purchase',()=>{const f=fixture();f.reply({source:'relax-stripe-gas',kind:'purchase_success',ok:true});assert(!f.successful());assert.equal(f.element('phone-area').innerHTML,'');});
test('invalid numeric amounts or durations cannot be confirmed',()=>{for(const changes of [{amountJpy:-1},{amountJpy:'4500'},{durationMinutes:0},{durationMinutes:60.5}]){const f=fixture();f.reply({...payload(),...changes});assert(!f.successful());}});
test('missing or malformed phone offers guidance without an unusable call link',()=>{for(const number of ['', 'abc', '+1 234 567 8901']){const f=fixture();f.reply({...payload(),counselorPhone:number});assert(f.successful());assert.doesNotMatch(f.element('phone-area').innerHTML,/href="tel:/);assert.match(f.element('phone-area').innerHTML,/決済をやり直さず/);}});
test('Japanese international phone is normalized for dialing',()=>{const f=fixture();f.reply({...payload(),counselorPhone:'+81 00 0000 0000'});assert.match(f.element('phone-area').innerHTML,/href="tel:00000000000"/);});
test('untrusted origins and unrelated message kinds cannot render',()=>{const f=fixture();for(const origin of ['https://evil.example','https://script.google.com.evil.example','http://script.google.com','null'])f.reply(payload(),origin);f.reply({...payload(),kind:'other'});assert(!f.successful());});
test('nested Google bridge message contract remains compatible',()=>{const f=fixture();f.reply(payload(),'https://n-qa-script.googleusercontent.com');assert(f.successful());});
test('invalid and duplicate session queries never request the bridge or disclose a message',()=>{for(const query of ['', '?session_id=cs_', '?session_id=cs_test_<>', '?session_id=cs_test_QAOnly123&session_id=cs_test_other']){const f=fixture(query);assert.equal(f.requests.length,0);f.reply(payload());assert(!f.successful());}});
test('timeout gives a retry path without directing another payment',()=>{const f=fixture();f.timeout();assert(!f.successful());assert.equal(f.element('error').style.display,'block');assert.match(html,/決済自体をもう一度行う必要はありません/);f.click('retry');assert.equal(f.requests.length,2);f.reply(payload());assert(f.successful());});
test('no reply is accepted while timed out until the user retries',()=>{const f=fixture();f.timeout();f.reply(payload());assert(!f.successful());});
test('completed view is not overwritten by duplicate success or late error',()=>{const f=fixture();f.reply(payload());f.reply({...payload(),counselorName:'別の応答'});f.reply({source:'relax-stripe-gas',kind:'purchase_success',ok:false,message:'late error'});assert(f.successful());assert.doesNotMatch(f.element('ticket-card').innerHTML,/別の応答/);assert.equal(f.events.filter(x=>x[1]==='purchase_complete').length,1);});
test('ticket details are escaped and cannot insert markup',()=>{const f=fixture();f.reply({...payload(),counselorName:'<img onerror="unsafe">'});assert.match(f.element('ticket-card').innerHTML,/&lt;img/);assert.doesNotMatch(f.element('ticket-card').innerHTML,/<img/);});
test('call click tracks on the actual call link rather than the first document click',()=>{const f=fixture();f.reply(payload());f.click('phone-link');f.click('phone-link');assert.equal(f.events.filter(x=>x[1]==='call_click').length,1);});
test('analytics configuration omits the payment session from the page location',()=>{const f=fixture('?session_id=cs_test_QAOnly123',false);f.reply(payload());const calls=f.window.dataLayer.map(x=>Array.from(x));const config=calls.find(x=>x[0]==='config');assert.equal(config[2].page_location,'https://relax-service.github.io/story/purchase-success/');assert(!JSON.stringify(calls).includes('cs_test_'));});
let failed=0;for(const [name,fn] of cases){try{fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
if(failed)process.exitCode=1;else console.log('PURCHASE_SUCCESS_DISPLAY_PASS: '+cases.length+' synthetic cases; no payment or service calls');
