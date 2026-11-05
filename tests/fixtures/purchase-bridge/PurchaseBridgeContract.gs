/** Isolated, pure purchase-confirmation v2 contract. NOT a deployed endpoint.
 * No doGet/doPost, Stripe calls, Sheet/cache/property writes, triggers or sends.
 * A future server adapter must fetch its own Stripe/private-master input and
 * enforce account/mode/access controls. NEVER accept paymentInput from a URL.
 * The challenge binds a reply to a request; it is not customer authentication,
 * authorization for fulfillment, a webhook handler or durable idempotency.
 */
function relaxPurchaseBridgeRequest_(request) {
  var origins = ['https://story.relax-s.com', 'https://relax-s.com',
    'https://www.relax-s.com', 'https://relax-service.github.io'];
  relaxPaymentAssert_(request && request.action === 'purchase_confirmation_v2' &&
    request.bridge_version === '2', 'BRIDGE_VERSION_REQUIRED');
  relaxPaymentAssert_(typeof request.session_id === 'string' && request.session_id.length <= 256 &&
    /^cs_(test|live)_[A-Za-z0-9]+$/.test(request.session_id), 'BRIDGE_SESSION_INVALID');
  relaxPaymentAssert_(typeof request.request_id === 'string' &&
    /^[a-f0-9]{32}$/.test(request.request_id), 'BRIDGE_REQUEST_INVALID');
  relaxPaymentAssert_(origins.indexOf(request.parent_origin) >= 0, 'BRIDGE_PARENT_INVALID');
  return {source:'relax-stripe-gas', kind:'purchase_success', bridgeVersion:2,
    sessionId:request.session_id, requestId:request.request_id};
}

function relaxPurchaseBridgeReply_(request, paymentInput) {
  var reply = relaxPurchaseBridgeRequest_(request);
  try {
    relaxPaymentAssert_(paymentInput && paymentInput.session &&
      paymentInput.session.id === reply.sessionId, 'BRIDGE_SESSION_MISMATCH');
    relaxPaymentAssert_(paymentInput.counselor &&
      ['talk','counseling'].indexOf(paymentInput.counselor.service_type) >= 0,
      'BRIDGE_SERVICE_INVALID');
    // Reuse the actual private payment/person/price/contact verifier. No caller
    // supplied `paid`, URL metadata or display labels may bypass this step.
    var verified = relaxPaymentVerify_(paymentInput);
    relaxPaymentAssert_(typeof verified.counselorName === 'string' &&
      verified.counselorName.trim().length > 0, 'BRIDGE_NAME_REQUIRED');
    relaxPaymentAssert_(Number.isSafeInteger(verified.amountJpy) && verified.amountJpy > 0,
      'BRIDGE_AMOUNT_INVALID');
    var ticket = relaxPaymentTicket_(paymentInput.mode, verified.consultantNo,
      paymentInput.tickets, relaxPaymentId_(paymentInput.session.payment_link),
      paymentInput.lineItems.data[0].price.id);
    var initial = ticket.ticket_kind === 'initial' ||
      Number((paymentInput.session.total_details || {}).amount_discount || 0) > 0;
    reply.ok = true;
    reply.counselorName = verified.counselorName;
    reply.counselorPhone = verified.counselorPhone;
    reply.ticketLabel = (initial ? '初回 ' : '') +
      (paymentInput.counselor.service_type === 'talk' ? '話し相手' : 'カウンセリング') +
      ' ' + verified.durationMinutes + '分チケット';
    reply.amountLabel = verified.amountJpy.toLocaleString('ja-JP') + '円';
    reply.lpId = verified.lpId;
    reply.consultantNo = verified.consultantNo;
    reply.ticketKind = initial ? 'initial' : 'standard';
    reply.durationMinutes = verified.durationMinutes;
    reply.amountJpy = verified.amountJpy;
    reply.confirmationId = verified.sessionId.slice(-16);
    // Expiry and Stripe document retrieval are separate integration work.
    // Do not infer them or copy arbitrary caller-provided links into the reply.
    return reply;
  } catch (_) {
    // Never expose provider errors, customer records, phone, email or IDs from
    // another order. A valid request receives only its own correlation fields.
    var failed = relaxPurchaseBridgeRequest_(request);
    failed.ok = false;
    failed.message = 'お支払い内容を確認できませんでした。決済をやり直さず、時間をおいてもう一度確認してください。';
    return failed;
  }
}

function relaxPurchaseBridgeJson_(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, function(c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}

function relaxPurchaseBridgeDocument_(request, paymentInput) {
  // Invalid destination/version/challenge fails before a postMessage document
  // exists. No wildcard or fallback origin, even for failures.
  var reply = relaxPurchaseBridgeReply_(request, paymentInput);
  return {html:'<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex,nofollow">' +
    '<title>購入内容の確認</title></head><body><script>' +
    'window.top.postMessage(' + relaxPurchaseBridgeJson_(reply) + ',' +
    relaxPurchaseBridgeJson_(request.parent_origin) + ');</script></body></html>',
    targetOrigin:request.parent_origin,sendAllowed:false,publicationAllowed:false};
}

