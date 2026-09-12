window.LP_CONFIG = Object.freeze({
  templateVersion: 'LP_TEMPLATE_v1.0-candidate',
  lpId: 'LP001',
  pageTitle: '勇気を出して夫を誘ったのに、断られた夜。｜リラックスサービス',
  pageDescription: '誰にも言いにくい夫婦・恋愛・性の気持ちを、声でほどく時間。話しやすそうな人と待機予定を確認できます。',
  hero: {
    kicker: '夫婦・恋愛のことを、誰にも言えない夜に',
    heading: '勇気を出して夫を誘ったのに、断られた夜。',
    lead: '悲しかったのは、セックスができなかったことだけじゃない。女性として大切にされたかった。',
    note: 'まとまっていなくても、そのまま話せる電話サービスです。'
  },
  benefits: {
    immediate: {
      label: '話したあと',
      title: '何に傷ついたのかが、少し見えてくる',
      body: '断られたことへの悔しさだけでなく、「私を見てほしかった」という気持ちを言葉にすると、頭の中を整理しやすくなります。'
    },
    future: {
      label: 'これから',
      title: '自分を置き去りにしない選び方へ',
      body: 'すぐに結論を出さず、夫に伝える・今日は休む・自分のために過ごすなど、今の自分に合う一歩を選びやすくなります。'
    }
  },
  realtime: {
    consultantNo: '0000-3',
    statusUrl: 'https://script.google.com/macros/s/AKfycbyl5jrBh-O9Zp2eiqddhQykp21fiEDpZBrxJ89byy57cCQq5nsPMZN3yl5K3QdPMjrt3g/exec?action=status',
    timezone: 'Asia/Tokyo',
    days: 7
  },
  payments: {
    supporter: {
      30:  { price: 3000,  url: 'https://buy.stripe.com/test_fZu9AVaVN6SKd2X7tKgQE00', firstUseDiscount: true },
      60:  { price: 6000,  url: 'https://buy.stripe.com/test_fZu00l9RJ5OG2oj8xOgQE01' },
      90:  { price: 9000,  url: 'https://buy.stripe.com/test_7sY4gBd3Velc3snbK0gQE02' },
      120: { price: 12000, url: 'https://buy.stripe.com/test_8x29AV7JB5OG8MH3dugQE0d' }
    },
    counselor150: {
      30:  { price: 4500,  url: 'https://buy.stripe.com/test_14AdRb0h9dh80gb7tKgQE03', firstUseDiscount: true },
      60:  { price: 9000,  url: 'https://buy.stripe.com/test_14A9AV0h95OG0gbeWcgQE08' },
      90:  { price: 13500, url: 'https://buy.stripe.com/test_9B614pd3V90SaUP6pGgQE09' },
      120: { price: 18000, url: 'https://buy.stripe.com/test_4gMaEZ7JB0um4wr15mgQE0c' }
    },
    counselorIds: ['0099','0117','0125']
  }
});

(function setupPaymentSelectors(){
  const cfg = window.LP_CONFIG;
  const paymentCfg = cfg.payments || {};
  const counselorIds = new Set(paymentCfg.counselorIds || []);

  function yen(value){ return Number(value).toLocaleString('ja-JP') + '円'; }
  function linkWithRef(url, counselorId){
    const u = new URL(url);
    u.searchParams.set('client_reference_id', counselorId + '_' + cfg.lpId);
    return u.toString();
  }

  function addStyles(){
    if(document.getElementById('ticket-picker-style')) return;
    const style = document.createElement('style');
    style.id = 'ticket-picker-style';
    style.textContent = `
      .ticket-picker{margin-top:10px;border:1px solid #ead7df;border-radius:12px;background:#fff;overflow:hidden}
      .ticket-picker summary{cursor:pointer;list-style:none;padding:12px 14px;font-weight:700;text-align:center;color:#fff;background:#EB6BA4}
      .ticket-picker summary::-webkit-details-marker{display:none}
      .ticket-picker[open] summary{border-radius:0}
      .ticket-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px}
      .ticket-option{display:block;text-decoration:none;text-align:center;border:1px solid #e8cbd8;border-radius:10px;padding:9px 6px;color:#6c3f53;background:#fff8fb;font-weight:700;font-size:13px;line-height:1.45}
      .ticket-option small{display:block;font-size:10px;font-weight:600;color:#a14f72;margin-top:2px}
      .ticket-price-note{margin-top:8px;font-size:12px;color:#6f666a;line-height:1.55}
      @media(max-width:360px){.ticket-options{grid-template-columns:1fr 1fr}.ticket-option{font-size:12px;padding:8px 4px}}
    `;
    document.head.appendChild(style);
  }

  function render(){
    addStyles();
    document.querySelectorAll('.person[data-counselor-id]').forEach(card=>{
      if(card.querySelector('.ticket-picker')) return;
      const id = card.dataset.counselorId;
      const tier = counselorIds.has(id) ? paymentCfg.counselor150 : paymentCfg.supporter;
      if(!tier) return;
      const oldCta = card.querySelector('a.cta[href*="buy.stripe.com"]');
      const price = card.querySelector('.price');
      if(!oldCta || !price) return;

      price.textContent = `30分 ${yen(tier[30].price)}〜`;
      const details = document.createElement('details');
      details.className = 'ticket-picker';
      const summary = document.createElement('summary');
      summary.textContent = '時間を選んで購入';
      const options = document.createElement('div');
      options.className = 'ticket-options';

      [30,60,90,120].forEach(minutes=>{
        const item = tier[minutes];
        if(!item) return;
        const a = document.createElement('a');
        a.className = 'ticket-option';
        a.href = linkWithRef(item.url,id);
        a.textContent = `${minutes}分 ${yen(item.price)}`;
        if(item.firstUseDiscount){
          const small = document.createElement('small');
          small.textContent = '初回割引対象';
          a.appendChild(small);
        }
        options.appendChild(a);
      });

      const note = document.createElement('div');
      note.className = 'ticket-price-note';
      note.textContent = '初回割引は30分のみ。60・90・120分は通常料金です。';
      details.append(summary,options,note);
      oldCta.replaceWith(details);
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',render,{once:true});
  else render();
})();
