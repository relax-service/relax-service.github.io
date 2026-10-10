/**
 * LP001 schedule listing eligibility.
 * This does NOT use week_slots: v0.33 filters the active slot out of
 * week_slots when LINE WORKS "終了します" is pressed.
 *
 * Required backend addition: calendar_slots = independent, calendar-derived
 * waiting slots for this consultant (not modified by LINE WORKS online/offline).
 * Missing calendar_slots means UNKNOWN, never "zero eligible slots".
 * These rules only control card visibility, NOT the real-time online badge.
 */
(function(root, factory){
  'use strict';
  var api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.RelaxLpScheduleEligibility=api;
})(typeof globalThis!=='undefined' ? globalThis : this, function(){
  'use strict';
  function evaluate(calendarSlots, nowValue, days){
    if(!Array.isArray(calendarSlots)) return { known:false, eligible:false, count:0 };
    var now=(nowValue instanceof Date) ? nowValue.getTime() : new Date(nowValue).getTime();
    if(!Number.isFinite(now)) return { known:false, eligible:false, count:0 };
    var nDays=Number(days);
    if(!Number.isFinite(nDays) || nDays<=0) nDays=7;
    var endWindow=now+nDays*24*60*60*1000;
    var count=calendarSlots.filter(function(slot){
      if(!slot || slot.status==='cancelled') return false;
      var start=Date.parse(slot.start);
      var end=Date.parse(slot.end || slot.until);
      return Number.isFinite(start) && Number.isFinite(end) &&
        end>start && end>now && start<=endWindow;
    }).length;
    return { known:true, eligible:count>0, count:count };
  }
  return { evaluate:evaluate };
});
