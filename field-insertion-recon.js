/* Main force holds outside the objective until an actual distant observation pass. */
(function(){const api=window.fieldSimulation,{active,dist}=api.internals,tick=api.sceneTick,move=api.journeyMove;
 const own=s=>s.units.filter(u=>u.faction==='blackline'&&active(u)&&!u.inside&&!u.boarded&&!u.evacuationHold),point=p=>({x:p[0],y:p[1]});
 function prepare(s){if(s.remoteRecon||s.journey?.stage!=='site'||s.journey.siteSearch.discovered||s.journey.insertionRecon)return;
  const target=s.goal.slice(),base=s.terrain.base,dx=base[0]-target[0],dy=base[1]-target[1],d=Math.max(1,Math.hypot(dx,dy)),rally=api.projectToGround(s.terrain,[target[0]+dx/d*28,target[1]+dy/d*28]);
  const marksmen=own(s).filter(u=>u.tacticalRole==='sniper'&&api.isPrecisionWeapon?.(u)),observers=marksmen.length?marksmen:own(s).filter(u=>u.tacticalRole==='scout');s.journey.insertionRecon={version:1,target,rally,observerIds:observers.map(u=>u.id),sectors:[[target[0]-5,target[1]],[target[0],target[1]+5],[target[0]+5,target[1]]].map(p=>({position:p,worked:0,checked:false,visible:false})),index:0,complete:observers.length===0,waitingForFire:false};
  if(observers.length)api.transmit(s,s.commander,'주 투입조는 작전구역 밖 집결 지점에서 대기. 관측조가 원거리 사격선·외부 위협을 먼저 확인한 뒤 접근한다.','command',true);
 }
 function observePoint(s,u,g){const p=point(g);return dist(u,p)<=u.vision&&api.canSeeActor(s,u,p,'site')&&api.clearLine(u,p,s.terrain)}
 api.sceneTick=function(s,op){tick?.(s,op);prepare(s);const j=s.journey,r=j?.insertionRecon;if(!r||r.complete||j.stage!=='site'||s.retreat)return;s.phase='원거리 사전 관측';
  const observers=own(s).filter(u=>r.observerIds.includes(u.id)&&((u.tacticalRole==='sniper'&&u.positionReported)||u.tacticalRole==='scout'&&dist(u,point(r.rally))<4));
  if(!observers.length){if(!own(s).some(u=>r.observerIds.includes(u.id))){r.complete=true;s.phase='접근';for(const u of own(s))u.routeIndex=2;api.transmit(s,s.commander,'관측 담당 전투 지속 불가. 확인된 정보만으로 접근 경로를 재검토한다.','command',true);}return;}
  const sector=r.sectors[r.index];if(sector){sector.visible=observers.some(u=>observePoint(s,u,sector.position));sector.worked+=sector.visible?1.5:.75;if(sector.worked>=14){sector.checked=true;r.index++;}}
  const pending=(op.fieldProgress?.supportOrders||[]).filter(o=>['artillery','airstrike'].includes(o.kind)&&!s.supportArrived.includes(o.id)&&s.contacts[o.targetId]?.visible&&s.time-s.contacts[o.targetId].lastSeen<=5);
  const incoming=s.events.some(e=>['artillery','airstrike'].includes(e.kind)&&!e.applied&&e.cancelledAt==null);r.waitingForFire=r.index>=r.sectors.length&&(pending.length>0||incoming);
  if(r.index>=r.sectors.length&&!r.waitingForFire){r.complete=true;s.phase='접근';for(const u of own(s))u.routeIndex=2;const count=Object.values(s.contacts).filter(c=>c.identified!==false&&s.time-c.lastSeen<20).length;api.transmit(s,s.commander,'원거리 관측 완료. 식별 접촉 '+count+'건, 차폐된 내부는 미확인. 확인된 접근로로 주 투입조 전개.','command',true);}
 };
 api.journeyMove=function(s,u,...args){const r=s.journey?.insertionRecon;if(!r||r.complete||s.journey.stage!=='site'||s.retreat||u.inside)return move(s,u,...args);if(u.tacticalRole==='sniper')return move(s,u,...args);
  const i=s.units.filter(v=>v.faction==='blackline').findIndex(v=>v.id===u.id),goal=api.projectToGround(s.terrain,[r.rally[0]+Math.cos(i*2.4)*2.2,r.rally[1]+Math.sin(i*2.4)*2.2]);api.journeyTools.moveTo(s,u,goal,.4);u.heading=Math.atan2(r.target[1]-u.y,r.target[0]-u.x);u.status=dist(u,point(goal))<3?'insertion-hold':'standoff-rally';return true;
 };
 const frame=api.journeyFrame;api.journeyFrame=function(s){const f=frame(s),r=s.journey?.insertionRecon;if(f&&r&&!r.complete)f.insertionRecon={rally:r.rally,target:r.target,index:r.index,progress:Math.min(100,Math.round((r.index+Math.min(1,(r.sectors[r.index]?.worked||0)/14))/r.sectors.length*100)),waitingForFire:r.waitingForFire};return f;};
})();
