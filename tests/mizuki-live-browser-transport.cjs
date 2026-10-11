'use strict';
/*
 * READ-ONLY mobile-sized Chromium against actual published LP.
 * This does not enter customer details, click buttons, or buy tickets.
 * Unlike mocked UI tests, the cross-origin GAS JSONP loads over the web.
 */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const uri='https://relax-service.github.io/story/mizuki/';
  let started;
  const anomalies=[];
  page.on('request',request=>{
    if(request.url().includes('script.google.com/macros/s/') &&
       request.url().includes('action=status'))started=performance.now();
  });
  page.on('requestfailed',request=>{
    if(request.url().includes('script.google.com/macros/s/'))
      anomalies.push('script request failed: '+String(request.failure()?.errorText||'unknown').slice(0,100));
  });
  page.on('console',msg=>{
    if(msg.type()==='warning' && msg.text().includes('Realtime status load failed'))
      anomalies.push('status loader warned about live request');
  });
  try{
    const response=await page.goto(uri,{waitUntil:'domcontentloaded',timeout:30000});
    assert.equal(response?.status(),200,'Published LP should return HTTP 200');
    await page.waitForFunction(()=>{
      const el=document.getElementById('realtime-time-0000-3');
      return !!el && !/読み込み中/.test(el.textContent);
    },null,{timeout:20000});
    const view=await page.evaluate(()=>{
      const t=document.getElementById('realtime-time-0000-3');
      const week=document.getElementById('realtime-week-0000-3');
      const card=document.querySelector('.person[data-counselor-id="0000-3"]');
      const purchase=document.getElementById('initial-ticket-form');
      const count=document.querySelectorAll('.ticket-options a[href]').length;
      return {time:t?.textContent||'',week:week?.textContent||'',
       hasCard:!!card,hasPurchase:!!purchase,links:count};
    });
    assert.ok(view.hasCard && view.hasPurchase && view.links===3,'Expected pre-existing published purchase DOM');
    assert.ok(started!==undefined,'No production cross-domain status request observed');
    assert.ok(!view.time.includes('取得できません'),'Published LP could not load anonymous GAS status');
    assert.ok(!view.week.includes('読み込み中'),'Calendar list did not refresh');
    console.log(JSON.stringify({
      result:'LIVE_BROWSER_PRODUCTION_JSONP_PASS',
      elapsed_since_script_request_ms:Math.round(performance.now()-started),
      has_consultant_card:view.hasCard,
      regular_ticket_link_count:view.links,
      warning_count:anomalies.length
    }));
  } finally {await browser.close();}
})().catch(error=>{console.error('LIVE_BROWSER_PRODUCTION_JSONP_FAIL: '+String(error.message).slice(0,250));process.exitCode=1;});
