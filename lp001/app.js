(function(){
  const STATUS_URL = 'https://script.google.com/macros/s/AKfycbyl5jrBh-O9Zp2eiqddhQykp21fiEDpZBrxJ89byy57cCQq5nsPMZN3yl5K3QdPMjrt3g/exec?action=status';
  const consultantNo = '0000-3';
  let lastStatusData = null;
  let realtimeExpiryTimer = null;

  const CUSTOMER_VOICES = {
    '0020': '自然と打ち解けて、昔からの友達みたいに緊張せず楽しく話せました。たくさん話しても、ちゃんと聞いてくれているのがわかりました。',
    '0099': '話しやすかったし、的確なアドバイスをもらえました。話すことで、すごく頭の整理ができました。話せて本当によかったです。',
    '0100': '誰にも話せなかったことを自然に打ち明けられ、とても心が軽くなりました。私の立場や悩みをしっかり理解してくれたので、安心して話せました。',
    '0113': 'きちんと話の内容を理解してくれて、いつもこちらの心に入ってきてくれます。本当にありがとう。また利用したいと思います。',
    '0117': 'すごく共感してくれて、どんな話もしっかり聞いてもらえました。紹介したいと思えるくらい、安心して話せる相談員さんでした。',
    '0124': '気持ちを理解し、親身になって一緒に考えてくれました。聞き上手で話しやすく、優しさにも癒されました。',
    '0000-3': '相談者が幸せな方向に進めるよう、誠心誠意、一緒に考えてアドバイスしてくれました。とても大切なことを相談して、本当に良かったと思っています。'
  };

  function $(id){ return document.getElementById(id); }
  function parseIso(value){ return value ? new Date(value) : null; }
  function pad(n){ return String(n).padStart(2,'0'); }
  function fmtDateTime(value){
    const d = parseIso(value);
    if(!d || Number.isNaN(d.getTime())) return '';
    const w=['日','月','火','水','木','金','土'][d.getDay()];
    return `${d.getMonth()+1}/${d.getDate()}（${w}） ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fmtTime(value){
    const d = parseIso(value);
    if(!d || Number.isNaN(d.getTime())) return '';
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function slotStart(slot){ return parseIso(slot && slot.start); }
  function slotEnd(slot){ return parseIso(slot && (slot.end || slot.until)); }
  function isFutureOrCurrentSlot(slot, now){
    const end=slotEnd(slot);
    if(end && !Number.isNaN(end.getTime())) return end.getTime()>now.getTime();
    const st=slotStart(slot);
    if(st && !Number.isNaN(st.getTime())) return st.getTime()>=now.getTime();
    return false;
  }
  function isWithin7Days(slot, now){
    const st=slotStart(slot);
    if(!st || Number.isNaN(st.getTime())) return false;
    return st.getTime() <= now.getTime() + 7*24*60*60*1000;
  }

  function renderCustomerVoices(){
    Object.entries(CUSTOMER_VOICES).forEach(([id, quote])=>{
      const card=document.querySelector(`.person[data-counselor-id="${id}"]`);
      if(!card || card.querySelector('.customer-voice')) return;

      const block=document.createElement('div');
      block.className='customer-voice';
      block.style.cssText='margin:14px 0 2px;padding:13px 14px 12px;background:#FFF8FB;border:1px solid #F0DDE6;border-left:3px solid #C95F8C;border-radius:8px';

      const label=document.createElement('div');
      label.className='customer-voice-label';
      label.style.cssText='font-size:12px;font-weight:700;letter-spacing:.03em;color:#9B486D;margin:0 0 6px';
      label.textContent='お客様の声';

      const text=document.createElement('p');
      text.className='customer-voice-quote';
      text.style.cssText='font-family:"Noto Serif JP",serif;font-size:14px;line-height:1.78;color:#403A3D;margin:0';
      text.textContent=quote;

      block.append(label,text);

      const voiceSample=card.querySelector('.voice-sample');
      const voice=card.querySelector('.voice');
      const schedule=card.querySelector('.schedule');
      if(voiceSample){
        voiceSample.insertAdjacentElement('afterend',block);
      }else if(voice){
        voice.insertAdjacentElement('afterend',block);
      }else if(schedule){
        schedule.insertAdjacentElement('beforebegin',block);
      }
    });
  }

  function render(data){
    if(!data || data.consultant_no !== consultantNo) return;
    const box=$('realtime-status-0000-3');
    const label=$('realtime-label-0000-3');
    const time=$('realtime-time-0000-3');
    const week=$('realtime-week-0000-3');
    if(!box||!label||!time||!week) return;

    const now=new Date();
    const rawUntil=parseIso(data.realtime_until || data.until);
    const online=!!data.online && (!rawUntil || Number.isNaN(rawUntil.getTime()) || rawUntil.getTime()>now.getTime());
    const rawSlots=Array.isArray(data.week_slots) ? data.week_slots : [];
    const slots=rawSlots.filter(slot=>isFutureOrCurrentSlot(slot,now) && isWithin7Days(slot,now));

    let next=(data.next_slot && isFutureOrCurrentSlot(data.next_slot,now) && isWithin7Days(data.next_slot,now)) ? data.next_slot : null;
    if(!next && slots.length) next=slots[0];

    if(realtimeExpiryTimer){
      clearTimeout(realtimeExpiryTimer);
      realtimeExpiryTimer=null;
    }
    if(online && rawUntil && !Number.isNaN(rawUntil.getTime())){
      realtimeExpiryTimer=setTimeout(()=>render(data),Math.max(0,rawUntil.getTime()-now.getTime())+250);
    }

    box.classList.toggle('is-online', online);
    if(online){
      label.textContent='🟢 今、お話できます';
      const until=fmtTime(data.realtime_until || data.until);
      time.textContent=until ? `${until}まで` : '現在お話できます';
    }else if(next){
      label.textContent='次にお話できる予定';
      time.textContent=next.label || fmtDateTime(next.start);
    }else{
      label.textContent='次にお話できる予定';
      time.textContent='日程調整中';
    }

    week.innerHTML='';
    if(slots.length){
      slots.forEach(slot=>{
        const li=document.createElement('li');
        li.textContent=slot.label || fmtDateTime(slot.start);
        week.appendChild(li);
      });
    }else{
      const li=document.createElement('li');
      li.textContent='日程調整中';
      week.appendChild(li);
    }
  }

  function jsonpStatus(){
    return new Promise((resolve,reject)=>{
      const cb='__lpStatus_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const script=document.createElement('script');
      const timer=setTimeout(()=>finish(new Error('jsonp timeout')),8000);
      function finish(err,data){
        clearTimeout(timer);
        try{ delete window[cb]; }catch(_){}
        script.remove();
        err ? reject(err) : resolve(data);
      }
      window[cb]=(data)=>finish(null,data);
      script.onerror=()=>finish(new Error('jsonp load failed'));
      const sep=STATUS_URL.includes('?')?'&':'?';
      script.src=STATUS_URL+sep+'callback='+encodeURIComponent(cb)+'&_='+Date.now();
      document.head.appendChild(script);
    });
  }

  function enforceSingleAudioPlayback(){
    const audios=[...document.querySelectorAll('audio')];
    audios.forEach(audio=>{
      audio.addEventListener('play',()=>{
        audios.forEach(other=>{
          if(other!==audio && !other.paused) other.pause();
        });
      });
    });
  }

  async function refresh(){
    try{
      const data=await jsonpStatus();
      lastStatusData=data;
      render(data);
    }catch(e){
      if(lastStatusData) render(lastStatusData);
      console.warn('Realtime status load failed',e);
    }
  }

  renderCustomerVoices();
  enforceSingleAudioPlayback();
  refresh();
  setInterval(refresh,60000);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){
      if(lastStatusData) render(lastStatusData);
      refresh();
    }
  });
})();
