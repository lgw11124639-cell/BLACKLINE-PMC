
/* BLACKLINE PMC: mission planning, rehearsals, deployment schedule, casualties, recruitment delegation. */
(function(){
 const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 const report=(category,title,body,amount)=>{state.reports.unshift({date:state.date,category,title,body,...(amount===undefined?{}:{amount})});state.reports=state.reports.slice(0,160)};
 const available=()=>state.team.filter(p=>!p.dead&&!p.injured&&!p.onMission);
 const leader=()=>state.team.find(p=>p.id===state.leaderId&&!p.dead)||available()[0];
 const methodFor=(m)=>m.id===1?'지상 차량 이동':m.id===2?'항공 수송 후 도보 이동':'지상 차량 이동 및 현장 인수';
 const rehearsalFor=(m)=>m.id===1?'호송 절차 및 응급상황 대응 연습':m.id===2?'민간인 보호·구조 및 후송 모의훈련':'출입통제 및 시설 대피 모의훈련';
 const planFor=(m)=>({id:'OP-'+String(state.day).padStart(4,'0')+'-'+m.id,missionId:m.id,leaderId:leader()?.id,leaderName:leader()?.name||'미지정',teamIds:available().map(p=>p.id),created:state.date,deployDate:addDays(state.date,m.risk>1?4:3),rehearsalDate:addDays(state.date,1),method:methodFor(m),rehearsal:rehearsalFor(m),status:'계획 검토',briefing:'작전 목표와 인명 보호 기준을 최우선으로 합니다. 팀별 역할, 의뢰기관 연락체계, 현장 위험 요소, 비상 철수 기준을 사전에 확인합니다.',rules:'민간인 보호 및 안전 기준 준수. 현장 상황이 악화되면 팀장은 임무 중단 및 복귀를 결정할 수 있습니다.',air:'restricted',artillery:'off',budget:20000000});
 if(!Array.isArray(state.operations))state.operations=[];
 if(!state.recruitPolicy)state.recruitPolicy={enabled:false,minTeam:4,maxAnnualSalary:110000000,monthlyLimit:1};
 if(!Array.isArray(state.fallen))state.fallen=[];
 state.team.forEach(p=>{if(p.dead)p.injured=false});
 const oldNextDay=nextDay;
 function autoRecruit(){
  const policy=state.recruitPolicy;if(!policy.enabled)return;
  const living=state.team.filter(p=>!p.dead);if(living.length>=policy.minTeam)return;
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
   if(op.status==='작전 승인'&&state.date>=op.rehearsalDate){
    op.status='사전 연습 완료';op.rehearsalComplete=true;
    report('작전','팀장 사전 연습 결과 보고 · '+op.id,op.leaderName+' 팀장이 '+op.rehearsal+'을 완료했습니다. 위험 요소 및 후송 절차를 점검했습니다.');
   }
   if((op.status==='사전 연습 완료'||op.status==='작전 승인')&&state.date>=op.deployDate){
    const m=state.missions.find(x=>x.id===op.missionId);
    if(!m){op.status='작전 보류';continue}
    const members=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(p=>p&&!p.dead&&!p.injured);
    if(members.length<2){op.status='작전 보류';report('작전','작전 투입 보류 · '+op.id,'출동 가능한 인원이 부족합니다. 팀장에게 재편성 보고를 요청했습니다.');continue}
    if(state.ammo<120||state.med<1){op.status='작전 보류';report('군수','작전 투입 보류 · '+op.id,'탄약 또는 의료물자가 부족하여 투입을 중단했습니다.');continue}
    const seed=(state.day*7919+m.id*101+state.history.length*509+members.length*37)%997;
    const avg=members.reduce((a,p)=>a+p.skill,0)/members.length;
    const success=seed%100<Math.min(94,Math.max(30,60+avg*.3-m.risk*12));
    const injury=seed%7===0||(!success&&seed%3===0);
    const death=(!success&&seed%11===0)||(m.risk>1&&seed%23===0);
    const used=Math.min(state.ammo,120+seed%180),supportCost=0,medUsed=injury?1:0;
    state.ammo-=used;state.med-=medUsed;
    const reward=success?m.reward:Math.round(m.reward*.15);state.cash+=reward;
    let casualtyName=null,injuryName=null;
    if(death){const p=members[(seed+1)%members.length];p.dead=true;p.injured=false;p.dateOfDeath=state.date;p.causeOfDeath='작전 중 사망';casualtyName=p.name;state.fallen.unshift({id:p.id,name:p.name,date:state.date,mission:m.title});if(state.leaderId===p.id){const replacement=available().find(x=>x.id!==p.id);state.leaderId=replacement?.id||null}}
    if(injury){const alive=members.filter(p=>!p.dead);if(alive.length){const p=alive[seed%alive.length];p.injured=true;injuryName=p.name}}
    state.reputation=Math.max(0,Math.min(100,state.reputation+(success?3:-4)-(death?4:0)));
    const logs=[{t:0,who:'작전통제',msg:'사전 승인된 작전이 예정일에 개시되었습니다.'},{t:30,who:op.leaderName,msg:'투입 방식: '+op.method+'. 인원과 장비 상태 확인 완료.'},{t:95,who:'현장팀',msg:'작전 목표 확인. 민간인 보호 기준을 준수합니다.'},{t:220,who:op.leaderName,msg:success?'주요 임무 목표 달성. 복귀를 준비합니다.':'상황 악화로 임무를 중단하고 철수합니다.'}];
    if(injuryName)logs.push({t:235,who:'의무 담당',msg:injuryName+' 부상. 응급처치 및 후송 절차 진행.'});
    if(casualtyName)logs.push({t:250,who:'작전통제',msg:'인명 피해 발생. 사망자 확인 및 유가족 통보 절차를 시작합니다.'});
    logs.push({t:390,who:'작전통제',msg:'작전 종료. 사후 보고서를 제출합니다.'});logs.sort((a,b)=>a.t-b.t);
    state.history.unshift({id:Date.now()+op.missionId,date:state.date,title:m.title,success,injury:!!injuryName,death:!!casualtyName,casualtyName,injuryName,used,medUsed,reward,supportCost,air:op.air,artillery:op.artillery,budget:op.budget,logs,day:state.day,team:members.map(p=>p.name),planId:op.id,method:op.method});
    op.status='작전 완료';op.completed=state.date;
    report('작전','최종 작전 결과 보고 · '+m.title,(success?'임무 성공. ':'임무 실패. ')+(casualtyName?'전사자 '+casualtyName+' 발생. ':'')+(injuryName?'부상자 '+injuryName+' 발생. ':'')+'투입 방식: '+op.method+'.',reward);
    if(casualtyName)report('인사','긴급 인명 피해 보고 · '+casualtyName,casualtyName+' 용병이 '+m.title+' 수행 중 사망했습니다. 계약 종료 및 추모 기록에 반영했습니다.');
   }
  }
 }
 nextDay=function(){oldNextDay();autoRecruit();runScheduled();save();render()};
 const oldHire=hire;hire=function(id){oldHire(id);const p=state.team.find(x=>x.id===id);if(p)p.dead=false};
 const oldPrepare=prepare;prepare=function(id){if(available().length<2){alert('출동 가능한 용병이 최소 2명 필요합니다.');return}if(state.operations.some(x=>x.missionId===id&&x.status!=='작전 완료'&&x.status!=='작전 보류')){alert('이미 준비 중인 작전입니다.');return}const m=state.missions.find(x=>x.id===id);if(!m)return;state.pending={id,air:'restricted',artillery:'off',budget:20000000,plan:planFor(m)};save();render()};
 approval=function(){const op=state.pending?.plan;if(!op)return '<p class="empty">작전계획이 없습니다.</p>';const m=state.missions.find(x=>x.id===op.missionId);return '<h2>팀장 사전 작전계획서</h2><div class="card"><div class="muted">작전번호 '+op.id+' · 계획 제출 '+op.created+'</div><h2>'+escapeHTML(m.title)+'</h2><div class="line"><span>작전팀장</span><strong>'+escapeHTML(op.leaderName)+'</strong></div><div class="line"><span>투입 예정일</span><strong>'+op.deployDate+'</strong></div><div class="line"><span>사전 연습 예정일</span><strong>'+op.rehearsalDate+'</strong></div><div class="line"><span>투입 방식</span><strong>'+escapeHTML(op.method)+'</strong></div><div class="line"><span>투입 인원</span><strong>'+op.teamIds.length+'명</strong></div><h3>팀장 브리핑</h3><p class="empty">'+escapeHTML(op.briefing)+'</p><h3>사전 연습 계획</h3><p class="empty">'+escapeHTML(op.rehearsal)+'</p><h3>안전·교전 제한</h3><p class="empty">'+escapeHTML(op.rules)+'</p><label>공중 지원 제한<select id="air"><option value="off">금지</option><option value="restricted" selected>조건부 허용</option><option value="authorized">사전 승인 범위 내 허용</option></select></label><label>포병 지원 제한<select id="artillery"><option value="off" selected>금지</option><option value="restricted">조건부 허용</option><option value="authorized">사전 승인 범위 내 허용</option></select></label><label>지원 예산 상한 (원)<input id="budget" type="number" min="0" max="200000000" step="1000000" value="'+op.budget+'"></label><p class="empty">승인 후 즉시 전투하지 않습니다. 예정일에 사전 연습과 작전 투입이 진행됩니다.</p><div class="btnrow">'+btn('작전계획 승인 · 일정 등록','approveScheduled()')+btn('반려','cancel()','secondary')+'</div></div>'};
 function approveScheduled(){const op=state.pending?.plan;if(!op)return;const budget=Number(document.getElementById('budget').value);if(!Number.isFinite(budget)||budget<0||budget>200000000){alert('지원 예산을 확인하세요.');return}op.budget=budget;op.air=document.getElementById('air').value;op.artillery=document.getElementById('artillery').value;op.status='작전 승인';state.operations.unshift(op);state.pending=null;report('작전','팀장 작전계획 승인 보고 · '+op.id,op.leaderName+' 팀장 계획 승인. '+op.rehearsalDate+' 사전 연습, '+op.deployDate+' 작전 투입 예정.');save();render()}
 window.approveScheduled=approveScheduled;
 const oldMissions=missions;missions=function(){let html='<h2>작전 운영 현황</h2>'+state.operations.filter(x=>x.status!=='작전 완료').map(op=>'<div class="card"><div class="line"><strong>'+escapeHTML(op.id)+'</strong><span class="tag">'+escapeHTML(op.status)+'</span></div><p class="empty">팀장 '+escapeHTML(op.leaderName)+' · 투입 '+op.deployDate+'<br>사전 연습 '+op.rehearsalDate+' · '+escapeHTML(op.rehearsal)+'<br>투입 방식 '+escapeHTML(op.method)+'</p></div>').join('');return html+oldMissions()};
 const oldHome=home;home=function(){const op=state.operations.filter(x=>x.status!=='작전 완료');return oldHome()+(op.length?'<h2>진행 중인 작전 일정</h2>'+op.map(x=>'<div class="card"><strong>'+escapeHTML(x.id)+'</strong><p class="empty">'+escapeHTML(x.status)+' · 연습 '+x.rehearsalDate+' · 투입 '+x.deployDate+'</p></div>').join(''):'')};
 const oldPeople=people;people=function(){return '<div class="card"><h3>인사팀 자율 채용 지침</h3><p class="empty">사장님이 채용 권한을 위임하면 인사팀은 매월 최대 1명까지 승인된 예산 범위에서 부족 인원을 자동 계약합니다.</p><label><input type="checkbox" id="autoRecruit" '+(state.recruitPolicy.enabled?'checked':'')+'> 인사팀 자동 계약 허용</label><label>최소 유지 인원<input type="number" id="minTeam" min="2" max="12" value="'+state.recruitPolicy.minTeam+'"></label><label>연봉 상한 (원)<input type="number" id="salaryCap" min="10000000" step="10000000" value="'+state.recruitPolicy.maxAnnualSalary+'"></label>'+btn('인사 위임 지침 저장','saveRecruitPolicy()')+'</div><h2>현직 인원 및 사망 기록</h2>'+(state.fallen.length?state.fallen.map(x=>'<div class="card"><strong>'+escapeHTML(x.name)+'</strong><p class="empty">사망일 '+x.date+' · '+escapeHTML(x.mission)+'</p></div>').join(''):'<p class="empty">사망 기록 없음</p>')+oldPeople()};
 function saveRecruitPolicy(){state.recruitPolicy.enabled=document.getElementById('autoRecruit').checked;state.recruitPolicy.minTeam=Math.max(2,Math.min(12,Number(document.getElementById('minTeam').value)||4));state.recruitPolicy.maxAnnualSalary=Math.max(10000000,Number(document.getElementById('salaryCap').value)||110000000);report('인사','인사팀 채용 위임 지침 변경','자동 채용 '+(state.recruitPolicy.enabled?'허용':'중지')+'. 최소 유지 인원 '+state.recruitPolicy.minTeam+'명.');save();render()}
 window.saveRecruitPolicy=saveRecruitPolicy;
 const oldRender=render;render=function(){oldRender()};
 const oldHistory=history;history=function(){return oldHistory()};
})();
