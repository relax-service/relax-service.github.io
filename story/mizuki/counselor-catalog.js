/**
 * Dynamic counselor cards for the published Mizuki page.
 * Fully data-driven; no counselor-specific code or calendar identifiers.
 * Existing Umetsu legacy card and its Stripe/LINE WORKS state are untouched.
 * No purchase requests or form submission occur here.
 */
(function () {
  'use strict';
  var cfg=(window.LP_CONFIG && window.LP_CONFIG.catalog)||{};
  var url=String(cfg.statusUrl||'');
  var segment=String(cfg.segment||'mizuki');
  var container=document.querySelector('#people .counselors');
  var status=document.getElementById('dynamic-catalog-status');
  if(!container||!status||!url)return; // Not wired to QA/public GAS yet: no false cards.
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url))return;
  if(!/^[a-z0-9_-]{1,32}$/.test(segment))return;
  var requestId=0;
  var rendered=null,expiryTimer=null;
  var maxAge=5*60000;

  function linkAllowed(raw,provider){
    if(typeof raw!=='string')return '';
    try {
      var u=new URL(raw);
      if(u.protocol!=='https:'||u.username||u.password)return '';
      if(provider==='stores' && u.hostname==='relax-s.stores.jp')return u.href;
      if(provider==='stripe' && u.hostname==='buy.stripe.com' && !u.pathname.startsWith('/test_'))return u.href;
    }catch(e){}
    return '';
  }
  function profileAllowed(raw){
    if(typeof raw!=='string')return '';
    try{var u=new URL(raw);return u.protocol==='https:'&&u.hostname==='www.relax-s.com'
      &&!u.username&&!u.password&&!u.port&&!u.search
      &&/^\/(counselor|supporter|fortuneteller)\.html$/.test(u.pathname)?u.href:'';}catch(e){return '';}
  }
  function stripeMenu(person){
    if(!Array.isArray(person.tickets)||person.tickets.length!==3)return null;
    var seen=new Set(),links=new Set(),valid=true;
    var tickets=person.tickets.map(function(t){
      if(!t||![30,60,90].includes(t.durationMinutes)||seen.has(t.durationMinutes)||
        t.amountJpy!==t.durationMinutes*person.minutePrice){valid=false;return null;}
      var link=linkAllowed(t.checkoutUrl,'stripe');
      if(!link){valid=false;return null;}
      var u=new URL(link),refs=u.searchParams.getAll('client_reference_id');
      if(u.port||u.hash||!/^\/[A-Za-z0-9]+$/.test(u.pathname)||links.has(u.pathname)||
        Array.from(u.searchParams.keys()).some(function(k){return k!=='client_reference_id';})||
        refs.length!==1||!new RegExp('^'+person.consultantNo+'_[A-Za-z0-9_-]{1,64}$').test(refs[0])){
        valid=false;return null;
      }
      seen.add(t.durationMinutes);links.add(u.pathname);
      return {duration:t.durationMinutes,amount:t.amountJpy,url:link};
    });
    if(!valid)return null;
    return tickets.sort(function(a,b){return a.duration-b.duration;});
  }
  function initialOffer(person){
    var offer=person.initialOffer;
    if(!offer)return null;
    if(offer.durationMinutes!==30||!Number.isInteger(offer.amountJpy)||offer.amountJpy<1)return null;
    try{
      var u=new URL(offer.eligibilityUrl);
      if(u.protocol!=='https:'||u.hostname!=='script.google.com'||u.port||u.hash||u.username||u.password||
        !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)||
        u.searchParams.get('action')!=='promo'||u.searchParams.get('consultant_no')!==person.consultantNo||
        !/^[A-Za-z0-9_-]{1,64}$/.test(u.searchParams.get('lp_id')||'')||
        Array.from(u.searchParams.keys()).sort().join(',')!=='action,consultant_no,lp_id')return null;
      return {url:u.href,amount:offer.amountJpy};
    }catch(e){return null;}
  }
  function mediaAllowed(src,type){
    if(typeof src!=='string')return '';
    var pattern=type==='image'? /^\/assets\/images\/[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp)$/i
      : /^\/assets\/audio\/[A-Za-z0-9_-]+\.mp3$/;
    return pattern.test(src)?src:'';
  }
  function element(tag,cls,text){
    var node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function appendText(parent,tag,cls,text){var n=element(tag,cls,text);parent.appendChild(n);return n;}
  function safeSlots(person,now){
    if(!Array.isArray(person.slots))return [];
    return person.slots.map(function(slot){
      if(!slot||typeof slot.start!=='string'||typeof slot.end!=='string')return null;
      var start=Date.parse(slot.start),end=Date.parse(slot.end);
      if(!Number.isFinite(start)||!Number.isFinite(end)||end<=now||end<=start||start>now+60*86400000)return null;
      return {start:new Date(start),end:new Date(end)};
    }).filter(Boolean).sort(function(a,b){return a.start-b.start;}).slice(0,12);
  }
  function dayLabel(dt){
    return new Intl.DateTimeFormat('ja-JP',{
      timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'
    }).format(dt);
  }
  function timeLabel(dt){
    return new Intl.DateTimeFormat('ja-JP',{
      timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',hour12:false,hourCycle:'h23'
    }).format(dt);
  }
  function dayKey(dt){
    return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(dt);
  }
  function slotLabel(slot){
    var same=dayKey(slot.start)===dayKey(slot.end);
    return dayLabel(slot.start)+' '+timeLabel(slot.start)+'〜'+(same?'':dayLabel(slot.end)+' ')+timeLabel(slot.end);
  }
  function build(person,now){
    if(!person||typeof person!=='object'||typeof person.consultantNo!=='string')return null;
    if(!/^[0-9]{2,8}(?:-[0-9]{1,6})?$/.test(person.consultantNo))return null;
    if(!person.displayName || typeof person.displayName!=='string'||person.displayName.length>100)return null;
    var checkout=linkAllowed(person.checkoutUrl,person.checkoutProvider);
    var menu=person.checkoutProvider==='stripe'?stripeMenu(person):null;
    var initial=person.checkoutProvider==='stripe'?initialOffer(person):null;
    var profile=profileAllowed(person.profileUrl);
    var photo=mediaAllowed(person.imagePath,'image'),voice=mediaAllowed(person.audioPath,'audio');
    var rate=person.minutePrice;
    if((person.checkoutProvider==='stripe'?!menu:!checkout)||!photo||
      typeof person.profileUrl!=='string'||(person.profileUrl!==''&&!profile)||
      typeof person.intro!=='string'||!person.intro.trim()||
      typeof person.roleLabel!=='string'||!person.roleLabel.trim()||
      (person.audioPath&&!voice)||!Number.isInteger(rate)||rate<1||rate>10000||
      (person.initialOffer&&!initial))return null;
    var slots=safeSlots(person,now);
    if(!slots.length)return null; // No verified future slot; no purchasing.
    var card=element('article','person');
    card.dataset.counselorId=person.consultantNo;
    card.setAttribute('data-catalog-generated','true');
    var top=element('div','person-top'),avatar=element('div','avatar');
    var image=element('img');image.src=photo;image.alt=person.displayName;image.loading='lazy';
    avatar.appendChild(image);top.appendChild(avatar);
    var identity=element('div');
    appendText(identity,'div','person-name',person.displayName);
    appendText(identity,'div','meta',String(person.roleLabel||'話し手').slice(0,100));
    top.appendChild(identity);card.appendChild(top);
    appendText(card,'p','one-line',String(person.intro||'').slice(0,180));
    if(voice){var audioBlock=element('div','voice-sample');
    appendText(audioBlock,'div','voice-native-label','声を聞く');
    var audio=element('audio','voice-native-audio');
    audio.controls=true;audio.playsInline=true;audio.preload='none';audio.src=voice;
    audioBlock.appendChild(audio);card.appendChild(audioBlock);}
    var schedule=element('div','schedule');
    var title=element('div','schedule-head');appendText(title,'b','','待機予定（日本時間）');schedule.appendChild(title);
    var ul=element('ul','schedule-list');
    slots.forEach(function(s){appendText(ul,'li','',slotLabel(s));});
    schedule.appendChild(ul);card.appendChild(schedule);
    if(profile){
      var more=appendText(card,'a','profile-link','詳しいプロフィール');
      more.href=profile;more.target='_blank';more.rel='noopener noreferrer';
    }else{
      appendText(card,'p','profile-note','本体サイトに詳細プロフィールの掲載がありません。ご不明点はお問い合わせください。');
    }
    var purchase=element('div','purchase-block');
    appendText(purchase,'div','purchase-label','お話する時間を選ぶ');
    appendText(purchase,'p','purchase-note','料金：1分'+rate.toLocaleString('ja-JP')+'円（30分'+(rate*30).toLocaleString('ja-JP')+'円）');
    if(menu){
      menu.forEach(function(t){
        var action=appendText(purchase,'a','cta',t.duration+'分 '+t.amount.toLocaleString('ja-JP')+'円');
        action.href=t.url;action.target='_blank';action.rel='noopener noreferrer';
      });
      if(initial){
        var gate=appendText(purchase,'a','profile-link','初回30分 '+initial.amount.toLocaleString('ja-JP')+'円の対象確認へ');
        gate.href=initial.url;gate.target='_blank';gate.rel='noopener noreferrer';
      }
    }else{
      var action=appendText(purchase,'a','cta','STORESでチケットを選ぶ');
      action.href=checkout;action.target='_blank';action.rel='noopener noreferrer';
    }
    appendText(purchase,'p','purchase-note','料金と利用条件は、購入画面でご確認ください。');
    card.appendChild(purchase);
    return card;
  }
  function clearDynamic(){
    container.querySelectorAll('[data-catalog-generated="true"]').forEach(function(n){n.remove();});
  }
  function forgetDynamic(){
    clearTimeout(expiryTimer);expiryTimer=null;rendered=null;
    clearDynamic();
  }
  function render(data,deadline){
    var now=Date.now();
    forgetDynamic();
    if(!data||data.schema!=='relax-public-catalog-v1'||data.ok!==true||data.segment!==segment
      ||!Array.isArray(data.counselors)||data.counselors.length>100
      ||!Number.isFinite(Date.parse(data.refreshedAt))
      ||Math.abs(now-Date.parse(data.refreshedAt))>=maxAge
      ||(deadline!==undefined&&deadline<=now)){
      status.textContent='ほかの話し手の予定を取得できません。時間をおいてお試しください。';
      return;
    }
    // A pending request must not extend the life of an older snapshot.
    // Retain this deadline on timer/visibility rechecks, including clock skew.
    deadline=deadline===undefined?Math.min(now+maxAge,Date.parse(data.refreshedAt)+maxAge):deadline;
    rendered={data:data,deadline:deadline};
    var nextExpiry=deadline;
    var seen=new Set(Array.from(container.querySelectorAll('.person[data-counselor-id]'))
      .map(function(c){return c.dataset.counselorId;}));
    var fragment=document.createDocumentFragment(),added=0;
    data.counselors.forEach(function(p){
      if(!p||seen.has(p.consultantNo))return;
      var card=build(p,now);
      if(card){seen.add(p.consultantNo);fragment.appendChild(card);added++;
        safeSlots(p,now).forEach(function(s){nextExpiry=Math.min(nextExpiry,s.end.getTime());});
      }
    });
    container.appendChild(fragment);
    status.textContent=added?'':'現在、ほかの話し手の待機予定はありません。';
    // Expire ended slots and stale purchasing even without a network response.
    expiryTimer=setTimeout(function(){render(data,deadline);},Math.max(1,nextExpiry-now));
  }
  function jsonp(){
    return new Promise(function(resolve,reject){
      var cb='__relaxCatalog_'+Date.now()+'_'+Math.random().toString(36).slice(2).replace(/[^a-z0-9]/g,'');
      var tag=document.createElement('script'),done=false;
      var timeout=setTimeout(function(){finish(new Error('timeout'),undefined,true);},20000);
      function finish(error,data,allowLateResponse){
        if(done)return;done=true;
        clearTimeout(timeout);
        if(allowLateResponse){
          // Google can finish a removed script after the request has expired.
          // Absorb that response without restoring old cards or purchase links.
          window[cb]=function(){};
          setTimeout(function(){try{delete window[cb];}catch(ignore){}},60000);
        }else{
          try{delete window[cb];}catch(ignore){}
        }
        tag.remove();
        if(error)reject(error);else resolve(data);
      }
      window[cb]=function(payload){finish(null,payload);};
      tag.onerror=function(){finish(new Error('unavailable'));};
      tag.src=url+'?action=catalog&segment='+encodeURIComponent(segment)+'&callback='+encodeURIComponent(cb)+'&_='+Date.now();
      document.head.appendChild(tag);
    });
  }
  function refresh(){
    var seq=++requestId;
    jsonp().then(function(data){if(seq===requestId)render(data);},function(){
      if(seq!==requestId)return;
      forgetDynamic();status.textContent='ほかの話し手の予定を取得できません。時間をおいてお試しください。';
    });
  }
  refresh();
  window.setInterval(refresh,60000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){
    if(rendered)render(rendered.data,rendered.deadline);
    refresh();
  }});
})();

