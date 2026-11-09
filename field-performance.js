/* Bounded event windows and one final public snapshot per tactical step. */
(function(){const api=window.fieldSimulation,cache=new WeakMap();
 api.eventsAround=function(s,t,seconds=45){const events=s.events||[],entry=cache.get(events)||{length:0,last:-Infinity,sorted:true};if(events.length<entry.length){entry.length=0;entry.last=-Infinity;entry.sorted=true;}for(let i=entry.length;i<events.length;i++){if(events[i].t<entry.last)entry.sorted=false;entry.last=events[i].t;}entry.length=events.length;cache.set(events,entry);if(!entry.sorted)return events.filter(e=>e.t>=t-seconds&&e.t<=t);const bound=value=>{let lo=0,hi=events.length;while(lo<hi){const m=(lo+hi)>>>1;if(events[m].t<value)lo=m+1;else hi=m;}return lo};return events.slice(bound(t-seconds),bound(t+Number.EPSILON*Math.max(1,t)*2));};
 const capture=api.captureFrame,step=api.step,dirty=new Set();let depth=0;
 api.captureFrame=function(s){if(depth){dirty.add(s);return}return capture(s)};
 api.step=function(s,op){depth++;try{return step(s,op)}finally{depth--;if(!depth){for(const changed of dirty)capture(changed);dirty.clear();}}};
})();
