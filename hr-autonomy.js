/* Autonomous personnel department: owner reads reports, staff hires and assigns teams. */
(function(){
 const active=()=>state.team.filter(p=>!p.dead&&!p.retired);
 const fit=p=>{const e=personnelEvaluation(p);return e.teamwork*.25+e.tactics*.2+e.awareness*.2+e.endurance*.15+e.leadership*.2};
 const issue=(title,body,detail)=>{state.reports.unshift({date:state.date,category:'인사',title,body,...(detail?{detail}:{})});state.reports=state.reports.slice(0,160)};
 if(!state.hrDepartment)state.hrDepartment={lastReview:null,leaderId:null,teams:[],lastRecruitMonth:null};
 const hr=state.hrDepartment;
 // Retain earlier data; the director no longer makes personnel decisions.
 state.recruitPolicy.enabled=false;
 function recruit(){
  const employed=active();
  const required=Math.max(18,Number(state.staffingDemand?.minimum)||6)+6,needsMedic=employed.filter(p=>!p.injured&&/의무|의료|구급/.test(p.role||'')).length<Math.ceil(required/6);if(employed.filter(p=>!p.injured).length>=required&&!needsMedic||!state.candidates.length)return;
  const candidate=state.candidates.filter(p=>state.cash>=p.salary/12).sort((a,b)=>(needsMedic?( /의무|의료|구급/.test(b.role)?1:0)-( /의무|의료|구급/.test(a.role)?1:0):0)||fit(b)-fit(a)||a.salary-b.salary)[0];
  if(!candidate){issue('채용 보류 보고','인사팀이 신규 채용을 검토했으나 가용 예산이 부족하여 계약을 보류했습니다.');return}
  const p={...candidate,injured:false,dead:false,retired:false,loadout:{primary:'미지급',secondary:'미지급',armor:'미지급',helmet:'미지급',radio:'미지급'}};
  const start=state.date,d=new Date(start+'T12:00:00Z');d.setUTCFullYear(d.getUTCFullYear()+1);
  p.contractStart=start;p.contractEnd=d.toISOString().slice(0,10);
  state.team.push(p);window.blacklineReviewArmory?.();state.candidates=state.candidates.filter(x=>x.id!==p.id);
  issue('인사팀 신규 채용 보고',p.name+' 인원을 '+p.role+' 분야로 채용했습니다. 계약 연봉 '+money(p.salary)+', 계약 종료 예정 '+p.contractEnd+'. 인사팀이 경력과 급여 예산을 검토해 자체 결정했습니다.',{summary:p.name+' 인원을 '+p.role+' 보직으로 신규 채용했습니다.',metrics:[{label:'계약 연봉',value:money(p.salary)},{label:'계약 만료',value:p.contractEnd}],sections:[{title:'채용 인원',items:['성명: '+p.name,'전문 보직: '+p.role,'이전 소속: '+(p.unit||'미기록')]},{title:'계약 조건',items:['계약 시작: '+p.contractStart,'계약 종료: '+p.contractEnd,'연봉: '+money(p.salary)]},{title:'인사본부 판단',items:['보직 적합성과 현재 가용 인력을 고려했습니다.','계약 체결 후 장비 지급은 군수본부에서 별도 관리합니다.']}]});
 }
 function organize(){
  const people=active().slice().sort((a,b)=>fit(b)-fit(a));
  const previous=state.leaderId;
  const leader=people.find(p=>!p.injured&&personnelEvaluation(p).leadership>=80)||people.find(p=>!p.injured)||people[0];
  state.leaderId=leader?.id||null;
  const squads=(state.operations||[]).filter(o=>!['작전 완료','작전 보류'].includes(o.status)).flatMap(o=>(o.taskGroups||[]).map(t=>({...t,operationId:o.id})));
  hr.teams=squads;hr.leaderId=state.leaderId;hr.formationPolicy='mission';
  // Personnel remain in the company pool until operations assigns an actual mission.

 }
 function renew(){
  for(const p of active()){
   if(!p.contractEnd)continue;
   const due=new Date(p.contractEnd+'T12:00:00Z')-new Date(state.date+'T12:00:00Z');
   if(due<0||due>30*86400000)continue;
   const age=personnelAge(p),e=personnelEvaluation(p);
   const good=age<58&&!p.dead&&state.cash>=p.salary/12&&((e.teamwork+e.tactics+e.awareness)/3>=58);
   if(!good)continue;
   const old=p.contractEnd,d=new Date(old+'T12:00:00Z');d.setUTCFullYear(d.getUTCFullYear()+1);p.contractEnd=d.toISOString().slice(0,10);
   issue('인사팀 계약 갱신 보고',p.name+' 용병의 복무 성과와 건강·예산을 검토해 계약을 1년 연장했습니다. 갱신 종료일 '+p.contractEnd+'.',{summary:p.name+' 인원의 계약을 1년 연장했습니다.',metrics:[{label:'연장 기간',value:'1년'},{label:'새 만료일',value:p.contractEnd}],sections:[{title:'계약 변경',items:['계약 인원: '+p.name,'기존 만료일: '+old,'갱신 만료일: '+p.contractEnd,'연봉: '+money(p.salary)]},{title:'갱신 판단',items:['복무 성과, 건강 상태 및 회사 가용 자금을 검토했습니다.']}]});
  }
 }
 function review(force=false){window.blacklineRefreshApplicants?.();
  const minutes=state.day*1440+(state.simClock?.minutes||0),urgent=!!state.staffingDemand&&minutes-(hr.lastUrgentReview??-100)>=10;if(!force&&hr.lastReview===state.date&&!urgent)return;
  renew();
  // Gradual hiring: at most one per day, rather than instantaneous roster filling.
  if(hr.lastReview!==state.date||urgent){recruit();if(urgent)recruit();hr.lastUrgentReview=minutes;}if(force&&!hr.continuousRosterInitialized&&active().length<2)recruit();hr.continuousRosterInitialized=true;organize();hr.lastReview=state.date;save();
 }
 const previousNext=nextDay;
 nextDay=function(){previousNext();review();save();render()};
 const previousPeople=people;
 people=function(){
  const staff=active(),teams=hr.teams||[];
  return '<h2>인사본부 · 부서장 보고</h2><div class="card"><h3>인사 운영 원칙</h3><p class="empty">채용, 계약 갱신, 퇴직, 팀 편제, 팀장 임명은 인사팀이 자율적으로 결정합니다. 사장님께서는 보고서와 인사기록을 열람합니다.</p><div class="line"><span>현직 계약 인원</span><strong>'+staff.length+'명</strong></div><div class="line"><span>운영 팀</span><strong>'+teams.length+'개</strong></div><div class="line"><span>퇴직자</span><strong>'+(state.alumni||[]).length+'명</strong></div><div class="line"><span>작전 중 사망자</span><strong>'+(state.fallen||[]).length+'명</strong></div></div><h2>팀 편제 보고</h2>'+ (teams.length?teams.map(t=>'<div class="card"><h3>'+escapeHTML(t.name)+'</h3><p class="muted">팀장: '+escapeHTML(state.team.find(p=>p.id===t.leaderId)?.name||'미지정')+'</p>'+t.memberIds.map(id=>{const p=state.team.find(x=>x.id===id);return p?'<div class="line"><span>'+escapeHTML(p.name)+' · '+escapeHTML(p.role)+'</span><span class="muted">'+(p.injured?'치료 중':'현역')+'</span></div>':''}).join('')+'</div>').join(''):'<div class="card"><p class="empty">상설 전투팀 없음 · 작전본부가 정찰 결과에 따라 임무별 팀을 편성합니다.</p></div>')+'<h2>현직 인원 기록</h2>'+staff.map(p=>'<div class="card person-click" onclick="openProfile('+p.id+',true)"><div class="line"><strong>'+escapeHTML(p.name)+'</strong><span class="tag">'+escapeHTML(p.role)+'</span></div><p class="muted">'+escapeHTML(p.unit)+' · 만 '+personnelAge(p)+'세 · '+(p.injured?'치료 중':'출동 가능')+'</p><small class="muted">상세 인사기록 열람</small></div>').join('')+'<h2>퇴직·사망 기록</h2>'+(state.alumni||[]).slice(0,10).map(p=>'<div class="card"><strong>'+escapeHTML(p.name)+'</strong><p class="empty">'+escapeHTML(p.reason)+' · '+p.date+'</p></div>').join('')+(state.fallen||[]).slice(0,10).map(p=>'<div class="card"><strong>'+escapeHTML(p.name)+'</strong><p class="empty">작전 중 사망 · '+p.date+'</p></div>').join('');
 };
 // Director sees personnel files but cannot appoint, hire or dismiss.
 const previousProfile=renderProfile;
 renderProfile=function(){previousProfile();if(!selectedProfile)return;const root=document.querySelector('.profile-body');if(!root)return;root.querySelectorAll('.dossier-actions').forEach(el=>el.remove());root.querySelectorAll('button').forEach(el=>{if(/팀장 임명|계약 종료|계약 체결/.test(el.textContent))el.remove()});};
 // The mission team is assembled by the team leader using available personnel.
 const previousPrepare=prepare;
 prepare=function(id){organize();previousPrepare(id);if(state.pending?.plan){const op=state.pending.plan;const eligible=active().filter(p=>!p.injured&&!p.onMission);const chosen=eligible.slice().sort((a,b)=>fit(b)-fit(a)).slice(0,Math.min(4,eligible.length));op.teamIds=chosen.map(p=>p.id);op.leaderId=chosen[0]?.id||null;op.leaderName=chosen[0]?.name||'미지정';issue('작전팀 인원 편성 보고',op.id+' 작전에 '+chosen.map(p=>p.name).join(', ')+' 인원을 배정했습니다. 팀장 '+op.leaderName+'.');save();render()}};
 // Startup: ensure the autonomous HR department is active without requiring an approval.
 window.blacklineReviewHR=()=>review();review(true);
})();
