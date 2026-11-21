/* Grant transport v3. The server validates the emailed authorization; this
 * client only correlates its response. No storage, network or side effects.
 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.RelaxPurchaseGrantSession=factory;
})(typeof globalThis!=='undefined'?globalThis:this,function(options){
  'use strict';
  const o=options||{},sid=o.sessionId,grant=o.grant,origin=o.parentOrigin;
  if(typeof sid!=='string'||!/^cs_(test|live)_[A-Za-z0-9]{1,240}$/.test(sid)||
    typeof grant!=='string'||grant.length>160||!/^rv1\.[0-9]+\.[0-9]+\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(grant)||
    !['https://story.relax-s.com','https://relax-s.com','https://www.relax-s.com','https://relax-service.github.io'].includes(origin))throw Error('GRANT_NOT_READY');
  const cryptoApi=o.crypto||globalThis.crypto,now=o.now||(()=>performance.now());
  if(!cryptoApi||typeof cryptoApi.getRandomValues!=='function')throw Error('GRANT_NOT_READY');
  let pending=null,complete=false;const issued=new Set();
  function time(){const t=now();if(!Number.isFinite(t))throw Error('GRANT_NOT_READY');return t;}
  function live(){if(!pending)return false;const t=time();if(t<pending.start||t>=pending.until){pending=null;return false;}return true;}
  return {
    begin(){
      if(complete||live())throw Error('GRANT_NOT_READY');
      const bytes=new Uint8Array(16);cryptoApi.getRandomValues(bytes);
      const requestId=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
      if(issued.has(requestId))throw Error('GRANT_NOT_READY');issued.add(requestId);
      const start=time();pending={requestId,start,until:start+20000};
      return {action:'purchase_view',bridge_version:'3',session_id:sid,
        viewer_grant:grant,request_id:requestId,parent_origin:origin};
    },
    accept(event){
      if(!live()||!event||typeof event.origin!=='string'||
        !/^https:\/\/(script\.google\.com|script\.googleusercontent\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/.test(event.origin))return null;
      const d=event.data;
      if(!d||typeof d!=='object'||Array.isArray(d)||d.source!=='relax-stripe-gas'||
        d.kind!=='purchase_success'||d.bridgeVersion!==3||d.sessionId!==sid||d.requestId!==pending.requestId)return null;
      if(d.ok===false){pending=null;return {ok:false,message:'購入内容を確認できませんでした。決済をやり直さず、購入メールまたは運営へご確認ください。'};}
      if(d.ok!==true||!['counselorName','counselorPhone','ticketLabel','amountLabel','lpId','consultantNo','confirmationId'].every(k=>typeof d[k]==='string'&&d[k].trim())||
        !/^0[0-9]{9,10}$/.test(d.counselorPhone.replace(/-/g,''))||!['standard','initial'].includes(d.ticketKind)||
        ![30,60,90].includes(d.durationMinutes)||!Number.isSafeInteger(d.amountJpy)||d.amountJpy<=0)return null;
      const result={ok:true};
      ['counselorName','counselorPhone','ticketLabel','amountLabel','lpId','consultantNo',
        'confirmationId','ticketKind','durationMinutes','amountJpy'].forEach(k=>{result[k]=d[k];});
      ['expiresLabel','receiptUrl','invoicePdfUrl','invoiceUrl'].forEach(k=>{if(typeof d[k]==='string'&&d[k].length<=2048)result[k]=d[k];});
      pending=null;complete=true;return result;
    },
    cancel(){pending=null;},isPending:live
  };
});
