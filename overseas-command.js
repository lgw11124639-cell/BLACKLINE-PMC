/* Fictional ROK overseas command. Additive save migration; one campaign plus recovery only. */
(function(){
 const api=window.fieldSimulation,closed=o=>['작전 완료','작전 보류'].includes(o.status),now=()=>Number(state.day||1)*1440+Number(state.simClock?.minutes||0);
 const command=state.overseasCommand=state.overseasCommand||{version:1,name:'대한민국 해외특수전사령부',phase:'ready',activeId:null,refit:null,processed:[],fundingMonth:null,transfers:[],nextTransferAt:0};
 command.processed=command.processed||[];command.transfers=command.transfers||[];window.blacklineROKArt=true;
 const soldierRanks=new Set(['이병','일병','상병','병장','훈련병','이등병','일등병','병','Private','PFC','Corporal']);
 for(const p of [...(state.team||[]),...(state.transportCrew||[]),...(state.candidates||[])]){const current=String(p.rank||'').trim();if(!soldierRanks.has(current))continue;if(!p.legacyRank)p.legacyRank=current;p.rank=/팀장|지휘|작전장교/.test(p.role||'')?'대위':/조종|항공/.test(p.role||'')?'준위':'하사';}

 // Normalize generated ages against rank and recorded service time; retain original dates for audit.
 const minimumAge={하사:21,중사:25,상사:30,원사:39,준위:34,소위:23,중위:25,대위:29,소령:35,중령:41,대령:46,준장:50};
 const todayYear=Number(state.date.slice(0,4))||2030;
 for(const p of [...(state.team||[]),...(state.transportCrew||[]),...(state.candidates||[]),...(state.commandHQ||[])]){
  const rank=String(p.rank||'').replace('(환산)',''),floor=minimumAge[rank];
  if(!floor)continue;
  const recorded=String(p.birthDate||''),year=Number(recorded.slice(0,4));
  const serviceYear=Number(String(p.military?.start||'').slice(0,4));
  const serviceFloor=serviceYear>=1950&&serviceYear<=todayYear?18+todayYear-serviceYear:0;
  const needed=Math.max(floor,serviceFloor);
  const actual=year>=1950&&year<=todayYear?todayYear-year:0;
  if(actual>=needed)continue;
  if(p.birthDate&&!p.originalBirthDate)p.originalBirthDate=p.birthDate;
  p.birthDate=String(todayYear-needed)+'-'+(/^\\d{4}-\\d{2}-\\d{2}$/.test(recorded)?recorded.slice(5):'03-15');
  if(typeof p.age==='number')p.age=needed;
 }
 const report=(title,body)=>{state.reports.unshift({date:state.date,category:'작전',title,body});state.reports=state.reports.slice(0,160);};
 state.commandHQ=state.commandHQ||[['김정훈','준장','사령관'],['이현우','대령','참모장'],['박지환','소령','작전참모'],['최서진','소령','인사참모'],['정도윤','소령','군수참모']].map(([name,rank,role],i)=>({id:970000+i,name,rank,role,country:'대한민국',unit:'대한민국 해외특수전사령부 · 사령부',salary:90000000,skill:90,birthDate:(Number(state.date.slice(0,4))-(i===0?50:i===1?46:37))+'-03-15',military:{start:(Number(state.date.slice(0,4))-(i===0?27:i===1?23:14))+'-03-01',discharge:null,reason:'현역 복무'},assignment:{command:command.name,unit:'사령부',position:role,service:'현역',assignedDate:state.date},loadout:{primary:'K5'}}));
 const findPersonnel=window.blacklineFindPersonnel;window.blacklineFindPersonnel=(id,hired)=>hired?state.commandHQ.find(p=>p.id===id)||findPersonnel?.(id,hired):findPersonnel?.(id,hired);
 const position=p=>/팀장|지휘/.test(p.role)?'특임팀장':/의무|의료|메딕/.test(p.role)?'의무부사관':/저격|정밀/.test(p.role)?'저격수':/정찰/.test(p.role)?'정찰부사관':/지원|기관총/.test(p.role)?'화력지원부사관':/통신/.test(p.role)?'통신부사관':'특전대원';
 window.blacklineMilitaryPrimary=p=>/저격|정밀/.test(p.role)?'K14':/지원|기관총/.test(p.role)?'K15':/정찰|통신|수송/.test(p.role)?'K1A':'K2C1';
 const live=o=>[o.fieldProgress?.tactical,o.preRecon?.status==='진행'?o.preRecon.operation?.fieldProgress?.tactical:null].filter(s=>s&&!s.done);
 function recall(s){if(s.retreat||s.done)return;s.retreat=true;const j=s.journey;if(!j)return;api.transmit(s,s.commander,'파견부대 단일 작전 전환 명령. 신규 과업 중단, 현장 인원·장비를 확인하고 안전 복귀한다.','command',true);if(j.stage==='outbound'){j.transport.returnFrom=j.transport.progress;j.transport.returnDistance=0;api.journeyTools.stage(s,'homebound','임무 통합을 위한 복귀');}else if(!['homebound','boarding','extraction','complete'].includes(j.stage))api.journeyTools.beginExtraction(s);}
 function select(){const pending=state.operations.filter(o=>!closed(o)&&!o.commandReturnOnly),current=pending.find(o=>o.id===command.activeId);return current||pending.find(o=>live(o).length)||pending[0];}
 function beginRefit(op){if(command.processed.includes(op.id))return;command.processed.push(op.id);command.processed=command.processed.slice(-128);const members=[...new Set([...(op.teamIds||[]),...(op.preRecon?.memberIds||[]),...[op.transportPlan,op.jointTransportOne,op.jointTransportTwo].filter(Boolean).flatMap(p=>p.crewIds||[])])],previous=command.refit;command.refit={operationId:op.id,startedAt:previous?.startedAt??now(),earliestAt:Math.max(previous?.earliestAt||0,now()+360),memberIds:[...new Set([...(previous?.memberIds||[]),...members])],checks:[]};command.phase='refit';command.activeId=null;report('파견부대 작전 종료·재정비 명령',op.id+' 종료. 귀환 인원 확인·부상자 치료·피로 회복·총기 및 보호장비 점검·탄약 보급·수송전력 정비를 완료할 때까지 후속 작전 투입을 금지한다.');}
 window.blacklineCampaignCompleted=beginRefit;
 function refitChecks(){const refit=command.refit,staff=state.team.filter(p=>!p.dead&&!p.retired),returning=state.operations.filter(o=>o.commandReturnOnly&&live(o).length),patients=[...state.team,...(state.transportCrew||[])].filter(p=>!p.dead&&!p.retired&&(p.injured||p.awaitingRecovery)),rest=[...staff,...(state.transportCrew||[])].filter(p=>!p.dead&&!p.retired&&refit.memberIds.includes(p.id)&&(p.fatigue||0)>25),ready=staff.filter(p=>!p.injured&&!p.awaitingRecovery&&!p.onMission&&(p.fatigue||0)<=25),roster=window.blacklineJointRoster?.(ready,24)||ready.slice(0,24),minimum=Math.ceil(24*.8);
  const missing=window.blacklineEquipmentReadiness?.(roster)||[],ammo=api.ammoPlan(roster).total,crew=(state.transportCrew||[]).filter(p=>p.transportReservation&&!p.dead&&!p.retired),support=(state.commandSupport?.assets||[]).filter(a=>a.state!=='ready');
  return [{id:'return',label:'전 부대 복귀·인원 확인',ready:!returning.length&&!crew.length,detail:returning.length+'개 부대 / 수송 '+crew.length+'명 복귀 중'},{id:'medical',label:'부상자 치료·후송 현황',ready:true,detail:patients.length+'명 치료·회수 진행 중 · 작전 대기 조건 제외'},{id:'rest',label:'작전 인원 피로 회복',ready:!rest.length,detail:rest.length+'명 피로 회복 중'},{id:'staffing',label:'부대 가용인원 80% 이상·의무 담당',ready:roster.length>=minimum&&roster.filter(p=>/의무|의료|메딕/.test(p.role)).length>=2,detail:roster.length+'/24명 (최소 '+minimum+'명) · 의무 '+roster.filter(p=>/의무|의료|메딕/.test(p.role)).length+'/2명'},{id:'equipment',label:'지급 장비 점검·정비',ready:!missing.length,detail:missing.length+'개 항목 미비'},{id:'supply',label:'탄약·의료물자 재보급',ready:state.ammo>=ammo&&state.med>=30,detail:'탄약 '+state.ammo+'/'+ammo+'발 · 의료 '+state.med+'/30'},{id:'support',label:'기갑·항공·포병 정비',ready:!support.length,detail:support.length+'개 전력 재정비 중'},{id:'inspection',label:'복귀 장비 검사·사후 보고',ready:now()>=refit.earliestAt,detail:Math.max(0,Math.ceil(refit.earliestAt-now()))+'분 남음'}];
 }
 let reviewing=false;
 window.blacklineReviewCommand=function(){if(reviewing)return;reviewing=true;try{
  const previous=state.operations.find(o=>o.id===command.activeId);if(previous?.status==='작전 완료'&&!command.processed.includes(previous.id))beginRefit(previous);
  const active=select();if(active&&command.phase!=='refit'){if(!active.fieldProgress?.tactical&&!active.contract?.nationalOperation&&active.contract)active.contract=window.blacklineJointContract(active.contract);command.activeId=active.id;command.phase='active';}
  for(const op of state.operations){if(op.commandReturnOnly&&!closed(op)&&!live(op).length&&!op.fieldProgress?.tactical&&op.preRecon?.settled){op.status='작전 보류';op.commandRecalledDate=state.date;if(op.workflow){op.workflow.stage='done';op.workflow.dueAt=null;}report('병행 정찰 종료·안전 복귀 확인',op.id+' 정찰 인원과 자원 정산 완료. 본 작전은 통합 부대 재정비 후 신규 명령으로 재검토한다.');}if(!closed(op)&&op.id!==command.activeId&&!live(op).length&&!op.commandReturnOnly&&op.teamIds?.length){op.commandQueuedRoster=op.commandQueuedRoster||op.teamIds.slice();op.teamIds=[];if(op.workflow)op.workflow.reservedIds=[];}if(!closed(op)&&op.id!==command.activeId&&live(op).length){op.commandReturnOnly=true;for(const s of live(op))recall(s);}if(op.commandReturnOnly&&closed(op)&&!command.processed.includes(op.id))beginRefit(op);}
  const current=state.operations.find(o=>o.id===command.activeId);if(current?.status==='작전 완료')beginRefit(current);
  if(command.phase==='refit'){window.blacklineReviewMedicalSupplies?.();command.refit.checks=refitChecks();if(command.refit.checks.every(c=>c.ready)){command.phase='ready';command.lastRefit={...command.refit,completedAt:now()};command.refit=null;report('파견부대 재정비 완료·차기 임무 검토', '전 인원 복귀·치료·휴식·편제·장비·보급·지원전력 점검을 마쳤다. 작전참모부는 다음 단일 전구 작전을 검토한다.');}}
  else if(!current&&!select())command.phase='ready';
 }finally{reviewing=false;}};
 window.blacklineCampaignCanSchedule=function(op){window.blacklineReviewCommand();if(op.commandReturnOnly)return false;if(command.phase==='refit')return false;if(!command.activeId&&!closed(op)){command.activeId=op.id;command.phase='active';}const allow=command.activeId===op.id;if(!allow&&op.workflow){op.workflow.waitingReason='단일 전구 작전·부대 재정비 종료 후 대기 순번에 따라 재검토';}return allow;};
 window.blacklineCanAcceptOperation=function(){window.blacklineReviewCommand();return command.phase==='ready'&&!state.operations.some(o=>!closed(o));};
 const joint=window.blacklineJointContract;window.blacklineJointContract=m=>({...joint(m),nationalOperation:true,issuingAuthority:'해외특수전사령부 작전참모부',fundingSource:'국방 임무 배정',reward:m.reward||0,allocatedBudget:m.allocatedBudget||m.reward||60000000});
 const requirement=window.blacklineStaffingRequirement;window.blacklineStaffingRequirement=m=>{const r=requirement(m);return m.nationalOperation&&!m.preRecon?{...r,minimum:20,reason:'기준 편제 24명 중 가용인원 80% 이상(20명) · 3개 특임팀 탄력 편성'}:r;};
 const assignCallsigns=api.assignCallsigns;api.assignCallsigns=function(s){assignCallsigns(s);if(s.jointOperation&&s.scenario?.mode==='joint')for(const [n,g]of s.jointOperation.groups.entries()){g.name=['제1특임팀 · 구출','제2특임팀 · 호송','제3특임팀 · 지역 통제'][n];for(const [i,u]of s.units.filter(u=>u.faction==='blackline'&&g.memberIds.includes(u.personId)).entries())u.callsign='태극 '+(n+1)+'-'+(i+1);}};
 function funding(){const month=state.date.slice(0,7);if(command.fundingMonth===month)return;command.fundingMonth=month;const amount=600000000;state.cash+=amount;const payroll=Math.ceil(state.commandHQ.reduce((n,p)=>n+p.salary,0)/12);state.cash-=payroll;report('상급부대 월간 파견 운영예산 배정',month+' 운영예산 '+money(amount)+' 배정. 사령부 인건비 '+money(payroll)+' 집행. 인건비·전입 지원·군수 조달·수송·의료·중장비 지원을 실제 사용량에 따라 집행한다. 작전 성공 보상금은 지급하지 않는다.');}
 function reinforce(){if(now()<(command.nextTransferAt||0))return;command.nextTransferAt=now()+180;const available=state.team.filter(p=>!p.dead&&!p.retired&&!p.injured&&!p.awaitingRecovery),target=36,needMedic=available.filter(p=>/의무|의료|메딕/.test(p.role)).length<6;if(available.length>=target&&!needMedic)return;window.blacklineRefreshApplicants?.();let pool=state.candidates.filter(p=>p.country==='대한민국'),candidate=pool.find(p=>needMedic?/의무|의료|메딕/.test(p.role):true);if(!candidate)return;const role=needMedic?'의무부사관':position(candidate),cost=250000;if(state.cash-cost<20000000)return;state.cash-=cost;const p={...candidate,role,country:'대한민국',unit:'대한민국 해외특수전사령부 · 특수임무단',rank:soldierRanks.has(String(candidate.rank||'').trim())?(/팀장/.test(role)?'대위':'하사'):(candidate.rank||(/팀장/.test(role)?'대위':'중사')),military:{start:candidate.military?.start||state.date,discharge:null,reason:'현역 복무'},assignment:{command:command.name,unit:'특수임무단',position:role,assignedDate:state.date,service:'현역',rankDate:state.date},contractStart:state.date,contractEnd:null,injured:false,retired:false,dead:false,loadout:{primary:'미지급'}};state.team.push(p);state.candidates=state.candidates.filter(v=>v.id!==p.id);command.transfers.push({personId:p.id,name:p.name,role,rank:p.rank,date:state.date,cost});command.transfers=command.transfers.slice(-60);report('상급부대 전입 명령 · '+p.rank+' '+p.name,p.unit+' 배속. 직책 '+role+'. 인사 검증·전입 수송비 '+money(cost)+' 집행. 무장·보호장구 지급을 마친 후 편제에 반영한다.');window.blacklineReviewArmory?.();}
 const hr=window.blacklineReviewHR;window.blacklineReviewHR=function(...args){funding();reinforce();return hr?.(...args);};
 // Existing military career and identities remain archived, while current posting is explicit.
 for(const p of [...state.team,...(state.transportCrew||[])]){if(p.dead||p.retired||p.assignment)continue;if(p.rank==='전문 계약직'){p.legacyRank=p.rank;p.rank=/pilot/.test(p.transportJob||'')?'준위':'중사';}p.assignment={command:command.name,unit:p.transportJob?'수송항공지원반':'특수임무단',position:p.transportJob?p.role:position(p),assignedDate:state.date,service:p.country==='대한민국'?'현역 파견':'연합 연락·교관',rankDate:state.date};}
 // A brand-new campaign starts at full authorized strength: 3 x 8 operators + 12 support/reserve.
 // Only fill the first-day starter roster; never rewrite existing people or later campaigns.
 if(Number(state.day||1)===1&&state.date==='2030-01-01'&&!(state.history||[]).length&&(state.team||[]).length<36&&!command.initialRosterCreated){
  const surnames=['김','이','박','최','정','강','조','윤','장','임','한','오'];
  const given=['민준','도현','지훈','현우','준서','태성','성민','재윤','동혁','승호','우진','준혁','서준','정훈','지호','재민','영준','기현','민석','건우','시우','성훈','정민','태훈','성현','승민','준영','민재','진우','재현','현준','동현','기석','종현','진호','승현'];
  const jobs=['팀장','부팀장','의무','통신','정찰','저격수','화력지원','특전대원'];
  const extra=['의무','의무','의무','통신','통신','정찰','정찰','저격수','화력지원','화력지원','특전대원','특전대원'];
  const existing=new Set([...(state.team||[]),...(state.candidates||[]),...(state.transportCrew||[]),...(state.commandHQ||[])].map(p=>Number(p.id)));
  for(let i=(state.team||[]).length;i<36;i++){
   const teamNo=i<24?Math.floor(i/8)+1:0,role=i<24?jobs[i%8]:extra[i-24];
   const rank=role==='팀장'?'대위':role==='부팀장'?'상사':role==='의무'?'중사':i%5===0?'중사':'하사';
   const age=rank==='대위'?33+i%3:rank==='상사'?35+i%4:rank==='중사'?28+i%6:24+i%5;
   let id=10001+i;while(existing.has(id))id++;existing.add(id);
   const birthYear=2030-age;
   state.team.push({id,name:surnames[i%12]+given[i],country:'대한민국',unit:'육군 특수전사령부',rank,role,skill:72+(i*7)%20,salary:48000000+(i%8)*4200000,birthDate:birthYear+'-04-15',military:{start:(2030-Math.max(age-19,4))+'-03-01',discharge:null,reason:'현역 복무'},assignment:{command:command.name,unit:teamNo?'제'+teamNo+'특임팀':'작전지원·예비대',position:position({role}),service:'현역',assignedDate:state.date,rankDate:(2030-(rank==='대위'?3:rank==='상사'?5:rank==='중사'?3:1))+'-03-01'},contractStart:state.date,contractEnd:null,injured:false,retired:false,dead:false,fatigue:0,onMission:false,loadout:{primary:window.blacklineMilitaryPrimary({role})}});
  }
  command.initialRosterCreated=true;
  report('초기 부대 편제 완료','제1·2·3특임팀 각 8명, 작전지원·예비대 12명 등 총 36명 전입 완료. 의무·정찰·통신·화력·저격 담당 편제.');
 }
 funding();window.blacklineReviewArmory?.();window.blacklineReviewCommand();
})();
