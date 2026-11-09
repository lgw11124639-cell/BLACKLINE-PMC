/* Persistent, bounded regional demand. No timers, external services or real-world data. */
(function(){
 const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
 const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const report=(title,body)=>{state.reports.unshift({date:state.date,category:'작전',title,body});state.reports=state.reports.slice(0,160)};
 const definitions=[
  {id:'ravien',name:'라비엔 공화국 · 수도 회랑',security:52,conflict:55,instability:48,economy:56},
  {id:'sera',name:'세라 연안국 · 항만 산업지대',security:68,conflict:28,instability:35,economy:76},
  {id:'norden',name:'노르덴 자치령 · 산악 에너지 지구',security:44,conflict:66,instability:57,economy:48}
 ];
 const busy=o=>!['작전 완료','작전 보류'].includes(o.status);
 function init(){
  if(!state.contractWorld){
   state.contractWorld={version:1,lastDate:null,sequence:1000,regions:definitions.map(r=>({...r})),clients:[],events:[],specialties:{}};
   report('지역 정세 연동 개시','지역 치안·분쟁·정치 불안·경제와 고객 예산에 따라 계약이 발생합니다. 기존 작전과 저장 기록은 유지합니다.');
  }
  const w=state.contractWorld;
  for(const t of state.missionTemplates){
   let c=w.clients.find(x=>x.name===t.client);
   if(!c){c={id:'client-'+(w.clients.length+1),name:t.client,regionId:/세라/.test(t.client)?'sera':/노르덴/.test(t.client)?'norden':/라비엔/.test(t.client)?'ravien':w.regions[w.clients.length%w.regions.length].id,trust:50,budget:800000000,demand:40,lastOffer:null};w.clients.push(c)}
  }
  w.sequence=Math.max(w.sequence,...state.missions.map(m=>Number(m.id)||0));
  for(const op of state.operations){
   if(!op.contract){const m=state.missions.find(m=>m.id===op.missionId)||state.missionTemplates.find(m=>m.id===op.missionId);if(m)op.contract={...m}}
  }
  for(const m of state.missions){
   const c=w.clients.find(c=>c.name===m.client);if(!c)continue;
   m.clientId=m.clientId||c.id;m.regionId=m.regionId||c.regionId;
   if(!m.contractStatus)m.contractStatus='검토 가능';
   const op=state.operations.find(o=>o.missionId===m.id);
   if(op)m.contractStatus=busy(op)?'수주 완료':op.status==='작전 완료'?'정산 완료':'작전 보류';
  }
  return w;
 }
 function demandFor(t,r){
  if(t.type==='시설 보안')return (100-r.security)*.55+r.conflict*.45;
  if(t.type==='구조')return r.conflict*.65+r.instability*.35;
  if(t.type==='호송')return (100-r.security)*.45+r.economy*.3+r.instability*.25;
  return r.conflict*.7+r.instability*.3;
 }
 function issue(t,c,r,reason,eventId,parentId){
  const w=state.contractWorld;
  if(state.missions.some(m=>m.clientId===c.id&&m.type===t.type&&['검토 가능','수주 완료'].includes(m.contractStatus)))return null;
  if(state.missions.filter(m=>m.contractStatus==='검토 가능').length>=7)return null;
  const risk=Math.max(1,Math.min(4,t.risk+(r.conflict>=75?1:0)));
  if(state.reputation<(risk>=4?48:risk>=3?25:0))return null;
  const reward=Math.round(t.reward*(.8+r.conflict/200+c.trust/500)/1000000)*1000000;
  if(c.budget<reward)return null;
  const offer={...t,id:++w.sequence,templateId:t.id,clientId:c.id,regionId:r.id,risk,reward,receivedDate:state.date,expiresDate:addDays(state.date,eventId?3:7),contractStatus:'검토 가능',marketReason:reason,eventId:eventId||null,parentContractId:parentId||null,contractKind:parentId&&t.type==='시설 보안'?'후속 시설 방호':eventId?'긴급 단기':'일반 단기',durationDays:1};
  // Budget is reserved by an outstanding offer, released on withdrawal, consumed on settlement.
  c.budget-=reward;c.lastOffer=state.date;c.lastOfferAt=state.simClock?state.day*1440+state.simClock.minutes:null;c.demand=Math.max(0,c.demand-18);
  state.missions.push(offer);report('신규 계약 의뢰 접수 · '+offer.title,r.name+' / '+reason+' / '+offer.contractKind+' / 제안 마감 '+offer.expiresDate+' / 보수 '+money(reward)+'.');return offer;
 }
 function refresh(){
  const w=init();
  const ongoing=new Set(state.operations.filter(busy).map(o=>o.missionId));
  state.missions=state.missions.filter(m=>{
   if(ongoing.has(m.id))return true;
   if(['정산 완료','작전 보류'].includes(m.contractStatus)){
    const c=w.clients.find(c=>c.id===m.clientId);if(c&&m.templateId&&m.contractStatus==='작전 보류')c.budget+=m.reward;
    return false;
   }
   if(m.expiresDate&&m.expiresDate<state.date){
    const c=w.clients.find(c=>c.id===m.clientId);if(c&&m.templateId)c.budget+=m.reward;
    report('의뢰 철회 통보 · '+m.title,m.client+'의 제안 유효기간이 만료되었습니다.');return false;
   }return true;
  });
  const cycle=state.simClock?state.date+':'+Math.floor(state.simClock.minutes/30):state.date;
  if(w.lastCycle===cycle)return;
  const first=w.lastDate===null,newDay=w.lastDate!==state.date;w.lastDate=state.date;w.lastCycle=cycle;
  for(const r of w.regions){
   if(!first&&newDay){r.conflict=clamp(r.conflict+(r.instability>50?2:-1));r.security=clamp(r.security+(r.conflict>60?-2:1));r.economy=clamp(r.economy+(r.security<40?-1:r.security>65?1:0));r.instability=clamp(r.instability+(r.economy<40?1:r.security>65?-1:0))}
   if(r.conflict>=60&&(!r.lastEventDate||addDays(r.lastEventDate,5)<=state.date)){
    const e={id:'event-'+r.id+'-'+state.date,date:state.date,regionId:r.id,kind:'시설 위협',cause:'분쟁 강도 '+r.conflict+' · 치안 '+r.security,title:'무장세력 활동 증가로 기반시설 공격 위험 상승'};
    w.events.unshift(e);w.events=w.events.slice(0,30);r.lastEventDate=state.date;r.security=clamp(r.security-3);
    report('지역 사건 · '+r.name,e.title+' / '+e.cause);
   }
  }
  for(const c of w.clients){
   const r=w.regions.find(r=>r.id===c.regionId);
   if(!first&&newDay)c.budget=Math.min(1500000000,c.budget+Math.round(r.economy*150000));
   const templates=state.missionTemplates.filter(t=>t.client===c.name);
   c.demand=clamp(Math.max(...templates.map(t=>demandFor(t,r)))+(100-c.trust)*.1);
  }
  const candidates=[];
  for(const t of state.missionTemplates){
   const c=w.clients.find(c=>c.name===t.client),r=w.regions.find(r=>r.id===c.regionId);
   if(state.simClock&&c.lastOfferAt!=null){if(state.day*1440+state.simClock.minutes-c.lastOfferAt<180)continue}else if(c.lastOffer&&addDays(c.lastOffer,3)>state.date)continue;
   const event=t.type==='시설 보안'?w.events.find(e=>e.regionId===r.id&&e.date===state.date):null;
   candidates.push({t,c,r,event,score:demandFor(t,r)+c.trust*.1+(event?25:0)+(w.specialties[t.type]||0)*2});
  }
  candidates.sort((a,b)=>b.score-a.score||a.t.id-b.t.id);
  let added=0;
  for(const x of candidates){if(added>=2)break;if(x.score<35)continue;const reason=x.event?x.event.title:'고객 수요 '+Math.round(x.c.demand)+' · 치안 '+x.r.security+' · 경제 '+x.r.economy;
   if(issue(x.t,x.c,x.r,reason,x.event?.id))added++;
  }
 }
 function settle(op,m,result){
  if(op.worldSettlement)return;
  const w=init(),c=w.clients.find(c=>c.id===m.clientId||c.name===m.client),r=w.regions.find(r=>r.id===(m.regionId||c?.regionId));
  if(!c||!r){op.worldSettlement={date:state.date,legacy:true};return}
  const before={trust:c.trust,security:r.security,conflict:r.conflict};
  c.trust=clamp(c.trust+(result.success?8:-10)-(result.death?3:0));
  c.budget=Math.min(1500000000,c.budget+Math.max(0,(m.templateId?m.reward:0)-result.reward));
  r.security=clamp(r.security+(result.success?5:-4));
  r.conflict=clamp(r.conflict+(result.success?-3:3)+Math.min(3,result.resolution.hostileRetreated||0));
  w.specialties[m.type]=Math.max(0,Math.min(20,(w.specialties[m.type]||0)+(result.success?1:-1)));
  m.contractStatus='정산 완료';
  const offer=state.missions.find(x=>x.id===m.id);if(offer)offer.contractStatus='정산 완료';
  op.worldSettlement={date:state.date,clientId:c.id,regionId:r.id,before,after:{trust:c.trust,security:r.security,conflict:r.conflict}};
  result.contract={id:m.id,clientId:c.id,regionId:r.id,reason:m.marketReason,kind:m.contractKind};result.worldSettlement=op.worldSettlement;
  report('고객 평가 및 지역 정세 · '+m.title,(result.success?'계약 목표 달성':'계약 목표 미달')+' → 고객 신뢰 '+before.trust+' → '+c.trust+' / '+r.name+' 치안 '+before.security+' → '+r.security+' / 분쟁 '+before.conflict+' → '+r.conflict+'.');
  if(result.success&&c.trust>=58){
   const t=state.missionTemplates.find(t=>t.client===c.name&&t.type==='시설 보안')||state.missionTemplates.find(t=>t.client===c.name);
   if(t)issue(t,c,r,'선행 계약 '+m.id+' 목표 달성 및 고객 신뢰 '+c.trust+'에 따른 후속 의뢰',null,m.id);
  }
 }
 function panel(){
  const w=state.contractWorld;if(!w)return '';
  return '<h2>지역 정세 · 고객 수요</h2>'+w.regions.map(r=>'<div class="card"><strong>'+escapeHTML(r.name)+'</strong><p class="empty">치안 '+r.security+' · 분쟁 '+r.conflict+' · 정치 불안 '+r.instability+' · 경제 '+r.economy+'</p></div>').join('')+'<details class="card"><summary>고객 관계 및 계약 여력</summary>'+w.clients.map(c=>'<p class="empty">'+escapeHTML(c.name)+' · 신뢰 '+c.trust+' · 수요 '+c.demand+' · 가용 예산 '+money(c.budget)+'</p>').join('')+'</details>';
 }
 // Install after all existing department wrappers, keeping one complete daily transaction per tap.
 window.addEventListener('DOMContentLoaded',()=>{
  const advance=nextDay;let advancing=false;
  nextDay=function(){
   if(advancing)return;
   advancing=true;
   try{return advance()}finally{setTimeout(()=>{advancing=false},350)}
  };
  save();
 });
 window.contractWorld={refresh,settle,panel};
})();
