/* Rival teams have a contract, bounded observation, formation and protection conflicts. */
(function(){const api=window.fieldSimulation,{active,dist,rand}=api.internals,create=api.create,agent=api.agentAction;
 const frame=api.journeyFrame;api.journeyFrame=function(s){const f=frame(s);if(f&&s.rivalMission?.reported)f.rivalMission={objective:s.rivalMission.objective,stage:s.rivalMission.stage,company:s.rival.name};return f;};
 const point=p=>({x:p[0],y:p[1]}),pmcs=s=>s.units.filter(u=>u.faction==='pmc'&&active(u)),blue=s=>s.units.filter(u=>u.faction==='blackline'&&active(u)&&!u.inside&&!u.roadOnly&&!u.boarded);
 const sees=(s,u,v)=>dist(u,v)<=u.vision&&api.canSeeActor(s,u,v,'site')&&api.clearLine(u,v,s.terrain);
 function initialize(s,m){if(s.rivalMission||!s.journey)return;const protection=['rescue','escort'].includes(s.scenario?.mode),objective=m?.rivalObjective||(protection&&((s.scenario.seed>>>3)%3===0)?'target-elimination':'area-security');s.rivalMission={version:1,objective,area:s.goal.slice(),reported:false,withdraw:false,stage:'approach',knownTarget:null,shots:0};
  s.units.filter(u=>u.faction==='pmc').forEach((u,i)=>{u.contractRole=['leader','flanker','overwatch'][i%3];u.contractSlot=i;});
 }
 api.create=function(...args){const s=create(...args);initialize(s,args[1]);return s};
 function move(s,u,p,speed=.23){api.moveScene(s,u,api.projectToGround(s.terrain,p),speed,'site');}
 function witness(s,u,c){return blue(s).some(b=>sees(s,b,u)&&dist(b,c)<=b.vision&&api.clearLine(b,c,s.terrain));}
 function conflict(s,u,c){const m=s.rivalMission;if(!witness(s,u,c))return;const first=!s.rival.hostile;s.rival.hostile=true;m.reported=true;s.rival.identified=true;if(first){api.transmit(s,'현장지휘관',s.rival.name+'의 구조·보호 대상 조준 확인. 상충 의뢰에 따른 적대행위로 판단. 보호조는 대상을 엄폐시키고 위협 사격을 저지한다.','command',true);s.events.push({t:s.time,kind:'contract-conflict',scene:'site',actor:u.id,target:c.id,x:u.x,y:u.y,visible:true});}
  for(const b of blue(s).filter(b=>sees(s,b,u))){b.knowledge[u.id]={x:u.x,y:u.y,lastSeen:s.time};s.contacts[u.id]={x:u.x,y:u.y,lastSeen:s.time,firstSeen:s.contacts[u.id]?.firstSeen??s.time,visible:true,identified:true,faction:'pmc',source:'visual'};}
 }
 api.agentAction=function(s,u,scene){initialize(s);if(u.faction!=='pmc'||scene!=='site'||!s.rivalMission||!active(u)||u.inside||u.roadOnly)return agent(s,u,scene);
  const m=s.rivalMission,team=pmcs(s),average=team.reduce((n,p)=>n+(p.health?.canFight===false?0:p.hp),0)/Math.max(1,team.length);u.ai=u.ai||{};
  m.originalStrength=m.originalStrength||s.units.filter(p=>p.faction==='pmc').length;if(average<35||team.length<Math.ceil(m.originalStrength*.5)||team.every(p=>p.ammo<5))m.withdraw=true;
  if(m.withdraw){m.stage='withdrawal';u.status='retreating';const exit=api.projectToGround(s.terrain,[s.terrain.width-3,s.terrain.height-3]);move(s,u,exit,.29);if(dist(u,point(exit))<3){u.status='retreated';s.journey.impact.escaped=s.journey.impact.escaped||[];if(!s.journey.impact.escaped.some(p=>p.id===u.id))s.journey.impact.escaped.push({id:u.id,faction:'pmc',scene:'site'});}return true;}
  const threats=s.units.filter(v=>active(v)&&!v.inside&&!v.roadOnly&&v.faction!=='pmc'&&(v.faction==='insurgent'||v.faction==='blackline'&&s.rival.hostile)&&u.knowledge?.[v.id]&&s.time-u.knowledge[v.id].lastSeen<=6&&sees(s,u,v)).sort((a,b)=>dist(u,a)-dist(u,b));
  if(threats.length){const v=threats[0];m.stage='engagement';const cover=(s.terrain.coverObjects||[]).filter(c=>c.integrity>20&&dist(u,c)<9).sort((a,b)=>dist(u,a)-dist(u,b))[0];if(cover&&s.time-(u.contractCoverAt||-30)>18){const d=Math.max(1,dist(cover,v)),goal=api.projectToGround(s.terrain,[cover.x+(cover.x-v.x)/d*1.6,cover.y+(cover.y-v.y)/d*1.6]);if(dist(u,point(goal))>1.5){move(s,u,goal,.3);u.status='taking-cover';return true;}u.contractCoverAt=s.time;}u.heading=Math.atan2(v.y-u.y,v.x-u.x);u.target=v.id;
   if(u.contractRole==='flanker'&&dist(u,v)>6&&s.time%18<6){const a=u.heading+Math.PI/2;move(s,u,[u.x+Math.cos(a)*3,u.y+Math.sin(a)*3],.28);u.status='flanking';}
   else if(dist(u,v)<=u.range){u.status=u.contractRole==='overwatch'?'overwatch':'engaging';api.tacticalFire(s,u,v);}
   else{const k=u.knowledge[v.id];move(s,u,[k.x-4,k.y+3]);u.status='covering';}return true;
  }
  if(m.objective==='target-elimination'){
   const targets=(s.civilians||[]).filter(c=>c.role!=='bystander'&&c.hp>0&&!c.rescued&&sees(s,u,c));if(targets.length){const c=targets[0];m.knownTarget={id:c.id,x:c.x,y:c.y,lastSeen:s.time};}
   const c=(s.civilians||[]).find(c=>c.id===m.knownTarget?.id&&c.hp>0&&!c.rescued);
   if(c&&sees(s,u,c)){u.heading=Math.atan2(c.y-u.y,c.x-u.x);u.status='aiming';if(u.contractAimTarget!==c.id){u.contractAimTarget=c.id;u.contractAimSince=s.time;}conflict(s,u,c);
    if(s.time-u.contractAimSince>=4&&s.time>=(u.contractNextShot||0)&&dist(u,c)<=u.range){const rounds=api.consumeRounds?api.consumeRounds(s,u):Math.min(1,u.ammo);if(rounds){if(!api.consumeRounds)u.ammo-=rounds;const hit=rand(s)<Math.max(.12,Math.min(.7,u.skill/140-dist(u,c)/100));const event={id:'pmc-contract-'+s.time+'-'+s.events.length,t:s.time,scene:'site',kind:'shot',actor:u.id,target:c.id,from:[u.x,u.y],to:[c.x,c.y],rounds,hit,visible:!!s.contacts[u.id]?.visible||witness(s,u,c)};s.events.push(event);api.sceneShot(s,event);m.shots+=rounds;if(hit){c.hp=Math.max(0,c.hp-28);c.status=c.hp<=0?'dead':'wounded';}u.contractNextShot=s.time+5;}}
    return true;
   }
   if(m.knownTarget&&(!c||c.rescued)){m.withdraw=true;return true;}
  }
  m.stage='maneuver';const slot=u.contractSlot||0,angle=slot*2.4,offset=u.contractRole==='overwatch'?12:5;
  const goal=api.projectToGround(s.terrain,[m.area[0]+Math.cos(angle)*offset,m.area[1]+Math.sin(angle)*offset]);
  if(dist(u,point(goal))>2){move(s,u,goal);u.status=u.contractRole==='overwatch'?'positioning':'flanking';}else{u.status=u.contractRole==='overwatch'?'overwatch':'covering';u.heading+=.025;}
  return true;
 };
})();
