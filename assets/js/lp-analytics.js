(function(){
  "use strict";
  const cfg=window.RELAX_LP_ANALYTICS||{};
  if(window.RELAX_ANALYTICS_DISABLED)return;

  const base={
    lp_id:cfg.lp_id||"",
    scenario:cfg.scenario||"",
    lp_version:cfg.lp_version||""
  };
  const sent=new Set();

  function clean(obj){
    const out={};
    Object.keys(obj||{}).forEach(function(k){
      const v=obj[k];
      if(v!==undefined&&v!==null&&v!=="")out[k]=v;
    });
    return out;
  }

  function track(name,params){
    if(typeof window.gtag!=="function")return;
    const payload=Object.assign({},base,params||{});
    if(new URLSearchParams(location.search).get("debug")==="1"){
      payload.debug_mode=true;
    }
    window.gtag("event",name,clean(payload));
  }

  function once(key,name,params){
    if(sent.has(key))return;
    sent.add(key);
    track(name,params);
  }

  function observe(selector,eventName){
    const el=document.querySelector(selector);
    if(!el)return;
    const io=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          once("reach:"+eventName,eventName,{page_path:location.pathname});
          io.disconnect();
        }
      });
    },{threshold:0.3});
    io.observe(el);
  }

  function durationFrom(el){
    const m=(el&&el.textContent||"").match(/(30|60|90)\s*分/);
    return m?Number(m[1]):undefined;
  }

  function amountFrom(el){
    const m=(el&&el.textContent||"").replace(/,/g,"").match(/([0-9]+)\s*円/);
    return m?Number(m[1]):undefined;
  }

  function counselorFrom(el){
    const card=el&&el.closest?el.closest("[data-counselor-id]"):null;
    return card?card.getAttribute("data-counselor-id")||undefined:undefined;
  }

  window.relaxTrack=track;

  document.addEventListener("DOMContentLoaded",function(){
    track("lp_view",{page_path:location.pathname,page_title:document.title});

    observe("#story","story_reach");
    observe("#self-check","selfcheck_reach");
    observe("#service-guide","service_reach");
    observe("#people","counselor_view");

    document.querySelectorAll("[data-initial-checkout]").forEach(function(initialForm){
      initialForm.addEventListener("submit",function(){
        track("purchase_cta_click",{
          consultant_no:initialForm.getAttribute("data-consultant-no")||counselorFrom(initialForm),
          ticket_kind:"initial",
          duration:30,
          amount:1000
        });
      });
    });

    document.addEventListener("click",function(e){
      const stripeLink=e.target.closest('a[href*="buy.stripe.com"],a[href*="checkout.stripe.com"]');
      if(stripeLink){
        const p={
          consultant_no:counselorFrom(stripeLink),
          ticket_kind:"standard",
          duration:durationFrom(stripeLink),
          amount:amountFrom(stripeLink)
        };
        track("purchase_cta_click",p);
        track("checkout_start",p);
      }

      const telLink=e.target.closest('a[href^="tel:"]');
      if(telLink){
        track("call_click",{consultant_no:counselorFrom(telLink)});
      }
    });
  });
})();