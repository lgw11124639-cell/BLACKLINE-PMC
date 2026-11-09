/* Commander orders use terrain and reported contacts; never hidden enemy coordinates. */
(function(){
 const api=window.fieldSimulation,{dist,active}=api.internals;
 const role=u=>/저격|정밀사수|지정사수/.test(u.role)?'sniper':/정찰|수색|정보/.test(u.role)?'scout':/메딕|의무|의료|구급/.test(u.role)?'medic':/지원|기관총/.test(u.role)?'support':/팀장|지휘/.test(u.role)?'commander':'assault';
 const labels={sniper:'후방 저격 엄호',scout:'선행 정찰·고지 확인',medic:'후방 의료 대기',support:'측면 엄호',commander:'현장 지휘',assault:'주축선 진입'};
 const radio=(s,who,msg,kind='command')=>api.transmit?api.transmit(s,who,msg,kind):s.radio.push({t:s.time,who,msg,kind});
 function order(s,u,kind,point,extra={}){u.assignment={kind,position:point,...extra};s.orders.push({t:s.time,actor:u.id,kind,position:point,...extra});}
 function separateSnipers(s){
  const snipers=s.units.filter(u=>u.faction==='blackline'&&role(u)==='sniper'),signature=snipers.map(u=>u.id).join('|');
  if(s.sniperAllocation?.version===1&&s.sniperAllocation.signature===signature)return;
  const map=s.terrain||api.MAP,used=[],roofKey=p=>p.roof?'roof:'+((map.buildings||[]).findIndex(b=>p.x>=b[0]&&p.x<=b[2]&&p.y>=b[1]&&p.y<=b[3]))+':'+(p.entry||[]).join(','):null;
  // Coordinates sharing a building reserve that whole roof, even with different entry doors.
  const buildingKey=p=>{if(!p.roof)return null;const n=(map.buildings||[]).findIndex(b=>p.x>=b[0]&&p.x<=b[2]&&p.y>=b[1]&&p.y<=b[3]);return n>=0?'building:'+n:roofKey(p)};
  const free=p=>used.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=3&&(!p.roof||buildingKey(p)!==buildingKey(q)));
  const candidates=(map.positions?.sniper||[]).slice().sort((a,b)=>Math.hypot(b.x-s.goal[0],b.y-s.goal[1])-Math.hypot(a.x-s.goal[0],a.y-s.goal[1]));
  for(const [index,u]of snipers.entries()){
   const old=u.assignment,original=old&&{x:old.position[0],y:old.position[1],roof:old.roof,entry:old.entry,height:old.height};
   let p=original&&free(original)?original:candidates.find(free);
   if(!p){for(let k=0;k<96&&!p;k++){const angle=(index+k)*2.39996,radius=12+Math.floor(k/12)*3,raw=[Math.max(2,Math.min(map.width-2,s.goal[0]+Math.cos(angle)*radius)),Math.max(2,Math.min(map.height-2,s.goal[1]+Math.sin(angle)*radius))],g=api.projectToGround?.(map,raw)||raw,candidate={x:g[0],y:g[1],roof:false,height:0};if(free(candidate))p=candidate}}
   if(!p)continue;used.push(p);u.tacticalRole='sniper';
   if(!original||original.x!==p.x||original.y!==p.y||!!original.roof!==!!p.roof){
    if(u.onRoof&&old?.entry)u.sniperRelocation={entry:old.entry.slice(),until:s.time+12};
    order(s,u,'후방 저격 엄호',[p.x,p.y],{entry:p.entry,roof:!!p.roof,height:p.height||0});
    u.positionedAt=null;u.positionReported=false;u.setupUntil=null;u.path=[];u.destination='';
    radio(s,s.commander,u.name+', 저격 위치 분산. '+(p.roof?'별도 건물 관측층':'독립 엄호 지점')+'을 확보하라.');
   }
  }
  s.sniperAllocation={version:1,signature};
 }
 function initialize(s,op){
  if(s.rolesInitialized){separateSnipers(s);return;}s.rolesInitialized=true;s.orders=[];s.medUsed=s.medUsed||0;s.medicalBudget=s.medicalBudget??Math.min(2,Number(state.med)||0);s.suppression={};s.commander=op.leaderName||'현장지휘관';
  const map=s.terrain||api.maps?.factory||api.MAP,positions=map.positions||{};
  const candidates=(positions.sniper||[]).filter(p=>Math.hypot(p.x-s.goal[0],p.y-s.goal[1])<=34);const high=(candidates.length?candidates:positions.sniper||[]).slice().sort((a,b)=>Math.hypot(b.x-s.goal[0],b.y-s.goal[1])-Math.hypot(a.x-s.goal[0],a.y-s.goal[1]));
  const scoutHigh=(positions.highGrounds||[]).filter(p=>!p.roof&&(!high[0]||Math.hypot(p.x-high[0].x,p.y-high[0].y)>5)).sort((a,b)=>Math.hypot(a.x-s.goal[0],a.y-s.goal[1])-Math.hypot(b.x-s.goal[0],b.y-s.goal[1]))[0];
  for(const [i,u] of s.units.filter(u=>u.faction==='blackline').entries()){
   u.tacticalRole=role(u);u.baseVision=u.vision;u.baseRange=u.range;u.elevation=0;u.roleActions=[];
   if(u.tacticalRole==='sniper'&&high.length){const p=high[i%high.length];order(s,u,'후방 저격 엄호',[p.x,p.y],{entry:p.entry,roof:!!p.roof,height:p.height});radio(s,s.commander,u.name+', '+(p.roof?'건물 관측층':'후방 고지')+' 좌표 '+p.x+'/'+p.y+' 확보. 주축선 진입조를 원거리에서 엄호하라.')}
   else if(u.tacticalRole==='scout'&&scoutHigh){order(s,u,'고지 정찰',[scoutHigh.x,scoutHigh.y],{height:scoutHigh.height});radio(s,s.commander,u.name+', 선행 정찰 후 고지 '+scoutHigh.id+'를 확인하라. 적 위치는 관측 후에만 보고한다.')}
   else if(u.tacticalRole==='medic'){const p=positions.medical||[s.goal[0]-18,s.goal[1]+12];u.medicalStation=p;order(s,u,'후방 의료 대기',p);radio(s,s.commander,u.name+', 엄폐된 후방에서 의료 대기. 부상 보고를 받으면 엄호 확보 후 진입하라.')}
   else if(u.tacticalRole==='support'){const p=positions.flanks?.[i%positions.flanks.length]||[s.goal[0]-12,s.goal[1]+7];order(s,u,'측면 엄호',p);radio(s,s.commander,u.name+', 측면 엄호 지점을 점령하라. 식별된 위협에 제압 사격으로 이동조를 보호한다.')}
   else{order(s,u,u.tacticalRole==='scout'?'선행 수색':u.tacticalRole==='commander'?'지휘·주축선 통제':'주축선 진입',s.goal);radio(s,s.commander,u.name+', '+labels[u.tacticalRole]+'. 확인된 접근로를 따라 이동하라.')}
  }
 }
 function moveRole(s,u,goal,speed){const x=u.x,y=u.y;api.internals.move(s,u,goal,speed/(1+(u.elevation||0)/80));if(Math.hypot(u.x-x,u.y-y)>.001)u.heading=Math.atan2(u.y-y,u.x-x);if(!u.onRoof)u.elevation=api.elevationAt?.(s.terrain||api.MAP,u)||0;}
 function handle(s,u,op){
  initialize(s,op);if(u.sniperRelocation){u.status='descending';if(s.time>=u.sniperRelocation.until){[u.x,u.y]=u.sniperRelocation.entry;u.onRoof=false;u.elevation=0;delete u.sniperRelocation;}return true;}if(u.health?.aid){u.status='treating';return true;}
  const a=u.assignment;if(!a)return false;
  if(s.phase==='복귀'){
   if(u.onRoof){if(!u.descendingUntil){u.descendingUntil=s.time+12;radio(s,u.name,'후방 엄호 종료. 관측층에서 내려와 복귀 경로에 합류한다.')}u.status='descending';if(s.time>=u.descendingUntil){u.x=a.entry[0];u.y=a.entry[1];u.onRoof=false;u.elevation=0;u.path=[];u.destination=''}return true}
   return false;
  }
  if(s.phase==='접근')return false;
  // Confirmed contacts trigger a command report, without disclosing unobserved positions.
  if(s.contact&&!s.contactOrders){s.contactOrders=true;radio(s,s.commander,'접촉 보고 접수. 선두는 엄폐, 저격조는 후방 사격선 유지. 지원조는 측면 엄호, 의무 담당은 후방에서 대기한다.')}
  if(u.tacticalRole==='medic'){
   const casualty=s.units.filter(p=>p.faction==='blackline'&&!p.inside&&!p.evacComplete&&p.id!==u.id&&p.status!=='dead'&&!p.stabilized&&!p.health?.fieldCareCompleted&&!p.health?.aid&&(p.hp<=55||p.woundedAt!=null)).sort((a,b)=>a.hp-b.hp)[0];
   if(casualty&&s.medUsed<s.medicalBudget){
    const unsafe=Object.entries(s.contacts).some(([id,c])=>c.visible&&Math.hypot(c.x-casualty.x,c.y-casualty.y)<8&&s.units.some(p=>p.id===id&&active(p)&&(p.faction==='insurgent'||s.rival.hostile)));
    if(unsafe){if(s.time-(u.lastMedicalRequest||-100)>45){u.lastMedicalRequest=s.time;radio(s,u.name,'부상자 접근로에 관측된 위협이 남아 있다. 엄호 확보를 요청한다.','medical')}u.status='medical-hold';return true}
    if(!u.treatTarget||u.treatTarget!==casualty.id){u.treatTarget=casualty.id;u.treatSince=null;order(s,u,'부상자 접근',[casualty.x,casualty.y],{target:casualty.id});radio(s,s.commander,u.name+', 부상자 '+casualty.name+' 응급처치. 나머지 인원은 접근로를 엄호하라.','medical')}
    if(dist(u,casualty)>2){moveRole(s,u,[casualty.x,casualty.y],.4);u.status='medical-moving';return true}
    u.status='treating';u.treatSince=u.treatSince??s.time;
    if(s.time-u.treatSince>=Math.max(10,25-Math.floor((Number(u.medical)||40)/8))){const critical=casualty.hp<=0;casualty.woundedAt=casualty.woundedAt??s.time;casualty.stabilized=true;casualty.hp=Math.min(70,Math.max(15,casualty.hp+15));if(critical)casualty.status='evacuated';api.triageResult?.(s,casualty,u);s.medUsed++;u.roleActions.push({t:s.time,result:'동료 응급처치',target:casualty.id});u.actions.push({t:s.time,round:0,result:casualty.name+' 응급처치 및 안정화'});radio(s,u.name,casualty.name+' 안정화 완료. '+(critical?'전투 복귀 없이 후송 대기.':'부상 상태로 임무를 축소한다.'),'medical');u.treatTarget=null;u.treatSince=null;order(s,u,'후방 의료 대기',u.medicalStation||a.position)}
    return true;
   }
  }
  if(u.tacticalRole==='scout'&&u.positionReported&&s.time-u.positionedAt>60&&a.kind==='고지 정찰'){order(s,u,'선행 수색',s.goal);radio(s,u.name,'고지·접근로 확인 완료. 수색조의 선행 경로로 다시 합류한다.');return false}
  if(['후방 저격 엄호','고지 정찰','측면 엄호','후방 의료 대기'].includes(a.kind)){
   const point=a.roof&&!u.onRoof?a.entry:a.position;
   if(dist(u,{x:point[0],y:point[1]})>2){moveRole(s,u,point,.38);u.status=u.tacticalRole==='scout'?'scouting':'repositioning';return true}
   if(!u.positionedAt){u.positionedAt=s.time;u.setupUntil=s.time+(a.roof?15:8);u.status='positioning';return true}
   if(s.time<u.setupUntil){u.status='positioning';return true}
   if(!u.positionReported){
    u.positionReported=true;if(a.roof){u.x=a.position[0];u.y=a.position[1];u.onRoof=true;u.elevation=a.height;u.path=[];u.destination=''}else u.elevation=api.elevationAt?.(s.terrain||api.MAP,u)||0;
    u.roleActions.push({t:s.time,result:a.kind+' 지점 확보',position:a.position});u.actions.push({t:s.time,round:0,result:a.kind+' 지점 확보'});radio(s,u.name,a.kind+' 지점 확보. '+(u.tacticalRole==='sniper'?'사격선 확인, 아군 진입을 엄호한다.':u.tacticalRole==='scout'?'관측 범위와 접근로를 확인한다.':'지정 임무를 유지한다.'));
   }
   u.heading=Math.atan2(s.goal[1]-u.y,s.goal[0]-u.x);u.status=u.tacticalRole==='sniper'?'overwatch':u.tacticalRole==='medic'?'medical-hold':u.tacticalRole==='support'?'covering':'high-ground';return true;
  }
  return false;
 }
 api.roles={initialize,handle,labels};
})();
