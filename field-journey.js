/* Serialized journey: regional transport > site > rooms > pickup > return. */
(function(){
 const api=window.fieldSimulation,create=api.create,step=api.step,{active,dist,move,rand,damage}=api.internals;
 const say=(s,who,msg,kind='command')=>api.transmit?api.transmit(s,who,msg,kind,kind==='command'||kind==='support'):s.radio.push({t:s.time,who,msg,kind});
 const blue=s=>s.units.filter(u=>u.faction==='blackline');
 const interior={id:'interior',name:'목표 건물 내부',label:'INTERIOR / 목표 건물 상세',width:100,height:66.667,grid:1,image:'images/maps/operations-interior.webp',base:[10,35],buildings:[[7,6,93,8,4],[7,59,93,61,4],[7,6,9,31,4],[7,40,9,61,4],[91,6,93,61,4],[9,30,25,32,4],[31,30,67,32,4],[74,30,91,32,4],[9,39,25,41,4],[31,39,67,41,4],[74,39,91,41,4],[47,8,49,30,4],[47,41,49,59,4]],obstacles:[],positions:{highGrounds:[]}};
 const point=p=>({x:p[0],y:p[1]});
 function route(map,start,end){const path=api.pathTo(point(start),end,map);return [start,...path,end]}
 function measure(path){let d=0;for(let i=1;i<path.length;i++)d+=dist(point(path[i-1]),point(path[i]));return d}
 function along(path,p){let remaining=measure(path)*Math.max(0,Math.min(1,p));for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],d=dist(point(a),point(b));if(remaining<=d)return {x:a[0]+(b[0]-a[0])*remaining/Math.max(.001,d),y:a[1]+(b[1]-a[1])*remaining/Math.max(.001,d),heading:Math.atan2(b[1]-a[1],b[0]-a[0])};remaining-=d}return {...point(path.at(-1)),heading:0}}
 function moveTo(s,u,goal,amount,map=s.terrain){const old=s.terrain,x=u.x,y=u.y;s.terrain=map;try{move(s,u,goal,amount)}finally{s.terrain=old}if(Math.hypot(u.x-x,u.y-y)>.001)u.heading=Math.atan2(u.y-y,u.x-x)}
 function stage(s,name,phase){s.journey.stage=name;s.journey.since=s.time;s.phase=phase;s.journey.transitions.push({t:s.time,stage:name,phase});}
 function tasks(type){return type==='구조'?['구조 대상 신원·상태 확인','응급 안정화 및 구조 인계']:type==='호송'?['고객 도착·신원 확인','보호 대상 안전 인계']:type==='시설 보안'?['출입 통제·내부 안전 확인','주요 설비 점검 및 방호 인수']:type==='정밀 지원'?['관측실·사격선 안전 확인','현장 정보 확보 및 임무 인계']:['내부 위협·접근로 수색','거점 자료 확인 및 안전 확보']}
 function setup(s,m){
  const buildings=s.terrain.buildings||[],candidates=buildings.slice().sort((a,b)=>Math.hypot((a[0]+a[2])/2-s.goal[0],(a[1]+a[3])/2-s.goal[1])-Math.hypot((b[0]+b[2])/2-s.goal[0],(b[1]+b[3])/2-s.goal[1])).slice(0,3),target=candidates[Math.floor(rand(s)*Math.max(1,candidates.length))];
  const entrance=api.projectToGround(s.terrain,target?[(target[0]+target[2])/2,target[3]+2]:s.goal);
  const searchPoints=candidates.map((b,i)=>({id:i,position:api.projectToGround(s.terrain,[(b[0]+b[2])/2,b[3]+2]),target:b===target,worked:0,cleared:false}));
  const team=blue(s).filter(u=>!['sniper','medic','support'].includes(u.tacticalRole));if(team.length<2)for(const u of blue(s))if(!team.includes(u)&&u.tacticalRole!=='sniper'&&team.length<2)team.push(u);for(const u of blue(s))if(!team.includes(u)&&team.length<Math.min(2,blue(s).length))team.push(u);
  const region=api.maps.regional,dest={factory:[252,72],urban:[214,108],mountain:[116,44],regional:[232,105]}[s.map]||[232,105];
  s.journey={siteSearch:{points:searchPoints,index:0,discovered:false},version:1,stage:'outbound',since:0,transitions:[{t:0,stage:'outbound',phase:'작전지 이동'}],transport:{map:JSON.parse(JSON.stringify(region)),path:route(region,region.base,dest),vehicle:{...point(region.base),heading:0},progress:0,distance:0,speed:2.2},building:{bounds:target||null,entrance,name:s.map==='factory'?'시설 통제동':s.map==='urban'?'목표 건물':s.map==='mountain'?'산악 현장 거점':'지역 작전 거점'},exfil:api.projectToGround(s.terrain,[entrance[0]-12,entrance[1]+10]),team:team.map(u=>u.id),interior:{map:JSON.parse(JSON.stringify(interior)),rooms:[[28,20],[70,20],[28,50],[70,50]],room:0,targetRoom:Math.floor(rand(s)*4),roomWorked:0,clearedRooms:[],discovered:false,tasks:tasks(s.missionType).map((name,i)=>({name:i?name:'실내 수색·대상 확인',position:i?[70,20]:[28,20],seconds:i?65:14,worked:0,progress:0,revealed:!i})),task:0,exit:[10,35],units:{},aims:[]},pickup:null,manifest:[],leftBehind:[]};
  api.assignCallsigns?.(s);s.version=3;s.plannedDuration=null;s.duration=null;s.phase='작전지 이동';blue(s).forEach(u=>u.status='transporting');s.journey.transport.vehicle=along(s.journey.transport.path,0);
  // Existing guards are allocated to rooms; no new kills or enemies are invented at a scene transition.
  const guards=[],roadGuards=[],hostileCount=s.units.filter(u=>u.faction==='insurgent').length,indoorLimit=s.enemyForcePlan?.scaled?Math.min(8,Math.ceil(hostileCount*.4)):2,roadLimit=s.enemyForcePlan?.scaled?Math.min(6,Math.ceil(hostileCount*.22)):2;for(const u of s.units.filter(u=>u.faction==='insurgent')){const placement=rand(s);if(placement<.3&&guards.length<indoorLimit)guards.push(u);else if(placement<.6&&roadGuards.length<roadLimit)roadGuards.push(u)}
  guards.forEach((u,i)=>{const room=s.journey.interior.rooms[Math.floor(rand(s)*4)];u.inside=true;u.interior={x:room[0]+3,y:room[1]+1,heading:Math.PI,hp:u.hp};u.interiorSeen=false;u.interiorNextShot=0});
  roadGuards.forEach((u,i)=>{const zones=[[110,146],[170,124],[211,104],[249,72],[123,50],[260,120],[76,164],[194,77]].filter(p=>dist(point(p),point(region.base))>60),p=zones[Math.floor(rand(s)*zones.length)],pos=api.projectToGround(region,[p[0]+rand(s)*10-5,p[1]+rand(s)*10-5]);u.roadOnly=true;u.road={x:pos[0],y:pos[1],heading:Math.PI};u.roadKnowledge={};});
  say(s,s.scenario?.transport==='helicopter'?'항공 수송':'수송 담당',s.scenario?.transport==='helicopter'?'헬기 탑승 완료. 이륙 후 작전지역까지 항로 이동한다.':'차량 출발. 작전지역까지 이동한다. 도착 후 하차, 주축선 진입과 외곽 엄호로 전개한다.');
 }
 api.create=function(op,m,members,ammoBudget,options){const scenario=api.chooseScenario?.(op,m),s=create(op,scenario?{...m,mapId:scenario.mapId}:m,members,ammoBudget,options);if(scenario)s.scenario=scenario;setup(s,m);api.configureJourney?.(s,m);s.frames=[];delete s.liveFrame;delete s.previousLiveFrame;api.captureFrame(s);return s};
 api.journeySearchReady=s=>!!s.journey?.siteSearch.discovered;
 api.journeyEntry=function(s){if(s.journey.mode&&s.journey.mode!=='interior')return api.startOutdoor(s);stage(s,'entry','건물 진입');say(s,s.commander||'현장지휘관','진입조는 목표 건물 출입구를 확보하고 내부로 진입하라. 저격·지원·의료 담당은 외곽을 엄호한다.');};
 api.journeyMove=function(s,u){const j=s.journey;if(!j)return false;if(api.outdoorMove?.(s,u))return true;if(!j.team.includes(u.id))return false;if(s.phase==='수색'&&!j.siteSearch.discovered){const sector=j.siteSearch.points[j.siteSearch.index];if(sector){moveTo(s,u,sector.position,.48);u.status=dist(u,point(sector.position))<3?'site-inspection':'searching';return true}}if(!['entry','interior','exit'].includes(j.stage))return false;if(u.inside)return true;if(j.stage==='exit')return false;const door=j.building.entrance;
  if(dist(u,point(door))>2){moveTo(s,u,door,.48);u.status='entering';return true}
  u.entrySince=u.entrySince??s.time;u.status='breaching';if(s.time-u.entrySince>=8){u.inside=true;u.interior={x:(j.interior.map.entry||[11,35])[0],y:(j.interior.map.entry||[11,35])[1]+(j.team.indexOf(u.id)%2),heading:0};u.path=[];u.destination='';say(s,u.name,'출입구 통과. 건물 내부 진입, 외곽 엄호 유지 바란다.','objective')}
  return true;
 };
 function indoorPoint(u){return {x:u.interior.x,y:u.interior.y,elevation:0}}
 function indoorMove(s,u,goal,speed){const original={x:u.x,y:u.y,heading:u.heading,path:u.path,destination:u.destination};u.x=u.interior.x;u.y=u.interior.y;u.path=u.interior.path||[];u.destination=u.interior.destination||'';moveTo(s,u,goal,speed,s.journey.interior.map);u.interior={...u.interior,x:u.x,y:u.y,heading:u.heading,path:u.path,destination:u.destination};Object.assign(u,original)}
 function shoot(s,u,target){if(api.authorizeEngagement?.(s,u,target,'interior')===false)return;const origin=indoorPoint(u),dest=indoorPoint(target);u.interior.heading=Math.atan2(dest.y-origin.y,dest.x-origin.x);u.interiorTarget=target.id;
  if(s.time<(u.interiorNextShot||0))return;u.interiorNextShot=s.time+(api.weaponCycle?.(u)||8+Math.floor(rand(s)*4));const rounds=api.consumeRounds?api.consumeRounds(s,u):Math.min(u.ammo,3);if(!rounds){u.interiorNextShot=s.time+1;return}if(!api.consumeRounds){u.ammo-=rounds;if(u.faction==='blackline')s.ammoUsed+=rounds;}const hit=rand(s)<Math.min(.8,.3+u.skill*(u.health?.accuracyFactor??1)/180-dist(origin,dest)/75),before=target.hp;
  const shot={id:'shot-'+s.time+'-'+s.events.length,t:s.time,scene:'interior',kind:'shot',actor:u.id,target:target.id,from:u.faction==='blackline'||u.interiorLastSeen===s.time?[origin.x,origin.y]:[dest.x+(origin.x-dest.x)/Math.max(1,dist(origin,dest))*5,dest.y+(origin.y-dest.y)/Math.max(1,dist(origin,dest))*5],to:[dest.x,dest.y],rounds,hit,visible:true};s.events.push(shot);
  api.sceneShot?.(s,shot);if(hit){damage(s,target,Math.round(12+rand(s)*17),u,shot);if(target.faction==='blackline'&&target.hp<=55){target.woundedAt=target.woundedAt??s.time;target.worstHP=Math.min(target.worstHP??before,target.hp)}}
  if(u.faction==='blackline'&&!s.contact){s.contact=true;say(s,u.name,'건물 내부 무장 인원 확인. 엄폐 후 대응 사격한다.','contact')}
 }
 function searchTick(s){const j=s.journey,search=j.siteSearch;if(s.phase!=='수색'||search.discovered)return;const sector=search.points[search.index];if(!sector)return;const observers=blue(s).filter(u=>active(u)&&j.team.includes(u.id)&&dist(u,point(sector.position))<3);const threat=Object.entries(s.contacts).some(([id,c])=>c.visible&&dist(point([c.x,c.y]),point(sector.position))<15&&s.units.some(u=>u.id===id&&active(u)&&(u.faction==='insurgent'||s.rival.hostile)));if(!observers.length||threat)return;sector.worked+=observers.reduce((n,u)=>n+(u.tacticalRole==='scout'?1.4:1)*(Number(u.skill)||50)/70,0)/Math.sqrt(observers.length);if(sector.worked<18)return;sector.cleared=true;if(sector.target){search.discovered=true;s.goal=j.building.entrance;say(s,observers[0].name,(j.mode&&j.mode!=='interior'?'야외 수색으로 의뢰 대상을 확인했다. 보호·과업 위치를 공유한다.':'현장 수색으로 의뢰 대상 건물을 확인했다. 출입구 위치를 공유한다.'),'objective')}else{say(s,observers[0].name,'수색 구역 확인. 의뢰 대상 단서는 없다. 다음 구역으로 이동한다.');if(s.version>=4)api.chooseSearchSector(s);else search.index++}}
 function recoverStalledSite(s){
  const j=s.journey;if(!j||!['site','entry','outdoor'].includes(j.stage)||s.retreat)return;
  const fit=blue(s).filter(u=>active(u)&&!u.boarded&&!u.evacComplete);
  if(!fit.length)return;
  const snapshot=fit.map(u=>[u.id,Math.round(u.x*2),Math.round(u.y*2),u.status]).join('|')+';'+Math.floor((s.objective||0)/2)+';'+j.stage+';'+(j.siteSearch?.index??-1)+';'+(j.siteSearch?.discovered?1:0);
  const monitor=j.stallMonitor||(j.stallMonitor={snapshot,at:s.time,lastAction:s.time});
  if(monitor.snapshot!==snapshot){monitor.snapshot=snapshot;monitor.at=s.time;return;}
  if(s.time-monitor.at<90||s.time-monitor.lastAction<90)return;
  monitor.lastAction=s.time;monitor.at=s.time;
  const search=j.siteSearch;
  if(search&&!search.discovered&&search.points?.length){
   const sector=search.points[search.index];
   if(sector){
    const near=fit.some(u=>dist(u,point(sector.position))<8);
    if(near){sector.worked=Math.max(sector.worked||0,17);say(s,'현장지휘관','현장 수색 정체 확인. 인접 정찰조의 확인 정보를 통합해 해당 구역 수색을 재개한다.','command');}
    else {for(const u of fit.filter(u=>j.team.includes(u.id))){u.path=[];u.destination='';}say(s,'현장지휘관','수색조 경로 정체. 이동 경로를 재계산하고 재접근한다.','command');}
    return;
   }
   search.discovered=true;s.goal=j.building.entrance;say(s,'현장지휘관','수색 구역 확인 완료. 목표 건물로 이동한다.','command');return;
  }
  for(const u of fit){u.path=[];u.destination='';}
  say(s,'현장지휘관','작전조 이동 정체 확인. 이동 경로 초기화 후 목표 접근을 재시도한다.','command');
 }
 function interiorTick(s){const j=s.journey,ind=j.interior,occupants=s.units.filter(u=>u.inside);let fit=occupants.filter(u=>u.faction==='blackline'&&active(u));ind.aims=[];api.indoorBefore?.(s);
  for(const u of occupants){u.interiorTarget=null;if(!active(u))continue;if(api.indoorRecover?.(s,u)||api.agentAction?.(s,u,'interior'))continue;const enemies=occupants.filter(v=>active(v)&&v.faction!==u.faction&&(v.faction==='insurgent'||u.faction==='insurgent')&&dist(indoorPoint(u),indoorPoint(v))<24&&api.canSeeActor?.(s,u,v,'interior')!==false&&api.clearLine(indoorPoint(u),indoorPoint(v),ind.map)).sort((a,b)=>dist(indoorPoint(u),indoorPoint(a))-dist(indoorPoint(u),indoorPoint(b)));
   const target=enemies[0];if(target&&u.ammo>0){u.interiorRecognized=u.interiorRecognized||{};u.interiorRecognized[target.id]=(u.interiorRecognized[target.id]||0)+1;if(u.faction==='blackline')api.observeContact?.(s,u,target,'interior',{identified:u.interiorRecognized[target.id]>=(api.identificationTicks?.(s,u)||3)});if(u.interiorRecognized[target.id]>=(api.identificationTicks?.(s,u)||3)){if(u.faction==='blackline'){target.interiorSeen=true;target.interiorLastSeen=s.time;target.interiorLastPosition=[target.interior.x,target.interior.y]};shoot(s,u,target);ind.aims.push({actor:u.id,target:target.id,from:[u.interior.x,u.interior.y],to:[target.interior.x,target.interior.y],friendly:u.faction==='blackline'});u.status=api.contactStatus?.(s,u,target,'interior')||'engaging';continue}}
   if(u.faction!=='blackline')continue;
   const task=ind.tasks[ind.task],baseGoal=j.stage==='exit'?ind.exit:task?.position||ind.exit,index=j.team.indexOf(u.id),goal=[baseGoal[0]+(index%3-1)*1.4,baseGoal[1]+(Math.floor(index/3)%2)*1.3];const ordered=api.indoorGoal?.(s,u,goal);indoorMove(s,u,ordered?.position||goal,ordered?.speed||(u.hp<=55?.3:.55));u.status=ordered?.status||(j.stage==='exit'?'exiting':'room-search');
  }
  fit=occupants.filter(u=>u.faction==='blackline'&&active(u));if(!fit.length){if(api.hasInteriorRescue?.(s))return;s.retreat=true;beginExtraction(s);return}
  if(j.stage==='entry'&&j.team.filter(id=>s.units.some(u=>u.id===id&&active(u))).every(id=>s.units.find(u=>u.id===id).inside)){stage(s,'interior','건물 내부');say(s,s.commander||'현장지휘관','진입조 내부 합류. 구역별 확인 후 목표 지점에서 과업을 수행하라.','objective')}
  if(j.stage==='interior'){
   if(!ind.discovered){const room=ind.rooms[ind.room],observers=fit.filter(u=>dist(indoorPoint(u),point(room))<4),danger=occupants.some(u=>u.faction==='insurgent'&&active(u)&&u.interiorLastSeen===s.time&&dist(indoorPoint(u),point(room))<20);if(observers.length&&!danger){ind.roomWorked+=observers.reduce((n,u)=>n+(u.tacticalRole==='scout'?1.5:1),0)/Math.sqrt(observers.length);ind.tasks[0].progress=Math.min(95,Math.round((ind.clearedRooms.length+Math.min(1,ind.roomWorked/18))/ind.rooms.length*100));if(ind.roomWorked>=18){ind.clearedRooms.push(ind.room);if(ind.room===ind.targetRoom){ind.discovered=true;ind.tasks[0].progress=100;ind.tasks[1].position=room.slice();ind.tasks[1].revealed=true;ind.task=1;say(s,observers[0].name,'실내 수색 중 의뢰 대상 오브젝트를 발견했다. 위치 확인, 현장 과업을 시작한다.','objective')}else{ind.room=s.version>=4?api.commanderRoom(s):ind.room+1;ind.roomWorked=0;ind.tasks[0].position=ind.rooms[ind.room].slice();say(s,observers[0].name,'실내 구역 확인. 대상 미발견, 다음 방을 수색한다.')}}}s.objective=ind.tasks[0].progress/2;return}
   const task=ind.tasks[ind.task];if(task){const threat=occupants.some(u=>u.faction==='insurgent'&&active(u)&&u.interiorLastSeen===s.time&&dist(indoorPoint(u),point(task.position))<20),workers=fit.filter(u=>dist(indoorPoint(u),point(task.position))<4);
    task.blocked=threat;task.working=!threat&&workers.length>0;
    if(task.working){task.worked+=workers.reduce((n,u)=>n+Math.max(.5,(Number(u.skill)||50)/80),0)/Math.sqrt(workers.length);workers.forEach(u=>u.status='objective-work');task.progress=Math.min(100,Math.floor(task.worked/task.seconds*100));s.objective=Math.min(100,ind.tasks.reduce((n,t)=>n+t.progress,0)/ind.tasks.length)}
    if(task.progress>=100){say(s,s.commander||'현장지휘관',task.name+' 100% 완료. '+(ind.task+1<ind.tasks.length?'다음 목표 지점으로 이동한다.':'진입조는 출입구로 철수, 전원 복귀 집결지로 이동한다.'),'objective');ind.task++;if(ind.task>=ind.tasks.length){s.objective=100;stage(s,'exit','건물 이탈')}}
   }
  }
  if(j.stage==='exit'){
   for(const u of fit)if(dist(indoorPoint(u),point(ind.exit))<2&&!api.mustRecoverInside?.(s,u)){u.inside=false;u.x=j.building.entrance[0];u.y=j.building.entrance[1];u.path=[];u.destination='';u.status='retreating';say(s,u.name,'건물 이탈 완료. 복귀 집결지로 이동한다.')}
   if(!blue(s).some(u=>u.inside&&u.status!=='dead'))beginExtraction(s);
  }
 }
 function beginExtraction(s){const j=s.journey;if(blue(s).some(u=>u.inside&&u.status!=='dead'&&!u.evacComplete)){if(j.stage!=='exit'){stage(s,'exit','건물 이탈');say(s,'현장지휘관','철수 명령. 진입조는 확인된 출입구로 이동, 부상자를 먼저 회수하라.')}return;}if(['extraction','boarding','homebound','complete'].includes(j.stage))return;
  // Incapacitated interior casualties are recovered through the doorway by the surviving team.
  for(const u of blue(s).filter(u=>u.inside&&!active(u)&&u.status!=='dead')){u.recoveryNeeded=true;}
  stage(s,'extraction','복귀 집결');s.returnStarted=s.time;s.phase='복귀';j.pickup={requestedAt:null,arrived:false,path:route(s.terrain,s.terrain.base,j.exfil),vehicle:{...point(s.terrain.base),heading:0},boarding:0};api.preparePickup?.(s);say(s,'현장지휘관','복귀 집결지로 이동한다. 수송조는 선두 도착 보고 후 접근, 전원 탑승을 확인한다.');
 }
 function extractTick(s,op){const j=s.journey,pick=j.pickup,fit=blue(s).filter(active),down=blue(s).filter(u=>!u.boarded&&!active(u)&&u.status!=='dead'&&!u.evacComplete&&!u.stagedForPickup);
  if(!fit.length&&j.medevac&&j.medevac.stage!=='complete'){s.retreat=true;s.phase='의료 후송 대기';return;}if(!fit.length){s.retreat=true;s.phase='본부 긴급 구조 요청 · 구조대 출동 대기';say(s,'본부','전투 가능 인원 상실. 긴급 구조대를 요청한다. 관전은 후송 완료까지 유지한다.','command');return}
  for(const [index,u]of fit.entries()){if(u.boarded||u.medicalOverride===s.time||u.contactOverride===s.time)continue;if(u.onRoof&&api.roles.handle(s,u,op))continue;if(down.some(v=>v.carriedBy===u.id))continue;u.inside=false;const station=api.projectToGround(s.terrain,[j.exfil[0]+Math.cos(index*2.4)*2.2,j.exfil[1]+Math.sin(index*2.4)*2.2]);moveTo(s,u,station,u.hp<=55?.34:.58);u.status=dist(u,point(j.exfil))<3?'pickup-security':'retreating';}
  const assigned=new Set(fit.filter(u=>u.onRoof||u.medicalOverride===s.time).map(u=>u.id));for(const u of down){if(j.medevac&&j.medevac.stage!=='complete'&&j.medevac.patients.includes(u.id))continue;const carrier=fit.find(v=>v.id===u.carriedBy&&!assigned.has(v.id))||fit.filter(v=>!v.boarded&&!assigned.has(v.id)).sort((a,b)=>dist(a,u)-dist(b,u))[0];if(!carrier)continue;assigned.add(carrier.id);u.carriedBy=carrier.id;
   const location=u.inside?j.building.entrance:[u.x,u.y];if(dist(carrier,point(location))>2){moveTo(s,carrier,location,.58);carrier.status='medical-moving';continue}
   u.recoverySince=u.recoverySince??s.time;if(s.time-u.recoverySince<12){carrier.status='casualty-recovery';continue}
   u.isBeingCarried=true;u.inside=false;u.status='evacuated';u.x=carrier.x;u.y=carrier.y;u.carriedBy=carrier.id;moveTo(s,carrier,j.exfil,.32);u.x=carrier.x;u.y=carrier.y;carrier.status='carrying';if(dist(u,point(j.exfil))<2.2){u.stagedForPickup=true;u.carriedBy=null;u.isBeingCarried=false;carrier.carryPatient=null;carrier.status='pickup-security';say(s,carrier.name,u.name+' 집결지 인계. 다음 부상자 회수에 합류한다.','medical')}
  }
  if(pick.requestedAt==null&&fit.some(u=>dist(u,point(j.exfil))<3)){pick.requestedAt=s.time;say(s,'수송 담당',(j.transport.kind==='helicopter'?'집결지 접근 승인. 헬기 진입 중, 약 ':'집결지 접근 승인. 차량 진입 중, 약 ')+Math.ceil(measure(pick.path)/1.4)+'초 후 도착한다.','support')}
  if(pick.requestedAt!=null&&!pick.arrived){const progress=api.pickupProgress?.(s,pick)??Math.min(1,(s.time-pick.requestedAt)/Math.max(1,measure(pick.path)/1.4));pick.vehicle=along(pick.path,progress);if(progress>=1&&api.pickupLanding?.(s,pick)!==false){pick.arrived=true;say(s,'수송 담당',(j.transport.kind==='helicopter'?'수송 헬기 착륙.':'수송 차량 도착.')+' 부상자부터 탑승, 지휘관은 마지막으로 인원을 확인하라.','support')}}
  if(pick.arrived){
   const survivors=blue(s).filter(u=>u.status!=='dead'&&!u.evacComplete);const present=survivors.filter(u=>!u.inside&&dist(u,point(j.exfil))<5);
   if(present.length===survivors.length){if(j.stage!=='boarding')stage(s,'boarding',j.transport.kind==='helicopter'?'헬기 탑승':'차량 탑승');pick.boarding=Math.min(100,pick.boarding+100/20);present.forEach(u=>u.status=pick.boarding>=100?'boarded':'boarding');if(pick.boarding>=100){present.forEach(u=>{u.boarded=true});j.manifest=present.map(u=>u.id);j.departAt=s.time;if(s.time>=j.departAt){stage(s,'homebound','본부 복귀');j.transport.progress=0;j.transport.returnDistance=0;say(s,j.transport.kind==='helicopter'?'항공 수송':'수송 담당',j.transport.kind==='helicopter'?'전원 탑승 확인. 이륙 후 본부로 복귀한다.':'전원 탑승 확인. 차량 출발, 본부로 복귀한다.','support')}}}
  }
 }
 function roadFire(s,u,target){if(api.authorizeEngagement?.(s,u,target,'regional')===false)return;const from=u.road,to=target.road;if(s.time<(u.roadNextShot||0)||u.ammo<=0)return;u.roadNextShot=s.time+(api.weaponCycle?.(u)||8+Math.floor(rand(s)*4));const rounds=api.consumeRounds?api.consumeRounds(s,u):Math.min(3,u.ammo);if(!rounds){u.roadNextShot=s.time+1;return}if(!api.consumeRounds){u.ammo-=rounds;if(u.faction==='blackline')s.ammoUsed+=rounds;}const hit=rand(s)<Math.max(.15,.28+u.skill*(u.health?.accuracyFactor??1)/180-dist(from,to)/75),observed=u.faction==='blackline'||u.roadSeenAt===s.time;
  const shot={id:'shot-'+s.time+'-'+s.events.length,t:s.time,scene:'regional',kind:'shot',actor:u.id,target:target.id,from:observed?[from.x,from.y]:[to.x+(from.x-to.x)/Math.max(1,dist(from,to))*5,to.y+(from.y-to.y)/Math.max(1,dist(from,to))*5],to:[to.x,to.y],rounds,hit,visible:true};s.events.push(shot);
  api.sceneShot?.(s,shot);const hp=target.hp;if(hit){damage(s,target,Math.round(10+rand(s)*16),u,shot);if(target.faction==='blackline'&&target.hp<=55){target.woundedAt=target.woundedAt??s.time;target.worstHP=Math.min(target.worstHP??hp,target.hp)}}
 }
 function roadTick(s){const j=s.journey,tr=j.transport,map=tr.map,vehicle=tr.vehicle,guards=s.units.filter(u=>u.roadOnly&&active(u));j.roadAims=[];j.roadContacts=j.roadContacts||{};for(const c of Object.values(j.roadContacts))c.visible=false;
  const threat=guards.some(u=>dist(u.road,vehicle)<25&&api.clearLine(u.road,vehicle,map));
  if(threat&&!j.roadStopped){j.roadStopped=true;j.roadRegroup=null;s.contact=true;say(s,'현장지휘관','이동 중 접촉! 차량 정차, 하차 후 엄폐. 정찰은 사격 방향 확인, 부상자와 차량을 우선 보호한다.','contact');blue(s).forEach((u,i)=>{u.road={...point(api.projectToGround(map,[vehicle.x+(i%3-1)*2,vehicle.y+Math.floor(i/3)*2])),heading:vehicle.heading};u.status=active(u)?'road-cover':u.status})}
  // Never leave a convoy indefinitely parked on a contact or inaccessible route.
  if(j.roadStopped){
   j.roadStoppedAt=j.roadStoppedAt??s.time;
   if(s.time-j.roadStoppedAt>=75){
    const capable=blue(s).filter(active);
    if(capable.length){
     j.roadReturning=true;s.retreat=true;
     say(s,'현장지휘관','도로 접촉 대응 제한시간 초과. 대원 회수 후 우회가 불가능하면 안전한 경로로 철수한다.','command');
     for(const u of capable){u.road=null;u.status='transporting'}
     j.roadStopped=false;stage(s,'homebound','접촉 지점 이탈·본부 복귀');
     tr.returnFrom=Math.max(.02,tr.progress);tr.returnDistance=0;return false;
    }
   }
  }else j.roadStoppedAt=null;
  if(!j.roadStopped)return true;
  const team=blue(s).filter(active);
  for(const u of [...team,...guards]){if(u.faction==='blackline'&&u.medicalOverride===s.time)continue;const enemies=(u.faction==='blackline'?guards:team).filter(v=>dist(u.road,v.road)<(api.roadEngagementRange?.(s,u)??(u.tacticalRole==='scout'?30:26))&&api.clearLine(u.road,v.road,map)).sort((a,b)=>dist(u.road,a.road)-dist(u.road,b.road)),target=enemies[0];
   if(api.agentAction?.(s,u,'regional'))continue;if(!target){
    u.roadTarget=null;
    // Dismounted troops must actively clear the threat, not stand by the parked truck forever.
    if(u.faction==='blackline'&&guards.length){
     const hostile=guards.filter(g=>active(g)&&g.road).sort((a,b)=>dist(u.road,a.road)-dist(u.road,b.road))[0];
     if(hostile){
      const d=dist(u.road,hostile.road);
      if(d>12){
       const dx=hostile.road.x-u.road.x,dy=hostile.road.y-u.road.y;
       const step=Math.min(.85,Math.max(0,d-12));
       const next=api.projectToGround(map,[u.road.x+dx/d*step,u.road.y+dy/d*step]);
       u.road.x=next[0];u.road.y=next[1];u.road.heading=Math.atan2(dy,dx);
       u.status='road-advance';
      }
     }
    }
    continue
   }u.roadTarget=target.id;u.road.heading=Math.atan2(target.road.y-u.road.y,target.road.x-u.road.x);if(u.faction==='blackline'){target.roadSeenAt=s.time;j.roadContacts[target.id]={x:target.road.x,y:target.road.y,lastSeen:s.time,visible:true};if(!target.roadReported){target.roadReported=true;if(!api.observeContact)say(s,u.name,'도로 인근 무장 인원 시각 확인. 엄폐 위치에서 대응 사격한다.','contact')}}
   if(u.ammo>0){roadFire(s,u,target);u.status=api.contactStatus?.(s,u,target,'regional')||'engaging';if(u.faction==='blackline'||u.roadSeenAt===s.time)j.roadAims.push({actor:u.id,target:target.id,from:[u.road.x,u.road.y],to:[target.road.x,target.road.y],friendly:u.faction==='blackline'})}
  }
  if(!team.length&&j.medevac&&j.medevac.stage!=='complete'){s.retreat=true;s.phase='의료 후송 대기';return false;}if(!team.length){s.retreat=true;s.done=true;s.duration=s.time;stage(s,'lost','이동 중 긴급 구조 요청');say(s,'현장지휘관','수송 중 전투 가능 인원 상실. 긴급 구조 요청, 작전 중단.','result');return false}
  const contact=guards.some(u=>active(u)&&team.some(b=>dist(b.road,u.road)<30&&api.clearLine(b.road,u.road,map)));
  if(contact&&team.some(u=>u.ammo>0)&&!s.retreat){
   // Stop an endless contact loop if opponents cannot be reached or damaged.
   j.lastRoadCombatAt=j.lastRoadCombatAt??s.time;
   if(s.time-j.lastRoadCombatAt<45)return false;
   s.retreat=true;j.roadReturning=true;
   say(s,'현장지휘관','교전 장기화. 적 제압 실패로 차량 회수 후 철수를 명령한다.','command');
  }if(j.medevac?.scene==='regional'&&['inbound','landed'].includes(j.medevac.stage))return false;
  if((contact||s.retreat)&&!j.roadReturning){s.retreat=true;j.roadReturning=true;say(s,'현장지휘관','잔탄·전력 한계. 현장 진입을 취소하고 차량으로 이탈한다.','command')}
  j.roadRegroup=j.roadRegroup??s.time;for(const u of team){u.status='road-boarding';const dx=vehicle.x-u.road.x,dy=vehicle.y-u.road.y,d=Math.hypot(dx,dy);if(d>1){u.road.x+=dx/d*Math.min(.6,d);u.road.y+=dy/d*Math.min(.6,d)}}
  if(s.time-j.roadRegroup<12||team.some(u=>dist(u.road,vehicle)>3))return false;
  blue(s).forEach(u=>{if(u.evacComplete||u.evacuationHold)return;u.road=null;if(u.status!=='dead')u.status='transporting'});j.roadStopped=false;
  if(j.roadReturning){stage(s,'homebound','긴급 본부 복귀');tr.returnFrom=tr.progress;tr.returnDistance=0;say(s,'수송 담당','인원 회수. 접촉 구간을 이탈하여 본부로 복귀한다.','support');return false}
  say(s,'수송 담당','도로 위협 이탈·재탑승 확인. 작전지역으로 이동을 재개한다.','support');return true;
 }
 api.journeyDrone=function(s,op){const j=s.journey;if(!j)return;j.drone=j.drone||{launched:false};const drone=j.drone;
  if(!drone.launched&&s.phase==='수색'&&!j.siteSearch.discovered){const fp=op.fieldProgress,cost=250000,spent=Number(fp.reservedSupportCost)||0;if(Number(state.cash)>=cost&&Number(op.budget)-spent>=cost){state.cash-=cost;fp.reservedSupportCost=spent+cost;fp.supportOrders=fp.supportOrders||[];fp.supportOrders.push({name:'현장 정찰 드론',kind:'drone',cost,effect:0,charged:true,requestedAt:s.time,eta:0,reason:'현장지휘관 수색 구역 정찰 요청'});drone.launched=true;drone.started=s.time;drone.centre=s.goal.slice();drone.duration=60;drone.radius=18;say(s,'현장지휘관','아이즈, 드론 정찰 요청. 의뢰 구역 상공 확인, 건물 내부는 미확인으로 유지하라.','support')}}
  if(!drone.launched||drone.finished)return;const elapsed=s.time-drone.started;if(elapsed>=drone.duration){drone.finished=true;drone.remaining=0;say(s,'정찰 담당','드론 배터리 한계, 회수한다. 표시는 마지막 관측 위치이며 실시간 추적을 종료한다.','support');return}
  const angle=elapsed/60*Math.PI*2;drone.x=drone.centre[0]+Math.cos(angle)*9;drone.y=drone.centre[1]+Math.sin(angle)*7;drone.remaining=drone.duration-elapsed;if(api.droneLink?.(s,drone)===false)return;
  for(const u of s.units){if(u.faction==='blackline'||u.inside||u.roadOnly||!active(u)||dist(u,drone)>drone.radius||!api.clearLine({...drone,elevation:35},u,s.terrain))continue;drone.recognition=drone.recognition||{};drone.recognition[u.id]=(drone.recognition[u.id]||0)+1;if(drone.recognition[u.id]<3)continue;const first=!s.contacts[u.id];s.contacts[u.id]={x:u.x,y:u.y,lastSeen:s.time,firstSeen:s.contacts[u.id]?.firstSeen??s.time,visible:true,faction:u.faction,source:'drone',identified:s.version<4||drone.recognition[u.id]>=5,confidence:s.version<4?100:Math.min(100,drone.recognition[u.id]*20)};if(first){u.seenAt=s.time;say(s,'정찰 담당','드론 영상, '+(u.faction==='pmc'?'타 PMC 식별 대기 인원':'무장 인원')+' 관측. 좌표 전송, 현장조 시각 재확인 바란다.','contact')}for(const b of blue(s).filter(b=>active(b)&&(s.version<4||s.contacts[u.id].identified&&api.radioLinked(s,b))))b.knowledge[u.id]={x:u.x,y:u.y,lastSeen:s.time};}
 };
 api.journeyFrame=function(s){const j=s.journey;if(!j)return undefined;return {scenario:s.scenario?{mode:s.scenario.mode,name:s.scenario.name}:null,ambient:api.ambientFrame?.(s),outdoor:j.outdoor?{kind:j.outdoor.kind,name:j.outdoor.name,progress:j.outdoor.progress,index:j.outdoor.index,discovered:j.outdoor.discovered,current:j.outdoor.current,handoff:j.outdoor.handoff,origin:j.outdoor.origin,blocked:!!j.outdoor.blocked,tasks:j.outdoor.tasks.map(t=>({...t}))}:null,vehicle:j.vehicle?{health:j.vehicle.health,repairKit:j.vehicle.repairKit,repairProgress:j.vehicle.repairProgress,recovery:j.vehicle.recovery?{arrived:j.vehicle.recovery.arrived,position:j.vehicle.recovery.position}:null}:null,civilians:(s.civilians||[]).filter(c=>c.found).map(c=>({id:c.id,name:c.name,role:c.role||'protected',x:c.x,y:c.y,hp:c.hp,status:c.status,rescued:!!c.rescued})),drone:j.drone?.launched?{x:j.drone.x,y:j.drone.y,remaining:j.drone.remaining||0,radius:j.drone.radius,finished:!!j.drone.finished}:null,stage:j.stage,since:j.since,phase:s.phase,transport:{...j.transport.vehicle,progress:j.transport.progress,kind:j.transport.kind||'ground',altitude:j.transport.altitude||0,headingFixed:!!j.transport.returnHeadingCorrected,stopped:!!j.roadStopped||!!j.vehicle&&j.vehicle.health<=35},road:blue(s).filter(u=>u.road&&!u.evacComplete).concat(s.units.filter(u=>u.roadOnly&&u.roadSeenAt===s.time)).map(u=>({id:u.id,x:u.road.x,y:u.road.y,heading:u.road.heading,hp:u.hp,ammo:u.ammo,status:u.status,faction:u.faction})),roadAims:j.roadAims||[],medevac:j.medevac?{...api.medicalFlightStatus?.(s),stage:j.medevac.stage,scene:j.medevac.scene,patients:j.medevac.patients,loadedIds:j.medevac.loadedIds||[],waitReason:j.medevac.waitReason||'',lz:j.medevac.lz,altitude:j.medevac.altitude,boarding:j.medevac.boarding,position:{...j.medevac.position}}:null,pickup:j.pickup?{...j.pickup.vehicle,kind:j.transport.kind||'ground',altitude:j.pickup.altitude||0,landingBlocked:!!j.pickup.landingBlocked,requestedAt:j.pickup.requestedAt,arrived:j.pickup.arrived,boarding:Math.round(j.pickup.boarding)}:null,task:j.interior.task,search:{index:j.siteSearch.index,discovered:j.siteSearch.discovered,points:j.siteSearch.points.map(p=>({position:p.position,cleared:p.cleared,progress:Math.min(100,Math.round(p.worked/18*100))}))},rooms:j.interior.clearedRooms.slice(),discovered:j.interior.discovered,tasks:j.interior.tasks.map(t=>({name:t.name,position:t.revealed?t.position:null,progress:t.progress,working:!!t.working,blocked:!!t.blocked,revealed:!!t.revealed})),inside:s.units.filter(u=>u.inside&&(u.faction==='blackline'||u.interiorLastSeen===s.time)).map(u=>({id:u.id,x:u.interior.x,y:u.interior.y,hp:u.hp,status:u.status,ammo:u.ammo,heading:u.interior.heading,faction:u.faction,visible:u.faction==='blackline'||u.interiorLastSeen===s.time})),aims:j.interior.aims.filter(a=>a.friendly||s.units.some(u=>u.id===a.actor&&u.interiorLastSeen===s.time)).map(a=>({...a})),manifest:j.manifest.slice()};};
 // HQ automatically launches a separate emergency recovery when every deployed operator is down.
 function emergencyRescue(s){
  const j=s.journey,original=blue(s).filter(u=>!u.rescueReinforcement);
  const casualty=u=>u.hp<=0||u.captured||['dead','wounded','medevac','incapacitated','unconscious','critical','captured'].includes(u.status);
  // Transport, boarding, recovery holds and completed evacuation are not combat incapacitation.
  const stranded=original.filter(u=>!u.evacComplete&&!u.boarded&&!['evac-home','retreated','evacuated'].includes(u.status));
  if(j.emergencyRescue&&j.emergencyRescue.stage!=='complete'){
   if(!stranded.length||stranded.some(u=>!casualty(u))){
    for(const id of j.emergencyRescue.personnelIds||[]){const p=(state?.team||[]).find(x=>String(x.id)===String(id));if(p)p.onMission=false;}
    j.emergencyRescue.stage='cancelled';
    say(s,'본부 작전상황실','긴급구조 출동 취소. 현장 인원 정상 이동 또는 복귀 확인.','command');
    return false;
   }
  }else if(!stranded.length||stranded.some(u=>!casualty(u))||s.done||['complete','lost','homebound','boarding','extraction'].includes(j.stage))return false;
  if(!j.emergencyRescue){
   const survivors=original.filter(u=>u.status!=='dead'&&!u.evacComplete);
   if(!survivors.length)return false;
   j.emergencyRescue={started:s.time,stage:'dispatch',survivors:survivors.map(u=>u.id),reinforcements:[]};
   s.retreat=true;
   stage(s,'emergency-rescue','본부 긴급 구조대 출동');
   say(s,'본부 작전상황실','파병 인원 전원 전투불능. 긴급 구조작전 발령. 예비 전투조 및 의무후송팀을 즉시 파견한다.','command');
   const assigned=new Set((s.units||[]).map(u=>String(u.personnelId??u.id)));
   const roster=(window.state?.team||state?.team||[]).filter(p=>!p.dead&&!p.retired&&!p.injured&&!p.awaitingRecovery&&!p.onMission&&!assigned.has(String(p.id)));
   const medics=roster.filter(p=>/의무|의료|메딕/.test(p.role||''));
   const selected=[...medics.slice(0,1),...roster.filter(p=>!medics.slice(0,1).includes(p)).slice(0,5)];
   if(!selected.length){
    j.emergencyRescue.stage='no-team';
    say(s,'본부 작전상황실','긴급 구조 요청 접수. 즉시 투입 가능한 예비 인원이 없어 구조대 편성 대기.','command');
   }else{
    const template=original[0],base=s.terrain?.base||[8,8];
    const helicopter=(state?.vehicles||[]).some(v=>/헬기|helicopter|UH-|KUH-|수리온/i.test([v.name,v.type,v.model].join(' '))&&!v.onMission&&!v.destroyed);
    j.emergencyRescue.transport=helicopter?'helicopter':'vehicle';
    j.emergencyRescue.personnelIds=selected.map(p=>p.id);
    j.emergencyRescue.origin=[base[0],base[1]];
    for(let i=0;i<selected.length;i++){
     const p=selected[i],id='hq-rescue-'+p.id;
     p.onMission=true;
     const u={...template,id,personnelId:p.id,name:p.name,rank:p.rank,role:p.role,hp:100,ammo:Math.max(90,template.ammo||0),status:'rescue-deploying',faction:'blackline',rescueReinforcement:true,inside:false,road:null,roadOnly:false,evacComplete:false,evacuationHold:false,carriedBy:null,knowledge:{},tacticalRole:/의무|의료|메딕/.test(p.role||'')?'medic':'support',x:base[0]+i*.7,y:base[1]+i*.5};
     s.units.push(u);j.emergencyRescue.reinforcements.push(id);
    }
    say(s,'본부 작전상황실','실제 예비대 '+selected.map(p=>p.rank+' '+p.name).join(', ')+' 출동. '+(helicopter?'헬기':'차량')+' 후송 수단 지정.','command');
   }
  }
  const r=j.emergencyRescue,elapsed=s.time-r.started;
  // Hostiles can seize isolated casualties before the HQ rescue party reaches them.
  if(elapsed>=12&&!r.captureChecked){
   r.captureChecked=true;
   const enemies=s.units.filter(u=>u.faction!=='blackline'&&active(u));
   const captured=original.filter(u=>u.status!=='dead'&&!u.evacComplete&&enemies.some(e=>dist(e,u)<18));
   if(captured.length){
    r.captured=captured.map(u=>u.id);
    for(const u of captured){u.status='captured';u.captured=true;u.capturedAt=s.time;u.capturedBy='hostile';}
    say(s,'본부 작전상황실','적이 전투불능 대원 '+captured.length+'명을 확보해 이송 중인 것으로 판단. 포로 구출작전 준비를 지시한다.','command');
   }
  }
  if(r.stage==='no-team'){
   if(s.time-r.started>=30){
    const assigned=new Set(s.units.map(u=>String(u.personnelId??u.id)));
    const roster=(state?.team||[]).filter(p=>!p.dead&&!p.retired&&!p.injured&&!p.onMission&&!assigned.has(String(p.id)));
    if(roster.length){delete j.emergencyRescue;return emergencyRescue(s);}
   }
   if(s.time-r.started>=180){
    r.stage='external-evacuation';r.externalStarted=s.time;
    say(s,'본부 작전상황실','예비 구조 인원 부족. 외부 연합 의무후송 수단으로 전환, 생존자 회수 중.','command');
   }
   return true;
  }
  if(r.stage==='external-evacuation'){
   if(s.time-r.externalStarted>=60){
    for(const u of original.filter(u=>u.status!=='dead'&&!u.captured)){u.evacComplete=true;u.status='evac-home';u.evacuationHold=false;}
    r.stage='complete';stage(s,'complete','외부 의무후송 완료');s.done=true;s.duration=s.time;
    say(s,'본부 작전상황실','외부 의무후송 종료. 미회수 포로는 별도 구출작전으로 이관한다.','result');
   }
   return true;
  }
  if(r.stage==='dispatch'){
   const origin=r.origin||[8,8],progress=Math.min(1,elapsed/(r.transport==='helicopter'?22:38));
   for(let i=0;i<r.reinforcements.length;i++){const u=s.units.find(x=>x.id===r.reinforcements[i]);if(u){u.x=origin[0]+(s.goal[0]-origin[0])*progress+i*.6;u.y=origin[1]+(s.goal[1]-origin[1])*progress+i*.6;}}
  }
  if(elapsed>=(r.transport==='helicopter'?22:38)&&r.stage==='dispatch'){r.stage='arrival';say(s,'긴급구조대','현장 접근 완료. 경계조가 주변 위협을 견제하고 의무조가 생존자 회수를 시작한다.','support');}
  if(elapsed>=(r.transport==='helicopter'?47:63)&&r.stage==='arrival'){
   r.stage='evacuation';
   for(const u of original){if(u.status==='dead'||u.captured||u.evacComplete)continue;u.evacComplete=true;u.status='medical-evacuation';u.evacuationHold=false;u.carriedBy=null;}
   say(s,'긴급구조대','생존자 수습 완료. 응급 처치 후 후송 차량으로 이송한다.','support');
  }
  const departAt=r.transport==='helicopter'?72:93,returnDuration=r.transport==='helicopter'?24:42;
  if(elapsed>=departAt&&r.stage==='evacuation'){
   r.stage='returning';r.returnStarted=s.time;
   stage(s,'emergency-return','긴급 구조대 생존자 후송 중');
   say(s,'긴급구조대','생존자 후송을 시작한다. 본부 도착 전까지 관전과 구조작전은 계속된다.','support');
  }
  if(r.stage==='returning'){
   const progress=Math.min(1,(s.time-r.returnStarted)/returnDuration),origin=r.origin||[8,8];
   for(let i=0;i<r.reinforcements.length;i++){
    const u=s.units.find(x=>x.id===r.reinforcements[i]);
    if(u){u.x=s.goal[0]+(origin[0]-s.goal[0])*progress+i*.6;u.y=s.goal[1]+(origin[1]-s.goal[1])*progress+i*.6;u.status='rescue-returning';}
   }
   if(progress>=1){
    r.stage='complete';s.retreat=true;
    for(const id of r.personnelIds||[]){const p=(state?.team||[]).find(x=>x.id===id);if(p){p.onMission=false;p.fatigue=Math.min(100,(p.fatigue||0)+25);}}
    stage(s,'complete','긴급 구조·후송 완료');s.done=true;s.duration=s.time;
    say(s,'본부 작전상황실',r.captured?.length?'구조대 복귀 완료. 포로 '+r.captured.length+'명은 미회수 상태로 구출작전 필요.':'긴급 구조대 복귀 완료. 생존자 후송 및 인계 완료.','result');
   }
  }
  return true;
 }
 api.step=function(s,op){if(!s.journey||s.version<3)return step(s,op);if(s.done)return;const j=s.journey;if(emergencyRescue(s)){s.time++;emergencyRescue(s);api.deliverRadio?.(s);api.captureFrame(s);return;}
  if(['outbound','extraction','boarding','homebound'].includes(j.stage)){
   s.time++;api.sceneTick?.(s,op);
   if(j.stage==='outbound'){
    const moving=j.transport.kind==='helicopter'?true:roadTick(s);
    const vehicleClear=api.vehicleTravel?.(s,op)!==false;
    const airClear=api.airTravel?.(s,'outbound')!==false;
    const travelAllowed=moving&&vehicleClear&&airClear;
    if(travelAllowed){
     j.transport.distance+=j.transport.speed;
     j.transport.blockedSince=null;
     j.transport.recoveryActive=false;
     j.transport.lastMovedAt=s.time;
     if(s.transportWaitReason)s.transportWaitReason='';
    }else if(moving&&!j.roadStopped){
     j.transport.blockedSince=j.transport.blockedSince??s.time;
     const elapsed=s.time-j.transport.blockedSince;
     if(elapsed>=12&&blue(s).some(active)){
      if(!j.transport.recoveryActive){
       j.transport.recoveryActive=true;
       say(s,'수송 담당','출발 장애 확인. 현장지휘관 판단에 따라 우회 이동으로 전환한다.','support');
      }
      // Advance continuously once the automatic recovery decision is made,
      // instead of adding one small step every 45 ticks.
      j.transport.distance+=j.transport.speed;
      j.transport.lastMovedAt=s.time;
      s.transportWaitReason='';
     }
    }
    j.transport.progress=Math.min(1,j.transport.distance/measure(j.transport.path));j.transport.vehicle=along(j.transport.path,j.transport.progress);if(j.stage==='outbound'&&j.transport.kind!=='helicopter')s.phase=s.transportWaitReason|| (j.roadStopped?'이동 중 교전':j.vehicle?.health<=35?'차량 정비·회수':'작전지 이동');if(j.stage==='outbound'&&j.transport.progress>=1&&api.airArrival?.(s)!==false){stage(s,'site','접근');s.dismounted=true;for(const u of blue(s).filter(active)){u.status='moving';u.road=null;}say(s,j.transport.kind==='helicopter'?'항공 수송':'수송 담당','작전지역 도착. 하차 완료, 현장 지휘관에게 통제권을 인계한다.','support')}}
   else if(j.stage==='homebound'){j.transport.returnDistance=(j.transport.returnDistance||0)+((j.transport.kind==='helicopter'?api.airTravel?.(s,'homebound'):api.vehicleTravel?.(s,op))===false?0:j.transport.speed);j.transport.progress=Math.min(1,j.transport.returnDistance/Math.max(.001,measure(j.transport.path)*(j.transport.returnFrom??1)));j.transport.vehicle=along(j.transport.path,(j.transport.returnFrom??1)*(1-j.transport.progress));j.transport.vehicle.heading+=Math.PI;j.transport.returnHeadingCorrected=true;if(j.transport.progress>=1&&api.airArrival?.(s)!==false&&(!j.medevac||j.medevac.stage==='complete')){stage(s,'complete','복귀 완료');s.done=true;s.duration=s.time;say(s,'현장지휘관',(j.transport.kind==='helicopter'?'헬기 본부 착륙. ':'차량 본부 도착. ')+'하차·인원 확인 및 작전 종료를 보고한다.','result')}}
   else {api.defendExtraction(s,op);extractTick(s,op);}
  }else{
   step(s,op);searchTick(s);api.outdoorTick?.(s,op);recoverStalledSite(s);
   if(s.retreat&&!s.done)beginExtraction(s);
   if(['entry','interior','exit'].includes(j.stage)&&blue(s).some(u=>u.inside))interiorTick(s);
   if(j.stage==='exit'&&!blue(s).some(u=>u.inside&&u.status!=='dead'))beginExtraction(s);
  }
  api.afterActors?.(s);api.deliverRadio?.(s);api.captureFrame(s);
 };
 api.journeyTools={stage,moveTo,indoorMove,indoorFire:shoot,roadFire,beginExtraction,route,measure,along};api.journeyMaps={interior};
})();
