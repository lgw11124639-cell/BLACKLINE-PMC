/* Bounded terrain analysis for autonomous marksmen. Contacts are last observed positions only. */
(function(){const api=window.fieldSimulation,{active,dist}=api.internals,tick=api.sceneTick,handle=api.roles.handle;
 const point=p=>({x:p[0],y:p[1]}),same=(a,b)=>a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<.5&&!!a.roof===!!b.roof;
 const body=u=>/저격|정밀사수|지정사수/.test(u.role||'')||u.tacticalRole==='sniper';
 api.isPrecisionWeapon=function(u){const name=(api.activeWeaponState?.(u)||u.weaponState)?.weapon||u.loadout?.primary;return name?/AXMC|MRAD|TRG|정밀소총/.test(name):body(u)};
 api.effectiveRange=function(s,u){const name=u.weaponState?.weapon||u.loadout?.primary||'',high=u.onRoof||u.elevation>=4;if(api.isPrecisionWeapon(u)){const base=/MRAD/.test(name)?62:/TRG/.test(name)?56:58;return Math.min(82,base+(high?14:0));}return (u.baseRange??u.range??10)+(u.elevation||0)*.2+(body(u)?12:0);};
 const observation=api.observationRange;api.observationRange=function(s,u){const current=observation?observation(s,u):(u.baseVision||u.vision||10)+(u.elevation||0)*.35;if(!api.isPrecisionWeapon(u))return current;return Math.max(current,u.onRoof||u.elevation>=4?Math.min(95,76+(u.elevation||0)*.3):58);};
 api.chooseSniperTarget=function(s,u,candidates){if(!body(u))return candidates[0]||null;
  const available=candidates.filter(v=>active(v)&&v.faction!==u.faction&&(v.faction==='insurgent'||u.faction==='insurgent'||s.rival.hostile)&&!v.inside&&!v.roadOnly&&u.knowledge?.[v.id]&&s.time-u.knowledge[v.id].lastSeen<=4&&dist(u,v)<=u.vision&&api.canSeeActor?.(s,u,v,'site')!==false&&api.clearLine(u,v,s.terrain)&&(!s.contacts[v.id]||s.contacts[v.id].identified!==false));
  const inRange=available.filter(v=>dist(u,v)<=u.range),pool=inRange.length?inRange:available;
  const score=v=>{const close=dist(u,v)<6?220:0,counter=body(v)&&api.isPrecisionWeapon(v)?100:0,firing=(api.eventsAround?.(s,s.time,12)||s.events).some(e=>e.kind==='shot'&&e.actor===v.id&&e.visible!==false&&s.time-e.t<=12&&s.units.some(b=>b.id===e.target&&b.faction===u.faction))?45:0;return close+counter+firing-dist(u,v)*.35;};
  pool.sort((a,b)=>score(b)-score(a)||dist(u,a)-dist(u,b));const best=pool[0],current=pool.find(v=>v.id===u.target),target=current&&best&&score(best)-score(current)<15?current:best;
  if(target&&target.id!==u.counterSniperTarget&&body(target)&&dist(u,target)<=u.range){u.counterSniperTarget=target.id;u.roleActions=u.roleActions||[];u.roleActions.push({t:s.time,result:'식별된 적 저격수 대응',target:target.id});if(u.faction==='blackline')api.transmit?.(s,u.name,'식별된 적 저격수 사격선 확인. 대응 저격, 아군 이동을 엄호한다.','combat');}
  return target||null;
 };
 const create=api.create;api.create=function(...args){const s=create(...args),m=args[1]||{};if(Number(m.risk)>=2&&(s.scenario?.seed??s.rng)%3===0){const enemy=s.units.find(u=>u.faction==='insurgent'&&!u.inside&&!u.roadOnly);if(enemy){enemy.role='적 저격수';enemy.tacticalRole='sniper';enemy.loadout={primary:'Sako TRG 42'};api.initializeWeapon?.(enemy,enemy);}}
  for(const u of s.units.filter(u=>u.faction==='pmc'&&u.contractRole==='overwatch'&&(s.scenario?.seed??s.rng)%2===0)){u.role='PMC 저격수';u.tacticalRole='sniper';u.loadout={primary:'Barrett MRAD'};api.initializeWeapon?.(u,u);}return s;};

 function building(map,p){return (map.buildings||[]).findIndex(b=>p.x>b[0]&&p.x<b[2]&&p.y>b[1]&&p.y<b[3])}
 function occupied(map,p,reserved){return reserved.some(q=>dist(p,q)<4||p.roof&&q.roof&&building(map,p)>=0&&building(map,p)===building(map,q))}
 function known(s){return Object.entries(s.contacts||{}).filter(([,c])=>c.identified!==false&&s.time-c.lastSeen<=20&&(c.faction==='insurgent'||c.faction==='pmc'&&s.rival.hostile)).map(([id,c])=>({id,x:c.x,y:c.y,elevation:0,weight:3,observed:true})).slice(0,4)}
 function objectives(s,contacts){const goal=s.journey?.siteSearch.discovered?s.journey.building.entrance:s.goal,probes=[[0,0],[-5,0],[5,0],[0,5]];return [...(s.sniperCoverageTarget?[{...point(s.sniperCoverageTarget),elevation:0,weight:4,observed:false}]:[]),...contacts.slice(0,2),...probes.map(d=>{const p=api.projectToGround(s.terrain,[goal[0]+d[0],goal[1]+d[1]]);return {...point(p),elevation:0,weight:1,observed:false}})];}
 function forbidden(s,p){const b=s.journey?.siteSearch.discovered&&s.journey.building.bounds;return !!(p.roof&&b&&p.x>b[0]&&p.x<b[2]&&p.y>b[1]&&p.y<b[3]);}
 function candidates(s){const map=s.terrain,goal=point(s.goal),all=[];
  const add=p=>{if(forbidden(s,p)||p.x<1||p.y<1||p.x>map.width-1||p.y>map.height-1||all.some(q=>dist(p,q)<.8&&!!p.roof===!!q.roof))return;all.push(p)};
  for(const p of [...(map.positions?.sniper||[]),...(map.positions?.highGrounds||[])])add({...p,height:p.height||api.elevationAt(map,p)||0,entry:p.entry?.slice(),type:p.roof?'관측층':'고지'});
  const buildings=(map.buildings||[]).map((b,id)=>({b,id,d:dist({x:(b[0]+b[2])/2,y:(b[1]+b[3])/2},goal)})).filter(({b,d})=>b[4]>=5&&b[4]<=26&&b[2]-b[0]>=4&&b[3]-b[1]>=4&&d>=8&&d<=75).sort((a,b)=>a.d-b.d).slice(0,10);
  for(const {b,id}of buildings){
   if(s.journey?.siteSearch.discovered&&s.journey.building.bounds&&b.every((n,i)=>n===s.journey.building.bounds[i]))continue;
   const entries=[[(b[0]+b[2])/2,b[3]+2],[(b[0]+b[2])/2,b[1]-2],[b[0]-2,(b[1]+b[3])/2],[b[2]+2,(b[1]+b[3])/2]].map(p=>api.projectToGround(map,p)).filter(p=>p[0]>=b[0]-3&&p[0]<=b[2]+3&&p[1]>=b[1]-3&&p[1]<=b[3]+3);
   for(const [x,y]of [[b[0]+1.2,b[1]+1.2],[b[2]-1.2,b[1]+1.2],[b[0]+1.2,b[3]-1.2],[b[2]-1.2,b[3]-1.2]])add({x,y,height:b[4],roof:true,entries,buildingId:id,type:'건물 가장자리 관측층'});
  }
  for(let i=0;i<12;i++){const a=i*Math.PI/6,r=18+(i%3)*7,p=api.projectToGround(map,[goal.x+Math.cos(a)*r,goal.y+Math.sin(a)*r]);add({...point(p),height:api.elevationAt(map,point(p)),roof:false,type:'외곽 엄폐 지점'});}
  return all.slice(0,64);
 }
 function fromAssignment(u){const a=u.assignment;return a&&{x:a.position[0],y:a.position[1],height:a.height||0,roof:!!a.roof,entry:a.entry?.slice(),type:a.tactical?.type||'기존 엄호 지점'}}
 function evaluate(s,u,p,targets,contacts){const map=s.terrain,eye={x:p.x,y:p.y,elevation:p.height||0},vision=api.observationRange?api.observationRange(s,{...u,elevation:p.height||0,onRoof:!!p.roof}):(u.baseVision||13)+12+(p.height||0)*.35;
  const lines=targets.map(t=>({t,clear:dist(eye,t)<=vision&&api.clearLine(eye,t,map)})),weight=targets.reduce((n,t)=>n+t.weight,0),visible=lines.filter(l=>l.clear).reduce((n,l)=>n+l.t.weight,0),coverage=visible/Math.max(1,weight),goalDistance=dist(p,point(s.goal)),range=api.effectiveRange(s,{...u,elevation:p.height||0,onRoof:!!p.roof});
  const cover=(map.coverObjects||[]).some(c=>c.integrity>0&&dist(p,c)<4),threat=contacts.reduce((n,c)=>Math.max(n,Math.max(0,12-dist(p,c))/12),0),rear=point(map.base),axis={x:rear.x-s.goal[0],y:rear.y-s.goal[1]},behind=((p.x-s.goal[0])*axis.x+(p.y-s.goal[1])*axis.y)/Math.max(1,Math.hypot(axis.x,axis.y));
  const distancePenalty=Math.abs(goalDistance-Math.min(34,range*.8))*.4,score=coverage*72+Math.min(20,p.height||0)*.65+(p.roof?4:cover?9:0)+Math.max(-8,Math.min(8,behind*.2))-distancePenalty-threat*70-(goalDistance<9?30:0);
  return {...p,score,coverage,visible:lines.filter(l=>l.clear).length,total:targets.length,threat,cover,watch:(lines.find(l=>l.clear&&l.t.observed)||lines.find(l=>l.clear)||lines[0])?.t};
 }
 function reachable(s,u,p,contacts,cache){const map=s.terrain,start=u.onRoof&&u.assignment?.entry?point(u.assignment.entry):u,entries=p.roof?p.entries||[p.entry].filter(Boolean):[[p.x,p.y]];let best=null;
  for(const entry of entries){const key=entry.map(n=>n.toFixed(1)).join(','),cached=cache.get(key);let result=cached;
   if(result===undefined){const path=api.pathTo(start,entry,map),end=path.at(-1),valid=dist(start,point(entry))<2.1||end&&Math.hypot(end[0]-entry[0],end[1]-entry[1])<Math.max(3,(map.grid||2)*1.5);
    if(!valid)result=null;else{const full=[[start.x,start.y],...path,entry];let length=0,risk=0;for(let i=1;i<full.length;i++){length+=Math.hypot(full[i][0]-full[i-1][0],full[i][1]-full[i-1][1]);if(i%4===0)for(const c of contacts)if(dist(point(full[i]),c)<15&&api.clearLine(point(full[i]),c,map))risk+=1;}result={entry:entry.slice(),length,risk};}cache.set(key,result);
   }
   if(result&&(!best||result.length+result.risk*5<best.length+best.risk*5))best=result;
  }
  return best?{...p,entry:p.roof?best.entry:undefined,routeLength:best.length,approachRisk:best.risk,score:p.score-best.length*.12-best.risk*3}:null;
 }
 function reason(p){return p.type+' · 사격선 '+p.visible+'/'+p.total+' · 높이 '+Math.round(p.height||0)+'m · '+(p.cover||p.roof?'엄폐 활용':'거리 유지')+' · 접근로 '+Math.round(p.routeLength||0)+'m'}
 api.evaluateSniperPosition=function(s,u,p){const contacts=known(s);return evaluate(s,u,p,objectives(s,contacts),contacts)};
 api.planSniperPositions=function(s,force=false){if(!s.terrain||s.remoteRecon||s.done||s.retreat||s.phase==='복귀'||s.journey&&!['site','entry','interior','outdoor'].includes(s.journey.stage))return;
  const snipers=s.units.filter(u=>u.faction==='blackline'&&body(u)&&active(u)&&!u.inside&&!u.evacuationHold&&!u.boarded),planner=s.sniperTactics=s.sniperTactics||{version:1,nextReview:0};
  if(!force&&s.time<planner.nextReview)return;planner.nextReview=s.time+30;
  const contacts=known(s),targets=objectives(s,contacts),pool=candidates(s),reserved=snipers.map(u=>{const p=fromAssignment(u);return p?{...p,owner:u.id}:null}).filter(Boolean);
  for(const u of snipers){if(u.health?.aid||u.sniperRelocation)continue;const previous=fromAssignment(u),reservedOthers=reserved.filter(p=>p.owner!==u.id);
   const old=previous&&evaluate(s,u,previous,targets,contacts),plan=u.sniperPlan;
   if(plan&&Math.hypot(u.x-plan.lastPosition[0],u.y-plan.lastPosition[1])>1){plan.lastPosition=[u.x,u.y];plan.lastProgressAt=s.time;}
   const firingContact=u.target&&s.contacts?.[u.target];
   if(plan&&old&&u.positionReported&&!forbidden(s,old)&&old.threat<.5&&firingContact?.identified!==false&&firingContact&&s.time-firingContact.lastSeen<=5&&api.clearLine({x:u.x,y:u.y,elevation:u.elevation||0},{x:firingContact.x,y:firingContact.y,elevation:0},s.terrain)){plan.watch=[firingContact.x,firingContact.y];continue;}
   if(plan&&old&&!forbidden(s,old)&&u.positionReported&&!force&&s.time-plan.orderedAt<75&&old.coverage>0&&old.threat<.3){plan.watch=old.watch?[old.watch.x,old.watch.y]:s.goal.slice();continue;}
   if(plan&&old&&!forbidden(s,old)&&!u.positionReported&&!force&&s.time-plan.lastProgressAt<90&&old?.threat<.3)continue;
   const cache=new Map(),ranked=pool.filter(p=>!occupied(s.terrain,p,reservedOthers)).map(p=>evaluate(s,u,p,targets,contacts)).sort((a,b)=>b.score-a.score).slice(0,12).map(p=>reachable(s,u,p,contacts,cache)).filter(Boolean).sort((a,b)=>b.score-a.score||a.x-b.x||a.y-b.y);
   let best=ranked[0];if(!best)continue;const current=old&&!forbidden(s,old)&&!occupied(s.terrain,old,reservedOthers)?reachable(s,u,old,contacts,cache):null;
   if(plan&&current&&best.score<current.score+12&&current.threat<.3){best=current;}
   const changed=!previous||!same(best,previous),duplicate=previous&&occupied(s.terrain,previous,reservedOthers);
   if(changed||duplicate||!plan){if((changed||duplicate)&&u.onRoof&&u.assignment?.entry)u.sniperRelocation={entry:u.assignment.entry.slice(),until:s.time+12};
    const tactical={version:1,type:best.type,visible:best.visible,total:best.total,coverage:best.coverage,routeLength:best.routeLength,approachRisk:best.approachRisk,reason:reason(best)};
    const assignment={kind:'후방 저격 엄호',position:[best.x,best.y],roof:!!best.roof,height:best.height||0,entry:best.entry,tactical};u.assignment=assignment;
    s.orders=s.orders||[];s.orders.push({t:s.time,actor:u.id,...assignment});u.roleActions=u.roleActions||[];u.roleActions.push({t:s.time,result:'지형·사격선 평가 후 저격 위치 선정',position:assignment.position,reason:tactical.reason});
    if(changed||duplicate){u.positionedAt=null;u.positionReported=false;u.setupUntil=null;u.path=[];u.destination='';}
    api.transmit?.(s,s.commander||'현장지휘관',u.name+', '+(best.roof?'건물 관측층':'외곽 고지·엄폐')+'으로 전개. '+best.visible+'/'+best.total+'개 관측 방향 사격선 확인. '+(u.sniperRelocation?'기존 관측층에서 내려온 뒤 이동하라.':'접근로를 확인하고 주축선을 엄호하라.'),'command',true);
   }
   if(changed||!plan)u.sniperPlan={version:1,orderedAt:s.time,lastProgressAt:s.time,lastPosition:[u.x,u.y],watch:best.watch?[best.watch.x,best.watch.y]:s.goal.slice(),reason:reason(best)};
   else{plan.watch=best.watch?[best.watch.x,best.watch.y]:s.goal.slice();plan.reason=reason(best);}
   const prior=reserved.findIndex(p=>p.owner===u.id);if(prior>=0)reserved.splice(prior,1);reserved.push({...best,owner:u.id});
  }
 };
 api.sceneTick=function(s,op){tick?.(s,op);api.planSniperPositions(s)};
 api.roles.handle=function(s,u,...args){const result=handle(s,u,...args);if(result&&body(u)&&u.positionReported&&!s.retreat&&s.phase!=='복귀'&&u.sniperPlan?.watch){const [x,y]=u.sniperPlan.watch;u.heading=Math.atan2(y-u.y,x-u.x);u.watchSector='확인 사격선·진입조 엄호';}return result};
})();
