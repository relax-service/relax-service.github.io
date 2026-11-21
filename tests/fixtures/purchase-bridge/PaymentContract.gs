/** Pure payment/onboarding contract. No Stripe, Sheet, mail or trigger writes.
 * Use only in the NEW isolated project. Never paste over the deployed payment GAS.
 * Callers fetch Stripe objects server-side with the verified account credential.
 */
function relaxPaymentAssert_(condition, code) {
  if (!condition) throw new Error(code);
}
function relaxPaymentTrue_(value) {
  return /^(true|1)$/i.test(String(value));
}
function relaxPaymentId_(object) {
  return typeof object === 'string' ? object : String(object && object.id || '');
}
function relaxPaymentTicket_(mode, no, rows, linkId, priceId) {
  var matches = rows.filter(function(r) {
    return r.mode === mode && relaxPaymentTrue_(r.active) &&
      String(r.consultant_no) === no && String(r.price_id) === priceId &&
      (linkId ? String(r.payment_link_id) === linkId :
        String(r.ticket_kind) === 'initial' && !r.payment_link_id);
  });
  relaxPaymentAssert_(matches.length === 1, 'PAYMENT_TICKET_NOT_UNIQUE');
  return matches[0];
}
function relaxPaymentVerify_(input) {
  var s = input.session, mode = input.mode, c = input.counselor;
  relaxPaymentAssert_(mode === 'test' || mode === 'live', 'PAYMENT_MODE_REQUIRED');
  relaxPaymentAssert_(s && s.livemode === (mode === 'live') &&
    new RegExp('^cs_' + mode + '_').test(s.id), 'PAYMENT_MODE_MISMATCH');
  relaxPaymentAssert_(s.status === 'complete' && s.payment_status === 'paid', 'PAYMENT_NOT_PAID');
  var ref = /^([0-9]{2,8}(?:-[0-9]{1,6})?)_([A-Za-z0-9_-]{1,64})$/.exec(s.client_reference_id || '');
  relaxPaymentAssert_(ref, 'PAYMENT_REFERENCE_INVALID');
  var no = ref[1];
  relaxPaymentAssert_(c && String(c.consultant_no) === no && relaxPaymentTrue_(c.active), 'PAYMENT_COUNSELOR_INVALID');
  var items = input.lineItems;
  relaxPaymentAssert_(items && items.has_more === false && Array.isArray(items.data) &&
    items.data.length === 1 && items.data[0].quantity === 1, 'PAYMENT_LINE_ITEMS_INVALID');
  var p = items.data[0].price, linkId = relaxPaymentId_(s.payment_link);
  relaxPaymentAssert_(p && p.livemode === (mode === 'live') && p.currency === 'jpy' &&
    p.type === 'one_time' && Number.isInteger(p.unit_amount), 'PAYMENT_PRICE_INVALID');
  var t = relaxPaymentTicket_(mode, no, input.tickets, linkId, p.id);
  relaxPaymentAssert_(relaxPaymentId_(p.product) === String(t.product_id), 'PAYMENT_PRODUCT_MISMATCH');
  relaxPaymentAssert_(t.service_type === c.service_type &&
    Number(t.rate_per_minute) === Number(c.rate_per_minute), 'PAYMENT_RATE_MISMATCH');
  relaxPaymentAssert_(p.unit_amount === Number(t.amount_jpy) &&
    s.currency === 'jpy' && s.amount_subtotal === p.unit_amount, 'PAYMENT_AMOUNT_MISMATCH');
  var duration = Number(t.duration_minutes), initial = String(t.ticket_kind) === 'initial';
  relaxPaymentAssert_(['standard','initial'].indexOf(String(t.ticket_kind)) >= 0 &&
    Number.isInteger(s.amount_total) && s.amount_total>0 && s.amount_total<=s.amount_subtotal &&
    [30,60,90].indexOf(duration) >= 0 &&
    (initial ? duration === 30 : p.unit_amount === duration * Number(c.rate_per_minute)), 'PAYMENT_DURATION_INVALID');
  // No silent acceptance of discounts, taxes or adjustments. Initial gate proof
  // must come from the private pending-order record, never URL/session metadata alone.
  var adjustments = s.total_details || {};
  var discount = adjustments.amount_discount === undefined ? 0 : adjustments.amount_discount;
  var tax = adjustments.amount_tax === undefined ? 0 : adjustments.amount_tax;
  var shipping = adjustments.amount_shipping === undefined ? 0 : adjustments.amount_shipping;
  relaxPaymentAssert_(Number.isSafeInteger(discount) && discount >= 0 &&
    tax === 0 && shipping === 0, 'PAYMENT_ADJUSTMENT_INVALID');
  relaxPaymentAssert_(s.amount_subtotal - discount === s.amount_total,
    discount === 0 ? 'PAYMENT_TOTAL_MISMATCH' : 'PAYMENT_ADJUSTMENT_INVALID');
  // A standard link with a private initial-offer proof is still 30 minutes only.
  // Proof does not authorize a discount on the 60/90-minute standard menus.
  relaxPaymentAssert_(discount === 0 || duration === 30, 'PAYMENT_DISCOUNT_DURATION_INVALID');
  if (initial || discount) {
    var proof = input.initialProof;
    relaxPaymentAssert_(proof && proof.sessionId === s.id && proof.consultantNo === no &&
      proof.precheckHash && proof.precheckHash === proof.paidPhoneHash &&
      proof.eligible === true && proof.expectedAmountJpy === s.amount_total,
      'PAYMENT_INITIAL_REVIEW_REQUIRED');
  } else {
    relaxPaymentAssert_(s.amount_total === p.unit_amount, 'PAYMENT_TOTAL_MISMATCH');
  }
  // This test-only plan NEVER sends. Neither current master contains a verified
  // phone version field; absence blocks completion rather than guessing a number.
  relaxPaymentAssert_(typeof c.phone === 'string' && /^0[0-9]{9,10}$/.test(c.phone.replace(/-/g,'')) &&
    input.contactVerified === true && String(t.phone_source_version || '') &&
    t.phone_source_version === input.phoneSourceVersion, 'PAYMENT_CONTACT_NOT_VERIFIED');
  var details=s.customer_details||{};
  return {
    sessionId:s.id,consultantNo:no,lpId:ref[2],durationMinutes:duration,amountJpy:s.amount_total,
    counselorName:c.name,counselorPhone:c.phone,
    customerMessage:'ご購入ありがとうございます。\n' + c.name + '\n電話番号：' + c.phone +
      '\n購入時と同じ電話番号から、発信者番号を通知してお電話ください。',
    counselorNotification:{to:String(c.notification_email || ''),status:c.notification_email ? 'preview_only' : 'missing_recipient',
      body:['チケット購入いただきました！',String(details.name||''),String(details.phone||''),
        String(details.email||''),c.service_type==='talk'?'話し相手':'カウンセリング',
        String(s.amount_total)+'円・'+duration+'分',
        'お客様へSMS等でのフォローをお願いいたします。'].join('\n')},
    idempotencyKey:s.id,sendAllowed:false
  };
}
function relaxPaymentSandboxPlan_(input) {
  relaxPaymentAssert_(input.account && input.account.livemode === false &&
    input.account.id === input.expectedSandboxAccountId && input.expectedSandboxAccountId,
    'ONBOARDING_SANDBOX_REQUIRED');
  var c = input.counselor, no = c && String(c.consultant_no);
  relaxPaymentAssert_(c && /^[0-9]{2,8}(?:-[0-9]{1,6})?$/.test(no) && c.name &&
    relaxPaymentTrue_(c.active) && ['talk','counseling'].indexOf(c.service_type) >= 0 &&
    Number.isInteger(Number(c.rate_per_minute)) && Number(c.rate_per_minute) > 0,
    'ONBOARDING_COUNSELOR_INVALID');
  relaxPaymentAssert_(input.contactVerified === true && c.phone &&
    /^0[0-9]{9,10}$/.test(String(c.phone).replace(/-/g,'')) && input.phoneSourceVersion,
    'ONBOARDING_CONTACT_REQUIRED');
  relaxPaymentAssert_(c.notification_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.notification_email),
    'ONBOARDING_NOTIFICATION_REQUIRED');
  relaxPaymentAssert_(input.existingTickets.every(function(t) {
    return t.mode !== 'test' || String(t.consultant_no) !== no;
  }), 'ONBOARDING_EXISTING_TICKETS_RECONCILE_FIRST');
  // Plan only: never returns an executable key or a public checkout URL.
  return [30,60,90].map(function(minutes) {
    return {
      key:'relax-qa-v1-' + no + '-' + minutes,
      product:{name:c.name + '｜電話相談' + minutes + '分【隔離QA】',
        metadata:{consultant_no:no,duration_minutes:String(minutes),purpose:'isolated_qa'}},
      price:{currency:'jpy',unit_amount:Number(c.rate_per_minute) * minutes},
      // Creation does not support active=false. These are dependent steps;
      // a future executor must create unpublished, immediately deactivate, then
      // read back active=false before persisting IDs. No executor is included.
      paymentLinkCreate:{allow_promotion_codes:false,
        after_completion:{type:'hosted_confirmation',hosted_confirmation:{custom_message:
          '【隔離QA・実際には発信しないでください】\n' + c.name + '\n電話番号：' + c.phone}},
        phone_number_collection:{enabled:true},
        metadata:{consultant_no:no,duration_minutes:String(minutes),purpose:'isolated_qa'}},
      paymentLinkAfterCreate:{active:false},
      // Invoice creation is NOT automatically enabled: confirm cost before use.
      ticket:{mode:'test',consultant_no:no,service_type:c.service_type,
        rate_per_minute:Number(c.rate_per_minute),duration_minutes:minutes,
        amount_jpy:Number(c.rate_per_minute)*minutes,ticket_kind:'standard',
        active:false,phone_source_version:input.phoneSourceVersion},
      state:'planned_not_created',purchaseAllowed:false,sendAllowed:false
    };
  });
}


