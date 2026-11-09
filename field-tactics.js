/* Fifteen-minute foreground operations with local perception, search and return. */
(function(){
 const api=window.fieldSimulation,legacyCreate=api.create,legacyStep=api.step;
 const {rand,move,damage,active,dist}=api.internals,MAP=api.MAP;
 const log=(s,who,msg,kind='radio')=>api.transmit?api.transmit(s,who,msg,kind):s.radio.push({t:s.time,who,msg,kind});
 const foes=(s,a,b)=>a.faction!==b.faction&&(a.faction==='insurgent'||b.faction==='insurgent'||s.rival.hostile);
 const visible=(s,a,b)=>!a.inside&&!b.inside&&!a.roadOnly&&!b.roadOnly&&dist(a,b)<=a.vision&&api.canSeeActor?.(s,a,b,'site')!==false&&api.clearLine(a,b,s.terrain||MAP);
 function snapshot(s){const frame={healthRevision:s.healthRevision||0,recovery:api.recoveryFrame?.(s),journey:api.journeyFrame?.(s),aims:s.units.filter(u=>u.target&&!u.inside&&(u.faction==='blackline'||s.contacts[u.id]?.visible)).flatMap(u=>{const target=s.units.find(v=>v.id===u.target);return target&&visible(s,u,target)?[{actor:u.id,target:target.id,from:[u.x,u.y],to:[target.x,target.y],friendly:u.faction==='blackline'}]:[]}),t:s.time,objective:Math.round(s.objective),retreat:s.retreat,phase:s.phase,contacts:Object.entries(s.contacts).map(([id,c])=>[id,+c.x.toFixed(2),+c.y.toFixed(2),c.lastSeen,c.visible,c.source||'ground',c.identified!==false,c.confidence??100]),units:s.units.map(u=>[+u.x.toFixed(2),+u.y.toFixed(2),u.hp,u.ammo,u.status,+u.heading.toFixed(2),+(u.elevation||0).toFixed(1),api.healthSnapshot?.(u)||null,api.weaponSnapshot?.(u)||null])};s.previousLiveFrame=s.liveFrame?.t===s.time?(s.previousLiveFrame||frame):(s.liveFrame||frame);s.liveFrame=frame;if(s.time%(s.journey?10:5)===0||s.done||s.units.some(u=>u.joinedAt===s.time)||s.journey&&s.frames.at(-1)?.journey?.stage!==s.journey.stage){if(s.frames.at(-1)?.t===s.time)s.frames[s.frames.length-1]=frame;else s.frames.push(frame)}}
 api.create=function(op,m,members,ammoBudget,options={}){
  const s=legacyCreate(op,m,members,ammoBudget,options);
  s.version=2;s.duration=null;s.plannedDuration=null;s.time=0;s.phase='접근';s.frames=[];s.events=[];s.radio=[];s.contacts={};s.searchStarted=null;s.securedAt=null;s.returnStarted=null;s.checkpoint=0;s.mutedLog=false;
  s.terrain=JSON.parse(JSON.stringify(api.selectMap?.(m)||MAP));s.map=s.terrain.id||'factory';s.goal=s.terrain.goals[m.type]||s.terrain.goals['시설 보안'];s.medicalBudget=options.medicalBudget??Math.min(2,Number(state.med)||0);s.medUsed=0;
  const positions=(s.terrain.spawnPoints||[[48,29],[57,31],[60,34],[71,37],[84,28],[90,30],[92,39],[76,41]]).map(p=>p.slice());
  const anchors=positions.map(p=>p.slice()),needed=s.units.filter(u=>u.faction==='insurgent').length;for(let n=0;positions.length<needed&&n<800;n++){const base=anchors[n%anchors.length],ring=1+Math.floor(n/anchors.length),angle=n*2.39996,p=api.projectToGround(s.terrain,[base[0]+Math.cos(angle)*ring*2.1,base[1]+Math.sin(angle)*ring*2.1]);if(positions.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>=1.65))positions.push(p);}
  for(const [i,u] of s.units.entries()){
   if(u.faction==='blackline'&&s.map!=='factory'){u.x=s.terrain.base[0]+(i%3)*1.1;u.y=s.terrain.base[1]+Math.floor(i/3)}
   if(u.faction==='pmc'&&s.map!=='factory'){u.x=s.goal[0]+7+(i%3)*1.2;u.y=s.goal[1]+6+(i%2)*1.5}
   if(u.faction==='insurgent'){const p=positions.splice(Math.floor(rand(s)*positions.length),1)[0]||api.projectToGround(s.terrain,s.goal);u.x=p[0];u.y=p[1]}
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
    u.recognition[target.id]=(u.recognition[target.id]||0)+1;if(s.version>=4&&u.faction==='blackline'&&u.recognition[target.id]>=2&&u.recognition[target.id]<4&&api.radioLinked(s,u)&&s.contacts[target.id]?.identified!==true)s.contacts[target.id]={x:target.x,y:target.y,lastSeen:s.time,firstSeen:s.time,visible:true,identified:false,confidence:35};
    if(u.faction==='blackline'&&u.recognition[target.id]>=2)api.observeContact?.(s,u,target,'site',{identified:u.recognition[target.id]>=(/정찰/.test(u.role)?2:4)});if(u.recognition[target.id]<(/정찰/.test(u.role)?2:4))continue;
    const previous=u.knowledge[target.id];u.knowledge[target.id]={x:target.x,y:target.y,lastSeen:s.time};
    if(u.faction==='blackline'&&(s.version<4||api.radioLinked(s,u))){
     const first=!s.contacts[target.id];s.contacts[target.id]={firstSeen:s.contacts[target.id]?.firstSeen??s.time,x:target.x,y:target.y,lastSeen:s.time,visible:true,faction:target.faction,identified:true,confidence:100};
     if(first){target.seenAt=s.time;if(!api.observeContact)log(s,u.name,target.faction==='pmc'?s.rival.name+' 소속 인원 관측. 상호 식별을 진행한다.':'무장 인원 시각 확인. 현 위치 엄폐, 팀장에게 접촉 보고.','contact');s.events.push({t:s.time,kind:'contact',target:target.id,visible:true})}
     if(target.faction==='pmc'&&!s.rival.identified){s.rival.identified=true;log(s,'현장지휘관',s.rival.hostile?'경계구역 충돌 가능. 접근을 중단하고 상대 의도를 확인한다.':'다른 PMC 계약 수행 구역 확인. 분리 이동하고 충돌을 피한다.','command')}
    }
   }
   for(const [id,k] of Object.entries(u.knowledge))if(s.time-k.lastSeen>45)delete u.knowledge[id];
  }
  for(const [id,c] of Object.entries(s.contacts))if(s.time-c.lastSeen>60)delete s.contacts[id];
  // Radio shares observations, never an unseen unit's actual coordinates.
  for(const u of blue.filter(u=>s.version<4||api.radioLinked(s,u)))for(const [id,c] of Object.entries(s.contacts))if(s.time-c.firstSeen>=2&&s.time-c.lastSeen<30&&!u.knowledge[id])u.knowledge[id]={x:c.x,y:c.y,lastSeen:c.lastSeen};
 }
 function fire(s,u,target){
  if(api.authorizeEngagement?.(s,u,target,'site')===false)return;
  if(s.time<u.nextShot)return;
  const suppressed=(s.suppression?.[u.id]||0)>s.time;
  u.nextShot=s.time+(api.weaponCycle?.(u)||(/저격|정밀/.test(u.role)?(api.consumeRounds?7:13):((api.consumeRounds?3:8)+Math.floor(rand(s)*5))*(suppressed?1.7:1)));
  const rounds=api.consumeRounds?api.consumeRounds(s,u):Math.min(u.ammo,/저격|정밀/.test(u.role)?1:3);if(!rounds){u.nextShot=s.time+1;return}if(!api.consumeRounds){u.ammo-=rounds;if(u.faction==='blackline')s.ammoUsed+=rounds;}
  const isObserved=u.faction==='blackline'||target.faction==='blackline'||s.contacts[u.id]?.visible;
  const precision=api.isPrecisionWeapon?.(u),distanceLoss=precision?dist(u,target)/Math.max(20,u.range)*.34:dist(u,target)/60,hit=rand(s)<Math.max(.08,Math.min(precision ? .86 : .78,.30+u.skill*(u.health?.accuracyFactor??1)/160-distanceLoss+(api.weaponAccuracyBonus?.(s,u)||0)+(u.elevation||0)*.005-(suppressed?.12:0)-(api.coverValue?.(s,target,u)||0)*.35));
  const shot={id:'shot-'+s.time+'-'+s.events.length,t:s.time,scene:'site',kind:'shot',actor:u.id,target:target.id,from:u.faction==='blackline'||s.contacts[u.id]?.visible?[u.x,u.y]:[target.x+(u.x-target.x)/Math.max(1,dist(u,target))*6,target.y+(u.y-target.y)/Math.max(1,dist(u,target))*6],to:[target.x,target.y],rounds,hit,visible:isObserved};s.events.push(shot);
  api.sceneShot?.(s,shot);s.mutedLog=!isObserved;const previous=target.hp;if(hit)damage(s,target,Math.round(10+rand(s)*16+((api.isPrecisionWeapon?api.isPrecisionWeapon(u):/저격|정밀/.test(u.role))?10:0)),u,shot);s.mutedLog=false;
  if(target.faction==='blackline'&&target.hp<=55){target.woundedAt=target.woundedAt??s.time;target.worstHP=Math.min(target.worstHP??previous,target.hp)}
  if(u.tacticalRole==='support'){s.suppression[target.id]=s.time+9;if(s.time-(u.lastSuppressionReport||-100)>45){u.lastSuppressionReport=s.time;log(s,u.name,'측면 제압 사격. 아군 이동과 의무 접근을 엄호한다.','combat')}}
  if(u.faction==='blackline'&&!s.contact){s.contact=true;s.dismounted=true;log(s,u.name,'식별된 위협에 대응 사격. 무리한 추격 없이 엄폐 위치를 유지한다.','combat')}
  if(target.faction==='blackline'&&!s.contact){s.contact=true;log(s,'현장지휘관','적 사격 감지. 엄폐 후 인원 상태와 사격 방향을 확인한다.','contact')}
  if(isObserved&&u.faction==='blackline'&&s.time-(u.lastRadio||0)>35){u.lastRadio=s.time;log(s,u.name,(hit?'명중 관측.':'상대 엄폐 중, 사격 간격 유지.')+' 잔탄 '+u.ammo+'발.','combat')}
  // Gunfire outside visual range is a direction cue, not a precise enemy marker.
  if(!isObserved&&s.units.some(b=>b.faction==='blackline'&&active(b)&&dist(b,u)<19)&&s.time-(s.lastSound||0)>40){s.lastSound=s.time;log(s,'정찰 담당','인근에서 총성 청취. 정확한 위치는 미확인이다. 경계를 강화한다.','contact')}
 }
 function supports(s,op){
  for(const e of s.events.filter(e=>e.impactAt!=null&&!e.applied&&!e.cancelledAt&&s.time>=e.impactAt)){
   if(s.units.some(u=>!u.roadOnly&&!u.health?.dead&&u.status!=='dead'&&!u.evacComplete&&!u.boarded&&(u.faction==='blackline'||u.faction==='pmc'&&!s.rival.hostile)&&dist(u,{x:e.x,y:e.y})<e.radius+3)){e.cancelledAt=s.time;log(s,'작전지원본부','타격 중지. 아군·중립 인원 접근, 안전거리 재확인.','support');continue}
   api.areaImpact?.(s,e);e.applied=true;for(const u of s.units)if(!u.inside&&!u.roadOnly&&active(u)&&dist(u,{x:e.x,y:e.y})<e.radius)damage(s,u,Math.round(80-dist(u,{x:e.x,y:e.y})*4),null);
   log(s,e.kind==='airstrike'?'FALCON / 항공 지원':'HAMMER / 화력 지원','탄착 확인. 현장조는 피해·잔여 위협 관측 바란다.','support');
  }
  for(const [i,o] of (op.fieldProgress?.supportOrders||[]).entries()){
   if(['drone','vehicle-recovery','ground-recovery','medevac','reinforcement','resupply'].includes(o.kind))continue;
   const key=o.id||o.name+'-'+i;if(s.time<o.requestedAt+o.eta||s.supportArrived.includes(key))continue;
   const kind=/공중/.test(o.name)?'airstrike':/원거리|포병/.test(o.name)?'artillery':null;
   if(!kind){s.supportArrived.push(key);log(s,'작전지원본부',o.name+' 도착.');continue}
   const target=s.units.find(u=>(!o.targetId||u.id===o.targetId)&&!u.inside&&active(u)&&u.faction!=='blackline'&&(u.faction==='insurgent'||s.rival.hostile)&&s.contacts[u.id]?.visible&&s.contacts[u.id]?.identified!==false&&s.time-s.contacts[u.id].lastSeen<=5);
   if(!target){s.supportWait=s.supportWait||{};if(s.supportWait[key]==null||s.time-s.supportWait[key]>=30){log(s,'작전지원본부',o.name+' 타격 보류. 유효한 시각 표적 정보가 없다. 표적 재식별까지 대기한다.','support');s.supportWait[key]=s.time;}continue}
   s.supportArrived.push(key);
   const radius=kind==='airstrike'?8:6;
   if((s.civilians||[]).some(c=>c.found&&c.hp>0&&dist(c,target)<radius+3)||s.units.some(u=>!u.health?.dead&&u.status!=='dead'&&!u.evacComplete&&!u.boarded&&(u.faction==='blackline'||u.faction==='pmc'&&!s.rival.hostile)&&dist(u,target)<radius+3)){log(s,'작전지원본부',o.name+' 취소. 아군·중립 인원과의 안전거리 미충족.','support');continue}
   const center={x:target.x,y:target.y};s.events.push({t:s.time,impactAt:s.time+6,scene:'site',kind,target:target.id,x:center.x,y:center.y,radius,visible:true});log(s,kind==='airstrike'?'FALCON / 항공 지원':'HAMMER / 화력 지원','확인 좌표로 진입. 6초 후 타격, 현장조는 안전거리 유지 바란다.','support');

  }
 }
 function headingMove(s,u,goal,speed){const x=u.x,y=u.y;move(s,u,goal,speed);if(Math.hypot(u.x-x,u.y-y)>.001)u.heading=Math.atan2(u.y-y,u.x-x)}
 function finish(s){s.done=true;s.duration=s.time;log(s,'현장지휘관',s.objective>=100&&!s.retreat?'본부 복귀 및 인원 확인 완료. 작전 종료를 보고한다.':'철수 및 인원 상태 확인. 미달성 목표를 최종 보고한다.','result')}
 function step(s,op){
  if(s.done)return;s.time++;api.sceneTick?.(s,op);
  if(!s.terrain)s.terrain=JSON.parse(JSON.stringify(api.maps?.factory||MAP));api.roles?.initialize(s,op);
  for(const u of s.units){u.baseVision=u.baseVision??u.vision;u.baseRange=u.baseRange??u.range;u.elevation=u.onRoof?u.assignment.height:(api.elevationAt?.(s.terrain,u)||0);u.vision=api.observationRange?api.observationRange(s,u):(u.baseVision||u.vision)+u.elevation*.35+(u.tacticalRole==='sniper'?12:0);u.range=api.effectiveRange?api.effectiveRange(s,u):(u.baseRange||u.range)+u.elevation*.2+(u.tacticalRole==='sniper'?12:0)}
  const blue=s.units.filter(u=>u.faction==='blackline'),fit=blue.filter(active);
  perceive(s);api.journeyDrone?.(s,op);supports(s,op);
  const approach=[...(s.terrain.approach||[[34,58],[36,36]]),s.terrain.approachFinal||[Math.max(10,s.goal[0]-16),s.goal[1]+7]];
  const approachEnd=approach[2];
  if(s.phase==='접근'&&fit.some(u=>dist(u,{x:approachEnd[0],y:approachEnd[1]})<5)){s.phase='수색';s.searchStarted=s.time;log(s,'현장지휘관','목표 구역 외곽 도착. 정찰·경계 조를 분리하고 출입로를 확인한다.','command')}
  if(s.phase==='수색'&&(s.journey?api.journeySearchReady(s):s.time-s.searchStarted>=150&&fit.some(u=>dist(u,{x:s.goal[0],y:s.goal[1]})<10))){s.phase=s.journey?'건물 진입':'과업';if(s.journey)api.journeyEntry(s);s.workStarted=s.time;log(s,'현장지휘관','수색 결과를 바탕으로 의뢰 구역 인수 절차에 들어간다. 잔여 위협을 경계한다.','objective')}
  const avg=fit.reduce((n,u)=>n+u.hp,0)/Math.max(1,fit.length),empty=fit.length&&fit.every(u=>!u.ammo);
  if(!s.retreat&&(fit.length<2||(s.contact&&(avg<35||empty)))){s.retreat=true;s.phase='복귀';s.returnStarted=s.time;log(s,'현장지휘관','전력 한계 확인. 목표보다 인원 보호를 우선하고 확인된 경로로 철수한다.','command')}
  if(!s.journey&&s.objective>=100&&s.phase!=='복귀'){s.phase='복귀';s.returnStarted=s.time;log(s,'현장지휘관','임무 인계 완료. 본부로 복귀한다.','command')}
  for(const [index,u] of s.units.entries()){
   if(!active(u)||u.inside||u.roadOnly||u.medicalOverride===s.time)continue;if(api.agentAction?.(s,u,'site'))continue;
   const seen=s.units.filter(v=>active(v)&&foes(s,u,v)&&u.knowledge[v.id]&&s.time-u.knowledge[v.id].lastSeen<=4&&visible(s,u,v)).sort((a,b)=>dist(u,a)-dist(u,b));
   const target=api.chooseSniperTarget?api.chooseSniperTarget(s,u,seen):seen[0];
   if(u.faction==='blackline'&&!target&&api.journeyMove?.(s,u,op))continue;
   if(u.faction==='blackline'&&u.tacticalRole==='medic'&&api.roles?.handle(s,u,op))continue;
   if(u.faction==='blackline'&&u.tacticalRole==='sniper'&&!u.positionReported&&s.phase!=='접근'&&s.phase!=='복귀'&&(!target||dist(u,target)>6)&&api.roles?.handle(s,u,op))continue;
   if(target&&u.ammo>0&&dist(u,target)<=u.range&&!(s.phase==='복귀'&&u.faction==='blackline')){
    if(u.target!==target.id){u.target=target.id;u.aimSince=s.time}u.heading=Math.atan2(target.y-u.y,target.x-u.x);u.status=api.contactStatus?.(s,u,target,'site')||'engaging';
    if(s.time-u.aimSince>=2)fire(s,u,target);continue;
   }
   u.target=null;u.aimSince=null;
   if(u.faction==='blackline'){
    if(api.journeyMove?.(s,u,op))continue;
    if(api.roles?.handle(s,u,op))continue;
    if(s.time<u.waitUntil){u.status='scanning';u.heading+=.018;continue}
    let goal;
    if(s.phase==='복귀'){goal=s.terrain.base;u.status=s.terrain.transit&&!s.journey?'transporting':'retreating'}
    else if(s.phase==='접근'){
     u.routeIndex=u.routeIndex||0;goal=approach[Math.min(u.routeIndex,2)];
     if(dist(u,{x:goal[0],y:goal[1]})<1.7&&u.routeIndex<2){u.routeIndex++;u.waitUntil=s.time+12+index%3*3;log(s,u.name,'접근로 구간 확인. 주변을 살핀 뒤 다음 확인 지점으로 이동한다.','radio')}
     u.status=s.terrain.transit&&!s.journey&&!s.dismounted?'transporting':'moving';
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
  if(s.phase==='과업'&&!s.journey){
   // Progress pauses when the team has observed a nearby active threat.
   const threat=Object.entries(s.contacts).some(([id,c])=>c.visible&&s.units.some(u=>u.id===id&&active(u)&&(u.faction==='insurgent'||s.rival.hostile))&&Math.hypot(c.x-s.goal[0],c.y-s.goal[1])<15);
   if(!threat&&fit.some(u=>dist(u,{x:s.goal[0],y:s.goal[1]})<10))s.objective=Math.min(100,s.objective+100/150);
  }
  if(!fit.length&&!s.journey)finish(s);
  else if(!s.journey&&s.phase==='복귀'&&(!s.legacyRecovery||s.legacyRecovery.stage==='complete')&&blue.filter(u=>u.status!=='dead'&&!u.evacComplete).every(u=>dist(u,{x:s.terrain.base[0],y:s.terrain.base[1]})<5))finish(s);

  snapshot(s);
  if(!s.journey&&s.time%60===0&&!s.done)log(s,'현장지휘관',s.phase+' 진행 중. 인원·통신 확인, 확인되지 않은 위치를 단정하지 않는다.','radio');
 }
 api.defendExtraction=function(s,op){perceive(s);api.journeyDrone?.(s,op);supports(s,op);for(const u of s.units){u.target=null;if(!active(u)||u.inside||u.roadOnly||u.boarded)continue;if(api.agentAction?.(s,u,'site'))continue;const eligible=s.units.filter(v=>active(v)&&!v.inside&&!v.roadOnly&&!v.boarded&&foes(s,u,v)&&u.knowledge[v.id]&&s.time-u.knowledge[v.id].lastSeen<=4&&visible(s,u,v)&&dist(u,v)<=u.range).sort((a,b)=>dist(u,a)-dist(u,b)),target=api.chooseSniperTarget?api.chooseSniperTarget(s,u,eligible):eligible[0];if(target&&u.ammo>0){u.target=target.id;u.heading=Math.atan2(target.y-u.y,target.x-u.x);fire(s,u,target)}else if(u.faction!=='blackline'){const memory=Object.entries(u.knowledge).find(([id,k])=>s.time-k.lastSeen<25&&s.units.some(v=>v.id===id&&foes(s,u,v)));if(memory)headingMove(s,u,[memory[1].x,memory[1].y],.14)}}};
 api.processSupports=supports;api.captureFrame=snapshot;api.tacticalFire=fire;
 const originalOutcome=api.outcome;api.outcome=function(s){const result=originalOutcome(s);if(s.version>=4)result.hostileRetreated=(s.journey.impact.escaped||[]).filter(e=>e.faction==='insurgent').length;if(s.version>=2){result.usedMed=s.medUsed||0;result.casualties=s.units.filter(u=>u.faction==='blackline'&&(u.woundedAt!=null||u.hp<=55||u.status==='dead')).map(u=>({id:u.personId,name:u.name,dead:u.status==='dead',hp:u.hp,stabilized:!!u.stabilized,severity:(u.worstHP??u.hp)<=0?'중상':(u.worstHP??u.hp)<30?'보통':'경상'}))}return result};
 api.step=(s,op)=>s.version>=2?step(s,op):legacyStep(s,op);
 api.upgrade=function(op){
  const s=op.fieldProgress?.tactical;if(!s||s.version>=2||s.done)return;
  op.fieldProgress.originalFieldVersion=1;const oldTime=s.time;s.version=2;s.time=Math.floor(oldTime/26);s.duration=null;s.plannedDuration=null;s.phase=s.units.some(u=>u.faction==='blackline'&&u.x>48)?'수색':'접근';s.searchStarted=s.phase==='수색'?s.time:null;s.contacts={};s.mutedLog=false;
  s.radio.forEach(r=>r.t=Math.floor(r.t/26));s.events.forEach(e=>{e.t=Math.floor(e.t/26);e.visible=e.actor?.startsWith('bl-')||e.target?.startsWith('bl-')||['artillery','airstrike'].includes(e.kind)});
  for(const u of s.units){u.vision=u.faction==='blackline'?(/정찰/.test(u.role)?15:10):11;u.range=/저격|정밀/.test(u.role)?18:10;u.heading=-Math.PI/2;u.knowledge={};u.recognition={};u.nextShot=s.time+8;u.aimSince=null;u.waitUntil=0;u.patrolIndex=0;u.routeIndex=u.x>40?2:0;u.spawn=[u.x,u.y]}
  s.frames.forEach(f=>{f.t=Math.floor(f.t/26);f.contacts=[]});delete s.liveFrame;delete s.previousLiveFrame;
  for(const o of op.fieldProgress.supportOrders||[]){o.requestedAt/=26;o.eta/=26}
  log(s,'작전본부','진행 중인 현장의 인원·탄약·피해는 유지하고, 실시간 관측과 목표 달성·실제 복귀에 따른 진행으로 연결했다.','command');snapshot(s);
 };
 for(const op of state.operations||[])api.upgrade(op);
 api.visibleAt=function(s,t){if(s.version<2)return null;let frame=s.frames[0];if(!s.done&&s.previousLiveFrame&&t>=s.previousLiveFrame.t)return (t>=s.liveFrame.t?s.liveFrame:s.previousLiveFrame).contacts||[];for(const f of s.frames){if(f.t>t)break;frame=f}return frame.contacts||[]};
})();
