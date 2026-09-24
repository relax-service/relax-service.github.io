(function(){
  "use strict";

  // LP pricing policy switch.
  // "initial_discount": show GAS eligibility gate + discounted initial 30-minute offer.
  // "regular_only": hide the discounted offer and sell only standard Stripe prices.
  const POLICY=Object.freeze({
    mode:"initial_discount",
    version:"20260924a"
  });
  window.RELAX_PAYMENT_POLICY=POLICY;

  function apply(){
    const regularOnly=POLICY.mode==="regular_only";
    document.documentElement.dataset.paymentMode=POLICY.mode;

    document.querySelectorAll("[data-initial-checkout]").forEach(function(form){
      form.hidden=regularOnly;
      const block=form.closest(".purchase-block");
      if(block){
        const divider=block.querySelector(".purchase-divider");
        if(divider) divider.hidden=regularOnly;
      }
    });

    document.querySelectorAll(".use-step").forEach(function(step){
      const title=step.querySelector("b");
      const body=step.querySelector("p");
      if(!title||!body||title.textContent.trim()!=="Stripeで購入") return;
      body.textContent=regularOnly
        ?"30分・60分・90分から選び、Stripeで購入します。"
        :"初回30分は電話番号で対象確認後、Stripeへ進みます。通常30分・60分・90分はStripeで購入します。";
    });
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",apply,{once:true});
  }else{
    apply();
  }
})();