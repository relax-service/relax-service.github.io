'use strict';

/*
 * READ-ONLY production transport preflight.
 * Never POSTs, clicks, buys, starts LINE WORKS, or alters Calendar/Stripe.
 * URL is read at run time from the existing, PUBLIC LP_CONFIG file.
 * Logs only latency and non-sensitive status metadata.
 */
const fs=require('node:fs');
const assert=require('node:assert/strict');

const config=fs.readFileSync('lp001/lp-config.js','utf8');
const story=fs.readFileSync('story/mizuki/index.html','utf8');
const found=config.match(/statusUrl:\s*'([^']+)'/);
assert.ok(found,'Published LP_CONFIG must contain status URL');
const url=new URL(found[1]);
assert.equal(url.protocol,'https:');
assert.equal(url.hostname,'script.google.com');
assert.equal(url.searchParams.get('action'),'status');
assert.match(url.pathname,/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/);
assert.match(story,/id="initial-ticket-form"/);
assert.match(story,/data-consultant-no="0000-3"/);
const links=[...story.matchAll(/href="https:\/\/buy\.stripe\.com\//g)];
assert.equal(links.length,3,'Expected three public regular Stripe links');

const privateKeys=['SECRET_KEY','CALENDAR_ID','SPREADSHEET_ID','BOT_ID'];
const waitMillis=Number(process.env.PROBE_TIMEOUT_MS||45000);
if(!(waitMillis>=1000&&waitMillis<=60000)) throw new Error('Invalid probe timeout');

async function probe(form){
 const req=new URL(url);
 const randomSuffix=String(Date.now());
 const callback='__qaMizukiReadOnly'+randomSuffix;
 if(form==='jsonp')req.searchParams.set('callback',callback);
 req.searchParams.set('_',randomSuffix);
 const start=performance.now();
 const response=await fetch(req,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(waitMillis),headers:{Accept:'*/*'}});
 const ms=Math.round(performance.now()-start);
 assert.equal(response.status,200,form+': public GAS HTTP must be 200');
 assert.ok(response.url.startsWith('https://script.googleusercontent.com/')||response.url.startsWith('https://script.google.com/'),
  form+': unexpected public origin');
 const body=await response.text();
 assert.ok(body.length<150000,form+': unexpectedly large response');
 let data;
 if(form==='json'){
   data=JSON.parse(body);
 }else{
   assert.ok(body.startsWith(callback+'('),form+': JSONP callback mismatch');
   assert.ok(body.endsWith(');'),form+': JSONP trailer malformed');
   data=JSON.parse(body.slice(callback.length+1,-2));
 }
 assert.equal(data.consultant_no,'0000-3');
 assert.equal(data.calendar_ok,true,'Production Calendar should be connected');
 assert.match(String(data.build_id),/^2026-/);
 assert.ok(Array.isArray(data.week_slots));
 assert.ok(!Object.hasOwn(data,'calendar_slots') || Array.isArray(data.calendar_slots),
  'calendar_slots must be an array if provided');
 for(const k of privateKeys) assert.equal(Object.hasOwn(data,k),false,'Sensitive key should never be public: '+k);
 console.log(JSON.stringify({
   probe:form,status:'PASS',build_id:data.build_id,calendar_ok:data.calendar_ok,
   online:!!data.online,week_slot_count:data.week_slots.length,
   elapsed_ms:ms
 }));
 return {data,ms};
}
(async()=>{
 const raw=await probe('json');
 const jsonp=await probe('jsonp');
 assert.equal(raw.data.build_id,jsonp.data.build_id);
 assert.equal(raw.data.consultant_no,jsonp.data.consultant_no);
 console.log('MIZUKI_LIVE_READONLY_PRODUCTION_TRANSPORT_PASS');
 if(raw.ms>8000||jsonp.ms>8000){
   console.log('MIZUKI_LATENCY_WARNING: at least one read-only live response exceeded the pending LP 8000ms timeout.');
 }
})().catch(e=>{console.error('MIZUKI_LIVE_READONLY_PRODUCTION_TRANSPORT_FAIL: '+String(e.name||'Error')+' - '+String(e.message||'unknown').replace(/https?:\/\/\S+/g,'[URL]'));process.exitCode=1;});
