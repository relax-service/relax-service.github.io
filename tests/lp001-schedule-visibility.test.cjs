'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const helper=require('../lp001/schedule-eligibility.js');
const app=fs.readFileSync(path.join(__dirname,'../lp001/app.js'),'utf8');

function node(){
  return {
    hidden:false,
    style:{display:''},
    dataset:{},
    innerHTML:'',
    textContent:'',
    children:[],
    classList:{add(){},remove(){},toggle(){return false;}},
    appendChild(child){this.children.push(child);return child;},
    append(...children){this.children.push(...children);},
    addEventListener(){},
    remove(){},
    setAttribute(){},
    querySelector(){return null;},
    querySelectorAll(){return [];}
  };
}
function harness(initialPayload){
  const card=node(),container=node(),section=node(),link=node(),week=node();
  card.hidden=true;
  card.dataset.counselorId='0000-3';
  card.querySelector=(selector)=>selector==='.customer-voice'?node():null;
  card.closest=(selector)=>selector==='.counselors'?container:null;
  container.firstElementChild=card;
  container.querySelectorAll=(selector)=>selector==='.person'?[card]:[];
  container.closest=(selector)=>selector==='section'?section:null;
  container.appendChild=(el)=>{container.firstElementChild=el;return el;};
  container.prepend=(el)=>{container.firstElementChild=el;};
  const controls={
    'realtime-status-0000-3':node(),
    'realtime-label-0000-3':node(),
    'realtime-time-0000-3':node(),
    'realtime-week-0000-3':week
  };
  const listeners={};
  const docs={
    hidden:false,
    title:'',
    documentElement:{classList:{add(){}}},
    getElementById:(id)=>controls[id]||null,
    querySelector(selector){
      if(selector==='.counselors')return container;
      if(selector==='.person[data-counselor-id="0000-3"]')return card;
      return null;
    },
    querySelectorAll(selector){
      if(selector==='.counselors .person')return [card];
      if(selector==='a[href="#people"]')return [link];
      return [];
    },
    createElement:()=>node(),
    addEventListener(event,cb){listeners[event]=cb;},
    head:{appendChild(script){
      const param=new URL(script.src).searchParams.get('callback');
      queueMicrotask(()=>{
        if(currentPayload instanceof Error)script.onerror();
        else win[param](currentPayload);
      });
    }}
  };
  let currentPayload=initialPayload;
  const win={LP_CONFIG:{realtime:{statusUrl:'https://example.invalid/exec?action=status',consultantNo:'0000-3',days:7}},RelaxLpScheduleEligibility:helper};
  const ctx={
    document:docs,
    window:win,
    console:{warn(){}},
    setTimeout:()=>1,
    clearTimeout(){},
    setInterval:()=>1,
    URL,
    Date,
    Intl,
    Promise
  };
  vm.runInNewContext(app,ctx,{filename:'lp001/app.js'});
  return {
    card,container,section,link,controls,
    setPayload(payload){currentPayload=payload;},
    refresh(){assert.equal(typeof listeners.visibilitychange,'function');listeners.visibilitychange();},
    async flushed(){await new Promise(resolve=>setImmediate(resolve));}
  };
}
function slot(hoursBeforeStart,hoursUntilEnd){
  const now=Date.now();
  return {start:new Date(now+hoursBeforeStart*3600000).toISOString(),end:new Date(now+hoursUntilEnd*3600000).toISOString()};
}
function payload(slots,{online=false,weekSlots=slots,ok=true}={}){
  return {consultant_no:'0000-3',calendar_ok:ok,online,week_slots:weekSlots,calendar_slots:slots,next_slot:null,realtime_until:null};
}

test('before API response, only-counselor card and ticket anchor are hidden',()=>{
  const ui=harness(payload([slot(1,2)]));
  assert.equal(ui.card.hidden,true);
  assert.equal(ui.section.hidden,true);
  assert.equal(ui.link.hidden,true);
});

test('confirmed zero schedule keeps card, purchase path, and section hidden',async()=>{
  const ui=harness(payload([]));
  await ui.flushed();
  assert.equal(ui.card.hidden,true);
  assert.equal(ui.section.hidden,true);
  assert.equal(ui.link.hidden,true);
});

test('registering one future slot restores counselor card and purchase path',async()=>{
  const ui=harness(payload([]));
  await ui.flushed();
  ui.setPayload(payload([slot(1,2)]));
  ui.refresh();
  await ui.flushed();
  assert.equal(ui.card.hidden,false);
  assert.equal(ui.section.hidden,false);
  assert.equal(ui.link.hidden,false);
});

test('LINE WORKS OFF drops week_slots, but current calendar slot retains card',async()=>{
  const current=slot(-1,1);
  const ui=harness(payload([current],{online:false,weekSlots:[]}));
  await ui.flushed();
  assert.equal(ui.card.hidden,false);
  assert.notEqual(ui.controls['realtime-label-0000-3'].textContent,'🟢 今、お話できます');
});

test('API calendar failure/null slots hides purchase, not interpreted as confirmed zero',async()=>{
  const ui=harness(payload([slot(1,2)]));
  await ui.flushed();
  assert.equal(ui.card.hidden,false);
  ui.setPayload(payload(null,{ok:false,weekSlots:[]}));
  ui.refresh();
  await ui.flushed();
  assert.equal(ui.card.hidden,true);
  assert.equal(ui.link.hidden,true);
});

test('transport timeout after previous success does not retain purchasable stale card',async()=>{
  const ui=harness(payload([slot(1,2)]));
  await ui.flushed();
  assert.equal(ui.card.hidden,false);
  ui.setPayload(new Error('simulated network error'));
  ui.refresh();
  await ui.flushed();
  assert.equal(ui.card.hidden,true);
  assert.equal(ui.link.hidden,true);
});

test('old GAS response without calendar_slots fails closed until API upgraded',async()=>{
  const data=payload([slot(1,2)]);
  delete data.calendar_slots;
  const ui=harness(data);
  await ui.flushed();
  assert.equal(ui.card.hidden,true);
  assert.equal(ui.link.hidden,true);
});
