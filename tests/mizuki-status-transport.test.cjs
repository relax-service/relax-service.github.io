'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('lp001/app.js','utf8');
const start=source.indexOf('  function jsonpStatus(){');
const end=source.indexOf('  function enforceSingleAudioPlayback()',start);
assert.ok(start>0&&end>start,'exercise the actual LP transport function');
function fixture(){
  let now=0,id=0,tag;
  const timers=new Map(),window={};
  const context={window,Promise,Date,Math,Error,encodeURIComponent,
    STATUS_URL:'https://example.invalid/exec?action=status',
    setTimeout(fn,ms){timers.set(++id,{at:now+ms,fn});return id;},
    clearTimeout(n){timers.delete(n);},
    document:{createElement(){return {remove(){this.removed=true;}};},head:{appendChild(t){tag=t;}}}};
  vm.createContext(context);
  vm.runInContext(source.slice(start,end)+';this.request=jsonpStatus;',context);
  let result='pending',value;
  const promise=context.request().then(v=>{result='ok';value=v;},e=>{result=e.message;});
  const callback=new URL(tag.src).searchParams.get('callback');
  async function tick(to){
    while(true){const due=[...timers].filter(([,t])=>t.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;
      now=due[1].at;timers.delete(due[0]);due[1].fn();await Promise.resolve();}
    now=to;await Promise.resolve();
  }
  return {window,tag,callback,promise,tick,timers,get result(){return result;},get value(){return value;},
    async reply(v){window[callback](v);await Promise.resolve();}};
}
(async()=>{
  let f=fixture();await f.tick(9430);assert.equal(f.result,'pending');
  await f.reply({calendar_ok:true});assert.equal(f.result,'ok');assert.equal(f.value.calendar_ok,true);
  assert.equal(f.tag.removed,true);assert.equal(f.window[f.callback],undefined);assert.equal(f.timers.size,0);
  f=fixture();await f.tick(19999);await f.reply({valid:true});assert.equal(f.result,'ok');
  f=fixture();await f.tick(20000);assert.equal(f.result,'jsonp timeout');assert.equal(f.tag.removed,true);
  await f.tick(21000);await f.reply({late:true});assert.equal(f.result,'jsonp timeout');assert.equal(f.value,undefined);
  await f.tick(80000);assert.equal(f.window[f.callback],undefined);assert.equal(f.timers.size,0);
  f=fixture();f.tag.onerror();await f.promise;assert.equal(f.result,'jsonp load failed');assert.equal(f.timers.size,0);
  f=fixture();const captured=f.window[f.callback];await f.reply({first:true});captured({second:true});
  f.tag.onerror();await f.promise;assert.equal(f.result,'ok');assert.equal(f.value.first,true);
  assert.equal(f.value.second,undefined);assert.equal(f.timers.size,0);
  console.log('PASS: delayed Google reply, deadline, late reply, cleanup, load failure and single settlement (6 cases)');
})().catch(e=>{console.error(e);process.exitCode=1;});
