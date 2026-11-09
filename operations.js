
/* BLACKLINE PMC: mission planning, rehearsals, deployment schedule, casualties, recruitment delegation. */
(function(){
 const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const report=(category,title,body,amount,detail)=>{state.reports.unshift({date:state.date,category,title,body,...(amount===undefined?{}:{amount}),...(detail?{detail}:{})});state.reports=state.reports.slice(0,160)};
 const available=()=>state.team.filter(p=>!p.dead&&!p.retired&&!p.injured&&!p.onMission);
 const leader=()=>state.team.find(p=>p.id===state.leaderId&&!p.dead)||available()[0];
 const methodFor=(m)=>m.id===1?'지상 차량 이동':m.id===2?'항공 수송 후 도보 이동':'지상 차량 이동 및 현장 인수';
 const teamReadiness=members=>{if(!members.length)return 0;return Math.round(members.reduce((sum,p)=>{const e=personnelEvaluation(p);return sum+e.teamwork*.23+e.awareness*.22+e.endurance*.17+e.tactics*.20+e.leadership*.18},0)/members.length)};
 const rehearsalFor=(m)=>m.id===1?'호송 절차 및 응급상황 대응 연습':m.id===2?'민간인 보호·구조 및 후송 모의훈련':'출입통제 및 시설 대피 모의훈련';
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
 function runScheduled(){
  for(const op of state.operations){
   if(op.status==='작전 완료')continue;
   if((op.status==='작전 승인'||op.status==='추가 연습 필요')&&state.date>=op.rehearsalDate){
    op.rehearsalComplete=true;
    const roll=(state.day*13+op.missionId*17+op.teamIds.length*7)%100;
    const readiness=teamReadiness(op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(Boolean));
    op.readiness=readiness;op.rehearsalQuality=readiness>=82?'우수':readiness>=68?'양호':'보완 필요';
    if(roll>readiness){op.rehearsalIssue='모의훈련에서 통신 및 현장 대응 절차의 보완 사항이 발견되었습니다.';op.status='추가 연습 필요';op.deployDate=addDays(op.deployDate,2);op.rehearsalDate=addDays(state.date,1);report('작전','사전 연습 문제점 보고 · '+op.id,op.leaderName+' 팀장: '+op.rehearsalIssue+' 작전 투입일을 '+op.deployDate+'로 연기했습니다.');}
    else {op.status='사전 연습 완료';report('작전','팀장 사전 연습 결과 보고 · '+op.id,op.leaderName+' 팀장이 '+op.rehearsal+'을 완료했습니다. 평가: '+op.rehearsalQuality+'.');}
   }
   if((op.status==='사전 연습 완료'||op.status==='작전 승인')&&state.date>=op.deployDate){
    const m=state.missions.find(x=>x.id===op.missionId);
    if(!m){op.status='작전 보류';continue}
    const members=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(p=>p&&!p.dead&&!p.retired&&!p.injured);
    if(members.length<2){op.status='작전 보류';report('작전','작전 투입 보류 · '+op.id,'출동 가능한 인원이 부족합니다. 팀장에게 재편성 보고를 요청했습니다.');continue}
    if(state.ammo<120||state.med<1){op.status='작전 보류';report('군수','작전 투입 보류 · '+op.id,'탄약 또는 의료물자가 부족하여 투입을 중단했습니다.');continue}
    if(op.status!=='현장 진행 중'){
      op.status='현장 진행 중';
      op.fieldProgress={stage:0,seed:(state.day*7919+op.missionId*101+members.length*37)%997,riskShift:0,lateRisk:0,events:[]};
      save();
    }
    startField(op);
   }
  }
 }

 const fieldTimers=new Map();
 const stageLabels=['현장 투입 및 상태 확인','현장 위험 평가','지휘관 상황 판단','지원·후속 상황 확인'];
 function fieldStep(op){
   if(op.status!=='현장 진행 중'){clearInterval(fieldTimers.get(op.id));fieldTimers.delete(op.id);return}
   const fp=op.fieldProgress;if(!fp)return;
   const stage=fp.stage;
   if(stage>=stageLabels.length){
     clearInterval(fieldTimers.get(op.id));fieldTimers.delete(op.id);
     const m=state.missions.find(x=>x.id===op.missionId);
     const members=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(p=>p&&!p.dead&&!p.retired&&!p.injured);
     if(!m||members.length<2){if(op.fieldProgress?.reservedSupportCost){state.cash+=op.fieldProgress.reservedSupportCost;op.fieldProgress.reservedSupportCost=0;}op.status='작전 보류';report('작전','작전 중단 보고 · '+op.id,'작전 진행 중 투입 가능 인원이 부족하거나 의뢰가 종료되어 작전을 보류했습니다.');save();render();return}
     finalizeOperation(op,m,members);save();render();return;
   }
   // Each checkpoint is evaluated only when its timer fires, not before deployment.
   const roll=(fp.seed+stage*173+state.team.length*11+Math.floor(state.cash/1000000))%100;
   const riskShift=roll<20?7:roll<45?3:roll>86?-4:0;
   fp.riskShift+=riskShift;
   if(stage===1)fp.situation=roll<25?'예상 밖의 현장 위험':roll<55?'현장 상황 변화':'계획 범위 내 상황';
   if(stage===2){
     const members=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(Boolean);
     const readiness=teamReadiness(members);
     const lead=members.find(p=>p.id===op.leaderId)||members[0];
     const leadScore=lead?personnelEvaluation(lead).leadership:50;
     fp.commandDecision=readiness-fp.riskShift-(state.missions.find(m=>m.id===op.missionId)?.risk||1)*9<36&&leadScore>=40?'철수':'계속';
   }
   if(stage===3){
     if(roll<30)fp.lateRisk+=6;
     const m=state.missions.find(x=>x.id===op.missionId);
     const requests=[];
     if(fp.commandDecision!=='철수'&&m){
       const budget=Math.max(0,Number(op.budget)||0);
       if(budget>=1800000&&(state.ammo<500||roll<35))requests.push({name:'현장 물자 재보급',cost:1800000,effect:4});
       if(m.risk>1&&op.teamIds.length<4&&budget>=requests.reduce((a,x)=>a+x.cost,0)+6000000)requests.push({name:'추가 인력 지원',cost:6000000,effect:9});
     }
     // Commit support expenses when the commander orders them; do not charge twice on completion.
     fp.supportOrders=[];
     fp.reservedSupportCost=Number(fp.reservedSupportCost)||0;
     for(const [i,r] of requests.entries()){
       if(fp.reservedSupportCost+r.cost>Math.max(0,Number(op.budget)||0)||state.cash<r.cost)continue;
       state.cash-=r.cost;
       fp.reservedSupportCost+=r.cost;
       fp.supportOrders.push({...r,requestedAt:155+i*22,eta:35+(fp.seed%4)*15,charged:true,reason:'현장지휘관 승인 후 집행'});
     }
     fp.supportArrivals=fp.supportOrders.map(o=>({name:o.name,arrivalAt:o.requestedAt+o.eta,onTime:o.requestedAt+o.eta<=220}));
     fp.events.push({stage:4,t:205,phase:'지원 도착 확인',detail:fp.supportArrivals.length?fp.supportArrivals.map(o=>o.name+(o.onTime?' · 판정 전 도착':' · 판정 후 도착')).join(', '):'지원 요청 없음',riskShift:0});
   }
   const detail=roll<20?'예상 외 위험 증가':roll>86?'현장 상황 안정':stage===2?'지휘관 현장 판단 갱신':'현장 상황 점검 완료';
   fp.events.push({stage:stage+1,t:(stage+1)*80,phase:stageLabels[stage],detail,riskShift});
   fp.stage++;
   op.status='현장 진행 중';
   if(stage===0)report('작전','작전 개시 보고 · '+op.id,op.leaderName+' 지휘관이 현장 지휘권을 인수했습니다. 이후 상황은 현장 판단에 따라 진행됩니다.');
   save();render();
 }
 function startField(op){
   if(op.status!=='현장 진행 중'||fieldTimers.has(op.id))return;
   fieldTimers.set(op.id,setInterval(()=>fieldStep(op),1800));
 }
 function finalizeOperation(op,m,members){
    // Stage-based, deterministic mission resolution. Support changes actual outcome.
    const seed=(state.day*7919+m.id*101+state.history.length*509+members.length*37)%997;
    const avg=members.reduce((a,p)=>a+(Number(p.skill)||0),0)/members.length;
    const readiness=teamReadiness(members);
    const avgFatigue=members.reduce((a,p)=>a+(Number(p.fatigue)||0),0)/members.length;
    const fatiguePenalty=Math.round(avgFatigue/9);
    const sniper=members.filter(p=>/저격수|정밀사수/.test(p.role||''));
    const specialistBonus=sniper.length?Math.min(5,Math.round(sniper.reduce((a,p)=>a+personnelEvaluation(p).precision,0)/sniper.length/20)):0;
    const preparationBonus=op.rehearsalQuality==='우수'?7:op.rehearsalQuality==='양호'?3:-4;
    const authorized=Math.max(0,Number(op.budget)||0),choices=[];let supportCost=0;
    const phases=[];
    const baseScore=Math.max(10,Math.min(90,44+avg*.22+readiness*.16+preparationBonus+specialistBonus-fatiguePenalty-m.risk*12));
    const incident=(seed*37+state.day*11+m.risk*29)%100;
    const situation=op.fieldProgress?.situation||(incident<19?'예상 밖의 현장 위험':incident<43?'현장 상황 변화':'계획 범위 내 상황');
    const pressure=(situation==='예상 밖의 현장 위험'?19:situation==='현장 상황 변화'?9:0)+Math.round(avgFatigue/12)+Math.max(-10,Math.min(16,Number(op.fieldProgress?.riskShift)||0));
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
    const secondIncident=(seed*53+state.day*23+m.id*31)%100;
    const latePressure=(secondIncident<17?14:secondIncident<36?6:0)+Math.max(0,Number(op.fieldProgress?.lateRisk)||0);
    const fieldStamina=Math.max(0,Math.round(100-avgFatigue-m.risk*6-(situation==='예상 밖의 현장 위험'?12:0)));
    const continuingScore=baseScore-pressure+supportBonus-latePressure+Math.round((fieldStamina-50)/12);
    const secondaryRetreat=!retreat&&continuingScore<31&&leaderScore>=40;
    const withdrew=retreat||secondaryRetreat;
    const finalScore=Math.max(5,Math.min(96,continuingScore));
    phases.push({t:185,phase:'지원 상황',detail:effective.length?effective.map(c=>c.name).join(', ')+' 도착':'목표 판정 전 지원 도착 없음',score:supportBonus});
    phases.push({t:205,phase:'상황 재평가',detail:secondaryRetreat?'상황 악화로 현장 철수 결정':latePressure?'추가 위험 확인':'현장 안정 유지',score:Math.round(continuingScore)});
    const success=!withdrew&&((seed*17+state.day*13+m.id*7)%100)<finalScore;
    const exposure=Math.max(2,Math.min(48,11+m.risk*5+pressure+latePressure-Math.round(readiness/13)-Math.round(supportBonus/2)-(withdrew?9:0)));
    const injury=(seed*23+state.day*7)%100<exposure;
    if(injury&&state.cash>=8500000)consider('긴급 의료 후송',8500000,'부상자 보호 및 의료 지원',true,true,0);
    const evacuation=choices.some(c=>c.name==='긴급 의료 후송'&&c.requestedAt+c.eta<=330);
    const death=(seed*31+state.day*19)%100<Math.max(1,Math.round(exposure/3)+(success?0:3)-(evacuation?7:0)-(withdrew?3:0));
    const used=Math.min(state.ammo,Math.max(45,120+seed%180-(withdrew?80:0)));
    const medUsed=injury?1:0;
    phases.push({t:220,phase:'임무 평가',detail:withdrew?'안전 철수':success?'목표 달성':'목표 미달성',score:Math.round(finalScore)});
    phases.push({t:330,phase:'인원 보호',detail:death?'중대한 인명 피해':injury?'부상자 발생':'인원 이상 없음',score:Math.round(exposure)});
    op.resolution={version:6,supportArrivals:op.fieldProgress?.supportArrivals||[],fieldEvents:op.fieldProgress?.events||[],phases,situation,retreat:withdrew,secondaryRetreat,baseScore:Math.round(baseScore),pressure,latePressure,fieldStamina,supportBonus,delayedSupport:delayed.map(c=>c.name),finalScore:Math.round(finalScore),exposure:Math.round(exposure)};
    state.cash-=Math.max(0,supportCost-(Number(op.fieldProgress?.reservedSupportCost)||0));op.actualSupportCost=supportCost;op.supportDecisions=choices;
    state.ammo-=used;state.med-=medUsed;
    const reward=success?m.reward:Math.round(m.reward*(withdrew?.08:.15));state.cash+=reward;
    let casualtyName=null,injuryName=null;
    if(death){const p=members[(seed+1)%members.length];p.dead=true;p.injured=false;p.dateOfDeath=state.date;p.causeOfDeath='작전 중 사망';casualtyName=p.name;state.fallen.unshift({id:p.id,name:p.name,date:state.date,mission:m.title});if(state.leaderId===p.id){const replacement=available().find(x=>x.id!==p.id);state.leaderId=replacement?.id||null}}
    if(injury){const alive=members.filter(p=>!p.dead);if(alive.length){const p=alive[seed%alive.length];p.injured=true;injuryName=p.name}}
    state.reputation=Math.max(0,Math.min(100,state.reputation+(success?3:-4)-(death?4:0)));
    const leaderVoice=op.leaderName||'현장 작전지휘관';
    const logs=[
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
    if(secondaryRetreat)logs.push({t:205,who:leaderVoice,msg:'현장 위험이 다시 높아졌습니다. 인원 안전을 위해 철수로 전환합니다.'});
    if(latePressure)logs.push({t:198,who:'현장 팀원',msg:'현장 상황이 추가로 변했습니다. 위험 평가를 갱신합니다.'});
    if(delayed.length)logs.push({t:218,who:'작전지원본부',msg:'일부 지원이 목표 판정 시점까지 도착하지 못했습니다. 이후 도착분은 성공 판정에 소급 적용하지 않습니다.'});
    if(injuryName)logs.push({t:235,who:'의무 담당',msg:injuryName+' 부상 확인. 응급처치 및 후송 절차를 진행합니다.'},{t:255,who:leaderVoice,msg:'부상자 보호를 최우선으로 하겠습니다. 현장 임무 절차를 조정합니다.'});
    if(casualtyName)logs.push({t:250,who:'작전본부',msg:'중대한 인명 피해 보고를 접수했습니다. 관련 절차를 개시합니다.'});
    choices.forEach((c,i)=>{logs.push({t:c.requestedAt,who:leaderVoice,msg:c.name+' 지원 요청. '+c.reason+'. 승인 예산 내 '+money(c.cost)+' 집행.'});logs.push({t:Math.min(355,c.requestedAt+c.eta),who:'작전지원본부',msg:c.name+' 지원 처리 완료. '+(c.requestedAt+c.eta>220?'목표 판정 이후 도착했습니다.':'현장지휘관에게 상태를 통보했습니다.')})});
    logs.push({t:390,who:leaderVoice,msg:'작전 종료를 보고합니다. 실제 지원비 '+money(supportCost)+', 미사용 승인 한도 '+money(Math.max(0,authorized-supportCost))+'. 상세 결과는 작전본부에 제출하겠습니다.'});logs.sort((a,b)=>a.t-b.t);
    state.history.unshift({id:Date.now()+op.missionId,date:state.date,title:m.title,success,injury:!!injuryName,death:!!casualtyName,casualtyName,injuryName,used,medUsed,reward,supportCost,air:op.air,artillery:op.artillery,budget:op.budget,supportDecisions:choices,resolution:op.resolution,logs,day:state.day,team:members.map(p=>p.name),planId:op.id,method:op.method});
    op.status='작전 완료';op.completed=state.date;delete op.fieldProgress;for(const p of members){p.fatigue=Math.min(100,(p.fatigue||0)+16+m.risk*9);if(p.dead||p.retired)continue;const ev=personnelEvaluation(p);const k=['teamwork','awareness','endurance','tactics'][(seed+p.id)%4];ev[k]=Math.min(97,ev[k]+1)}
    report('재무','작전 예산 집행 정산 · '+op.id,'승인 한도 '+money(authorized)+', 현장지휘관 실제 집행 '+money(supportCost)+', 미사용 한도 '+money(Math.max(0,authorized-supportCost))+'. 지출 내역: '+(choices.map(c=>c.name+' '+money(c.cost)).join(', ')||'추가 지원 없음')+'.',-supportCost,{summary:'현장지휘관의 실제 지원 집행액은 '+money(supportCost)+'이며 미사용 한도는 '+money(Math.max(0,authorized-supportCost))+'입니다.',metrics:[{label:'예산 한도',value:money(authorized)},{label:'실제 지출',value:money(supportCost)},{label:'미사용 한도',value:money(Math.max(0,authorized-supportCost))}],sections:[{title:'집행 개요',items:['작전 식별자: '+op.id,'총 승인 한도: '+money(authorized),'실제 현장 지원비: '+money(supportCost),'미사용 한도: '+money(Math.max(0,authorized-supportCost))]},{title:'현장 지원별 지출',items:choices.length?choices.map(c=>c.name+' / '+money(c.cost)+' / '+c.reason):['추가 지원비 집행 없음']},{title:'정산 기준',items:['지원비는 실제 요청 및 처리된 항목만 집계합니다.','예산 한도 전액을 자동으로 지출하지 않습니다.']}]});
    report('작전','최종 작전 결과 보고 · '+m.title,(success?'임무 성공. ':'임무 실패. ')+(casualtyName?'전사자 '+casualtyName+' 발생. ':'')+(injuryName?'부상자 '+injuryName+' 발생. ':'')+'투입 방식: '+op.method+'.',reward,{summary:(success?'임무 목표 달성. ':'임무 목표 미달성. ')+(casualtyName?'사망자 1명 발생. ':'')+(injuryName?'부상자 1명 발생. ':'')+'현장지휘관의 종료 보고가 접수됐습니다.',metrics:[{label:'임무 결과',value:success?'성공':'실패'},{label:'계약 수입',value:money(reward)},{label:'지원비',value:money(supportCost)}],sections:[{title:'작전 기본 정보',items:['작전명: '+m.title,'작전번호: '+op.id,'현장지휘관: '+op.leaderName,'투입 방식: '+op.method,'투입 인원: '+members.length+'명']},{title:'임무 수행 결과',items:['최종 결과: '+(success?'임무 성공':'임무 실패'),'계약 수입: '+money(reward),'탄약 사용량: '+used,'의료물자 사용량: '+medUsed]},{title:'인원 피해 현황',items:[casualtyName?'사망: '+casualtyName:'사망 보고 없음',injuryName?'부상: '+injuryName:'부상 보고 없음']},{title:'현장 지원 처리',items:choices.length?choices.map(c=>c.name+' / '+money(c.cost)):['추가 지원 요청 없음']},{title:'사후 처리',items:['현장 판단: '+(withdrew?'조기 철수':'임무 계속')+' / 제때 도착한 지원 효과 '+supportBonus+'점 / 최종 평가 '+Math.round(finalScore)+'점','현장 기록과 무전 로그는 작전 다시보기에서 열람할 수 있습니다.','인사 및 재무 변동은 각 부서 기록에 반영됩니다.']}]});
    if(casualtyName)report('인사','긴급 인명 피해 보고 · '+casualtyName,casualtyName+' 용병이 '+m.title+' 수행 중 사망했습니다. 계약 종료 및 추모 기록에 반영했습니다.');
 }
 nextDay=function(){oldNextDay();autoRecruit();runScheduled();state.operations.filter(o=>o.status==='현장 진행 중').forEach(startField);save();render()};
 // Resume any unfinished field operation after a reload without advancing the date.
 setTimeout(()=>{state.operations.filter(o=>o.status==='현장 진행 중').forEach(startField)},0);
 const oldHire=hire;hire=function(id){oldHire(id);const p=state.team.find(x=>x.id===id);if(p)p.dead=false};
 const oldPrepare=prepare;prepare=function(id){if(available().length<2){alert('출동 가능한 용병이 최소 2명 필요합니다.');return}if(state.operations.some(x=>x.missionId===id&&x.status!=='작전 완료'&&x.status!=='작전 보류')){alert('이미 준비 중인 작전입니다.');return}const m=state.missions.find(x=>x.id===id);if(!m)return;state.pending={id,air:'restricted',artillery:'off',budget:20000000,plan:planFor(m)};save();render()};
 approval=function(){const op=state.pending?.plan;if(!op)return '<p class="empty">작전계획이 없습니다.</p>';const m=state.missions.find(x=>x.id===op.missionId);return '<h2>팀장 사전 작전계획서</h2><div class="card"><div class="muted">작전번호 '+op.id+' · 계획 제출 '+op.created+'</div><h2>'+escapeHTML(m.title)+'</h2><div class="line"><span>작전팀장</span><strong>'+escapeHTML(op.leaderName)+'</strong></div><div class="line"><span>투입 예정일</span><strong>'+op.deployDate+'</strong></div><div class="line"><span>사전 연습 예정일</span><strong>'+op.rehearsalDate+'</strong></div><div class="line"><span>투입 방식</span><strong>'+escapeHTML(op.method)+'</strong></div><div class="line"><span>투입 인원</span><strong>'+op.teamIds.length+'명</strong></div><h3>팀장 브리핑</h3><p class="empty">'+escapeHTML(op.briefing)+'</p><h3>사전 연습 계획</h3><p class="empty">'+escapeHTML(op.rehearsal)+'</p><h3>안전·교전 제한</h3><p class="empty">'+escapeHTML(op.rules)+'</p><label>공중 지원 제한<select id="air"><option value="off">금지</option><option value="restricted" selected>조건부 허용</option><option value="authorized">사전 승인 범위 내 허용</option></select></label><label>포병 지원 제한<select id="artillery"><option value="off" selected>금지</option><option value="restricted">조건부 허용</option><option value="authorized">사전 승인 범위 내 허용</option></select></label><label>지원 예산 상한 (원)<input id="budget" type="number" min="0" max="200000000" step="1000000" value="'+op.budget+'"></label><p class="empty">승인 후 즉시 전투하지 않습니다. 예정일에 사전 연습과 작전 투입이 진행됩니다.</p><div class="btnrow">'+btn('작전계획 승인 · 일정 등록','approveScheduled()')+btn('반려','cancel()','secondary')+'</div></div>'};
 function approveScheduled(){const op=state.pending?.plan;if(!op)return;const budget=Number(document.getElementById('budget').value);if(!Number.isFinite(budget)||budget<0||budget>200000000){alert('지원 예산을 확인하세요.');return}op.budget=budget;op.air=document.getElementById('air').value;op.artillery=document.getElementById('artillery').value;op.status='작전 승인';op.departmentBudget={personnel:Math.round(budget*.22),logistics:Math.round(budget*.25),transport:Math.round(budget*.18),medical:Math.round(budget*.15),reserve:budget-Math.round(budget*.22)-Math.round(budget*.25)-Math.round(budget*.18)-Math.round(budget*.15)};state.operations.unshift(op);state.pending=null;report('작전','팀장 작전계획 승인 보고 · '+op.id,op.leaderName+' 팀장 계획 승인. 팀 준비 평가 '+(op.readiness>=82?'우수':op.readiness>=68?'양호':'보완 필요')+'. '+op.rehearsalDate+' 사전 연습, '+op.deployDate+' 작전 투입 예정.');save();render()}
 window.approveScheduled=approveScheduled;
 const oldMissions=missions;missions=function(){let html='<h2>작전 운영 현황</h2>'+state.operations.filter(x=>x.status!=='작전 완료').map(op=>'<div class="card"><div class="line"><strong>'+escapeHTML(op.id)+'</strong><span class="tag">'+escapeHTML(op.status)+'</span></div><p class="empty">팀장 '+escapeHTML(op.leaderName)+' · 투입 '+op.deployDate+'<br>사전 연습 '+op.rehearsalDate+' · '+escapeHTML(op.rehearsal)+'<br>팀 준비 평가 '+(op.readiness>=82?'우수':op.readiness>=68?'양호':'보완 필요')+'<br>투입 방식 '+escapeHTML(op.method)+'</p></div>').join('');return html+oldMissions()};
 const oldHome=home;home=function(){const op=state.operations.filter(x=>x.status!=='작전 완료');return oldHome()+(op.length?'<h2>진행 중인 작전 일정</h2>'+op.map(x=>'<div class="card"><strong>'+escapeHTML(x.id)+'</strong><p class="empty">'+escapeHTML(x.status)+' · 연습 '+x.rehearsalDate+' · 투입 '+x.deployDate+'</p></div>').join(''):'')};
 const oldPeople=people;people=function(){return '<div class="card"><h3>인사팀 자율 채용 지침</h3><p class="empty">사장님이 채용 권한을 위임하면 인사팀은 매월 최대 1명까지 승인된 예산 범위에서 부족 인원을 자동 계약합니다.</p><label><input type="checkbox" id="autoRecruit" '+(state.recruitPolicy.enabled?'checked':'')+'> 인사팀 자동 계약 허용</label><label>최소 유지 인원<input type="number" id="minTeam" min="2" max="12" value="'+state.recruitPolicy.minTeam+'"></label><label>연봉 상한 (원)<input type="number" id="salaryCap" min="10000000" step="10000000" value="'+state.recruitPolicy.maxAnnualSalary+'"></label>'+btn('인사 위임 지침 저장','saveRecruitPolicy()')+'</div><h2>현직 인원 및 사망 기록</h2>'+(state.fallen.length?state.fallen.map(x=>'<div class="card"><strong>'+escapeHTML(x.name)+'</strong><p class="empty">사망일 '+x.date+' · '+escapeHTML(x.mission)+'</p></div>').join(''):'<p class="empty">사망 기록 없음</p>')+oldPeople()};
 function saveRecruitPolicy(){state.recruitPolicy.enabled=document.getElementById('autoRecruit').checked;state.recruitPolicy.minTeam=Math.max(2,Math.min(12,Number(document.getElementById('minTeam').value)||4));state.recruitPolicy.maxAnnualSalary=Math.max(10000000,Number(document.getElementById('salaryCap').value)||110000000);report('인사','인사팀 채용 위임 지침 변경','자동 채용 '+(state.recruitPolicy.enabled?'허용':'중지')+'. 최소 유지 인원 '+state.recruitPolicy.minTeam+'명.');save();render()}
 window.saveRecruitPolicy=saveRecruitPolicy;
 const oldRender=render;render=function(){oldRender()};
 const oldHistory=history;history=function(){return oldHistory()};
})();
