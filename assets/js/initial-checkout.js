(function(){
  "use strict";

  function normalizePhone(v){
    let d=String(v||"").replace(/\D/g,"");
    if(d.indexOf("81")===0&&d.length>=11)d="0"+d.slice(2);
    return /^0\d{9,10}$/.test(d)?d:"";
  }

  function trustedOrigin(origin){
    try{
      const u=new URL(origin);
      return u.protocol==="https:"&&(
        u.hostname==="script.google.com"||
        u.hostname==="script.googleusercontent.com"||
        u.hostname.endsWith(".googleusercontent.com")
      );
    }catch(_){return false}
  }

  function setup(form,index){
    const phone=form.querySelector("[data-initial-phone]");
    const submit=form.querySelector("[data-initial-submit]");
    const status=form.querySelector("[data-initial-status]");
    const actionUrl=form.getAttribute("data-action-url")||"";
    const consultantNo=form.getAttribute("data-consultant-no")||"";
    const lpId=form.getAttribute("data-lp-id")||"";
    if(!phone||!submit||!status||!actionUrl||!consultantNo||!lpId)return;

    const frame=document.createElement("iframe");
    const frameName="stripe-gate-frame-"+index+"-"+Date.now();
    frame.name=frameName;
    frame.title="初回購入確認";
    frame.className="gate-frame";
    document.body.appendChild(frame);

    let timer=null;

    form.addEventListener("submit",function(e){
      e.preventDefault();
      const normalized=normalizePhone(phone.value);
      if(!normalized){
        status.textContent="電話番号をご確認ください。";
        phone.focus();
        return;
      }

      const post=document.createElement("form");
      post.method="post";
      post.action=actionUrl;
      post.target=frameName;
      post.hidden=true;
      [
        ["action","promo"],
        ["embed","1"],
        ["consultant_no",consultantNo],
        ["lp_id",lpId],
        ["phone",normalized],
        ["parent_origin",window.location.origin]
      ].forEach(function(pair){
        const input=document.createElement("input");
        input.type="hidden";
        input.name=pair[0];
        input.value=pair[1];
        post.appendChild(input);
      });
      document.body.appendChild(post);

      submit.disabled=true;
      status.textContent="初回対象を確認しています…";
      clearTimeout(timer);
      timer=setTimeout(function(){
        submit.disabled=false;
        status.textContent="確認に時間がかかっています。もう一度お試しください。";
      },20000);
      post.submit();
      setTimeout(function(){post.remove();},1000);
    });

    window.addEventListener("message",function(e){
      if(!trustedOrigin(e.origin))return;
      const data=e.data||{};
      if(data.source!=="relax-stripe-gas")return;
      clearTimeout(timer);

      if(data.ok&&typeof data.checkoutUrl==="string"&&data.checkoutUrl.indexOf("https://checkout.stripe.com/")===0){
        status.textContent="Stripeへ移動します…";
        if(typeof window.relaxTrack==="function"){
          window.relaxTrack("checkout_start",{consultant_no:consultantNo,ticket_kind:"initial",duration:30,amount:1000});
        }
        window.location.assign(data.checkoutUrl);
        return;
      }

      submit.disabled=false;
      status.textContent=data.message||"確認できませんでした。時間をおいて再度お試しください。";
    });
  }

  document.addEventListener("DOMContentLoaded",function(){
    document.querySelectorAll("[data-initial-checkout]").forEach(setup);
  });
})();