/* Standoff reconnaissance: a ridge outside the objective area, never a clearance team. */
(function(){const api=window.fieldSimulation,{active,dist}=api.internals,create=api.create,step=api.step,move=api.journeyMove,ready=api.journeySearchReady,roles=api.roles.handle;
 api.observationRange=function(s,u){const base=u.baseVision??u.vision??10,high=u.onRoof||u.elevation>=4;return high&&u.tacticalRole==='sniper'?Math.min(95,base+45+u.elevation*1.2):s.remoteRecon&&u.faction==='blackline'&&u.elevation>=4?Math.min(80,base+32+u.elevation*.9):base+u.elevation*.35+(u.tacticalRole==='sniper'?12:0)};
 const own=s=>s.units.filter(u=>u.faction==='blackline'),say=(s,msg)=>api.transmit(s,'현장지휘관',msg,'command',true);
 function prepare(s){if(s.scenario?.mode!=='recon'||!s.journey||s.remoteRecon)return;
  const center=s.goal.slice(),map=s.terrain,base=map.base,candidates=(map.positions?.highGrounds||[]).filter(p=>!p.roof&&Math.hypot(p.x-center[0],p.y-center[1])>=30).sort((a,b)=>b.height-a.height||dist(a,{x:base[0],y:base[1]})-dist(b,{x:base[0],y:base[1]}));
  let hill=candidates.find(p=>s.reconPlan?.observationRidge&&p.x===s.reconPlan.observationRidge.x&&p.y===s.reconPlan.observationRidge.y)||candidates[0];if(!hill){const dx=base[0]-center[0],dy=base[1]-center[1],d=Math.max(1,Math.hypot(dx,dy)),p=api.projectToGround(map,[Math.max(2,Math.min(map.width-2,center[0]+dx/d*42)),Math.max(2,Math.min(map.height-2,center[1]+dy/d*42))]);hill={x:p[0],y:p[1],height:api.elevationAt?.(map,{x:p[0],y:p[1]})||0}}
  const slots=own(s).map((u,i)=>{const p=api.projectToGround(map,[hill.x+Math.cos(i*2.4)*Math.sqrt(i)*1.8,hill.y+Math.sin(i*2.4)*Math.sqrt(i)*1.8]);return {id:u.id,position:p}});
  s.remoteRecon={version:1,center,exclusionRadius:24,hill:{x:hill.x,y:hill.y,height:hill.height},slots,sectors:[[center[0]-4,center[1]],[center[0]+3,center[1]-4],[center[0]+2,center[1]+4]].map(p=>({position:p,worked:0,checked:false,visible:false})),index:0,completed:false};
  s.journey.mode='recon';s.journey.team=own(s).map(u=>u.id);s.journey.siteSearch.discovered=false;s.journey.building.name='외곽 능선 관측';s.journey.exfil=api.projectToGround(map,[hill.x-7,hill.y+7]);
  if(s.journey.stage==='outbound'&&map.id==='regional'){const t=s.journey.transport;t.path=api.journeyTools.route(t.map,t.map.base,s.journey.exfil);t.distance=0;t.progress=0;}
  say(s,'작전구역 진입 금지. 외곽 능선에서 접근로·외부 움직임만 관측하고 복귀한다. 건물 내부와 가림 구역은 미확인으로 남긴다.');
 }
 api.create=function(...args){const s=create(...args);if(args[1]?.reconPlan)s.reconPlan=JSON.parse(JSON.stringify(args[1].reconPlan));prepare(s);return s};
 api.journeySearchReady=s=>s.remoteRecon?false:ready(s);
 api.journeyMove=function(s,u,...args){const r=s.remoteRecon;if(!r||s.journey.stage!=='site'||s.retreat||u.inside)return move(s,u,...args);const slot=r.slots.find(p=>p.id===u.id);if(!slot||!active(u)||u.evacuationHold)return false;
  const safety={...s.terrain,obstacles:[...(s.terrain.obstacles||[]),[r.center[0]-24,r.center[1]-24,r.center[0]+24,r.center[1]+24]]};
  api.journeyTools.moveTo(s,u,slot.position,.43,safety);u.status=dist(u,{x:slot.position[0],y:slot.position[1]})<2?'ridge-observing':'ridge-approach';const sector=r.sectors[Math.min(r.index,2)];u.heading=Math.atan2(sector.position[1]-u.y,sector.position[0]-u.x);u.lookAt=u.heading;u.lookUntil=s.time+2;return true;
 };
 api.roles.handle=function(s,u,...args){if(s.remoteRecon&&s.journey.stage==='site'&&!s.retreat&&!u.health?.aid)return false;return roles(s,u,...args)};
 const tick=api.sceneTick;api.sceneTick=function(s,op){prepare(s);tick?.(s,op);const r=s.remoteRecon;if(!r||s.done)return;
  if(own(s).some(u=>u.inside)){if(!r.legacyWithdrawal){r.legacyWithdrawal=true;s.retreat=true;api.journeyTools.stage(s,'exit','실내 철수');say(s,'구형 정찰의 내부 진입을 중단한다. 진입 인원은 출입구로 철수하고 복귀한다.')}return;}
  if(s.journey.stage!=='site'||s.retreat)return;s.phase='능선 관측';s.journey.siteSearch.discovered=false;
  const sector=r.sectors[r.index];if(!sector)return;const observers=own(s).filter(u=>active(u)&&!u.inside&&!u.evacuationHold&&r.slots.some(p=>p.id===u.id&&Math.hypot(u.x-p.position[0],u.y-p.position[1])<2));
  if(!observers.length)return;const target={x:sector.position[0],y:sector.position[1],elevation:0};sector.visible=observers.some(u=>dist(u,target)<=u.vision&&api.canSeeActor(s,u,target,'site')&&api.clearLine(u,target,s.terrain));sector.worked+=observers.length>1?1.3:1;
  if(sector.worked>=35){sector.checked=true;r.index++;say(s,'능선 관측 구역 '+r.index+' 확인. '+(sector.visible?'외부 관측 결과 전송.':'시야 차폐로 세부 사항 미확인. 진입하지 않는다.'));}
  s.objective=Math.min(100,Math.floor((r.index+Math.min(1,(r.sectors[r.index]?.worked||0)/35))/r.sectors.length*100));
  if(r.index>=r.sectors.length){r.completed=true;s.objective=100;say(s,'외곽 관측 종료. 내부 미확인, 관측한 정보만 본부에 전송하고 복귀한다.');api.journeyTools.beginExtraction(s);}
 };
 const frame=api.journeyFrame;api.journeyFrame=function(s){const f=frame(s);if(f&&s.remoteRecon){const r=s.remoteRecon;f.recon={hill:{...r.hill},center:r.center.slice(),index:r.index,completed:r.completed,progress:s.objective,sectors:r.sectors.map(p=>({...p,position:p.position.slice()}))};}return f;};
 api.step=function(s,op){prepare(s);return step(s,op)};
})();
