'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const host='http://127.0.0.1:18767';
 const now=Date.now();
 const iso=(minute)=>new Date(now+minute*60000).toISOString();
 const active={start:iso(-10),end:iso(30),label:'テスト待機中'};
 const future={start:iso(30),end:iso(90),label:'テスト次回待機'};
 const empty={build_id:'2026-10-10-v0.34-qa',consultant_no:'0000-3',calendar_ok:true,
   online:false,realtime_label:'',realtime_until:null,updated_at:null,next_slot:null,
   calendar_slots:[],week_slots:[]};

 async function run(label,pathname,data,shouldShow,shouldOnline=false){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  let calls=0;
  await page.route(url=>{
    const u=new URL(url.href);
    return u.hostname==='script.google.com' &&
      u.pathname.includes('/macros/s/') && u.searchParams.get('action')==='status';
  },async route=>{
    calls++;
    const callback=new URL(route.request().url()).searchParams.get('callback');
    assert.match(callback||'',/^__lpStatus_[0-9]+_[a-z0-9]+$/);
    if(data===null){
      return route.fulfill({status:403,contentType:'text/plain',body:'test-only failure'});
    }
    return route.fulfill({status:200,contentType:'application/javascript',
      body:callback+'('+JSON.stringify(data)+');'});
  });
  try{
   await page.goto(host+pathname,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>{
      const el=document.getElementById('realtime-time-0000-3');
      return !!el&&el.textContent!=='待機予定を読み込み中…';
   },null,{timeout:22000});
   assert.ok(calls>0,label+': status request not performed');
   const result=await page.evaluate(()=>{
     const card=document.querySelector('.person[data-counselor-id="0000-3"]');
     const section=document.getElementById('people');
     const form=document.getElementById('initial-ticket-form');
     const links=[...document.querySelectorAll('.ticket-options a[href]')];
     // Include ancestor visibility: child <form> may have display:block
     // even when its entire counselor <section> is display:none.
     const visible=el=>!!el&&el.getClientRects().length>0;
     const ctas=[...document.querySelectorAll('a[href="#people"]')];
     const label=document.getElementById('realtime-label-0000-3');
     return {
       card:visible(card),eligible:!!card&&!card.hidden&&card.style.display!=='none',
       section:visible(section),form:visible(form),
       links:links.map(visible),count:links.length,
       ctas:ctas.map(visible),status:label?.textContent||'',
       urls:links.map(x=>x.href)
     };
   });
   assert.equal(pathname.startsWith('/story/')?result.card:result.eligible,
       shouldShow,label+': counselor listing qualification');
   if(pathname==='/lp001/' && shouldShow && !result.card){
     const more=page.locator('.more-counselors-toggle');
     assert.ok(await more.count()>0,label+': existing eight-person show-more absent');
     await more.click();
     assert.equal(await page.locator('.person[data-counselor-id="0000-3"]').isVisible(),true,
       label+': legacy card fails to open when expanding');
   }
   if(pathname.startsWith('/story/')){
     assert.equal(result.section,shouldShow,label+': story section');
     assert.equal(result.form,shouldShow,label+': initial checkout');
     assert.equal(result.count,3,label+': regular purchase links count');
     assert.deepEqual(result.links,[shouldShow,shouldShow,shouldShow],label+': regular links');
     assert.ok(result.ctas.every(x=>x===shouldShow),label+': purchase CTAs');
     for(const href of result.urls){
       const u=new URL(href);
       assert.equal(u.hostname,'buy.stripe.com');
       assert.ok(!u.pathname.startsWith('/test_'));
     }
   }
   assert.equal(result.status.includes('今、お話できます'),shouldOnline,label+': priority');
   console.log('MIZUKI_MOBILE_BROWSER_PASS '+label);
  }finally{ await context.close(); }
 }
 try{
   await run('story zero slots','/story/mizuki/',empty,false);
   await run('story future slot','/story/mizuki/',{...empty,calendar_slots:[future],week_slots:[future],next_slot:future},true);
   await run('story active slot OFF','/story/mizuki/',{...empty,calendar_slots:[active],week_slots:[active]},true);
   await run('story realtime priority','/story/mizuki/',{...empty,calendar_slots:[active],week_slots:[active],
       online:true,realtime_label:'今、お話できます',realtime_until:iso(20)},true,true);
   await run('story Calendar unavailable','/story/mizuki/',{...empty,calendar_ok:false,calendar_slots:null},false);
   await run('story network error','/story/mizuki/',null,false);
   // Production eight-counselor page remains untouched by story-only gating.
   // Its target card starts visible under main HTML, irrespective of calendar.
   await run('eight-person legacy unchanged','/lp001/',{...empty,calendar_ok:false,calendar_slots:null},true);
   console.log('MIZUKI_STORY_ONLY_BROWSER_QA_PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error('MIZUKI_QA_FAILED:',error.message);process.exitCode=1;});
