/* Saved, resource-backed reconnaissance followed by mission-specific task organization. */
(function(){
 const api=window.fieldSimulation;
 const unfinished=o=>!['작전 완료','작전 보류'].includes(o.status);
 function free(except){const used=new Set((state.operations||[]).filter(o=>o!==except&&unfinished(o)).flatMap(o=>[...(o.teamIds||[]),...(o.preRecon?.status==='진행'?o.preRecon.memberIds:[])]));return state.team.filter(p=>!p.dead&&!p.retired&&!p.injured&&!p.onMission&&!p.supportReservation&&!p.recoveryAssignment&&!used.has(p.id));}
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
 window.blacklinePrepareRecon=function(op,m){window.blacklineReviewArmory?.();const pool=free();if(pool.length<4||state.med<1)return false;const scouts=roster(pool,4),ammo=api.ammoPlan?.(scouts).total||180,medical=Math.min(state.med,scouts.length+2);if(window.blacklineReviewArmory&&scouts.some(p=>!p.loadout?.primary||p.loadout.primary==='미지급'))return false;if(state.ammo<ammo){window.blacklineReviewMunitions?.();if(state.ammo<ammo)return false}if(!scouts.some(p=>/정찰|수색|저격/.test(p.role||''))||!scouts.some(p=>/의무|의료|구급/.test(p.role||'')))return false;
  op.reconSeed=(state.day*7919+Number(m.id||1)*101+37*4)%997;
  const child={id:op.id+'-RECON',leaderName:scouts[0].name,budget:op.budget,teamIds:scouts.map(p=>p.id),fieldProgress:{seed:op.reconSeed,supportOrders:[]}};
  const contract={...m,title:m.title+' · 사전 정찰',objectiveMode:'recon',preRecon:true,mapId:'regional',pinMap:true};
  const tactical=api.create(child,contract,scouts,ammo,{medicalBudget:medical});child.fieldProgress.tactical=tactical;
  state.ammo-=ammo;state.med-=medical;op.preRecon={version:1,issuedAmmo:ammo,issuedMed:medical,status:'진행',memberIds:scouts.map(p=>p.id),operation:child,startedDate:state.date};
  op.teamIds=[];op.taskGroups=[];op.status='사전 정찰';
  say('사전 정찰 출동 · '+m.title,scouts.map(p=>p.name).join(', ')+' 배정. 탄약 '+ammo+'발·의료물자 '+medical+'개 인수. 접근로와 관측 지점을 확인하고 복귀한 뒤 본대 편성을 결정합니다.');return true
 };
 function settleRecon(op){const r=op.preRecon,s=r.operation.fieldProgress.tactical;if(r.settled)return;r.settled=true;r.status=s.retreat?'철수 보고':'정찰 보고';r.finishedDate=state.date;
  r.findings=Object.entries(s.contacts||{}).filter(([,v])=>v.identified!==false).map(([id,v])=>({id,x:v.x,y:v.y,lastSeen:v.lastSeen,source:v.source||'ground',hostile:s.units.some(u=>u.id===id&&(u.faction==='insurgent'||u.faction==='pmc'&&s.rival.hostile))}));
  const own=s.units.filter(u=>u.faction==='blackline');state.ammo+=own.reduce((n,u)=>n+Math.max(0,u.ammo||0),0);state.med+=Math.max(0,(r.issuedMed??1)-(s.medUsed||0));
  for(const u of own){const p=state.team.find(p=>p.id===u.personId);if(!p)continue;if(u.status==='dead'){p.dead=true;p.injured=false}else if(u.hp<=55||u.evacComplete){p.injured=true;if(u.health?.wounds.length){p.medicalCase={operationId:op.id+'-RECON',admittedDate:state.date,status:'진료 대기',wounds:JSON.parse(JSON.stringify(u.health.wounds)),health:JSON.parse(JSON.stringify(u.health))};window.blacklineTreatAtBase?.(p);}p.injuryDetail='사전 정찰 중 부상 · 의무 복귀';}p.fatigue=Math.min(100,(p.fatigue||0)+12)}
  op.status='정찰 후 편성';say('정찰 결과 · '+(op.contract?.title||op.id),'식별된 접촉 '+r.findings.length+'건. '+(s.retreat?'위험으로 정찰을 중단했습니다. ':'관측 경로 확인 후 복귀했습니다. ')+'미관측 구역은 미확인 상태입니다. 작전본부가 편제와 투입 가능 여부를 재검토합니다.');
 }
 window.blacklineReviewMissionPlans=function(){for(const op of state.operations||[]){if(op.status!=='정찰 후 편성')continue;const m=op.contract||{},r=op.preRecon;if(!r?.settled)continue;const base=window.blacklineStaffingRequirement(m),extra=r.findings.filter(f=>f.hostile).length>=4?2:0,minimum=Math.min(12,base.minimum+extra),pool=free(op),chosen=roster(pool,minimum),check=window.blacklineCheckStaffing(m,chosen);
  if(chosen.length<minimum||!check?.ready){state.staffingDemand={...state.staffingDemand,minimum,missing:check?.missing||['편성 인원 부족'],mission:m.title};continue}
  op.teamIds=chosen.map(p=>p.id);op.leaderId=chosen.find(p=>/팀장|지휘/.test(p.role||''))?.id||chosen[0].id;op.leaderName=chosen.find(p=>p.id===op.leaderId).name;op.taskGroups=groups(op,chosen);op.requiredStaffing={...base,minimum};op.status='작전 승인';const now=state.day*1440+(state.simClock?.minutes||0);op.rehearsalAt=now+5;op.deployAt=now+15;op.rehearsalDate=op.deployDate=state.date;
  say('정찰 기반 임무 편성 · '+m.title,chosen.length+'명 · '+op.taskGroups.map(t=>t.name+' '+t.memberIds.length+'명 ('+t.purpose+')').join(' / ')+'. 현장지휘관 '+op.leaderName+' 통합 지휘. 상설 팀이 아닌 이번 작전 전용 편제입니다.');if(state.hrDepartment)state.hrDepartment.teams=state.operations.filter(unfinished).flatMap(o=>o.taskGroups||[]);save();render()
 }};
 window.blacklineMissionPlanSummary=op=>op.status==='사전 정찰'?'사전 정찰 '+Math.floor((op.preRecon?.operation.fieldProgress.tactical.time||0)/60)+'분 · 본대 미편성':op.taskGroups?.length?op.taskGroups.map(t=>t.name+' '+t.memberIds.length+'명').join(' / '):'정찰 결과에 따라 편성';
 window.blacklineApplyTaskGroups=function(op,s){for(const u of s.units.filter(u=>u.faction==='blackline')){const group=op.taskGroups?.find(t=>t.memberIds.includes(u.personId));if(group){u.taskGroup=group.name;u.groupLeaderId=group.leaderId;u.groupPurpose=group.purpose;api.transmit(s,op.leaderName,u.name+', '+group.name+' 배속. '+group.purpose+' 임무를 수행하라.','command');if(group.name.startsWith('브라보')){u.watchSector='측후방·철수로 경계';if(!['medic','commander','sniper','scout'].includes(u.tacticalRole)){const points=s.terrain.positions?.flanks||[],point=points.length?points[op.taskGroups.indexOf(group)%points.length]:[s.goal[0]-10,s.goal[1]+8];u.tacticalRole='support';u.assignment={kind:'측면 엄호',position:api.projectToGround(s.terrain,point)};s.orders.push({t:s.time,actor:u.id,...u.assignment});}}}}};
 window.blacklineReconTick=function(){let changed=false;for(const op of state.operations||[]){if(op.status!=='사전 정찰')continue;const r=op.preRecon,s=r?.operation.fieldProgress.tactical;if(!s)continue;if(!s.done)api.step(s,r.operation);if(s.done){settleRecon(op);changed=true}}
  if(changed){window.blacklineReviewMissionPlans();save();render()}};
 let last=performance.now(),saved=last;
 setInterval(()=>{const now=performance.now();if(now-last<1000)return;last=now;if(document.hidden||state.simClock?.paused||window.blacklineImportingSave||document.body.classList.contains('start-visible'))return;window.blacklineReconTick();if(now-saved>5000){saved=now;if(state.operations.some(o=>o.status==='사전 정찰'))save()}},250);
})();
