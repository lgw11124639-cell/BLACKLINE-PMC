
/* BLACKLINE PMC: mission planning, rehearsals, deployment schedule, casualties, recruitment delegation. */
(function(){
 const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const report=(category,title,body,amount,detail)=>{state.reports.unshift({date:state.date,category,title,body,...(amount===undefined?{}:{amount}),...(detail?{detail}:{})});state.reports=state.reports.slice(0,160)};
 const available=()=>state.team.filter(p=>!p.dead&&!p.retired&&!p.injured&&!p.onMission);
 const leader=()=>state.team.find(p=>p.id===state.leaderId&&!p.dead)||available()[0];
 const methodFor=(m)=>m.type==='정밀 지원'?'지상 관측팀 및 원거리 경계':m.type==='무장세력 대응'?'현장 안전 확보 및 경계 이동':(m.type==='호송'||m.id===1)?'지상 차량 이동':(m.type==='구조'||m.id===2)?'항공 수송 후 도보 이동':'지상 차량 이동 및 현장 인수';
 const teamReadiness=members=>{if(!members.length)return 0;return Math.round(members.reduce((sum,p)=>{const e=personnelEvaluation(p);return sum+e.teamwork*.23+e.awareness*.22+e.endurance*.17+e.tactics*.20+e.leadership*.18},0)/members.length)};
 const rehearsalFor=(m)=>m.type==='정밀 지원'?'표적 식별·민간인 보호 및 교전 제한 검증':m.type==='무장세력 대응'?'위협 식별·민간인 대피 및 작전 중단 기준 연습':(m.type==='호송'||m.id===1)?'호송 절차 및 응급상황 대응 연습':(m.type==='구조'||m.id===2)?'민간인 보호·구조 및 후송 모의훈련':'출입통제 및 시설 대피 모의훈련';
 const planFor=(m)=>({id:'OP-'+String(state.day).padStart(4,'0')+'-'+m.id,missionId:m.id,leaderId:leader()?.id,leaderName:leader()?.name||'미지정',teamIds:available().map(p=>p.id),created:state.date,deployDate:addDays(state.date,m.risk>1?4:3),rehearsalDate:addDays(state.date,1),method:methodFor(m),rehearsal:rehearsalFor(m),status:'계획 검토',briefing:'작전 목표와 인명 보호 기준을 최우선으로 합니다. 팀별 역할, 의뢰기관 연락체계, 현장 위험 요소, 비상 철수 기준을 사전에 확인합니다.',readiness:teamReadiness(available()),rehearsalQuality:null,rehearsalIssue:null,rules:'민간인 보호 및 안전 기준 준수. 현장 상황이 악화되면 팀장은 임무 중단 및 복귀를 결정할 수 있습니다.',air:'restricted',artillery:'off',budget:20000000});
 if(!Array.isArray(state.operations))state.operations=[];
 if(!state.recruitPolicy)state.recruitPolicy={enabled:false,minTeam:4,maxAnnualSalary:110000000,monthlyLimit:1};
 if(!Array.isArray(state.fallen))state.fallen=[];
 state.team.forEach(p=>{if(p.dead)p.injured=false});
 const oldNextDay=nextDay;
 function autoRecruit(){
  const policy=state.recruitPolicy;if(!policy.enabled)return;
  const living=state.team.filter(p=>!p.dead&&!p.retired);if(living.length>=policy.minTeam)return;
  const last=state.lastAutoRecruit||'0000-00';if(last===state.date.slice(0,7))return;
  const p=state.candidates.filter(p=>p.salary<=policy.maxAnnualSalary&&state.cash>=p.salary/12).sort((a,b)=>b.skill-a.skill)[0];if(!p)return;
  p.dead=false;p.injured=false;p.loadout={primary:'미지급',secondary:'미지급',armor:'미지급',helmet:'미지급',radio:'미지급'};
  state.team.push(p);state.candidates=state.candidates.filter(x=>x.id!==p.id);state.lastAutoRecruit=state.date.slice(0,7);
  if(!leader())state.leaderId=p.id;
  report('인사','인사팀 자동 계약 체결 보고',p.name+' 용병을 승인된 연봉 상한 내에서 채용했습니다. 연봉 '+money(p.salary)+'.');
 }
 const absoluteTime=()=>state.day*1440+(state.simClock?.minutes||0);
 function runScheduled(){
  for(const op of state.operations){
   if(op.status==='작전 완료')continue;
   if((op.status==='작전 승인'||op.status==='추가 연습 필요')&&(op.rehearsalAt?absoluteTime()>=op.rehearsalAt:state.date>=op.rehearsalDate)){
    op.rehearsalComplete=true;
    const roll=(state.day*13+op.missionId*17+op.teamIds.length*7+(op.rehearsalAt?(op.rehearsalAttempts||0)*19:0))%100;
    if(op.rehearsalAt)op.rehearsalAttempts=(op.rehearsalAttempts||0)+1;
    const readiness=teamReadiness(op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(Boolean));
    op.readiness=readiness;op.rehearsalQuality=readiness>=82?'우수':readiness>=68?'양호':'보완 필요';
    if(roll>readiness){op.rehearsalIssue='모의훈련에서 통신 및 현장 대응 절차의 보완 사항이 발견되었습니다.';op.status='추가 연습 필요';if(op.rehearsalAt){op.rehearsalAt=absoluteTime()+1;op.deployAt=absoluteTime()+3}else{op.deployDate=addDays(op.deployDate,2);op.rehearsalDate=addDays(state.date,1)};report('작전','사전 연습 문제점 보고 · '+op.id,op.leaderName+' 팀장: '+op.rehearsalIssue+' 작전 투입일을 '+op.deployDate+'로 연기했습니다.');}
    else {op.status='사전 연습 완료';report('작전','팀장 사전 연습 결과 보고 · '+op.id,op.leaderName+' 팀장이 '+op.rehearsal+'을 완료했습니다. 평가: '+op.rehearsalQuality+'.');}
   }
   if((op.status==='사전 연습 완료'||op.status==='작전 승인')&&(op.deployAt?absoluteTime()>=op.deployAt:state.date>=op.deployDate)){
    const m=op.contract||state.missions.find(x=>x.id===op.missionId);
    if(!m){op.status='작전 보류';continue}
    const members=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(p=>p&&!p.dead&&!p.retired&&!p.injured);
    if(window.blacklineReviewArmory&&members.some(p=>!p.loadout?.primary||p.loadout.primary==='미지급')){window.blacklineReviewArmory();if(members.some(p=>!p.loadout?.primary||p.loadout.primary==='미지급')){op.status='작전 보류';report('군수','지급 총기 확보 대기 · '+op.id,'미지급 인원이 있어 출동을 보류했습니다. 군수본부가 실제 총기와 탄약을 확보한 뒤 재검토합니다.');continue}}
    const staffing=window.blacklineCheckStaffing?.(m,members);if(members.length<Math.max(2,op.requiredStaffing?.minimum||0)||staffing&&!staffing.ready){op.status='작전 보류';report('작전','작전 투입 보류 · '+op.id,'출동 가능한 인원이 부족합니다. 팀장에게 재편성 보고를 요청했습니다.');continue}
    if(state.ammo<(window.fieldSimulation.ammoPlan?.(members).total||120)||state.med<1){window.blacklineReviewMunitions?.();if(state.ammo<(window.fieldSimulation.ammoPlan?.(members).total||120)||state.med<1){op.status='작전 보류';report('군수','작전 투입 보류 · '+op.id,'보직별 휴대 탄약 또는 의료물자가 부족하여 투입을 중단했습니다.');continue}}
    if(op.status!=='현장 진행 중'){
      op.status='현장 진행 중';
      op.fieldProgress={stage:0,seed:op.reconSeed??((state.day*7919+op.missionId*101+members.length*37)%997),startedDay:state.day,startedDate:state.date,teamSnapshot:members.map(p=>p.id),riskShift:0,lateRisk:0,events:[]};
      if(window.fieldSimulation){
        op.fieldProgress.reservedTacticalAmmo=Math.min(state.ammo,window.fieldSimulation.ammoPlan?.(members).total||Math.max(120,members.length*45));
        state.ammo-=op.fieldProgress.reservedTacticalAmmo;
        op.fieldProgress.reservedTacticalMed=Math.min(state.med,members.length+members.filter(p=>/의무/.test(p.role)).length*2);state.med-=op.fieldProgress.reservedTacticalMed;
        op.fieldProgress.tactical=window.fieldSimulation.create(op,m,members,op.fieldProgress.reservedTacticalAmmo,{medicalBudget:op.fieldProgress.reservedTacticalMed});
        window.blacklineApplyTaskGroups?.(op,op.fieldProgress.tactical);
      }
      save();render();
    }
    startField(op);
   }
  }
 }

 const fieldTimers=new Map();
 const processingFields=new Set();
 const stageLabels=['현장 투입 및 상태 확인','현장 위험 평가','지휘관 상황 판단','지원·후속 상황 확인'];
 function fieldStep(op){
   if(window.blacklineImportingSave)return;
   if(op.status!=='현장 진행 중'){clearInterval(fieldTimers.get(op.id));fieldTimers.delete(op.id);return}
   if(state.simClock?.paused||document.hidden||document.body.classList.contains('start-visible'))return;
   const fp=op.fieldProgress;window.fieldSimulation.reconcileSupport?.(op);if(!fp){clearInterval(fieldTimers.get(op.id));fieldTimers.delete(op.id);return;}
   if(processingFields.has(op.id))return;
   processingFields.add(op.id);
   try{
   if(fp.tactical){
     if(state.simClock?.paused||document.hidden||document.body.classList.contains('start-visible'))return;
     window.blacklineAuditField?.(op);window.fieldSimulation.step(fp.tactical,op);
     if(fp.tactical.done)fp.stage=4;
     const threshold=fp.tactical.done?fp.tactical.time:((fp.tactical.version>=2?[20,240,480,650]:[13,91,169,247])[fp.stage]??fp.tactical.duration);
     if(fp.tactical.time<threshold||fp.stage>=4&&!fp.tactical.done){save();window.dispatchEvent(new Event('blackline-field-update'));return}
   }
   const stage=fp.stage;
   if(stage>=stageLabels.length){
     clearInterval(fieldTimers.get(op.id));fieldTimers.delete(op.id);
     const m=op.contract||state.missions.find(x=>x.id===op.missionId);
     const members=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(Boolean);
     if(!m||members.length<2&&!fp.tactical){if(fp.reservedTacticalMed){state.med+=fp.reservedTacticalMed;fp.reservedTacticalMed=0;}if(fp.reservedTacticalAmmo){state.ammo+=Math.max(0,fp.reservedTacticalAmmo-(fp.tactical?.ammoUsed||0));fp.reservedTacticalAmmo=0;}if(op.fieldProgress?.reservedSupportCost){state.cash+=op.fieldProgress.reservedSupportCost;op.fieldProgress.reservedSupportCost=0;}op.status='작전 보류';report('작전','작전 중단 보고 · '+op.id,'작전 진행 중 투입 가능 인원이 부족하거나 의뢰가 종료되어 작전을 보류했습니다.');save();render();return}
     if(fp.finalized||op.resolution){op.status='작전 완료';save();render();return;}
     finalizeOperation(op,m,members);fp.finalized=true;save();render();return;
   }
   // Each checkpoint is evaluated only when its timer fires, not before deployment.
   const roll=(fp.seed+stage*173+(fp.teamSnapshot?.length||op.teamIds.length)*11)%100;
   const riskShift=roll<20?7:roll<45?3:roll>86?-4:0;
   fp.riskShift+=riskShift;
   if(stage===1)fp.situation=roll<25?'예상 밖의 현장 위험':roll<55?'현장 상황 변화':'계획 범위 내 상황';
   if(stage===2){
     const members=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(Boolean);
     const readiness=teamReadiness(members);
     const lead=members.find(p=>p.id===op.leaderId)||members[0];
     const leadScore=lead?personnelEvaluation(lead).leadership:50;
     fp.commandDecision=fp.tactical?(fp.tactical.retreat?'철수':'계속'):readiness-fp.riskShift-((op.contract||state.missions.find(m=>m.id===op.missionId))?.risk||1)*9<36&&leadScore>=40?'철수':'계속';
   }
   if(stage===3){
     if(fp.supportOrders&&fp.medical&&fp.reorganization){fp.stage=4;save();render();return;}
     if(roll<30)fp.lateRisk+=6;
     const m=op.contract||state.missions.find(x=>x.id===op.missionId);
     const requests=[];const observedEnemies=fp.tactical?.units.filter(u=>!u.inside&&!u.roadOnly&&u.hp>0&&fp.tactical.contacts?.[u.id]?.visible&&(u.faction==='insurgent'||u.faction==='pmc'&&fp.tactical.rival.hostile))||[];
     if(fp.commandDecision!=='철수'&&m){
       const budget=Math.max(0,Number(op.budget)||0);
       if(budget>=1800000&&(fp.tactical?.version>=3?fp.tactical.units.filter(u=>u.faction==='blackline').reduce((n,u)=>n+u.ammo,0)<op.teamIds.length*15:state.ammo<500||roll<35))requests.push({name:'현장 물자 재보급',cost:1800000,effect:4});
       if(m.risk>1&&op.teamIds.length<4&&budget>=requests.reduce((a,x)=>a+x.cost,0)+6000000)requests.push({name:'추가 인력 지원',cost:6000000,effect:9});
     }
     if(fp.tactical&&m&&fp.commandDecision!=='철수'&&(fp.tactical.version<3||observedEnemies.length>0)){
       const budget=Math.max(0,Number(op.budget)||0),spent=requests.reduce((a,x)=>a+x.cost,0);
       const preferArtillery=fp.tactical.version>=3?op.artillery!=='off'&&observedEnemies.length>=2:fp.tactical.rng%2===0;
       if(preferArtillery&&op.artillery!=='off'&&budget>=spent+11000000)requests.push({name:'승인된 원거리 지원',cost:11000000,effect:6});
       else if(op.air!=='off'&&m.risk>=2&&budget>=spent+14000000)requests.push({name:'승인된 공중 지원',cost:14000000,effect:8});
     }
     // Commit support expenses when the commander orders them; do not charge twice on completion.
     fp.supportOrders=(fp.supportOrders||[]).filter(o=>['drone','vehicle-recovery','medevac','reinforcement','resupply'].includes(o.kind));
     fp.reservedSupportCost=Number(fp.reservedSupportCost)||0;
     for(const [i,request] of requests.entries()){
       const r=window.fieldSimulation.reserveSupport?.(op,request);if(!r)continue;
       if(fp.reservedSupportCost+r.cost>Math.max(0,Number(op.budget)||0)||state.cash<r.cost)continue;
       state.cash-=r.cost;
       fp.reservedSupportCost+=r.cost;
       fp.supportOrders.push({...r,requestedAt:(fp.tactical?.time??155)+i*13,eta:35+(fp.seed%4)*15,charged:true,reason:'현장지휘관 승인 후 집행'});
       if(fp.tactical)fp.tactical.radio.push({t:fp.tactical.time,who:op.leaderName||'현장지휘관',msg:r.name+' 요청. 예산 내 '+money(r.cost)+' 집행, 도착 대기.',kind:'support'});
     }
     fp.supportArrivals=fp.supportOrders.map(o=>({name:o.name,arrivalAt:o.requestedAt+o.eta,onTime:o.requestedAt+o.eta<=220}));
     // Determine injuries at the field checkpoint; commit the medical response immediately.
     const members=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(p=>p&&!p.dead&&!p.retired&&!p.injured);
     const readiness=teamReadiness(members);
     const missionRisk=Number(m?.risk)||1;
     const fieldMedic=members.some(p=>/의무|의료|구급/.test(p.role||''))?3:0;
     const exposure=Math.max(2,Math.min(48,11+missionRisk*5-fieldMedic+Math.max(0,fp.riskShift)+fp.lateRisk-Math.round(readiness/13)-(fp.commandDecision==='철수'?9:0)));
     const actual=fp.tactical?window.fieldSimulation.outcome(fp.tactical).casualties.find(c=>!c.dead):null;
     const injured=fp.tactical?!!actual:(fp.seed*23+(fp.startedDay??state.day)*7)%100<exposure;
     const severityRoll=(fp.seed*41+(fp.startedDay??state.day)*13+missionRisk*19)%100;
     const severity=fp.tactical?actual?.severity||null:injured?(severityRoll<12?'중상':severityRoll<42?'보통':'경상'):null;
     const recoveryDays=severity==='중상'?45+fp.seed%31:severity==='보통'?18+fp.seed%14:severity==='경상'?5+fp.seed%8:0;
     fp.medical={injured,exposure,severity,recoveryDays,personId:fp.tactical?actual?.id||null:injured&&members.length?members[fp.seed%members.length].id:null,evacuation:false,medicalCost:0,medUsed:injured?1:0,reassignment:injured?'부상 인원 임무 제외 · 잔여 인원 재배치':'불필요'};
     if(injured){
       const remaining=Math.max(0,Number(op.budget)||0)-fp.reservedSupportCost;
       if(!fp.tactical&&remaining>=8500000&&state.cash>=8500000){
         state.cash-=8500000;fp.reservedSupportCost+=8500000;
         fp.medical.evacuation=true;fp.medical.medicalCost=8500000;
         fp.supportOrders.push({name:'긴급 의료 후송',cost:8500000,effect:0,requestedAt:fp.tactical?.time??235,eta:45,charged:true,reason:'현장 의무 담당 긴급 요청'});
       }
       fp.events.push({stage:4,t:235,phase:'의료 대응',detail:severity+' 부상 · '+(fp.medical.evacuation?'의료 후송 승인':'현장 응급처치')+' · 잔여 인원 재배치',riskShift:0});
     }

     // Lock in the post-casualty field reorganization before the final settlement.
     const remainingMembers=fp.medical.injured?members.filter(p=>p.id!==fp.medical.personId):members;
     const remainingReadiness=remainingMembers.length?teamReadiness(remainingMembers):0;
     const reassignmentPenalty=fp.medical.injured?Math.max(4,Math.round((readiness-remainingReadiness)/3)+Math.round(16/Math.max(1,remainingMembers.length))+(fp.medical.severity==='중상'?4:0)):0;
     const leader=members.find(p=>p.id===op.leaderId)||members[0];
     const leadership=leader?personnelEvaluation(leader).leadership:50;
     const supportEffect=fp.supportOrders.filter(o=>o.requestedAt+o.eta<=220).reduce((sum,o)=>sum+(Number(o.effect)||0),0);
     const fieldEstimate=Math.round(44+readiness*.16+(members.reduce((a,p)=>a+(Number(p.skill)||0),0)/Math.max(1,members.length))*.22-missionRisk*12-fp.riskShift-fp.lateRisk+supportEffect-reassignmentPenalty);
     fp.reorganization={activeTeamIds:remainingMembers.map(p=>p.id),activeReadiness:remainingReadiness,penalty:reassignmentPenalty,fieldEstimate};
     fp.secondaryDecision=fp.commandDecision==='철수'?'철수 유지':(remainingMembers.length<2||fieldEstimate<31)&&leadership>=40?'철수':'계속';
     fp.events.push({stage:4,t:240,phase:'전력 재편성',detail:'가용 '+remainingMembers.length+'명 · '+(fp.secondaryDecision==='철수'?'지휘관 철수 결정':'잔여 인원 임무 계속'),riskShift:0});
     fp.events.push({stage:4,t:205,phase:'지원 도착 확인',detail:fp.supportArrivals.length?fp.supportArrivals.map(o=>o.name+(o.onTime?' · 판정 전 도착':' · 판정 후 도착')).join(', '):'지원 요청 없음',riskShift:0});
   }
   const detail=roll<20?'예상 외 위험 증가':roll>86?'현장 상황 안정':stage===2?'지휘관 현장 판단 갱신':'현장 상황 점검 완료';
   fp.events.push({stage:stage+1,t:(stage+1)*80,phase:stageLabels[stage],detail,riskShift});
   fp.stage++;
   op.status='현장 진행 중';
   if(stage===0)report('작전','작전 개시 보고 · '+op.id,op.leaderName+' 지휘관이 현장 지휘권을 인수했습니다. 이후 상황은 현장 판단에 따라 진행됩니다.');
   save();render();
   }finally{processingFields.delete(op.id);}
 }
 function startField(op){
   if(op.status!=='현장 진행 중'||fieldTimers.has(op.id))return;
   let stamp=performance.now(),pending=0;
   const timer=setInterval(()=>{try{
    const now=performance.now(),delta=Math.min(1000,Math.max(0,now-stamp));stamp=now;
    if(state.simClock?.paused||document.hidden||document.body.classList.contains('start-visible'))return;
    if(op.fieldProgress?.tactical?.version>=2){pending+=delta;while(pending>=1000){pending-=1000;fieldStep(op);if(op.status!=='현장 진행 중')break}}
    else{const steps=op.fieldProgress?.tactical?(state.simClock?.speed||1):1;for(let i=0;i<steps;i++){fieldStep(op);if(op.status!=='현장 진행 중')break}}
   }catch(err){clearInterval(timer);fieldTimers.delete(op.id);console.error('BLACKLINE field operation failed',op.id,err)}},op.fieldProgress?.tactical?.version>=2?250:op.fieldProgress?.tactical?500:1800);
   fieldTimers.set(op.id,timer);
 }
 function finalizeOperation(op,m,members){
    if(op.status==='작전 완료'||op.completed||state.history.some(h=>h.planId===op.id))return;
    const tactical=op.fieldProgress?.tactical;
    const fieldResult=tactical?window.fieldSimulation.outcome(tactical):null;
    // Existing missions retain their legacy resolution; new deployments resolve from field actions.
    const seed=op.fieldProgress?.seed??(state.day*7919+m.id*101+state.history.length*509+members.length*37)%997;
    const missionDay=op.fieldProgress?.startedDay??state.day;
    const avg=members.reduce((a,p)=>a+(Number(p.skill)||0),0)/members.length;
    const readiness=teamReadiness(members);
    const avgFatigue=members.reduce((a,p)=>a+(Number(p.fatigue)||0),0)/members.length;
    const fatiguePenalty=Math.round(avgFatigue/9);
    const sniper=members.filter(p=>/저격수|정밀사수/.test(p.role||''));
    const specialistBonus=sniper.length?Math.min(5,Math.round(sniper.reduce((a,p)=>a+personnelEvaluation(p).precision,0)/sniper.length/20)):0;
    const preparationBonus=op.rehearsalQuality==='우수'?7:op.rehearsalQuality==='양호'?3:-4;
    const methodBonus=/항공/.test(op.method||'')?(m.risk>1?3:-2):/차량/.test(op.method||'')?(m.type==='호송'?4:0):0;
    const roles=members.map(p=>String(p.role||''));
    const medicBonus=roles.some(x=>/의무|의료|구급/.test(x))?3:0;
    const reconBonus=roles.some(x=>/정찰|수색|정보/.test(x))?4:0;
    const authorized=Math.max(0,Number(op.budget)||0),choices=[];let supportCost=0;
    const phases=[];
    const baseScore=Math.max(10,Math.min(90,44+avg*.22+readiness*.16+preparationBonus+specialistBonus+methodBonus+medicBonus+reconBonus-fatiguePenalty-m.risk*12));
    const incident=(seed*37+missionDay*11+m.risk*29)%100;
    const situation=op.fieldProgress?.situation||(incident<19?'예상 밖의 현장 위험':incident<43?'현장 상황 변화':'계획 범위 내 상황');
    const pressure=(situation==='예상 밖의 현장 위험'?19:situation==='현장 상황 변화'?9:0)+Math.round(avgFatigue/12)-(reconBonus?3:0)+Math.max(-10,Math.min(16,Number(op.fieldProgress?.riskShift)||0));
    const leadership=members.find(p=>p.id===op.leaderId)||members[0];
    const leaderScore=leadership?personnelEvaluation(leadership).leadership:50;
    const retreat=op.fieldProgress?.commandDecision?op.fieldProgress.commandDecision==='철수':baseScore-pressure<34&&leaderScore>=43;
    phases.push({t:80,phase:'현장 평가',detail:situation,score:Math.round(baseScore-pressure)});
    phases.push({t:145,phase:'지휘관 판단',detail:retreat?'인원 보호를 위한 조기 철수':'임무 계속 진행',score:Math.round(baseScore-pressure)});
    const consider=(name,cost,reason,needed,permitted=true,effect=0)=>{
      if(!needed||!permitted||supportCost+cost>authorized)return false;
      const requestedAt=155+choices.length*22,eta=35+(seed%4)*15;
      supportCost+=cost;choices.push({name,cost,reason,requestedAt,eta,effect});
      return true;
    };
    if(!retreat&&!op.fieldProgress?.supportOrders){
      consider('현장 물자 재보급',1800000,'소모 물자 및 보급 상태 보완',state.ammo<500||seed%4===0,true,4);
      consider('추가 인력 지원',6000000,'현장 인력 보강 필요',m.risk>1&&members.length<4&&seed%3!==0,true,9);
      consider('승인된 공중 지원',14000000,'현장 안전 지원 요청',m.risk>1&&seed%5===0,op.air!=='off',8);
      consider('승인된 원거리 지원',11000000,'현장 위험 완화 지원 요청',m.risk>1&&seed%7===0,op.artillery!=='off',6);
    }
    if(op.fieldProgress?.supportOrders){for(const order of op.fieldProgress.supportOrders){if(supportCost+order.cost<=authorized){choices.push({...order,reason:'현장 단계에서 지휘관 승인'});supportCost+=order.cost}}}
    // Resolve sequential checkpoints; late support cannot retroactively affect a completed phase.
    const effective=choices.filter(c=>c.requestedAt+c.eta<=220);
    const delayed=choices.filter(c=>c.requestedAt+c.eta>220);
    const supportBonus=effective.reduce((sum,c)=>sum+c.effect,0);
    const secondIncident=(seed*53+missionDay*23+m.id*31)%100;
    const latePressure=(secondIncident<17?14:secondIncident<36?6:0)+Math.max(0,Number(op.fieldProgress?.lateRisk)||0);
    const fieldStamina=Math.max(0,Math.round(100-avgFatigue-m.risk*6-(situation==='예상 밖의 현장 위험'?12:0)));
    // A casualty removes one operative from the active roster for the remaining mission.
    const medical=op.fieldProgress?.medical;
    const activeMembers=medical?.injured?members.filter(p=>p.id!==medical.personId):members;
    const activeReadiness=teamReadiness(activeMembers);
    const reassignmentPenalty=op.fieldProgress?.reorganization?.penalty??(medical?.injured?Math.max(4,Math.round((readiness-activeReadiness)/3)+Math.round(16/Math.max(1,activeMembers.length))+(medical.severity==='중상'?4:0)):0);
    const continuingScore=baseScore-pressure+supportBonus-latePressure+Math.round((fieldStamina-50)/12)-reassignmentPenalty;
    const secondaryRetreat=!retreat&&(op.fieldProgress?.secondaryDecision?op.fieldProgress.secondaryDecision==='철수':(continuingScore<31||activeMembers.length<2)&&leaderScore>=40);
    const withdrew=fieldResult?fieldResult.retreat:retreat||secondaryRetreat;
    const finalScore=Math.max(5,Math.min(96,continuingScore));
    phases.push({t:185,phase:'지원 상황',detail:effective.length?effective.map(c=>c.name).join(', ')+' 도착':'목표 판정 전 지원 도착 없음',score:supportBonus});
    if(medical?.injured)phases.push({t:200,phase:'인원 재배치',detail:'잔여 '+activeMembers.length+'명 재편성 · 수행 영향 '+reassignmentPenalty+'점',score:Math.round(activeReadiness)});
    phases.push({t:205,phase:'상황 재평가',detail:secondaryRetreat?'상황 악화로 현장 철수 결정':latePressure?'추가 위험 확인':'현장 안정 유지',score:Math.round(continuingScore)});
    const missionType=m.type||(m.id===1?'호송':m.id===2?'구조':'시설 보안');
    const objectiveDefs=missionType==='정밀 지원'?[['관측 구역 안전 확인',0.98,2],['위협 식별 및 보호 대상 안전 확보',1.07,3],['관측 종료 및 팀 복귀',1.1,4]]:missionType==='무장세력 대응'?[['민간인 대피 및 위험 구역 확인',1.02,2],['무장 위협 억제 및 지역 안전 확보',1.14,3],['현장 안정화 및 인계',1.12,4]]:missionType==='호송'
      ?[['이동 경로 안전 확보',0.94,2],['호송 대상 보호',1.04,3],['목적지 도착 확인',1.08,4]]
      :missionType==='구조'
      ?[['현장 접근 및 수색',0.98,2],['보호 대상 확인',1.07,3],['안전 지역 후송',1.12,4]]
      :[['현장 출입 통제',0.94,2],['주요 구역 안전 확보',1.03,3],['시설 인계 및 경계 종료',1.09,4]];
    const objectives=objectiveDefs.map(([name,difficulty,stage],i)=>{
      const score=Math.max(4,Math.min(96,Math.round(finalScore/difficulty+(i===0?reconBonus:0)+(i===2?medicBonus:0))));
      const roll=(seed*(17+i*19)+missionDay*(13+i*7)+m.id*(7+i*11)+i*29)%100;
      return {name,stage,score,roll,completed:fieldResult?!withdrew&&tactical.objective>=[25,65,100][i]:!withdrew&&roll<score};
    });
    const completedObjectives=objectives.filter(o=>o.completed).length;
    const success=fieldResult?fieldResult.success:!withdrew&&completedObjectives===objectives.length;
    phases.push(...objectives.map((o,i)=>({t:155+i*28,phase:'세부 목표 '+(i+1),detail:o.name+' · '+(o.completed?'달성':'미달성'),score:o.score})));
    const exposure=Math.max(2,Math.min(48,11+m.risk*5+pressure+latePressure-medicBonus-Math.round(readiness/13)-Math.round(supportBonus/2)-(withdrew?9:0)));
    const injury=fieldResult?fieldResult.casualties.some(c=>!c.dead):op.fieldProgress?.medical?!!op.fieldProgress.medical.injured:(seed*23+missionDay*7)%100<exposure;
    if(injury&&!fieldResult&&!op.fieldProgress?.medical&&state.cash>=8500000)consider('긴급 의료 후송',8500000,'부상자 보호 및 의료 지원',true,true,0);
    const evacuation=fieldResult?(tactical.units.some(u=>u.faction==='blackline'&&u.evacComplete)||tactical.supportArrived.some(k=>k.startsWith('긴급 의료 후송'))):op.fieldProgress?.medical?!!op.fieldProgress.medical.evacuation:choices.some(c=>c.name==='긴급 의료 후송'&&c.requestedAt+c.eta<=330);
    const death=fieldResult?fieldResult.casualties.some(c=>c.dead):(seed*31+missionDay*19)%100<Math.max(1,Math.round(exposure/3)+(success?0:3)-(evacuation?7:0)-(withdrew?3:0));
    const combatPersonnel=members.filter(p=>!p.dead&&!p.retired);
    let hostileContact,hostileCount,personnelCombat,hostileKilled,hostileDetained,hostileRetreated;
    if(fieldResult){({hostileContact,hostileCount,personnelCombat,hostileKilled,hostileDetained,hostileRetreated}=fieldResult)}else{
    // Hostile contact is simulated only when the mission encounters an armed threat.
    hostileContact=!withdrew&&m.risk>=2&&((seed*29+missionDay*11+m.id*17)%100)<Math.min(85,18+m.risk*15+Math.max(0,pressure)+(missionType==='무장세력 대응'?12:0));
    hostileCount=hostileContact?1+(seed%Math.max(2,m.risk+2)):0;
    personnelCombat=combatPersonnel.map(p=>({id:p.id,name:p.name,role:p.role||'일반 대원',kills:0,detained:0,actions:[]}));
    hostileKilled=0;hostileDetained=0;
    // Each operator acts independently. The aggregate encounter report is derived from these actions.
    let remainingHostiles=hostileCount;
    for(let round=0;round<2&&remainingHostiles>0;round++){
      for(const record of personnelCombat){
        if(remainingHostiles<=0)break;
        const p=combatPersonnel.find(x=>x.id===record.id);
        const ev=personnelEvaluation(p);
        const precision=Number(ev.precision)||Number(p.skill)||50;
        const awareness=Number(ev.awareness)||50;
        const specialist=/저격|정밀사수/.test(record.role)&&missionType==='정밀 지원'?12:0;
        const fatigue=Math.round((Number(p.fatigue)||0)/7);
        const chance=Math.max(8,Math.min(78,Math.round(20+precision*.34+awareness*.12+specialist-fatigue-m.risk*5)));
        const roll=(seed*17+missionDay*11+m.id*7+Number(p.id||0)*13+round*37)%100;
        if(roll>=chance){record.actions.push({round:round+1,result:'위협 관측·대응 실패'});continue}
        const lethal=(seed*23+Number(p.id||0)*19+round*31+missionDay)%100<(missionType==='무장세력 대응'?38:missionType==='정밀 지원'?32:17);
        if(lethal){record.kills++;hostileKilled++;record.actions.push({round:round+1,result:'적대 인원 사살'})}
        else{record.detained++;hostileDetained++;record.actions.push({round:round+1,result:'적대 인원 제압·체포'})}
        remainingHostiles--;
      }
    }
    hostileRetreated=remainingHostiles;
    }
    for(const record of personnelCombat){const p=combatPersonnel.find(x=>x.id===record.id);if(!p)continue;p.combatStats=p.combatStats||{missions:0,kills:0,detained:0};p.combatStats.missions++;p.combatStats.kills+=record.kills;p.combatStats.detained+=record.detained;p.combatHistory=Array.isArray(p.combatHistory)?p.combatHistory:[];p.combatHistory.unshift({date:state.date,mission:m.title,kills:record.kills,detained:record.detained,actions:record.actions});p.combatHistory=p.combatHistory.slice(0,30)}
    phases.push({t:210,phase:'위협 대응',detail:hostileContact?'적대 세력 '+hostileCount+'명 접촉 · 사살 '+hostileKilled+'명 · 제압·체포 '+hostileDetained+'명 · 이탈 '+hostileRetreated+'명':'적대 세력 접촉 없음',score:Math.round(finalScore)});
    const used=fieldResult?fieldResult.used:Math.min(state.ammo,Math.max(45,120+seed%180-(withdrew?80:0)));
    const medUsed=tactical?.physiologyVersion?(tactical.medUsed||0):tactical?.version>=2?Math.min((op.fieldProgress.reservedTacticalMed||0)+state.med,(fieldResult.usedMed||0)+fieldResult.casualties.filter(c=>!c.dead&&!c.stabilized).length):fieldResult?Math.min(state.med,fieldResult.casualties.filter(c=>!c.dead).length):injury?1:0;
    phases.push({t:220,phase:'임무 평가',detail:withdrew?'안전 철수':success?'목표 달성':'목표 미달성',score:Math.round(finalScore)});
    phases.push({t:330,phase:'인원 보호',detail:death?'중대한 인명 피해':injury?'부상자 발생':'인원 이상 없음',score:Math.round(exposure)});
    op.resolution={version:15,personnelCombat,hostileContact,hostileCount,hostileKilled,hostileDetained,hostileRetreated,missionType,objectives,completedObjectives,methodBonus,medicBonus,reconBonus,fieldReorganization:op.fieldProgress?.reorganization||null,activeTeamCount:activeMembers.length,reassignmentPenalty,medical:op.fieldProgress?.medical||null,supportArrivals:op.fieldProgress?.supportArrivals||[],fieldEvents:op.fieldProgress?.events||[],phases,situation,retreat:withdrew,secondaryRetreat,baseScore:Math.round(baseScore),pressure,latePressure,fieldStamina,supportBonus,delayedSupport:delayed.map(c=>c.name),finalScore:Math.round(finalScore),exposure:Math.round(exposure)};
    state.cash-=Math.max(0,supportCost-(Number(op.fieldProgress?.reservedSupportCost)||0));op.actualSupportCost=supportCost;op.supportDecisions=choices;
    if(fieldResult){const ledger=window.fieldSimulation.ammoAccounting?.(tactical,op);state.ammo+=ledger?ledger.returned:Math.max(0,(op.fieldProgress.reservedTacticalAmmo||0)-used);if(ledger)op.resolution.ammunition=ledger;op.fieldProgress.reservedTacticalAmmo=0;window.fieldSimulation.settleRelations(tactical)}else state.ammo-=used;if(tactical?.version>=2){const reserved=op.fieldProgress.reservedTacticalMed||0;state.med+=Math.max(0,reserved-medUsed);state.med-=Math.max(0,medUsed-reserved);op.fieldProgress.reservedTacticalMed=0}else state.med-=medUsed;
    const reward=success?m.reward:Math.round(m.reward*(withdrew?.08:.15)+(!withdrew?m.reward*.12*completedObjectives:0));state.cash+=reward;
    let casualtyName=null,injuryName=null;
    if(fieldResult){
      const dead=[],injured=[];for(const actor of tactical.units.filter(u=>u.faction==='blackline')){const person=state.team.find(p=>p.id===actor.personId);if(person&&actor.health?.armor)person.armorCondition=actor.health.armor.condition;}
      for(const casualty of fieldResult.casualties){
        const p=members.find(p=>p.id===casualty.id);if(!p)continue;
        if(casualty.dead){p.dead=true;p.injured=false;p.dateOfDeath=state.date;p.causeOfDeath='현장 교전 중 사망';dead.push(p.name);state.fallen.unshift({id:p.id,name:p.name,date:state.date,mission:m.title});if(state.leaderId===p.id)state.leaderId=available().find(x=>x.id!==p.id)?.id||null}
        else{p.injured=true;p.injurySeverity=casualty.severity;if(casualty.wounds&&!casualty.recovered)p.awaitingRecovery=true;if(casualty.wounds&&casualty.recovered){if(p.medicalCase?.operationId!==op.id)p.medicalCase={operationId:op.id,admittedDate:state.date,status:'진료 대기',wounds:casualty.wounds,health:casualty.health};window.blacklineTreatAtBase?.(p);}p.recoveryUntil=p.medicalCase?.recoveryUntil||addDays(state.date,casualty.severity==='중상'?45:casualty.severity==='보통'?21:7);p.injuryHistory=Array.isArray(p.injuryHistory)?p.injuryHistory:[];p.injuryHistory.unshift({date:state.date,mission:m.title,severity:casualty.severity,wounds:casualty.wounds||[],recoveryUntil:p.recoveryUntil,evacuated:evacuation});p.injuryHistory=p.injuryHistory.slice(0,30);if(p.medicalCase?.status==='치료 완료'){p.injured=false;p.recoveryUntil=null;}injured.push(p.name)}
      }
      casualtyName=dead.join(', ')||null;injuryName=injured.join(', ')||null;
      op.resolution.casualties=fieldResult.casualties;
      const injuryDetail=fieldResult.casualties.find(c=>!c.dead);if(injuryDetail)op.resolution.medical={injured:true,personId:injuryDetail.id,severity:injuryDetail.severity,recoveryDays:injuryDetail.severity==='중상'?45:injuryDetail.severity==='보통'?21:7,evacuation};
      op.resolution.activeTeamCount=tactical.units.filter(u=>u.faction==='blackline'&&u.hp>0).length;
      op.resolution.rivalPMC={...tactical.rival};
    }else{
    if(death){const p=members[(seed+1)%members.length];p.dead=true;p.injured=false;p.dateOfDeath=state.date;p.causeOfDeath='작전 중 사망';casualtyName=p.name;state.fallen.unshift({id:p.id,name:p.name,date:state.date,mission:m.title});if(state.leaderId===p.id){const replacement=available().find(x=>x.id!==p.id);state.leaderId=replacement?.id||null}}
    if(injury){const alive=members.filter(p=>!p.dead);if(alive.length){const p=alive.find(p=>p.id===op.resolution.medical?.personId)||alive[seed%alive.length];p.injured=true;const med=op.resolution.medical;if(med){p.injurySeverity=med.severity;p.recoveryUntil=addDays(state.date,med.recoveryDays);p.injuryHistory=Array.isArray(p.injuryHistory)?p.injuryHistory:[];p.injuryHistory.unshift({date:state.date,mission:m.title,severity:med.severity,recoveryUntil:p.recoveryUntil,evacuated:med.evacuation});p.injuryHistory=p.injuryHistory.slice(0,30)}injuryName=p.name}}
    }
    state.reputation=Math.max(0,Math.min(100,state.reputation+(success?3:-4)-(death?4:0)));
    const leaderVoice=op.leaderName||'현장 작전지휘관';
    let logs=[
      {t:0,who:'작전본부',msg:'사전 승인된 임무가 개시되었습니다. 현장 지휘권을 작전지휘관에게 이양합니다.'},
      {t:25,who:leaderVoice,msg:'현장 지휘권 인수. 팀원 전원 상태 보고 바랍니다.'},
      {t:48,who:'현장 팀원',msg:'전원 확인했습니다. 현장 상황 확인을 시작합니다.'},
      {t:80,who:leaderVoice,msg:'민간인 보호와 팀원 안전을 우선합니다. 각 담당자는 변화 사항을 즉시 보고하세요.'},
      {t:118,who:'현장 팀원',msg:situation==='계획 범위 내 상황'?'현재까지 특이사항 없습니다. 임무를 계속 진행할 수 있습니다.':situation+'이 확인됐습니다. 추가 판단을 요청합니다.'},
      {t:145,who:leaderVoice,msg:retreat?'인원 보호를 위해 조기 철수합니다.':situation==='계획 범위 내 상황'?'확인. 기존 임무 목표를 유지하며 진행합니다.':'위험을 재평가하고 임무 절차를 조정합니다.'},
      {t:185,who:'작전본부',msg:'현장 지휘관 상황 보고 접수. 본부는 관찰을 유지하며 현장 판단을 존중합니다.'},
      {t:220,who:leaderVoice,msg:success?'주요 임무 목표를 달성했습니다. 전원 안전 확인 후 복귀를 준비합니다.':withdrew?'안전 기준에 따라 철수를 완료합니다.':'임무 목표 달성에 실패했습니다. 안전한 복귀를 결정합니다.'},
      {t:275,who:'현장 팀원',msg:success?'목표 달성 확인. 인원 상태를 점검 중입니다.':'임무 중단 명령 확인. 인원 상태를 확인합니다.'},
      {t:330,who:leaderVoice,msg:'팀원 상태 최종 확인 후 본부에 작전 종료를 보고하겠습니다.'}
    ];
    for(const p of personnelCombat)for(const action of p.actions)logs.push({t:190+action.round*10,who:p.name,msg:action.result});
    if(hostileContact&&personnelCombat.some(p=>p.kills||p.detained))logs.push({t:216,who:'작전본부',msg:'대원별 교전 결과: '+personnelCombat.filter(p=>p.kills||p.detained).map(p=>p.name+' 사살 '+p.kills+'명·제압 '+p.detained+'명').join(', ')});
    if(hostileContact)logs.push({t:210,who:'현장 지휘관',msg:'적대 세력 접촉 '+hostileCount+'명. 사살 '+hostileKilled+'명, 제압·체포 '+hostileDetained+'명, 현장 이탈 '+hostileRetreated+'명으로 집계합니다.'});
    objectives.forEach((o,i)=>logs.push({t:155+i*28,who:'현장 작전팀',msg:o.name+' · '+(o.completed?'목표 달성 확인':'목표 미달성 보고')}));
    for(const event of op.fieldProgress?.events||[])logs.push({t:event.t,who:'현장 상황실',msg:event.phase+' · '+event.detail});
    if(op.fieldProgress?.commandDecision)logs.push({t:145,who:leaderVoice,msg:op.fieldProgress.commandDecision==='철수'?'현장 평가 후 철수를 명령합니다.':'현장 평가 후 임무 계속을 승인합니다.'});
    if(op.fieldProgress?.secondaryDecision)logs.push({t:240,who:leaderVoice,msg:op.fieldProgress.secondaryDecision==='계속'?'잔여 인원 재배치 후 임무를 계속합니다.':'안전 기준에 따라 잔여 인원을 철수시킵니다.'});
    if(secondaryRetreat)logs.push({t:205,who:leaderVoice,msg:'현장 위험이 다시 높아졌습니다. 인원 안전을 위해 철수로 전환합니다.'});
    if(latePressure)logs.push({t:198,who:'현장 팀원',msg:'현장 상황이 추가로 변했습니다. 위험 평가를 갱신합니다.'});
    if(delayed.length)logs.push({t:218,who:'작전지원본부',msg:'일부 지원이 목표 판정 시점까지 도착하지 못했습니다. 이후 도착분은 성공 판정에 소급 적용하지 않습니다.'});
    if(injuryName)logs.push({t:235,who:'의무 담당',msg:injuryName+' '+(op.resolution.medical?.severity||'')+' 부상 확인. '+(evacuation?'의료 후송을 요청했습니다.':'현장 응급처치를 진행합니다.')},{t:255,who:leaderVoice,msg:'부상자 보호를 최우선으로 하겠습니다. 현장 임무 절차를 조정합니다.'});
    if(casualtyName)logs.push({t:250,who:'작전본부',msg:'중대한 인명 피해 보고를 접수했습니다. 관련 절차를 개시합니다.'});
    choices.forEach((c,i)=>{logs.push({t:c.requestedAt,who:leaderVoice,msg:c.name+' 지원 요청. '+c.reason+'. 승인 예산 내 '+money(c.cost)+' 집행.'});logs.push({t:Math.min(355,c.requestedAt+c.eta),who:'작전지원본부',msg:c.name+' 지원 처리 완료. '+(c.requestedAt+c.eta>220?'목표 판정 이후 도착했습니다.':'현장지휘관에게 상태를 통보했습니다.')})});
    logs.push({t:390,who:leaderVoice,msg:'작전 종료를 보고합니다. 실제 지원비 '+money(supportCost)+', 미사용 승인 한도 '+money(Math.max(0,authorized-supportCost))+'. 상세 결과는 작전본부에 제출하겠습니다.'});if(tactical)logs=[...tactical.radio,{t:tactical.duration,who:'작전본부',msg:'최종 결과 '+(success?'성공':'실패')+' / 계약 수입 '+money(reward)+' / 실제 탄약 '+used+'발.'}];logs.sort((a,b)=>a.t-b.t);
    state.history.unshift({id:Date.now()+op.missionId,date:state.date,title:m.title,success,injury:!!injuryName,death:!!casualtyName,casualtyName,injuryName,used,medUsed,reward,supportCost,air:op.air,artillery:op.artillery,budget:op.budget,supportDecisions:choices,resolution:op.resolution,tactical:tactical||undefined,logs,day:state.day,team:members.map(p=>p.name),planId:op.id,method:op.method});
    window.contractWorld.settle(op,m,state.history[0]);
    op.status='작전 완료';op.completed=state.date;delete op.fieldProgress;for(const p of members){p.fatigue=Math.min(100,(p.fatigue||0)+16+m.risk*9);if(p.dead||p.retired)continue;const ev=personnelEvaluation(p);const k=['teamwork','awareness','endurance','tactics'][(seed+p.id)%4];ev[k]=Math.min(97,ev[k]+1)}
    report('재무','작전 예산 집행 정산 · '+op.id,'승인 한도 '+money(authorized)+', 현장지휘관 실제 집행 '+money(supportCost)+', 미사용 한도 '+money(Math.max(0,authorized-supportCost))+'. 지출 내역: '+(choices.map(c=>c.name+' '+money(c.cost)).join(', ')||'추가 지원 없음')+'.',-supportCost,{summary:'현장지휘관의 실제 지원 집행액은 '+money(supportCost)+'이며 미사용 한도는 '+money(Math.max(0,authorized-supportCost))+'입니다.',metrics:[{label:'예산 한도',value:money(authorized)},{label:'실제 지출',value:money(supportCost)},{label:'미사용 한도',value:money(Math.max(0,authorized-supportCost))}],sections:[{title:'집행 개요',items:['작전 식별자: '+op.id,'총 승인 한도: '+money(authorized),'실제 현장 지원비: '+money(supportCost),'미사용 한도: '+money(Math.max(0,authorized-supportCost))]},{title:'현장 지원별 지출',items:choices.length?choices.map(c=>c.name+' / '+money(c.cost)+' / '+c.reason):['추가 지원비 집행 없음']},{title:'정산 기준',items:['지원비는 실제 요청 및 처리된 항목만 집계합니다.','예산 한도 전액을 자동으로 지출하지 않습니다.']}]});
    report('작전','최종 작전 결과 보고 · '+m.title,(success?'임무 성공. ':'임무 실패. ')+(casualtyName?'전사자 '+casualtyName+' 발생. ':'')+(injuryName?'부상자 '+injuryName+' 발생. ':'')+'투입 방식: '+op.method+'.',reward,{summary:(success?'임무 목표 달성. ':'임무 목표 미달성. ')+(casualtyName?'사망자 '+(fieldResult?fieldResult.casualties.filter(c=>c.dead).length:1)+'명 발생. ':'')+(injuryName?'부상자 '+(fieldResult?fieldResult.casualties.filter(c=>!c.dead).length:1)+'명 발생. ':'')+'현장지휘관의 종료 보고가 접수됐습니다.',metrics:[{label:'임무 결과',value:success?'성공':'실패'},{label:'계약 수입',value:money(reward)},{label:'지원비',value:money(supportCost)}],sections:[{title:'작전 기본 정보',items:['작전명: '+m.title,'작전번호: '+op.id,'현장지휘관: '+op.leaderName,'투입 방식: '+op.method,'투입 인원: '+members.length+'명']},{title:'임무 수행 결과',items:['최종 결과: '+(success?'임무 성공':'임무 실패'),'세부 목표 달성: '+completedObjectives+'/'+objectives.length,'적대 세력 접촉: '+hostileCount+'명 / 사살 '+hostileKilled+'명 / 제압·체포 '+hostileDetained+'명 / 이탈 '+hostileRetreated+'명',...personnelCombat.filter(p=>p.kills||p.detained).map(p=>p.name+' · 사살 '+p.kills+'명 · 제압 '+p.detained+'명'),'계약 수입: '+money(reward),'탄약 사용량: '+used,'의료물자 사용량: '+medUsed]},{title:'인원 피해 현황',items:[casualtyName?'사망: '+casualtyName:'사망 보고 없음',injuryName?'부상: '+injuryName+' / '+(op.resolution.medical?.severity||'정도 미확인')+' / 회복 예상 '+(op.resolution.medical?.recoveryDays||'미정')+'일':'부상 보고 없음']},{title:'현장 지원 처리',items:choices.length?choices.map(c=>c.name+' / '+money(c.cost)):['추가 지원 요청 없음']},{title:'사후 처리',items:['현장 판단: '+(withdrew?'조기 철수':'임무 계속')+' / 제때 도착한 지원 효과 '+supportBonus+'점 / 최종 평가 '+Math.round(finalScore)+'점','현장 기록과 무전 로그는 작전 다시보기에서 열람할 수 있습니다.',injuryName?'부상자 제외 후 잔여 '+activeMembers.length+'명 재편성 / 작전 수행 영향 '+reassignmentPenalty+'점':'추가 인원 재배치 없음','인사 및 재무 변동은 각 부서 기록에 반영됩니다.']}]});
    if(casualtyName)report('인사','긴급 인명 피해 보고 · '+casualtyName,casualtyName+' 용병이 '+m.title+' 수행 중 사망했습니다. 계약 종료 및 추모 기록에 반영했습니다.');
 }
 
 // Preserve legacy templates and in-flight contracts before changing the live board.
 function refreshContractMarket(){
   if(!Array.isArray(state.missions))state.missions=[];
   if(!Array.isArray(state.missionTemplates)||!state.missionTemplates.length){
     state.missionTemplates=state.missions.map(m=>({id:m.id,title:m.title,client:m.client,reward:m.reward,risk:m.risk,type:m.type||'시설 보안',description:m.description}));
     const ongoing=new Set(state.operations.filter(o=>!['작전 완료','작전 보류'].includes(o.status)).map(o=>o.missionId));
     state.missions=state.missions.filter((m,i)=>i<5||ongoing.has(m.id)).map((m,i)=>({...m,receivedDate:m.receivedDate||state.date,expiresDate:m.expiresDate||addDays(state.date,4+i*2),contractStatus:m.contractStatus||'검토 가능'}));
   }
   state.contractMarketVersion=2;
   window.contractWorld.refresh();
 }
 window.blacklineRunScheduled=runScheduled;
 refreshContractMarket();
 nextDay=function(){oldNextDay();autoRecruit();refreshContractMarket();runScheduled();state.operations.filter(o=>o.status==='현장 진행 중').forEach(startField);save();render()};
 // Resume unfinished operations without advancing the simulation date.
 function resumeFields(){if(typeof state==='undefined'||!Array.isArray(state.operations))return;state.operations.filter(o=>o.status==='현장 진행 중'&&o.fieldProgress).forEach(startField)}
 setTimeout(resumeFields,0);
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeFields()});
 const oldHire=hire;hire=function(id){oldHire(id);const p=state.team.find(x=>x.id===id);if(p)p.dead=false};
 const oldPrepare=prepare;prepare=function(id){if(available().length<2){alert('출동 가능한 용병이 최소 2명 필요합니다.');return}if(state.operations.some(x=>x.missionId===id&&x.status!=='작전 완료'&&x.status!=='작전 보류')){alert('이미 준비 중인 작전입니다.');return}const m=state.missions.find(x=>x.id===id);if(!m)return;state.pending={id,air:'restricted',artillery:'off',budget:20000000,plan:planFor(m)};save();render()};
 approval=function(){const op=state.pending?.plan;if(!op)return '<p class="empty">작전계획이 없습니다.</p>';const m=op.contract||state.missions.find(x=>x.id===op.missionId);return '<h2>팀장 사전 작전계획서</h2><div class="card"><div class="muted">작전번호 '+op.id+' · 계획 제출 '+op.created+'</div><h2>'+escapeHTML(m.title)+'</h2><div class="line"><span>작전팀장</span><strong>'+escapeHTML(op.leaderName)+'</strong></div><div class="line"><span>투입 예정일</span><strong>'+op.deployDate+'</strong></div><div class="line"><span>사전 연습 예정일</span><strong>'+op.rehearsalDate+'</strong></div><div class="line"><span>투입 방식</span><strong>'+escapeHTML(op.method)+'</strong></div><div class="line"><span>투입 인원</span><strong>'+op.teamIds.length+'명</strong></div><h3>팀장 브리핑</h3><p class="empty">'+escapeHTML(op.briefing)+'</p><h3>사전 연습 계획</h3><p class="empty">'+escapeHTML(op.rehearsal)+'</p><h3>안전·교전 제한</h3><p class="empty">'+escapeHTML(op.rules)+'</p><label>공중 지원 제한<select id="air"><option value="off">금지</option><option value="restricted" selected>조건부 허용</option><option value="authorized">사전 승인 범위 내 허용</option></select></label><label>포병 지원 제한<select id="artillery"><option value="off" selected>금지</option><option value="restricted">조건부 허용</option><option value="authorized">사전 승인 범위 내 허용</option></select></label><label>지원 예산 상한 (원)<input id="budget" type="number" min="0" max="200000000" step="1000000" value="'+op.budget+'"></label><p class="empty">승인 후 즉시 전투하지 않습니다. 예정일에 사전 연습과 작전 투입이 진행됩니다.</p><div class="btnrow">'+btn('작전계획 승인 · 일정 등록','approveScheduled()')+btn('반려','cancel()','secondary')+'</div></div>'};
 function approveScheduled(){const op=state.pending?.plan;if(!op)return;const budget=Number(document.getElementById('budget').value);if(!Number.isFinite(budget)||budget<0||budget>200000000){alert('지원 예산을 확인하세요.');return}op.budget=budget;op.air=document.getElementById('air').value;op.artillery=document.getElementById('artillery').value;op.status='작전 승인';op.departmentBudget={personnel:Math.round(budget*.22),logistics:Math.round(budget*.25),transport:Math.round(budget*.18),medical:Math.round(budget*.15),reserve:budget-Math.round(budget*.22)-Math.round(budget*.25)-Math.round(budget*.18)-Math.round(budget*.15)};state.operations.unshift(op);state.pending=null;report('작전','팀장 작전계획 승인 보고 · '+op.id,op.leaderName+' 팀장 계획 승인. 팀 준비 평가 '+(op.readiness>=82?'우수':op.readiness>=68?'양호':'보완 필요')+'. '+op.rehearsalDate+' 사전 연습, '+op.deployDate+' 작전 투입 예정.');save();render()}
 window.approveScheduled=approveScheduled;
 const oldMissions=missions;missions=function(){let html='<h2>작전 운영 현황</h2>'+state.operations.filter(x=>x.status!=='작전 완료').map(op=>'<div class="card"><div class="line"><strong>'+escapeHTML(op.id)+'</strong><span class="tag">'+escapeHTML(op.status)+'</span></div><p class="empty">팀장 '+escapeHTML(op.leaderName)+' · 투입 '+op.deployDate+'<br>사전 연습 '+op.rehearsalDate+' · '+escapeHTML(op.rehearsal)+'<br>팀 준비 평가 '+(op.readiness>=82?'우수':op.readiness>=68?'양호':'보완 필요')+'<br>투입 방식 '+escapeHTML(op.method)+'</p></div>').join('');return html+oldMissions()};
 const oldHome=home;home=function(){const op=state.operations.filter(x=>x.status!=='작전 완료');return oldHome()+(op.length?'<h2>진행 중인 작전 일정</h2>'+op.map(x=>{const fp=x.fieldProgress;const latest=fp?.events?.slice(-1)[0];return '<div class="card"><strong>'+escapeHTML(x.id)+'</strong><p class="empty">'+escapeHTML(x.status)+' · 연습 '+x.rehearsalDate+' · 투입 '+x.deployDate+'</p>'+(fp?'<p class="empty">현장 진행 '+Math.min(4,fp.stage)+'/4단계 · '+escapeHTML(latest?.phase||'현장 투입 대기')+'</p><p class="empty">'+escapeHTML(latest?.detail||'현장 지휘부 연결 중')+'</p>'+(fp.medical?.injured?'<p class="empty">의료 대응: '+escapeHTML(fp.medical.severity)+' · '+escapeHTML(fp.medical.evacuation?'후송 승인':'현장 응급처치')+'</p>':''):'')+'</div>'}).join(''):'')};
 const oldPeople=people;people=function(){return '<div class="card"><h3>인사팀 자율 채용 지침</h3><p class="empty">사장님이 채용 권한을 위임하면 인사팀은 매월 최대 1명까지 승인된 예산 범위에서 부족 인원을 자동 계약합니다.</p><label><input type="checkbox" id="autoRecruit" '+(state.recruitPolicy.enabled?'checked':'')+'> 인사팀 자동 계약 허용</label><label>최소 유지 인원<input type="number" id="minTeam" min="2" max="12" value="'+state.recruitPolicy.minTeam+'"></label><label>연봉 상한 (원)<input type="number" id="salaryCap" min="10000000" step="10000000" value="'+state.recruitPolicy.maxAnnualSalary+'"></label>'+btn('인사 위임 지침 저장','saveRecruitPolicy()')+'</div><h2>현직 인원 및 사망 기록</h2>'+(state.fallen.length?state.fallen.map(x=>'<div class="card"><strong>'+escapeHTML(x.name)+'</strong><p class="empty">사망일 '+x.date+' · '+escapeHTML(x.mission)+'</p></div>').join(''):'<p class="empty">사망 기록 없음</p>')+oldPeople()};
 function saveRecruitPolicy(){state.recruitPolicy.enabled=document.getElementById('autoRecruit').checked;state.recruitPolicy.minTeam=Math.max(2,Math.min(12,Number(document.getElementById('minTeam').value)||4));state.recruitPolicy.maxAnnualSalary=Math.max(10000000,Number(document.getElementById('salaryCap').value)||110000000);report('인사','인사팀 채용 위임 지침 변경','자동 채용 '+(state.recruitPolicy.enabled?'허용':'중지')+'. 최소 유지 인원 '+state.recruitPolicy.minTeam+'명.');save();render()}
 window.saveRecruitPolicy=saveRecruitPolicy;
 const oldCombatProfile=renderProfile;
 renderProfile=function(){oldCombatProfile();if(!selectedProfile)return;const p=(selectedProfile.hired?state.team:state.candidates).find(x=>x.id===selectedProfile.id);if(!p||!p.combatStats)return;const root=document.querySelector('.profile-body');if(!root)return;const c=p.combatStats;root.insertAdjacentHTML('beforeend','<div class="dossier-section-label">작전 교전 기록</div><div class="dossier-report"><p>참가 작전 '+c.missions+'회 · 적 사살 '+c.kills+'명 · 제압·체포 '+c.detained+'명</p>'+(p.combatHistory||[]).slice(0,8).map(x=>'<p>'+escapeHTML(x.date)+' · '+escapeHTML(x.mission)+' · 사살 '+x.kills+'명 / 제압 '+x.detained+'명</p>').join('')+'</div>')};
 const oldRender=render;render=function(){oldRender()};
 const oldHistory=history;history=function(){return oldHistory()};
})();
