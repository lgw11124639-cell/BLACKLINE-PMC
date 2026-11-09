/* Fifteen-minute foreground operations with local perception, search and return. */
(function(){
 const api=window.fieldSimulation,legacyCreate=api.create,legacyStep=api.step;
 const {rand,move,damage,active,dist}=api.internals,MAP=api.MAP;
 const log=(s,who,msg,kind='radio')=>s.radio.push({t:s.time,who,msg,kind});
 const foes=(s,a,b)=>a.faction!==b.faction&&(a.faction==='insurgent'||b.faction==='insurgent'||s.rival.hostile);
 const visible=(s,a,b)=>dist(a,b)<=a.vision&&api.clearLine(a,b,s.terrain||MAP);
 function snapshot(s){const frame={t:s.time,objective:Math.round(s.objective),retreat:s.retreat,phase:s.phase,contacts:Object.entries(s.contacts).map(([id,c])=>[id,+c.x.toFixed(2),+c.y.toFixed(2),c.lastSeen,c.visible]),units:s.units.map(u=>[+u.x.toFixed(2),+u.y.toFixed(2),u.hp,u.ammo,u.status,+u.heading.toFixed(2),+(u.elevation||0).toFixed(1)])};s.previousLiveFrame=s.liveFrame||frame;s.liveFrame=frame;if(s.time%5===0||s.done)s.frames.push(frame)}
 api.create=function(op,m,members,ammoBudget,options={}){
  const s=legacyCreate(op,m,members,ammoBudget,options);
  s.version=2;s.duration=900;s.plannedDuration=900;s.time=0;s.phase='접근';s.frames=[];s.events=[];s.radio=[];s.contacts={};s.searchStarted=null;s.securedAt=null;s.returnStarted=null;s.checkpoint=0;s.mutedLog=false;
  s.terrain=JSON.parse(JSON.stringify(api.selectMap?.(m)||MAP));s.map=s.terrain.id||'factory';s.goal=s.terrain.goals[m.type]||s.terrain.goals['시설 보안'];s.medicalBudget=options.medicalBudget??Math.min(2,Number(state.med)||0);s.medUsed=0;
  const positions=(s.terrain.spawnPoints||[[48,29],[57,31],[60,34],[71,37],[84,28],[90,30],[92,39],[76,41]]).map(p=>p.slice());
  for(const [i,u] of s.units.entries()){
   if(u.faction==='blackline'&&s.map!=='factory'){u.x=s.terrain.base[0]+(i%3)*1.1;u.y=s.terrain.base[1]+Math.floor(i/3)}
   if(u.faction==='pmc'&&s.map!=='factory'){u.x=s.goal[0]+7+(i%3)*1.2;u.y=s.goal[1]+6+(i%2)*1.5}
   if(u.faction==='insurgent'){const p=positions.splice(Math.floor(rand(s)*positions.length),1)[0];u.x=p[0];u.y=p[1]}
   u.vision=u.faction==='blackline'?(/정찰/.test(u.role)?15:/저격/.test(u.role)?13:10):11;
   u.range=/저격|정밀/.test(u.role)?18:10;u.heading=-Math.PI/2;u.knowledge={};u.recognition={};u.nextShot=0;u.aimSince=null;u.waitUntil=0;u.patrolIndex=i%3;const ground=api.projectToGround?.(s.terrain,[u.x,u.y])||[u.x,u.y];u.x=ground[0];u.y=ground[1];u.spawn=[u.x,u.y];u.seenAt=null;
  }
  api.roles?.initialize(s,op);
  log(s,op.leaderName||'팀장','출발한다. 알려진 것은 의뢰 구역뿐이다. 접근로부터 확인하고 미확인 구역에 대한 사격은 금지한다.','command');snapshot(s);return s;
 };
 function perceive(s){
  const blue=s.units.filter(u=>u.faction==='blackline'&&active(u));
  for(const c of Object.values(s.contacts))c.visible=false;
  for(const u of s.units){
   if(!active(u))continue;
   for(const target of s.units){
    if(target.faction===u.faction||!active(target))continue;
    if(!visible(s,u,target)){delete u.recognition[target.id];continue}
    u.recognition[target.id]=(u.recognition[target.id]||0)+1;
    if(u.recognition[target.id]<(/정찰/.test(u.role)?2:4))continue;
    const previous=u.knowledge[target.id];u.knowledge[target.id]={x:target.x,y:target.y,lastSeen:s.time};
    if(u.faction==='blackline'){
     const first=!s.contacts[target.id];s.contacts[target.id]={firstSeen:s.contacts[target.id]?.firstSeen??s.time,x:target.x,y:target.y,lastSeen:s.time,visible:true,faction:target.faction};
     if(first){target.seenAt=s.time;log(s,u.name,target.faction==='pmc'?s.rival.name+' 소속 인원 관측. 상호 식별을 진행한다.':'무장 인원 시각 확인. 현 위치 엄폐, 팀장에게 접촉 보고.','contact');s.events.push({t:s.time,kind:'contact',target:target.id,visible:true})}
     if(target.faction==='pmc'&&!s.rival.identified){s.rival.identified=true;log(s,'현장지휘관',s.rival.hostile?'경계구역 충돌 가능. 접근을 중단하고 상대 의도를 확인한다.':'다른 PMC 계약 수행 구역 확인. 분리 이동하고 충돌을 피한다.','command')}
    }
   }
   for(const [id,k] of Object.entries(u.knowledge))if(s.time-k.lastSeen>45)delete u.knowledge[id];
  }
  for(const [id,c] of Object.entries(s.contacts))if(s.time-c.lastSeen>60)delete s.contacts[id];
  // Radio shares observations, never an unseen unit's actual coordinates.
  for(const u of blue)for(const [id,c] of Object.entries(s.contacts))if(s.time-c.firstSeen>=2&&s.time-c.lastSeen<30&&!u.knowledge[id])u.knowledge[id]={x:c.x,y:c.y,lastSeen:c.lastSeen};
 }
 function fire(s,u,target){
  if(s.time<u.nextShot)return;
  const suppressed=(s.suppression?.[u.id]||0)>s.time;
  u.nextShot=s.time+(/저격|정밀/.test(u.role)?13:(8+Math.floor(rand(s)*5))*(suppressed?1.7:1));
  const rounds=Math.min(u.ammo,/저격|정밀/.test(u.role)?1:3);u.ammo-=rounds;if(u.faction==='blackline')s.ammoUsed+=rounds;
  const isObserved=u.faction==='blackline'||target.faction==='blackline'||s.contacts[u.id]?.visible;
  const hit=rand(s)<Math.max(.12,Math.min(.78,.30+u.skill/160-dist(u,target)/60+(u.elevation||0)*.005-(suppressed?.12:0)));
  s.events.push({t:s.time,kind:'shot',actor:u.id,target:target.id,from:u.faction==='blackline'||s.contacts[u.id]?.visible?[u.x,u.y]:[target.x+(u.x-target.x)/Math.max(1,dist(u,target))*6,target.y+(u.y-target.y)/Math.max(1,dist(u,target))*6],to:[target.x,target.y],rounds,hit,visible:isObserved});
  s.mutedLog=!isObserved;const previous=target.hp;if(hit)damage(s,target,Math.round(10+rand(s)*16+(/저격|정밀/.test(u.role)?10:0)),u);s.mutedLog=false;
  if(target.faction==='blackline'&&target.hp<=55){target.woundedAt=target.woundedAt??s.time;target.worstHP=Math.min(target.worstHP??previous,target.hp)}
  if(u.tacticalRole==='support'){s.suppression[target.id]=s.time+9;if(s.time-(u.lastSuppressionReport||-100)>45){u.lastSuppressionReport=s.time;log(s,u.name,'측면 제압 사격. 아군 이동과 의무 접근을 엄호한다.','combat')}}
  if(u.faction==='blackline'&&!s.contact){s.contact=true;s.dismounted=true;log(s,u.name,'식별된 위협에 대응 사격. 무리한 추격 없이 엄폐 위치를 유지한다.','combat')}
  if(target.faction==='blackline'&&!s.contact){s.contact=true;log(s,'현장지휘관','피격 보고 접수. 사격 방향은 확인 중이다. 인원 보호를 우선한다.','contact')}
  if(isObserved&&u.faction==='blackline'&&s.time-(u.lastRadio||0)>35){u.lastRadio=s.time;log(s,u.name,(hit?'명중 관측.':'상대 엄폐 중, 사격 간격 유지.')+' 잔탄 '+u.ammo+'발.','combat')}
  // Gunfire outside visual range is a direction cue, not a precise enemy marker.
  if(!isObserved&&s.units.some(b=>b.faction==='blackline'&&active(b)&&dist(b,u)<19)&&s.time-(s.lastSound||0)>40){s.lastSound=s.time;log(s,'정찰 담당','인근에서 총성 청취. 정확한 위치는 미확인이다. 경계를 강화한다.','contact')}
 }
 function supports(s,op){
  for(const [i,o] of (op.fieldProgress?.supportOrders||[]).entries()){
   const key=o.name+'-'+i;if(s.time<o.requestedAt+o.eta||s.supportArrived.includes(key))continue;
   s.supportArrived.push(key);const kind=/공중/.test(o.name)?'airstrike':/원거리|포병/.test(o.name)?'artillery':null;
   if(!kind){log(s,'작전지원본부',o.name+' 도착.');continue}
   const target=s.units.find(u=>active(u)&&u.faction!=='blackline'&&(u.faction==='insurgent'||s.rival.hostile)&&s.contacts[u.id]?.visible&&s.time-s.contacts[u.id].lastSeen<=5);
   if(!target){log(s,'작전지원본부',o.name+' 타격 보류. 유효한 시각 표적 정보가 없다.','support');continue}
   const radius=kind==='airstrike'?8:6;
   if(s.units.some(u=>active(u)&&(u.faction==='blackline'||u.faction==='pmc'&&!s.rival.hostile)&&dist(u,target)<radius+3)){log(s,'작전지원본부',o.name+' 취소. 아군·중립 인원과의 안전거리 미충족.','support');continue}
   const center={x:target.x,y:target.y};s.events.push({t:s.time,kind,x:center.x,y:center.y,radius,visible:true});log(s,kind==='airstrike'?'FALCON / 항공 지원':'HAMMER / 화력 지원','관측 인원이 확인한 좌표에 타격. 효과 관측 바란다.','support');
   for(const u of s.units)if(active(u)&&dist(u,center)<radius)damage(s,u,Math.round(80-dist(u,center)*4),null);
  }
 }
 function headingMove(s,u,goal,speed){const x=u.x,y=u.y;move(s,u,goal,speed);if(Math.hypot(u.x-x,u.y-y)>.001)u.heading=Math.atan2(u.y-y,u.x-x)}
 function finish(s){s.done=true;s.duration=s.time;log(s,'현장지휘관',s.objective>=100&&!s.retreat?'본부 복귀 및 인원 확인 완료. 작전 종료를 보고한다.':'철수 및 인원 상태 확인. 미달성 목표를 최종 보고한다.','result')}
 function step(s,op){
  if(s.done)return;s.time++;
  if(!s.terrain)s.terrain=JSON.parse(JSON.stringify(api.maps?.factory||MAP));api.roles?.initialize(s,op);
  for(const u of s.units){u.baseVision=u.baseVision??u.vision;u.baseRange=u.baseRange??u.range;u.elevation=u.onRoof?u.assignment.height:(api.elevationAt?.(s.terrain,u)||0);u.vision=(u.baseVision||u.vision)+u.elevation*.35+(u.tacticalRole==='sniper'?12:0);u.range=(u.baseRange||u.range)+u.elevation*.2+(u.tacticalRole==='sniper'?12:0)}
  const blue=s.units.filter(u=>u.faction==='blackline'),fit=blue.filter(active);
  perceive(s);supports(s,op);
  const approach=[...(s.terrain.approach||[[34,58],[36,36]]),s.terrain.approachFinal||[Math.max(10,s.goal[0]-16),s.goal[1]+7]];
  const approachEnd=approach[2];
  if(s.phase==='접근'&&fit.some(u=>dist(u,{x:approachEnd[0],y:approachEnd[1]})<5)){s.phase='수색';s.searchStarted=s.time;log(s,'현장지휘관','목표 구역 외곽 도착. 정찰·경계 조를 분리하고 출입로를 확인한다.','command')}
  if(s.phase==='수색'&&s.time-s.searchStarted>=150&&fit.some(u=>dist(u,{x:s.goal[0],y:s.goal[1]})<10)){s.phase='과업';s.workStarted=s.time;log(s,'현장지휘관','수색 결과를 바탕으로 의뢰 구역 인수 절차에 들어간다. 잔여 위협을 경계한다.','objective')}
  const avg=fit.reduce((n,u)=>n+u.hp,0)/Math.max(1,fit.length),empty=fit.length&&fit.every(u=>!u.ammo);
  if(!s.retreat&&(fit.length<2||(s.contact&&(avg<35||empty)))){s.retreat=true;s.phase='복귀';s.returnStarted=s.time;log(s,'현장지휘관','전력 한계 확인. 목표보다 인원 보호를 우선하고 확인된 경로로 철수한다.','command')}
  if((s.objective>=100&&s.time>=660||s.time>=900)&&s.phase!=='복귀'){s.phase='복귀';s.returnStarted=s.time;log(s,'현장지휘관',s.objective>=100?'임무 인계 완료. 본부로 복귀한다.':'작전 제한시간 도달. 미확인 구역 추격을 중단하고 복귀한다.','command')}
  for(const [index,u] of s.units.entries()){
   if(!active(u))continue;
   const seen=s.units.filter(v=>active(v)&&foes(s,u,v)&&u.knowledge[v.id]&&s.time-u.knowledge[v.id].lastSeen<=4&&visible(s,u,v)).sort((a,b)=>dist(u,a)-dist(u,b));
   const target=seen[0];
   if(u.faction==='blackline'&&u.tacticalRole==='medic'&&api.roles?.handle(s,u,op))continue;
   if(u.faction==='blackline'&&u.tacticalRole==='sniper'&&!u.positionReported&&s.phase!=='접근'&&s.phase!=='복귀'&&(!target||dist(u,target)>6)&&api.roles?.handle(s,u,op))continue;
   if(target&&u.ammo>0&&dist(u,target)<=u.range&&!(s.phase==='복귀'&&u.faction==='blackline')){
    if(u.target!==target.id){u.target=target.id;u.aimSince=s.time}u.heading=Math.atan2(target.y-u.y,target.x-u.x);u.status='engaging';
    if(s.time-u.aimSince>=2)fire(s,u,target);continue;
   }
   u.target=null;u.aimSince=null;
   if(u.faction==='blackline'){
    if(api.roles?.handle(s,u,op))continue;
    if(s.time<u.waitUntil){u.status='scanning';u.heading+=.018;continue}
    let goal;
    if(s.phase==='복귀'){goal=s.terrain.base;u.status=s.terrain.transit?'transporting':'retreating'}
    else if(s.phase==='접근'){
     u.routeIndex=u.routeIndex||0;goal=approach[Math.min(u.routeIndex,2)];
     if(dist(u,{x:goal[0],y:goal[1]})<1.7&&u.routeIndex<2){u.routeIndex++;u.waitUntil=s.time+12+index%3*3;log(s,u.name,'접근로 구간 확인. 주변을 살핀 뒤 다음 확인 지점으로 이동한다.','radio')}
     u.status=s.terrain.transit&&!s.dismounted?'transporting':'moving';
    }else if(s.phase==='수색'){
     const sectors=[[s.goal[0]-8,s.goal[1]+5],[s.goal[0],s.goal[1]+4],[s.goal[0]-4,s.goal[1]+8]];goal=sectors[(index+Math.floor((s.time-s.searchStarted)/50))%sectors.length];u.status='searching';
    }else{goal=[s.goal[0]-2+(index%2)*2,s.goal[1]+3+Math.floor(index/2)*1.5];u.status='holding'}
    const previous=[u.x,u.y];headingMove(s,u,goal,(u.hp<55?.17:s.terrain.transit&&(s.phase==='복귀'||s.phase==='접근'&&!s.dismounted)?(s.map==='regional'?2.0:.65):s.phase==='복귀'?.42:.36));
    if(Math.hypot(u.x-previous[0],u.y-previous[1])<.01&&s.phase!=='접근')u.heading+=.01;
   }else{
    // Patrol and investigate last observations; never pursue unknown BLUE positions.
    const memory=Object.entries(u.knowledge).filter(([id,k])=>s.time-k.lastSeen<25&&s.units.some(v=>v.id===id&&foes(s,u,v)))[0];
    let goal=memory?[memory[1].x,memory[1].y]:[[u.spawn[0],u.spawn[1]],[u.spawn[0]-3,u.spawn[1]+1],[u.spawn[0]+1,u.spawn[1]+3]][u.patrolIndex%3];
    if(dist(u,{x:goal[0],y:goal[1]})<1){u.patrolIndex++;u.waitUntil=s.time+20}
    if(s.time>=u.waitUntil)headingMove(s,u,goal,.14);u.status='patrol';
   }
  }
  if(s.phase==='과업'){
   // Progress pauses when the team has observed a nearby active threat.
   const threat=Object.entries(s.contacts).some(([id,c])=>c.visible&&s.units.some(u=>u.id===id&&active(u)&&(u.faction==='insurgent'||s.rival.hostile))&&Math.hypot(c.x-s.goal[0],c.y-s.goal[1])<15);
   if(!threat&&fit.some(u=>dist(u,{x:s.goal[0],y:s.goal[1]})<10))s.objective=Math.min(100,s.objective+100/150);
  }
  if(!fit.length)finish(s);
  else if(s.phase==='복귀'&&fit.every(u=>dist(u,{x:s.terrain.base[0],y:s.terrain.base[1]})<5)&&(s.retreat||s.time>=900))finish(s);
  else if(s.time>=1080){s.retreat=true;finish(s)}
  snapshot(s);
  if(s.time%60===0&&!s.done)log(s,'현장지휘관',s.phase+' 진행 중. 인원·통신 확인, 확인되지 않은 위치를 단정하지 않는다.','radio');
 }
 const originalOutcome=api.outcome;api.outcome=function(s){const result=originalOutcome(s);if(s.version>=2){result.usedMed=s.medUsed||0;result.casualties=s.units.filter(u=>u.faction==='blackline'&&(u.woundedAt!=null||u.hp<=55||u.status==='dead')).map(u=>({id:u.personId,name:u.name,dead:u.status==='dead',hp:u.hp,stabilized:!!u.stabilized,severity:(u.worstHP??u.hp)<=0?'중상':(u.worstHP??u.hp)<30?'보통':'경상'}))}return result};
 api.step=(s,op)=>s.version>=2?step(s,op):legacyStep(s,op);
 api.upgrade=function(op){
  const s=op.fieldProgress?.tactical;if(!s||s.version>=2||s.done)return;
  op.fieldProgress.originalFieldVersion=1;const oldTime=s.time;s.version=2;s.time=Math.floor(oldTime/26);s.duration=900;s.plannedDuration=900;s.phase=s.units.some(u=>u.faction==='blackline'&&u.x>48)?'수색':'접근';s.searchStarted=s.phase==='수색'?s.time:null;s.contacts={};s.mutedLog=false;
  s.radio.forEach(r=>r.t=Math.floor(r.t/26));s.events.forEach(e=>{e.t=Math.floor(e.t/26);e.visible=e.actor?.startsWith('bl-')||e.target?.startsWith('bl-')||['artillery','airstrike'].includes(e.kind)});
  for(const u of s.units){u.vision=u.faction==='blackline'?(/정찰/.test(u.role)?15:10):11;u.range=/저격|정밀/.test(u.role)?18:10;u.heading=-Math.PI/2;u.knowledge={};u.recognition={};u.nextShot=s.time+8;u.aimSince=null;u.waitUntil=0;u.patrolIndex=0;u.routeIndex=u.x>40?2:0;u.spawn=[u.x,u.y]}
  s.frames.forEach(f=>{f.t=Math.floor(f.t/26);f.contacts=[]});delete s.liveFrame;delete s.previousLiveFrame;
  for(const o of op.fieldProgress.supportOrders||[]){o.requestedAt/=26;o.eta/=26}
  log(s,'작전본부','진행 중인 현장의 인원·탄약·피해는 유지하고, 실시간 관측 및 약 15분 작전 시간으로 연결했다.','command');snapshot(s);
 };
 for(const op of state.operations||[])api.upgrade(op);
 api.visibleAt=function(s,t){if(s.version<2)return null;let frame=s.frames[0];if(!s.done&&s.previousLiveFrame&&t>=s.previousLiveFrame.t)return (t>=s.liveFrame.t?s.liveFrame:s.previousLiveFrame).contacts||[];for(const f of s.frames){if(f.t>t)break;frame=f}return frame.contacts||[]};
})();
