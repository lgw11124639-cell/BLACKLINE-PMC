/* OVERWATCH state boundary. No browser timers or legacy global-state dependencies. */
(function(root){
 'use strict';
 const GAME='BLACKLINE_OVERWATCH',SCHEMA=1;
 const LIMITS=Object.freeze({headquarters:10,deploymentMinimum:2,deploymentMaximum:6,squads:3});
 const CALLSIGNS=Object.freeze(['ALPHA','BRAVO','CHARLIE']);
 const SPECIALTIES=Object.freeze(['firstAid','communications','reconnaissance','drone']);
 const clone=x=>JSON.parse(JSON.stringify(x));
 function requireThat(ok,message){if(!ok)throw new Error(message);}
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const text=(x,max=160)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
 const finite=(x,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
 function validate(s){
  requireThat(object(s)&&s.game===GAME,'OVERWATCH 저장 파일이 아닙니다.');
  requireThat(s.schemaVersion===SCHEMA,'현재 단계에서 지원하지 않는 저장 버전입니다. 원본은 변경하지 않았습니다.');
  requireThat(text(s.campaignId)&&Number.isSafeInteger(s.revision)&&s.revision>=0,'저장 식별자 또는 revision이 잘못되었습니다.');
  for(const k of ['createdAt','updatedAt'])requireThat(text(s[k])&&Number.isFinite(Date.parse(s[k])),'저장 날짜가 잘못되었습니다.');
  requireThat(object(s.headquarters)&&text(s.headquarters.name,60)&&finite(s.headquarters.funds),'본부 정보가 잘못되었습니다.');
  requireThat(Array.isArray(s.members)&&s.members.length<=LIMITS.headquarters,'본부 인원은 최대 10명입니다.');
  const ids=new Set();
  for(const m of s.members){
   requireThat(object(m)&&text(m.id)&&!ids.has(m.id)&&text(m.name,60),'중복되거나 잘못된 대원 정보입니다.');ids.add(m.id);
   requireThat(['observer','sniper'].includes(m.specialty),'대원의 주특기는 관측수 또는 저격수입니다.');
   requireThat(Array.isArray(m.secondarySpecialties)&&m.secondarySpecialties.length<=2&&new Set(m.secondarySpecialties).size===m.secondarySpecialties.length&&m.secondarySpecialties.every(k=>SPECIALTIES.includes(k)),'부특기는 중복 없이 최대 2개입니다.');
   requireThat(Number.isInteger(m.age)&&finite(m.age,18,85),'대원 나이가 잘못되었습니다.');
   requireThat(['standby','resting','training','treatment','deceased','resigned','retired'].includes(m.status),'현재 단계에서 복원할 수 없는 대원 상태입니다.');
   requireThat(object(m.skills)&&['shooting','observation','composure','fitness','judgment','teamwork'].every(k=>finite(m.skills[k],0,100)),'대원 능력치가 잘못되었습니다.');
   requireThat(finite(m.experience)&&finite(m.fatigue,0,100)&&finite(m.stress,0,100)&&Array.isArray(m.injuries)&&Array.isArray(m.history),'대원 상태 또는 기록이 잘못되었습니다.');
  }
  requireThat(Array.isArray(s.squads)&&s.squads.length<=3,'저격조는 최대 3개입니다.');
  const assigned=new Set(),names=new Set();
  for(const q of s.squads){
   requireThat(object(q)&&CALLSIGNS.includes(q.callsign)&&!names.has(q.callsign),'저격조 호출부호가 잘못되었습니다.');names.add(q.callsign);
   for(const [key,role]of [['observerId','observer'],['sniperId','sniper']]){const m=s.members.find(m=>m.id===q[key]);requireThat(m&&m.specialty===role&&m.status==='standby'&&!assigned.has(m.id),'관측수·저격수 편제 또는 중복 배정이 잘못되었습니다.');assigned.add(m.id);}
  }
  requireThat(assigned.size<=6,'출격 인원은 최대 6명입니다.');
  requireThat(s.activeMission===null,'실시간 작전 저장은 전장 엔진 연결 단계에서 지원합니다. 원본을 보존합니다.');
  requireThat(Array.isArray(s.contracts)&&s.contracts.length===0,'계약 데이터는 작전 시스템 연결 단계에서 지원합니다.');
  requireThat(object(s.inventory)&&Array.isArray(s.inventory.items)&&s.inventory.items.length===0,'장비 데이터는 장비 시스템 연결 단계에서 지원합니다.');
  requireThat(Array.isArray(s.records)&&s.records.length<=500,'본부 기록이 잘못되었습니다.');
  const eventIds=new Set();for(const e of s.records){requireThat(object(e)&&text(e.id)&&!eventIds.has(e.id)&&['hq-established','campaign-imported'].includes(e.type)&&finite(e.time,0,0)&&text(e.message,1000),'기록 또는 사건 식별자가 잘못되었습니다.');eventIds.add(e.id);}
  requireThat(object(s.clock)&&finite(s.clock.elapsedSeconds)&&typeof s.clock.paused==='boolean'&&[1,2,4].includes(s.clock.speed)&&typeof s.clock.emergencyPause==='boolean','시계 설정이 잘못되었습니다.');
  requireThat(s.clock.paused===true&&s.clock.elapsedSeconds===0,'1단계에서는 전장 시간을 진행하지 않습니다.');
  requireThat(object(s.settings)&&typeof s.settings.reducedMotion==='boolean','설정이 잘못되었습니다.');
  requireThat(object(s.ui)&&['headquarters','personnel','contracts','equipment','records','storage'].includes(s.ui.tab),'화면 정보가 잘못되었습니다.');
  return s;
 }
 function createCampaign({id,at=new Date().toISOString()}={}){
  requireThat(text(id),'캠페인 식별자가 필요합니다.');
  return validate({game:GAME,schemaVersion:SCHEMA,campaignId:id,revision:0,createdAt:at,updatedAt:at,headquarters:{name:'BLACKLINE 본부',funds:0},members:[],squads:[],contracts:[],inventory:{items:[]},activeMission:null,clock:{elapsedSeconds:0,paused:true,speed:1,emergencyPause:true},settings:{reducedMotion:false},ui:{tab:'headquarters'},records:[{id:id+'-established',type:'hq-established',time:0,message:'OVERWATCH 본부 기록을 개설했습니다.'}]});
 }
 const api={GAME,SCHEMA,LIMITS,CALLSIGNS,SPECIALTIES,clone,validate,createCampaign};root.OverwatchCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
