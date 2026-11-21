/* Purchase confirmation v2 client. Executable body pinned to Kingdom PR #18.
 * Passive until the page adapter selects v2; no endpoint or automatic connection.
 * Request correlation does not authenticate a purchaser or authorize fulfillment.
 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.RelaxPurchaseBridgeSession=factory;
})(typeof globalThis!=='undefined'?globalThis:this,function createPurchaseBridgeSession(options){
  'use strict';
  options=options||{};
  var origins=['https://story.relax-s.com','https://relax-s.com',
    'https://www.relax-s.com','https://relax-service.github.io'];
  var sessionId=options.sessionId,parentOrigin=options.parentOrigin;
  if(typeof sessionId!=='string'||sessionId.length>256||!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId))throw Error('BRIDGE_SESSION_INVALID');
  if(origins.indexOf(parentOrigin)<0)throw Error('BRIDGE_PARENT_INVALID');
  var cryptoApi=options.crypto||(typeof globalThis!=='undefined'&&globalThis.crypto);
  var now=options.now||function(){return performance.now();};
  if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function')throw Error('BRIDGE_CRYPTO_REQUIRED');
  var pending=null,completed=false,issuedIds=new Set();
  function time(){var t=now();if(!Number.isFinite(t))throw Error('BRIDGE_CLOCK_INVALID');return t;}
  function isPending(){
    if(!pending)return false;
    var t=time();
    if(t<pending.started||t>=pending.deadline){pending=null;return false;}
    return true;
  }
  function trustedOrigin(origin){
    return typeof origin==='string'&&/^https:\/\/(script\.google\.com|(?:[a-z0-9-]+\.)+googleusercontent\.com)$/.test(origin);
  }
  function validDetails(data){
    return ['counselorName','counselorPhone','ticketLabel','amountLabel','lpId','consultantNo','confirmationId'].every(function(k){
      return typeof data[k]==='string'&&data[k].trim().length>0;
    })&&/^0[0-9]{9,10}$/.test(data.counselorPhone.replace(/-/g,''))&&
      ['standard','initial'].indexOf(data.ticketKind)>=0&&
      [30,60,90].indexOf(data.durationMinutes)>=0&&Number.isSafeInteger(data.amountJpy)&&data.amountJpy>0;
  }
  return {
    begin:function(){
      if(completed)throw Error('BRIDGE_ALREADY_CONFIRMED');
      if(isPending())throw Error('BRIDGE_REQUEST_PENDING');
      var bytes=new Uint8Array(16);cryptoApi.getRandomValues(bytes);
      var id=Array.from(bytes,function(b){return ('0'+b.toString(16)).slice(-2);}).join('');
      if(issuedIds.has(id))throw Error('BRIDGE_CHALLENGE_REUSED');
      issuedIds.add(id);
      var t=time();pending={id:id,started:t,deadline:t+20000};
      return {action:'purchase_confirmation_v2',bridge_version:'2',session_id:sessionId,
        request_id:id,parent_origin:parentOrigin};
    },
    accept:function(event){
      if(!isPending()||!event||!trustedOrigin(event.origin))return null;
      var data=event.data;
      if(!data||typeof data!=='object'||Array.isArray(data)||data.source!=='relax-stripe-gas'||
        data.kind!=='purchase_success'||data.bridgeVersion!==2||data.sessionId!==sessionId||data.requestId!==pending.id)return null;
      if(data.ok===false){
        pending=null;
        // Provider/customer-specific error text is not part of this contract.
        return {ok:false,message:'お支払い内容を確認できませんでした。決済をやり直さず、時間をおいてもう一度確認してください。'};
      }
      if(data.ok!==true||!validDetails(data))return null;
      var result={ok:true};
      ['counselorName','counselorPhone','ticketLabel','amountLabel','lpId','consultantNo',
        'ticketKind','durationMinutes','amountJpy','confirmationId'].forEach(function(k){result[k]=data[k];});
      pending=null;completed=true;
      return result;
    },
    isPending:isPending,
    cancel:function(){pending=null;}
  };
});

