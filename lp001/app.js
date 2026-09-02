(function(){
  const STATUS_URL = 'https://script.google.com/macros/s/AKfycbyl5jrBh-O9Zp2eiqddhQykp21fiEDpZBrxJ89byy57cCQq5nsPMZN3yl5K3QdPMjrt3g/exec?action=status';
  const consultantNo = '0000-3';

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
    return true;
  }
  function isWithin7Days(slot, now){
    const st=slotStart(slot);
    if(!st || Number.isNaN(st.getTime())) return true;
    return st.getTime() <= now.getTime() + 7*24*60*60*1000;
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

    let next=(data.next_slot && isFutureOrCurrentSlot(data.next_slot,now)) ? data.next_slot : null;
    if(!next && slots.length) next=slots[0];

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

  async function refresh(){
    try{
      const data=await jsonpStatus();
      render(data);
    }catch(e){
      console.warn('Realtime status load failed',e);
    }
  }

  refresh();
  setInterval(refresh,60000);
})();
