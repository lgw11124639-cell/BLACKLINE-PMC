/* Saved, resource-backed reconnaissance followed by mission-specific task organization. */
(function(){
 const api=window.fieldSimulation;
 const unfinished=o=>!['작전 완료','작전 보류'].includes(o.status);
 function free(except){const used=new Set((state.operations||[]).filter(o=>o!==except&&unfinished(o)).flatMap(o=>[...(o.teamIds||[]),...(o.preRecon?.status==='진행'?o.preRecon.memberIds:[]),...(o.workflow?.reservedIds||[])]));return state.team.filter(p=>!p.dead&&!p.retired&&!p.injured&&!p.onMission&&!p.supportReservation&&!p.recoveryAssignment&&!used.has(p.id));}
 window.blacklineAvailablePersonnel=()=>free();
 const say=(title,body)=>{state.reports.unshift({date:state.date,category:'작전',title,body});state.reports=state.reports.slice(0,160)};
 const rating=p=>{const e=personnelEvaluation(p);return (e.awareness||p.skill||50)+(e.tactics||p.skill||50)+(e.leadership||50)*.3};
 function take(pool,pattern){const i=pool.findIndex(p=>pattern.test(p.role||''));return i<0?null:pool.splice(i,1)[0]}
 function roster(pool,minimum){pool=pool.slice().sort((a,b)=>rating(b)-rating(a));const chosen=[];for(const re of [/팀장|지휘/,/의무|의료|구급/,/정찰|수색|저격/]){const p=take(pool,re);if(p)chosen.push(p)}while(chosen.length<minimum&&pool.length)chosen.push(pool.shift());return chosen}
 function groups(op,members){const multi=members.length>=8,main=members.filter(p=>!/저격|정찰/.test(p.role||'')),observers=members.filter(p=>/저격|정찰/.test(p.role||''));const result=[];
  if(multi){const n=Math.ceil(main.length/2);result.push({name:'알파 · 주임무',purpose:'주목표 접근·확보',memberIds:main.slice(0,n).map(p=>p.id)},{name:'브라보 · 지원',purpose:'측후방 경계·철수로 확보',memberIds:main.slice(n).map(p=>p.id)})}else result.push({name:'알파 · 임무팀',purpose:'목표 수행·상호 엄호',memberIds:main.map(p=>p.id)});
  if(observers.length)result.push({name:'오버워치 · 관측',purpose:'선행 관측·원거리 엄호',memberIds:observers.map(p=>p.id)});
  for(const t of result){t.leaderId=members.filter(p=>t.memberIds.includes(p.id)).sort((a,b)=>rating(b)-rating(a))[0]?.id;t.operationId=op.id}return result.filter(t=>t.memberIds.length)
 }
 function dispatchRecon(op,m){window.blacklineReviewArmory?.();const pool=free(op);if(pool.length<4||state.med<1)return false;const scouts=op.workflow?.reservedIds?.length?op.workflow.reservedIds.map(id=>pool.find(p=>p.id===id)).filter(Boolean):roster(pool,4);if(scouts.length<4)return false;if(window.blacklineEquipmentReadiness?.(scouts).length)return false;const ammo=api.ammoPlan?.(scouts).total||180,medical=Math.min(state.med,scouts.length+2);if(window.blacklineReviewArmory&&scouts.some(p=>!p.loadout?.primary||p.loadout.primary==='미지급'))return false;if(state.ammo<ammo){window.blacklineReviewMunitions?.();if(state.ammo<ammo)return false}if(!scouts.some(p=>/정찰|수색|저격/.test(p.role||''))||!scouts.some(p=>/의무|의료|구급/.test(p.role||'')))return false;
  op.reconSeed=op.reconSeed??(state.day*7919+Number(m.id||1)*101+37*4)%997;
  const child={id:op.id+'-RECON',leaderName:scouts[0].name,budget:op.budget,teamIds:scouts.map(p=>p.id),fieldProgress:{seed:op.reconSeed,supportOrders:[]}};
  const contract={...m,title:m.title+' · 사전 정찰',objectiveMode:'recon',preRecon:true,transport:'ground',mapId:'mountain',pinMap:true,reconPlan:op.reconPlan};
  if(window.blacklineReserveTransport&&!window.blacklineReserveTransport(child,'ground'))return false;
  const tactical=api.create(child,contract,scouts,ammo,{medicalBudget:medical});child.fieldProgress.tactical=tactical;
  state.ammo-=ammo;state.med-=medical;op.preRecon={version:1,issuedAmmo:ammo,issuedMed:medical,status:'진행',memberIds:scouts.map(p=>p.id),operation:child,startedDate:state.date};
  op.teamIds=[];op.taskGroups=[];op.status='사전 정찰';if(op.workflow){op.workflow.stage='recon';op.workflow.since=now();op.workflow.dueAt=null;op.workflow.reservedIds=[];op.workflow.waitingReason='';op.workflow.history.push({stage:'recon',at:now()});}
  say('사전 정찰 출동 · '+m.title,scouts.map(p=>p.name).join(', ')+' 배정. 탄약 '+ammo+'발·의료물자 '+medical+'개 인수. 접근로와 관측 지점을 확인하고 복귀한 뒤 본대 편성을 결정합니다.');return true
 };
 function settleRecon(op){const r=op.preRecon,s=r.operation.fieldProgress.tactical;if(r.settled)return;r.settled=true;r.status=s.retreat?'철수 보고':'정찰 보고';r.finishedDate=state.date;
  r.findings=Object.entries(s.contacts||{}).filter(([,v])=>v.identified!==false).map(([id,v])=>({id,x:v.x,y:v.y,lastSeen:v.lastSeen,source:v.source||'ground',hostile:s.units.some(u=>u.id===id&&(u.faction==='insurgent'||u.faction==='pmc'&&s.rival.hostile))}));
  api.settleFieldEquipment?.(s,r.operation);const own=s.units.filter(u=>u.faction==='blackline');const ledger=api.ammoAccounting?.(s,r.operation);state.ammo+=ledger?ledger.returned:own.reduce((n,u)=>n+Math.max(0,u.ammo||0),0);if(ledger)r.ammunition=ledger;state.med+=Math.max(0,(r.issuedMed??1)-(s.medUsed||0));
  for(const u of own){const p=state.team.find(p=>p.id===u.personId);if(!p)continue;if(u.status==='dead'){p.dead=true;p.injured=false}else if(u.hp<=55||u.evacComplete){p.injured=true;if(u.health?.wounds.length){p.medicalCase={operationId:op.id+'-RECON',admittedDate:state.date,status:'진료 대기',wounds:JSON.parse(JSON.stringify(u.health.wounds)),health:JSON.parse(JSON.stringify(u.health))};window.blacklineTreatAtBase?.(p);}p.injuryDetail='사전 정찰 중 부상 · 의무 복귀';}p.fatigue=Math.min(100,(p.fatigue||0)+12)}
  op.status='정찰 보고 검토';if(!op.workflow)op.workflow=workflow('recon');enter(op,'debrief');say('정찰 결과 · '+(op.contract?.title||op.id),'식별된 접촉 '+r.findings.length+'건. '+(s.retreat?'위험으로 정찰을 중단했습니다. ':'관측 경로 확인 후 복귀했습니다. ')+'미관측 구역은 미확인 상태입니다. 작전본부가 편제와 투입 가능 여부를 재검토합니다.');
 }
 const now=()=>state.day*1440+Number(state.simClock?.minutes??480);
 const names={approval:'계약 승인 검토',reconPlan:'정찰 계획 수립',reconReady:'정찰 준비',recon:'사전 정찰',debrief:'정찰 보고 검토',mainPlan:'본 작전계획 수립',rehearsal:'장비 점검·사전훈련',deployReady:'최종 출동 준비',operation:'본 작전',done:'작전 완료'};
 const sequence=Object.keys(names);
 function workflow(stage='approval'){return {version:1,stage,since:now(),dueAt:null,reservedIds:[],waitingReason:'',history:[{stage,at:now()}]};}
 function duration(op,stage){const m=op.contract||{},risk=Math.max(1,Number(m.risk)||1),urgent=/긴급|대피|응급/.test(m.title||''),n=op.preRecon?.findings?.length||0;return {approval:urgent?60:120,reconPlan:(urgent?120:180)+risk*60,reconReady:urgent?90:120,debrief:(urgent?60:120)+n*15,mainPlan:(urgent?180:360)+risk*120+n*20,rehearsal:(urgent?120:240)+risk*60,deployReady:urgent?60:120}[stage]||0;}
 function stamp(at){if(at==null)return '현장 진행';const date=new Date(state.date+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+Math.floor(at/1440)-state.day);const minutes=Math.floor(at%1440);return date.toISOString().slice(0,10)+' '+String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
 function enter(op,stage){const f=op.workflow||workflow(stage);op.workflow=f;f.stage=stage;f.since=now();f.dueAt=duration(op,stage)?now()+duration(op,stage):null;f.waitingReason='';f.waitKey=null;if(!f.history.some(x=>x.stage===stage))f.history.push({stage,at:now()});
  if(!['rehearsal','deployReady','operation','done','recon'].includes(stage))op.status=names[stage];
  if(stage==='rehearsal'){op.status='작전 승인';op.rehearsalAt=f.dueAt;op.deployAt=f.dueAt+duration(op,'deployReady');op.rehearsalDate=stamp(op.rehearsalAt).slice(0,10);op.deployDate=stamp(op.deployAt).slice(0,10);}
  if(stage==='deployReady'){f.dueAt=op.deployAt;op.deployDate=stamp(op.deployAt).slice(0,10);}
  say(names[stage]+' · '+(op.contract?.title||op.id),op.leaderName+' 담당. '+(f.dueAt?'다음 단계 검토 예정 '+stamp(f.dueAt)+'. ':'')+({approval:'계약 조건·예산·위험도를 검토합니다.',reconPlan:'지도·접근로·외곽 관측 위치·통신·후송 계획을 작성합니다.',reconReady:'정찰 인원과 장비·탄약·수송 준비를 확인합니다.',debrief:'정찰 자료와 미확인 구역, 피해·정비 소요를 정리합니다.',mainPlan:'정찰 결과에 따라 목표·편제·지원·철수 계획을 수립합니다.',rehearsal:'본대 장비 점검과 역할·통신·후송 모의훈련을 진행합니다.',deployReady:'훈련 결과를 반영한 최종 브리핑과 출동 인수를 진행합니다.'}[stage]||'현장 지휘관이 자율적으로 임무를 수행합니다.'));
 }
 function wait(op,reason){const f=op.workflow;f.waitingReason=reason;if(f.waitKey!==reason){f.waitKey=reason;say(names[f.stage]+' 대기 · '+(op.contract?.title||op.id),reason+' 준비가 확인되면 현재 단계부터 재개합니다.');save();render();}return false;}
 window.blacklinePrepareRecon=function(op,m){if(op.workflow)return true;const pool=free(op);if(pool.length<4)return false;op.contract=op.contract||m;op.teamIds=[];op.taskGroups=[];op.workflow=workflow();enter(op,'approval');delete op.rehearsalAt;delete op.deployAt;return true;};
 function draft(op){const m=op.contract||{},r=op.preRecon,base=window.blacklineStaffingRequirement(m),extra=(r?.findings||[]).filter(f=>f.hostile).length>=4?2:0,minimum=Math.min(12,base.minimum+extra),chosen=roster(free(op),minimum),check=window.blacklineCheckStaffing(m,chosen);
  if(chosen.length<minimum||!check.ready){state.staffingDemand={...state.staffingDemand,minimum,missing:check?.missing||['편성 인원 부족'],mission:m.title};return wait(op,(check.missing||['편성 인원 부족']).join(' · '));}
  op.teamIds=chosen.map(p=>p.id);op.leaderId=chosen.find(p=>/팀장|지휘/.test(p.role||''))?.id||chosen[0].id;op.leaderName=chosen.find(p=>p.id===op.leaderId).name;op.taskGroups=groups(op,chosen);op.requiredStaffing={...base,minimum};op.workflow.reservedIds=[];
  op.operationalPlan={version:1,createdAt:now(),objective:m.type==='구조'?'대상 확인·안정화·보호 인계':m.type==='호송'?'보호 대상 확인·호송·안전 인계':m.type==='시설 보안'?'외곽 경계·시설 인수':'위협 식별·의뢰 목표 수행',identifiedContacts:(r?.findings||[]).length,hostileContacts:(r?.findings||[]).filter(f=>f.hostile).length,unknownAreas:['건물 내부','미관측 접근로'],groups:groups(op,chosen),method:op.method,air:op.air,artillery:op.artillery,withdrawal:'전투 가용 인원 부족·중대한 부상·탄약 소진 시 인원 보호와 철수 우선'};
  say('정찰 기반 본 작전계획 · '+m.title,chosen.length+'명 · '+op.taskGroups.map(t=>t.name+' '+t.memberIds.length+'명 ('+t.purpose+')').join(' / ')+'. 훈련과 최종 준비를 마친 뒤 투입합니다.');if(state.hrDepartment)state.hrDepartment.teams=state.operations.filter(unfinished).flatMap(o=>o.taskGroups||[]);return true;
 }
 window.blacklineReviewOperationWorkflow=function(op){const f=op.workflow;if(!f)return false;const stage=f.stage;
  if(op.status==='현장 진행 중'){if(stage!=='operation'){f.stage='operation';f.since=now();f.dueAt=null;f.history.push({stage:'operation',at:now()});return true;}return false;}
  if(op.status==='작전 완료'){f.stage='done';f.dueAt=null;return false;}
  if(stage==='recon')return false;
  if(stage==='rehearsal'){if(op.status==='사전 연습 완료'){enter(op,'deployReady');return true;}f.dueAt=op.rehearsalAt;return false;}
  if(stage==='deployReady')return false;
  if(now()<f.dueAt)return false;
  if(stage==='approval')enter(op,'reconPlan');
  else if(stage==='reconPlan'){const scouts=roster(free(op),4);if(scouts.length<4)return wait(op,'정찰 편제 4명 확보 필요.');f.reservedIds=scouts.map(p=>p.id);op.reconSeed=op.reconSeed??(state.day*7919+Number(op.contract?.id||1)*101+37*4)%997;const map=api.maps.mountain,area=(map.goals[op.contract?.type]||map.goals['시설 보안']).slice(),ridge=(map.positions.highGrounds||[]).filter(p=>!p.roof&&Math.hypot(p.x-area[0],p.y-area[1])>=30).sort((a,b)=>b.height-a.height)[0];op.reconPlan={version:1,createdAt:now(),mapId:'mountain',targetArea:area,observationRidge:ridge?{x:ridge.x,y:ridge.y,height:ridge.height}:null,noEntry:true,memberIds:f.reservedIds.slice(),extraction:ridge?api.projectToGround(map,[ridge.x-7,ridge.y+7]):map.base.slice(),unknownAreas:['건물 내부','관측이 차폐된 구역']};op.reconPlan.ingress=api.journeyTools.route(map,map.base,op.reconPlan.extraction);enter(op,'reconReady');say('정찰 계획서 · '+(op.contract?.title||op.id),scouts.map(p=>p.name).join(', ')+' 배정. '+(ridge?'외곽 능선 '+ridge.x+'/'+ridge.y+' · 높이 '+ridge.height+'에서 관측. ':'외곽 안전 지점에서 관측. ')+'작전구역·건물 진입 금지. 접근 경로 '+op.reconPlan.ingress.length+'개 경유 지점, 복귀 집결지와 의료 후송 절차를 확인합니다.');}
  else if(stage==='reconReady'){if(f.reservedIds.some(id=>!free(op).some(p=>p.id===id))){f.reservedIds=[];enter(op,'reconPlan');return true;}if(!dispatchRecon(op,op.contract))return wait(op,'정찰 담당·의무 인원, 지급 장비, 탄약·의료물자 확보 필요.');}
  else if(stage==='debrief')enter(op,'mainPlan');
  else if(stage==='mainPlan'){if(!draft(op))return false;enter(op,'rehearsal');}
  else return false;return true;
 };
 window.blacklineReviewMissionPlans=function(){let changed=false;for(const op of state.operations||[])if(window.blacklineReviewOperationWorkflow(op))changed=true;if(changed){save();render();}};
 window.blacklineCanDeployWorkflow=function(op){if(!op.workflow)return true;const people=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(p=>p&&!p.dead&&!p.retired&&!p.injured),check=window.blacklineCheckStaffing(op.contract||{},people);if(!check.ready){op.teamIds=[];enter(op,'mainPlan');return wait(op,'출동 인원 변동으로 편제를 다시 검토합니다.');}
  window.blacklineReviewArmory?.();const missing=window.blacklineEquipmentReadiness?.(people)||[],ammo=api.ammoPlan?.(people).total||120;if(missing.length||state.ammo<ammo||state.med<1){wait(op,missing.join(' · ')||'출동 탄약·의료물자 확보 필요.');op.deployAt=now()+60;op.workflow.dueAt=op.deployAt;op.deployDate=stamp(op.deployAt).slice(0,10);return false;}
  if(window.blacklineReserveTransport&&!window.blacklineReserveTransport(op,api.chooseTransport(op,op.contract||{}))){wait(op,'수송 승무원·기체·급유 비용 확보 필요.');op.deployAt=now()+60;op.workflow.dueAt=op.deployAt;return false;}
  op.workflow.waitingReason='';return true;
 };
 window.blacklineMissionStageLabel=op=>names[op.workflow?.stage]||op.status;
 window.blacklineMissionPlanSummary=function(op){const f=op.workflow;if(f)return (names[f.stage]||op.status)+(f.waitingReason?' · '+f.waitingReason:f.dueAt?' · 다음 검토 '+stamp(f.dueAt):f.stage==='recon'?' · 현장 복귀·보고 대기':' · 실제 현장 진행');return op.status;};
 window.blacklineMissionTimeline=function(op){const f=op.workflow;if(!f)return '';const current=sequence.indexOf(f.stage);return '<div class="mission-workflow" aria-label="계약에서 출동까지 진행 절차">'+sequence.filter(s=>s!=='done').map((s,i)=>'<span class="workflow-step '+(i<current?'done':i===current?'current':'')+'">'+(i<current?'✓ ':String(i+1).padStart(2,'0')+' ')+names[s]+'</span>').join('')+'<p>회사 일정 기준 · 인원·장비 준비가 부족하면 현재 단계에서 대기합니다.</p></div>';};
 for(const op of state.operations||[]){if(op.workflow||op.status==='작전 완료'||op.status==='작전 보류'||op.fieldProgress?.tactical)continue;op.originalWorkflowSchedule={status:op.status,rehearsalAt:op.rehearsalAt,deployAt:op.deployAt,teamIds:(op.teamIds||[]).slice()};if(op.preRecon?.status==='진행'){op.workflow=workflow('recon');continue;}if(op.preRecon?.settled){op.workflow=workflow('debrief');enter(op,'debrief');}else{op.teamIds=[];op.workflow=workflow();enter(op,'approval');}delete op.rehearsalAt;delete op.deployAt;}
 window.blacklineApplyTaskGroups=function(op,s){for(const u of s.units.filter(u=>u.faction==='blackline')){const group=op.taskGroups?.find(t=>t.memberIds.includes(u.personId));if(group){u.taskGroup=group.name;u.groupLeaderId=group.leaderId;u.groupPurpose=group.purpose;api.transmit(s,op.leaderName,u.name+', '+group.name+' 배속. '+group.purpose+' 임무를 수행하라.','command');if(group.name.startsWith('브라보')){u.watchSector='측후방·철수로 경계';if(!['medic','commander','sniper','scout'].includes(u.tacticalRole)){const points=s.terrain.positions?.flanks||[],point=points.length?points[op.taskGroups.indexOf(group)%points.length]:[s.goal[0]-10,s.goal[1]+8];u.tacticalRole='support';u.assignment={kind:'측면 엄호',position:api.projectToGround(s.terrain,point)};s.orders.push({t:s.time,actor:u.id,...u.assignment});}}}}};
 window.blacklineReconTick=function(){let changed=false;for(const op of state.operations||[]){if(op.status!=='사전 정찰')continue;const r=op.preRecon,s=r?.operation.fieldProgress.tactical;if(!s)continue;if(!s.done)api.step(s,r.operation);if(s.done){settleRecon(op);changed=true}}
  if(changed){window.blacklineReviewMissionPlans();save();render()}};
 let last=performance.now(),saved=last;
 setInterval(()=>{const now=performance.now();if(now-last<1000)return;last=now;if(document.hidden||state.simClock?.paused||window.blacklineImportingSave||document.body.classList.contains('start-visible'))return;window.blacklineReconTick();if(now-saved>5000){saved=now;if(state.operations.some(o=>o.status==='사전 정찰'))save()}},250);
})();
