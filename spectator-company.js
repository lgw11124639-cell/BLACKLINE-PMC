/* Autonomous spectator-only company director. No owner budget or mission approvals. */
(function(){
 if(!state.autonomousCompany)state.autonomousCompany={enabled:true,lastReview:null};
 const config=state.autonomousCompany;config.enabled=true;
 const originalMissions=missions,originalHome=home,originalNext=nextDay;
 const active=()=>window.blacklineAvailablePersonnel?window.blacklineAvailablePersonnel():state.team.filter(p=>!p.dead&&!p.retired&&!p.injured&&!p.onMission&&!p.supportReservation);
 const report=(category,title,body,detail)=>{state.reports.unshift({date:state.date,category,title,body,...(detail?{detail}:{})});state.reports=state.reports.slice(0,90)};
 const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 function budgetFor(m){
  const team=active().length;
  const risk=Math.max(1,Number(m.risk)||1);
  const proposed=Math.round((5500000+risk*4500000+team*1300000)/1000000)*1000000;
  const cashLimit=Math.max(0,Math.floor((state.cash-30000000)*.22/1000000)*1000000);
  const rewardLimit=Math.max(0,Math.floor((Number(m.reward)||0)*.7/1000000)*1000000);
  return Math.min(200000000,proposed,cashLimit,rewardLimit);
 }
 function plan(m){
  const people=active();const staffing=window.blacklineCheckStaffing?.(m,people);if(staffing&&!staffing.ready){const demand=state.staffingDemand=state.staffingDemand||{};demand.minimum=staffing.requirement.minimum;demand.missing=staffing.missing;demand.mission=m.title;demand.reason=staffing.requirement.reason;demand.date=state.date;const key=state.date+':'+staffing.missing.join(',');if(demand.reportedDate!==state.date){demand.reportedDate=state.date;demand.reported={}}demand.reported=demand.reported||{};if(!demand.reported[key]){demand.reported[key]=true;demand.reportKey=key;report('작전','작전본부 출동 편제 보류',m.title+' 검토: '+staffing.missing.join(' · ')+'. '+staffing.requirement.reason+' 확보 후 재검토합니다.');save()}return null}if(people.length<2||state.ammo<120||state.med<1)return null;
  const leader=people.find(p=>/팀장|지휘/.test(p.role||''))||people.find(p=>p.id===state.leaderId)||people[0];
  const risk=Math.max(1,Number(m.risk)||1);
  const budget=budgetFor(m);
  if(budget<3000000)return null;
  const op={id:'OP-'+String(state.day).padStart(4,'0')+'-'+m.id,missionId:m.id,leaderId:leader.id,leaderName:leader.name,teamIds:people.slice(0,Math.min(12,Math.max(staffing?.requirement.minimum||6,people.length))).map(p=>p.id),created:state.date,deployDate:addDays(state.date,risk>1?4:3),rehearsalDate:addDays(state.date,1),method:risk>1?(m.type==='구조'?'헬기 수송':'지상 차량 이동'):'지상 차량 이동',rehearsal:'통신·후송·민간인 보호 모의훈련',status:'작전 승인',briefing:'작전본부가 자율적으로 의뢰 조건을 검토했습니다.',readiness:75,rehearsalQuality:null,rehearsalIssue:null,rules:'민간인 보호 및 인원 안전 우선. 현장지휘관은 위험 시 임무를 중단할 수 있습니다.',air:risk>1?'restricted':'off',artillery:risk>=3?'restricted':'off',budget};
  op.departmentBudget={personnel:Math.round(budget*.22),logistics:Math.round(budget*.25),transport:Math.round(budget*.18),medical:Math.round(budget*.15),reserve:budget-Math.round(budget*.22)-Math.round(budget*.25)-Math.round(budget*.18)-Math.round(budget*.15)};
  op.contract={...m,mapId:window.fieldSimulation?.selectMap?.(m)?.id||m.mapId};
  if(state.simClock){const now=state.day*1440+state.simClock.minutes;op.rehearsalAt=now+.25;op.deployAt=now+.75;op.rehearsalDate=state.date;op.deployDate=state.date}
  return op;
 }
 function review(force=false){
  window.blacklineReviewMissionPlans?.();
  if(!force&&config.lastReview===state.date)return;
  config.lastReview=state.date;
  // Do not replace an active operation or flood reports when resources are inadequate.
  if(state.pending)state.pending=null;
  const busy=state.operations.some(o=>!['작전 완료','작전 보류'].includes(o.status));
  if(busy||!state.missions.length)return;
  const candidates=state.missions.filter(m=>m.contractStatus==='검토 가능'&&(!m.expiresDate||m.expiresDate>=state.date)&&!state.operations.some(o=>o.missionId===m.id&&o.status!=='작전 완료'&&o.status!=='작전 보류'));
  const ordered=candidates.slice().sort((a,b)=>(Number(b.reward)||0)/(Math.max(1,Number(b.risk)||1))-(Number(a.reward)||0)/(Math.max(1,Number(a.risk)||1)));
  for(const m of ordered){
   const op=plan(m);if(!op)continue;
   if(window.blacklinePrepareRecon&&!window.blacklinePrepareRecon(op,m))continue;
   m.contractStatus='수주 완료';
   state.operations.unshift(op);
   report('작전','작전본부 자율 수주 · '+m.title,'작전본부가 의뢰의 수익성과 위험도를 평가하여 자체 수주했습니다. '+op.leaderName+' 계획 담당 지정. 사전 정찰 후 본대 편성과 투입 여부를 재검토합니다. 예산 상한 '+money(op.budget)+'.',{summary:'작전본부가 위험도·계약 보수·투입 가능 인원을 종합 검토하여 자체 수주했습니다.',sections:[{title:'수주 검토',items:['의뢰명: '+m.title,'계약 보수: '+money(m.reward),'위험도: '+m.risk,'가용 인원: '+active().length+'명']},{title:'현장 운영 계획',items:['현장지휘관: '+op.leaderName,'사전 연습: '+op.rehearsalDate,'예정 투입일: '+op.deployDate,'작전 예산 상한: '+money(op.budget)]},{title:'운영 원칙',items:['현장지휘관이 작전 중 자율적으로 판단합니다.','투입 인원의 안전과 민간인 보호를 우선합니다.']}],metrics:[{label:'계약 보수',value:money(m.reward)},{label:'예산 상한',value:money(op.budget)},{label:'투입 예정',value:op.deployDate}]});
   report('재무','재무본부 자율 예산 편성 · '+op.id,'총 한도 '+money(op.budget)+'. 인사 '+money(op.departmentBudget.personnel)+', 군수 '+money(op.departmentBudget.logistics)+', 수송 '+money(op.departmentBudget.transport)+', 의무 '+money(op.departmentBudget.medical)+', 예비비 '+money(op.departmentBudget.reserve)+'. 실제 비용은 작전 집행 후 정산합니다.',{summary:'재무본부가 회사 가용 자금과 계약 수익을 기준으로 작전 예산을 편성했습니다.',sections:[{title:'예산 배분 내역',items:[['인사',op.departmentBudget.personnel],['군수',op.departmentBudget.logistics],['수송',op.departmentBudget.transport],['의무',op.departmentBudget.medical],['예비비',op.departmentBudget.reserve]].map(([n,v])=>n+': '+money(v))},{title:'집행 및 통제',items:['예산은 사전 확정된 최대 집행 한도이며 즉시 지출되는 금액이 아닙니다.','현장 지원 요청은 예산 한도 내에서 자율 결정합니다.','실제 지출은 작전 종료 후 별도 정산 보고합니다.']}],metrics:[{label:'총 예산 한도',value:money(op.budget)},{label:'예비비',value:money(op.departmentBudget.reserve)}]});
   save();render();break;
  }
 }
 missions=function(){
  const activeOps=state.operations.filter(o=>!['작전 완료','작전 보류'].includes(o.status));
  return '<h2>작전본부 · 자동 운영 현황</h2><p class="empty">의뢰 수주, 예산 편성, 지휘관 지정, 출동과 지원 요청은 부서가 자체 결정합니다. 사장은 작전과 보고서를 관전합니다.</p>'+(activeOps.length?activeOps.map(o=>'<div class="card"><div class="line"><strong>'+escapeHTML(o.id)+'</strong><span class="tag">'+escapeHTML(o.status)+'</span></div><p class="empty">현장지휘관 '+escapeHTML(o.leaderName)+' · '+escapeHTML(window.fieldSimulation?.selectMap?.(o.contract||{}).name||'현장')+' · '+escapeHTML(window.blacklineMissionPlanSummary?.(o)||('투입 '+o.deployDate))+' · 예산 한도 '+money(o.budget)+'</p></div>').join(''):'<div class="card"><p class="empty">현재 준비 중인 작전이 없습니다. 작전본부가 의뢰와 가용 자원을 검토하고 있습니다.</p></div>')+window.contractWorld.panel()+'<h2>의뢰 검토 현황</h2>'+state.missions.map(m=>'<div class="card"><strong>'+escapeHTML(m.title)+'</strong><p class="empty">계약 보수 '+money(m.reward)+' · '+escapeHTML(m.contractKind||'기존 계약')+'<br>접수 '+escapeHTML(m.receivedDate||'기존 제안')+' · 마감 '+escapeHTML(m.expiresDate||'별도 협의')+'<br>'+escapeHTML(m.marketReason||'기존 거래처 의뢰')+'<br>'+ (activeOps.some(o=>o.missionId===m.id)?'작전 준비 중':'작전본부 검토 대상')+'</p></div>').join('');
 };
 home=function(){return originalHome()+'<div class="card"><h3>회사 운영 권한</h3><p class="empty">완전 관전형 · 작전본부, 인사본부, 군수본부, 재무본부가 자체적으로 의사결정합니다. 사장은 진행 현황과 작전 결과를 확인합니다.</p></div>'};
 nextDay=function(){originalNext();review();save();render()};
 window.blacklineReviewCompany=()=>review(true);
 // Disable legacy owner action entrypoints while retaining automatic simulation internals.
 window.prepare=function(){};
 window.approveScheduled=function(){};
 window.buyWeapon=function(){};
 window.approveStandardRifle=function(){};
 // Do not call review during initial load before all plugins have initialized.
 // Existing saves and pending operations remain untouched on app launch.
 render();
})();