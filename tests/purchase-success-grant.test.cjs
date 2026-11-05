'use strict';
// Real page + real v3 client; synthetic DOM/messages only, no HTTP or email.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('story/purchase-success/index.html','utf8');
const page=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
const client=fs.readFileSync('assets/js/purchase-bridge-grant.js','utf8');
const sid='cs_live_SyntheticOnly',grant='rv1.1800000000.1800001800.'+'A'.repeat(43)+'.'+'B'.repeat(43);
const endpoint='https://script.google.com/macros/s/QAOnlyNotDeployed/exec';
function fixture(options={}){
 let now=0,seq=0,entropy=0;const nodes={},listeners={},posts=[],gets=[],forms=[],analytics=[],storage=new Map(),timers=new Map(),actions=[];
 const location={origin:'https://relax-service.github.io',pathname:'/story/purchase-success/',search:options.query||'',
  hash:'fragment' in options?options.fragment:'#session_id='+sid+'&view_grant='+grant};
 const el=id=>nodes[id]||(nodes[id]={hidden:id==='success',style:{},innerHTML:'',textContent:'',listeners:{},
  addEventListener(k,fn){this.listeners[k]=fn;},querySelector(){return null;}});
 Object.defineProperty(el('bridge'),'src',{set:v=>gets.push(v)});
 const window={RELAX_PURCHASE_BRIDGE_CONFIG:options.config||{mode:'grant',endpointUrl:endpoint},addEventListener:(k,fn)=>listeners[k]=fn};
 if(!options.noAnalytics)window.gtag=(...args)=>analytics.push(args);
 const document={visibilityState:options.hidden?'hidden':'visible',getElementById:el,addEventListener:(k,fn)=>listeners[k]=fn,
  head:{appendChild:n=>actions.push('script:'+n.src)},body:{appendChild:n=>{n.attached=true;}},
  createElement(type){
   if(type!=='form')return {};
   const form={children:[],appendChild(n){this.children.push(n);},submit(){
    actions.push('post');if(options.submitThrows)throw Error('synthetic submission failure');
    const p={url:this.action,method:this.method,target:this.target,fields:Object.fromEntries(this.children.map(n=>[n.name,n.value]))};
    posts.push(p);if(options.immediate)reply(p);
   },remove(){this.removed=true;this.children=[];}};forms.push(form);return form;
  }};
 const ctx={window,document,location,URL,URLSearchParams,Date,Number,console,
  history:{replaceState(_,__,url){actions.push('scrub');if(options.historyThrows)throw Error('synthetic history failure');assert.equal(url,location.pathname);location.search='';location.hash='';}},
  crypto:options.crypto||{getRandomValues(a){a.fill(++entropy);}},performance:{now:()=>now},
  localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  setTimeout:(fn,ms)=>{timers.set(++seq,{fn,at:now+ms});return seq;},clearTimeout:id=>timers.delete(id)};
 function reply(post=posts.at(-1),patch={},origin='https://n-qa-script.googleusercontent.com'){
  const data={source:'relax-stripe-gas',kind:'purchase_success',bridgeVersion:3,ok:true,
   sessionId:sid,requestId:post.fields.request_id,counselorName:'架空QA',counselorPhone:'00000000000',
   ticketLabel:'30分チケット',amountLabel:'4,500円',lpId:'LP001',consultantNo:'0099',ticketKind:'standard',
   durationMinutes:30,amountJpy:4500,confirmationId:'Synthetic',receiptUrl:'https://pay.stripe.com/receipts/qa',...patch};
  listeners.message({data,origin});return data;
 }
 vm.createContext(ctx);if(!options.noModule){vm.runInContext(client,ctx);window.RelaxPurchaseGrantSession=ctx.RelaxPurchaseGrantSession;}
 vm.runInContext(page,ctx);
 return {posts,gets,forms,analytics,storage,location,actions,window,reply,el,timers,
  success:()=>!el('success').hidden,retry:()=>el('retry').listeners.click(),
  tick(ms){now+=ms;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},
  lifecycle:(k,e={})=>listeners[k](e),visibility(state){document.visibilityState=state;listeners.visibilitychange();}};
}
let count=0;function test(name,run){run();count++;console.log('PASS '+name);}
test('fragment is scrubbed before POST and token is never a GET parameter',()=>{
 const f=fixture();assert.equal(f.location.hash,'');assert.equal(f.location.search,'');assert.equal(f.actions[0],'scrub');
 assert.equal(f.posts.length,1);assert.equal(f.gets.length,0);assert.equal(f.posts[0].url,endpoint);assert.equal(f.posts[0].method,'post');
 assert.equal(f.posts[0].fields.viewer_grant,grant);assert(f.forms.every(x=>x.removed&&x.children.length===0));assert(!Object.hasOwn(f.window,'RELAX_PURCHASE_VIEW_BOOT'));
 assert(html.indexOf('replaceState')<html.indexOf('<script src='));assert.match(html,/name="referrer" content="no-referrer"/);
});
test('matching authorized response renders phone and Stripe document',()=>{const f=fixture();f.reply();assert(f.success());assert.match(f.el('phone-area').innerHTML,/tel:00000000000/);assert.match(f.el('documents').innerHTML,/pay\.stripe\.com/);assert.equal(f.timers.size,0);});
test('provider failure text is replaced without a phone or purchase event',()=>{const f=fixture();f.reply(undefined,{ok:false,message:'buyer@example.invalid/private'});assert(!f.success());assert(!f.el('error-message').textContent.includes('buyer@'));assert.equal(f.analytics.length,0);});
test('wrong request, session and protocol cannot render',()=>{for(const patch of [{requestId:'b'.repeat(32)},{sessionId:'cs_live_Other'},{bridgeVersion:2},{ok:'true'}]){const f=fixture();f.reply(undefined,patch);assert(!f.success());}});
test('untrusted origins cannot render',()=>{for(const origin of ['https://evil.example','https://foo.googleusercontent.com','http://script.google.com','https://script.google.com.evil.example']){const f=fixture();f.reply(undefined,{},origin);assert(!f.success());}});
test('timeout and explicit retry rotate request id without legacy navigation',()=>{const f=fixture(),old=f.posts[0];f.tick(20000);f.reply(old);assert(!f.success());f.retry();assert.equal(f.posts.length,2);assert.notEqual(f.posts[1].fields.request_id,old.fields.request_id);f.reply(old);assert(!f.success());f.reply();assert(f.success());assert.equal(f.gets.length,0);});
test('hidden/returned page clears private display and verifies afresh',()=>{const f=fixture(),old=f.posts[0];f.reply();f.visibility('hidden');assert(!f.success());assert.equal(f.el('phone-area').innerHTML,'');assert.equal(f.el('documents').innerHTML,'');f.reply(old);assert(!f.success());f.visibility('visible');assert.equal(f.posts.length,2);f.reply(old);assert(!f.success());f.reply();assert(f.success());});
test('cached restoration cannot reuse a previous success or refund response',()=>{const f=fixture();f.reply();f.lifecycle('pagehide');f.lifecycle('pageshow',{persisted:true});assert.equal(f.posts.length,2);f.reply(undefined,{ok:false});assert(!f.success());assert.equal(f.el('phone-area').innerHTML,'');});
test('initially hidden page waits before POST',()=>{const f=fixture({hidden:true});assert.equal(f.posts.length,0);f.visibility('visible');assert.equal(f.posts.length,1);});
test('synchronous reply is accepted and leaves no timer or hidden input',()=>{const f=fixture({immediate:true});assert(f.success());assert.equal(f.timers.size,0);assert(f.forms.every(x=>x.removed));});
test('history failure prevents all submissions and fallback',()=>{const f=fixture({historyThrows:true});assert.equal(f.posts.length,0);assert.equal(f.gets.length,0);assert(!f.success());});
for(const fragment of ['', '#session_id='+sid, '#session_id='+sid+'&view_grant=bad', '#session_id='+sid+'&view_grant='+grant+'&extra=x', '#session_id='+sid+'&session_id='+sid+'&view_grant='+grant])test('invalid or incomplete fragment is refused '+fragment.slice(0,28),()=>{const f=fixture({fragment});assert.equal(f.posts.length,0);assert.equal(f.gets.length,0);});
test('a grant is not sent to legacy mode or a URL-selected endpoint',()=>{const f=fixture({config:{mode:'legacy',endpointUrl:''},query:'?mode=grant&endpointUrl=https://evil.example'});assert.equal(f.posts.length,0);assert.equal(f.gets.length,0);});
test('ordinary post-payment redirect explains the purchase email without a futile retry',()=>{const f=fixture({fragment:'',query:'?session_id='+sid});assert.equal(f.posts.length,0);assert.match(f.el('error-message').textContent,/購入メール/);assert.equal(f.el('retry').hidden,true);});
for(const endpointUrl of ['', 'http://script.google.com/macros/s/qa/exec',endpoint+'?x=1','https://evil.example/exec'])test('unsafe configured endpoint is refused '+endpointUrl,()=>{const f=fixture({config:{mode:'grant',endpointUrl}});assert.equal(f.posts.length,0);assert.equal(f.gets.length,0);});
test('missing client and unavailable crypto fail without fallback',()=>{for(const options of [{noModule:true},{crypto:{getRandomValues(){throw Error('unavailable');}}}]){const f=fixture(options);assert.equal(f.posts.length,0);assert.equal(f.gets.length,0);}});
test('submission failure removes controls and shows no phone',()=>{const f=fixture({submitThrows:true});assert.equal(f.posts.length,0);assert(f.forms.every(x=>x.removed));assert.equal(f.el('phone-area').innerHTML,'');assert.equal(f.timers.size,0);});
test('analytics and storage never receive the grant or fragment',()=>{const f=fixture({noAnalytics:true});f.reply();assert(f.success());const raw=JSON.stringify(f.window.dataLayer.map(x=>Array.from(x)));assert(!raw.includes(grant));assert(!raw.includes('view_grant'));assert(!raw.includes('cs_live_'));assert(!JSON.stringify([...f.storage]).includes(grant));});
test('private/unrecognized response fields are discarded and HTML/URLs are inert',()=>{const f=fixture();f.reply(undefined,{counselorName:'<img onerror="bad">',receiptUrl:'javascript:bad',email:'buyer@example.invalid',viewer_grant:grant});assert(f.success());assert.doesNotMatch(f.el('ticket-card').innerHTML,/<img/);assert.doesNotMatch(f.el('documents').innerHTML,/href=/);assert(!JSON.stringify(f.analytics).includes('buyer@'));});
test('reused request id on return fails closed',()=>{const f=fixture({crypto:{getRandomValues(a){a.fill(1);}}});f.reply();f.lifecycle('pagehide');f.lifecycle('pageshow',{persisted:true});assert.equal(f.posts.length,1);assert(!f.success());});
console.log('PURCHASE_SUCCESS_GRANT_PASS: '+count+' synthetic page/client cases; HTTP and real mail=0');
