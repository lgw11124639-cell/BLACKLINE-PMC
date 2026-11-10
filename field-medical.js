/* Saved medical flights: assigned patients wait for a carrier and remain at the landing zone. */
(function(){
 const api=window.fieldSimulation,{active,dist}=api.internals,baseTick=api.sceneTick,pt=p=>({x:p[0],y:p[1]});
 const say=(s,msg)=>api.transmit(s,'의료 후송',msg,'medical',true);
 api.triageResult=function(s,p){if(p.status==='dead')return;const cleared=(p.worstHP??p.hp)>=40&&p.hp>=60;p.fitForDuty=cleared;p.mobility=cleared?'limited':'immobile';p.requiresEvac=!cleared;p.status=cleared?'guarding':'evacuated';say(s,p.name+(cleared?' 처치 후 제한 임무 가능.':' 임무 복귀 불가. 후송한다.'))};
 const location=(p,scene)=>scene==='regional'?p.road:p;
 function wait(s,f,reason){f.waitReason=reason;if(f.lastWaitReason!==reason||s.time-(f.lastWaitReport||0)>=45){f.lastWaitReason=reason;f.lastWaitReport=s.time;say(s,reason)}}
 const fpBudget=op=>Math.max(0,(Number(op.budget)||0)-(op.fieldProgress.reservedSupportCost||0));
 function release(units,f,p){const carrier=units.find(u=>u.id===f.carriers[p.id]);if(carrier){carrier.carryPatient=null;carrier.status='lz-security';f.guardIds=f.guardIds||[];if(!f.guardIds.includes(carrier.id))f.guardIds.push(carrier.id);}delete f.carriers[p.id];p.carriedBy=null;p.isBeingCarried=false;}
 api.medicalLzSafety=function(s,f){const scene=f.scene||'site',contacts=scene==='regional'?s.journey.roadContacts||{}:s.contacts||{},lz=pt(f.lz),units=s.units.filter(u=>u.faction==='blackline'),map=scene==='regional'?s.journey.transport.map:s.terrain,threat=Object.entries(contacts).some(([id,c])=>(c.visible||s.time-c.lastSeen<=30)&&c.identified!==false&&dist(c,lz)<18&&s.units.some(u=>u.id===id&&active(u)&&(u.faction==='insurgent'||u.faction==='pmc'&&s.rival.hostile))),incoming=(api.eventsAround?.(s,s.time,15)||s.events).some(e=>e.kind==='shot'&&(e.scene||'site')===scene&&s.time-e.t<=15&&e.t<=s.time&&units.some(u=>u.id===e.target)&&e.to&&dist(pt(e.to),lz)<18),guards=units.filter(u=>active(u)&&!u.carryPatient&&!['carrying','treating','medical-moving'].includes(u.status)&&!u.inside&&!f.patients.includes(u.id)&&location(u,scene)&&dist(location(u,scene),lz)<14&&api.clearLine({...location(u,scene),elevation:api.elevationAt?.(map,location(u,scene))||0},{...lz,elevation:api.elevationAt?.(map,lz)||0},map));for(const u of guards){u.watchSector='착륙지 사주 경계';u.lookAt=(s.time%20)/20*Math.PI*2;u.lookUntil=s.time+1;}if(!guards.length||threat||incoming){f.securedSince=null;return {safe:false,verified:false,reason:!guards.length?'지상 경계조의 착륙 지점 확보 대기':incoming?'착륙 지점 인근 사격 · 진입 보류':'착륙 지점 주변 위협 · 진입 보류'}}f.securedSince=f.securedSince??s.time;return {safe:true,verified:s.time-f.securedSince>=20,reason:'지상 경계조 사주 확인 중'};};
 api.medicalFlightStatus=function(s){const f=s.journey?.medevac;if(!f)return null;const length=api.journeyTools.measure(f.path),alt=Math.ceil((f.altitude||0)/3);let eta=null,phase=f.waitReason||f.stage,progress=0;if(f.stage==='transit'){eta=Math.ceil((f.strategicLength-f.strategicTravelled)/1.2+length/1.2+alt);progress=Math.round(f.strategicTravelled/Math.max(1,f.strategicLength)*100);phase='광역 항로 이동';}else if(f.stage==='inbound'){eta=Math.ceil(Math.max(0,length-f.distance)/1.2+alt);progress=Math.round(f.distance/Math.max(1,length)*100);phase='현장 접근·착륙';}else if(f.stage==='preparing'){eta=Math.ceil(Math.max(0,f.readyAt-s.time)+(api.journeyTools.measure(s.journey.transport.path)+length)/1.2+alt);phase='지상 안전 확인 · 출동 준비';}else if(f.stage==='landed'){phase='환자 인계·탑승';progress=Math.round((f.boarding||0)/15*100);}else if(f.stage==='returning'){eta=Math.ceil(f.distance/2+(f.distance>0?Math.max(0,35-(f.altitude||0))/3:0)+12);progress=Math.round((1-f.distance/Math.max(1,length))*100);phase='환자 후송·의료 기지 복귀';}else if(f.stage==='complete'){eta=0;phase='의무대 인계 완료';progress=100;}return {phase,eta,progress};};
 api.sceneTick=function(s,op){baseTick?.(s,op);if(!s.journey||s.version<3)return;const units=s.units.filter(u=>u.faction==='blackline'),j=s.journey;
  for(const p of units){if(p.health)continue;if(p.status==='dead'||p.evacComplete||p.fitForDuty)continue;if(p.hp<=55||p.mobility==='immobile'){p.status=p.stabilized?'evacuated':'wounded';p.mobility='immobile';if(p.stabilized||p.road||!units.some(u=>active(u)&&u.tacticalRole==='medic')||s.medUsed>=s.medicalBudget)p.requiresEvac=true}}
  if(s.version<4)return;
  const pending=units.filter(p=>p.requiresEvac&&!p.evacComplete&&!p.boarded&&p.status!=='dead');
  if(['site','entry','interior','outdoor'].includes(j.stage)&&units.filter(active).length<Math.max(3,Math.ceil((op.requiredStaffing?.minimum||6)*.6))&&!s.retreat){s.retreat=true;say(s,'전투 가능 인원 부족. 과업을 중단하고 부상자 우선 회수·철수한다.')}
  let f=j.medevac;if(!pending.length&&(!f||f.stage==='complete'))return;
  if(!f||f.stage==='complete'){
   const patients=pending.slice(0,6),cost=1500000,fp=op.fieldProgress;
   if(j.stage==='outbound'&&patients.some(p=>!p.road)){
    if(j.transport.kind==='helicopter'){s.retreat=true;j.transport.returnFrom=j.transport.progress;j.transport.returnDistance=0;api.journeyTools.stage(s,'homebound','기내 환자 응급 복귀');say(s,'기내 환자 발생. 탑승 중인 헬기로 의료 기지에 우선 복귀한다.');return}
    j.roadStopped=true;for(const [i,u]of units.filter(u=>!u.evacComplete&&u.status!=='dead').entries())if(!u.road){const q=api.projectToGround(j.transport.map,[j.transport.vehicle.x+(i%3-1)*2,j.transport.vehicle.y+Math.floor(i/3)*2]);u.road={x:q[0],y:q[1],heading:j.transport.vehicle.heading};}
    say(s,'차량 내 환자 발생. 현재 수송 위치에서 정차해 의료 헬기에 인계한다.');
   }
   if(state.cash<cost||(Number(fp.reservedSupportCost)||0)+cost>Number(op.budget)){if(!j.medicalBudgetReported){j.medicalBudgetReported=true;say(s,'항공 후송 자원 부족. 지상 수송으로 환자를 우선 복귀시킨다.');s.retreat=true}return}
   if(window.blacklineReserveMedevac&&!window.blacklineReserveMedevac(op,s,cost))return;
   state.cash-=cost;fp.reservedSupportCost=(fp.reservedSupportCost||0)+cost;fp.supportOrders=fp.supportOrders||[];fp.supportOrders.push({name:'의료 헬기 후송',kind:'medevac',cost,effect:0,charged:true,requestedAt:s.time,eta:0,reason:'실제 임무 불가 환자 회수'});
   const first=patients[0],scene=first.road&&j.stage==='outbound'?'regional':'site',map=scene==='regional'?j.transport.map:s.terrain,p=location(first,scene),lz=api.projectToGround(map,[p.x-5,p.y+5]);
   f=j.medevac={id:op.id+'-MED-'+s.time,version:2,requestedAt:s.time,readyAt:s.time+90,securedSince:null,scene,stage:'awaiting-lz',patients:patients.map(p=>p.id),loadedIds:[],lz,path:[map.base.slice(),lz.slice()],distance:0,altitude:35,boarding:0,position:pt(map.base),carriers:{},staged:[],loadProgress:{}};
   say(s,'의료 후송 접수. 승무원 출동 준비 90초. 지상조가 착륙 지점을 안전 확보한 뒤 항로 진입한다. 환자 '+patients.length+'명, 처치와 엄호를 유지하라.');
  }
  if(f.stage==='complete')return;
  if(window.blacklineTransportFlightReady&&!window.blacklineTransportFlightReady(s,op)){wait(s,f,'후송 승무원 전투 불능 · 교대 구조 대기');return;}
  f.carriers=f.carriers||{};f.staged=f.staged||[];f.loadedIds=f.loadedIds||[];f.loadProgress=f.loadProgress||{};
  const scene=f.scene||'site',patients=f.patients.map(id=>units.find(p=>p.id===id)).filter(p=>p&&p.status!=='dead'),length=api.journeyTools.measure(f.path);
  if(['awaiting-lz','preparing','transit','inbound','landed'].includes(f.stage)){f.guardIds=f.guardIds||[];if(!f.guardIds.some(id=>units.some(u=>u.id===id&&active(u)))&&f.staged.length){const guard=units.filter(u=>active(u)&&!u.inside&&!u.onRoof&&!f.patients.includes(u.id)&&location(u,scene)&&dist(location(u,scene),pt(f.lz))<20).sort((a,b)=>dist(location(a,scene),pt(f.lz))-dist(location(b,scene),pt(f.lz)))[0];if(guard)f.guardIds.push(guard.id);}for(const id of f.guardIds){const guard=units.find(u=>u.id===id&&active(u));if(guard&&!guard.carryPatient){guard.medicalOverride=s.time;guard.status='lz-security';}}}
  for(const p of patients){p.evacuationHold=true;p.target=null;p.interiorTarget=null;p.roadTarget=null;p.aimSince=null;if(p.evacComplete){if(!f.loadedIds.includes(p.id))f.loadedIds.push(p.id);continue}p.medicalOverride=s.time;
   if(f.loadedIds.includes(p.id))continue;
   const pos=location(p,scene);if(p.inside||!pos)continue;
   if(f.staged.includes(p.id)&&dist(pos,pt(f.lz))>3)f.staged=f.staged.filter(id=>id!==p.id);
   if(dist(pos,pt(f.lz))<2.2){if(!f.staged.includes(p.id))f.staged.push(p.id);release(units,f,p);p.status='medical-waiting';continue}
   let carrier=units.find(u=>u.id===f.carriers[p.id]&&active(u)&&!u.onRoof&&!u.inside&&!f.patients.includes(u.id));
   if(!carrier){delete f.carriers[p.id];carrier=units.filter(u=>active(u)&&!u.onRoof&&!u.inside&&!f.patients.includes(u.id)&&!Object.values(f.carriers).includes(u.id)).sort((a,b)=>(a.tacticalRole==='medic'?0:1)-(b.tacticalRole==='medic'?0:1)||dist(a,p)-dist(b,p))[0];if(carrier)f.carriers[p.id]=carrier.id}
   if(!carrier)continue;const cp=location(carrier,scene);if(!cp)continue;carrier.medicalOverride=s.time;carrier.status='medical-moving';
   if(!p.isBeingCarried&&dist(cp,pos)>2){api.moveScene(s,carrier,[pos.x,pos.y],.5,scene);continue}
   p.carriedBy=carrier.id;p.isBeingCarried=true;carrier.carryPatient=p.id;carrier.status='carrying';api.moveScene(s,carrier,f.lz,.28,scene);const next=location(carrier,scene);pos.x=next.x;pos.y=next.y;
   if(dist(pos,pt(f.lz))<2.2){if(!f.staged.includes(p.id))f.staged.push(p.id);release(units,f,p);p.status='medical-waiting';say(s,p.name+' 착륙 지점 인계. 환자는 탑승까지 대기한다.')}
  }
  if(!patients.length&&f.stage!=='returning'){f.stage='returning';say(s,'이송 가능한 생존 환자가 없어 의료 기지로 복귀한다.')}
  const unsafe=Object.entries(scene==='regional'?j.roadContacts||{}:s.contacts||{}).some(([id,c])=>c.visible&&c.identified!==false&&dist(c,pt(f.lz))<12&&s.units.some(u=>u.id===id&&active(u)&&(u.faction==='insurgent'||u.faction==='pmc'&&s.rival.hostile)));
  if(f.version>=2&&['awaiting-lz','preparing'].includes(f.stage)&&!units.some(active)&&api.reserveSupport&&!f.rescueOrder){const order=api.reserveSupport(op,{name:'추가 인력 지원',kind:'reinforcement',rescue:true,requestedAt:s.time});if(order&&state.cash>=order.cost&&(fpBudget(op)>=order.cost)){const start=s.terrain.base,path=api.journeyTools.route(s.terrain,start,f.lz);order.delivery={path,distance:0,position:api.journeyTools.along(path,0),arrived:false};order.id=order.id||op.id+'-LZ-RESCUE';order.charged=true;state.cash-=order.cost;op.fieldProgress.reservedSupportCost=(op.fieldProgress.reservedSupportCost||0)+order.cost;(op.fieldProgress.supportOrders=op.fieldProgress.supportOrders||[]).push(order);f.rescueOrder=order.id;say(s,'지상 경계 전력 상실. 회사 가용 구조 인원 '+order.personnelIds.length+'명 출동, 착륙 지점 확보 후 의료 헬기를 유도한다.');}}
  if(f.version>=2&&['awaiting-lz','preparing','transit','inbound'].includes(f.stage)){const safety=api.medicalLzSafety(s,f);if(['awaiting-lz','preparing'].includes(f.stage)){if(!safety.verified){f.stage='awaiting-lz';wait(s,f,safety.reason);return}if(s.time<f.readyAt){f.stage='preparing';f.waitReason='안전 확보 확인 · 헬기 출동 준비 '+Math.ceil(f.readyAt-s.time)+'초';return}f.launchedAt=s.time;f.strategicPath=j.transport.path;f.strategicLength=api.journeyTools.measure(f.strategicPath);f.strategicTravelled=0;f.stage='transit';f.strategicPosition=api.journeyTools.along(f.strategicPath,0);say(s,'착륙 지점 안전 확보·출동 준비 확인. 의료 헬기 이륙, 광역 항로로 이동한다.');}if(f.stage==='transit'){f.strategicTravelled=Math.min(f.strategicLength,f.strategicTravelled+1.2);f.strategicPosition=api.journeyTools.along(f.strategicPath,f.strategicTravelled/Math.max(1,f.strategicLength));f.waitReason='의료 헬기 항로 이동 · 현장까지 약 '+Math.ceil((f.strategicLength-f.strategicTravelled)/1.2+length/1.2)+'초';if(f.strategicTravelled<f.strategicLength)return;f.stage='inbound';}if(f.stage==='inbound'&&!safety.verified){wait(s,f,safety.reason+' · 현장 외곽 대기');return}}
  if(f.stage==='inbound'){
   f.distance=Math.min(length,f.distance+1.2);f.position=api.journeyTools.along(f.path,f.distance/Math.max(1,length));f.waitReason='환자 위치로 비행 중';
   if(f.distance>=length){if(unsafe)wait(s,f,'착륙 지점 위협 관측. 상공 대기 중.');else{f.altitude=Math.max(0,f.altitude-3);f.waitReason='착륙 중';if(!f.altitude){f.stage='landed';say(s,'의료 헬기 착륙. 환자별 탑승 확인을 시작한다.')}}}
  }
  if(f.stage==='landed'){
   for(const p of patients){if(f.loadedIds.includes(p.id))continue;const pos=location(p,scene);if(p.inside||!pos||dist(pos,pt(f.lz))>=3)continue;
    f.loadProgress[p.id]=(f.loadProgress[p.id]??(patients.length===1?f.boarding||0:0))+1;
    if(f.loadProgress[p.id]>=15){f.loadedIds.push(p.id);p.evacComplete=true;p.boarded=true;p.inside=false;p.status='medevac';release(units,f,p);say(s,p.name+' 환자 탑승 확인.')}
   }
   f.boarding=patients.length?patients.reduce((n,p)=>n+(f.loadedIds.includes(p.id)?15:Math.min(15,f.loadProgress[p.id]||0)),0)/patients.length:0;
   if(patients.every(p=>f.loadedIds.includes(p.id))){f.stage='returning';f.distance=length;f.waitReason='이륙 중';say(s,'환자 전원 탑승 확인. 즉시 이륙해 의료 기지로 복귀한다.')}else wait(s,f,patients.some(p=>p.inside)?'건물 내부 환자 회수 대기.':patients.some(p=>!f.staged.includes(p.id))?'환자 접근·운반 대기.':'환자 탑승 중.');
  }
  if(f.stage==='returning'){
   if(f.distance>0&&f.altitude<35){f.altitude=Math.min(35,f.altitude+3);f.waitReason='이륙 중';}
   else if(f.distance>0){const previous=f.position;f.distance=Math.max(0,f.distance-2);f.position=api.journeyTools.along(f.path,f.distance/Math.max(1,length));f.position.heading=Math.atan2(f.position.y-previous.y,f.position.x-previous.x);f.waitReason='의료 기지로 후송 비행 중';}
   else{f.altitude=Math.max(0,f.altitude-3);f.waitReason='의료 기지 착륙 중';if(!f.altitude){f.stage='complete';f.waitReason='의무대 인계 완료';for(const p of patients.filter(p=>f.loadedIds.includes(p.id)))p.status='evac-home';say(s,'의료 기지 도착. 환자와 후송 기록을 의무대에 인계했다.');}}
  }
 };
})();
