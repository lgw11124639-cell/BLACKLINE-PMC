/* Coordinate-based field simulation. Decisions, ammunition, radio and replay share this state. */
(function(){
 const MAP={width:100,height:66.667,image:'images/maps/sera-district.webp',base:[26,61],
  buildings:[[7,41,22,49],[23,51,30,59],[41,42,56,54],[9,19,20,28],[23,8,39,16],[23,18,39,27],[43,8,60,16],[43,18,60,27],[73,5,84,23],[84,5,94,15]],
  goals:{'시설 보안':[88,27],'호송':[94,34],'구조':[58,29],'정밀 지원':[62,29],'무장세력 대응':[86,28]}};
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const active=u=>u.hp>0&&!['captured','evacuated','retreated'].includes(u.status);
 const blocked=(x,y,map=MAP)=>x<1||x>map.width-1||y<1||y>map.height-1||[...(map.buildings||[]),...(map.obstacles||[])].some(b=>x>b[0]-.7&&x<b[2]+.7&&y>b[1]-.7&&y<b[3]+.7);
 function clearLine(a,b,map=MAP){const count=Math.max(20,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)));for(let i=1;i<count;i++){const t=i/count,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,eye=(a.elevation||0)+1.7+((b.elevation||0)-(a.elevation||0))*t;
  if((map.buildings||[]).some(r=>x>r[0]&&x<r[2]&&y>r[1]&&y<r[3]&&eye<(r[4]??99)))return false;
  if(window.fieldSimulation?.elevationAt&&window.fieldSimulation.elevationAt(map,{x,y})>eye+1)return false;
 }return true}
 function pathTo(a,end,map=MAP){
  const grid=map.grid||2,cols=Math.floor(map.width/grid)+1,rows=Math.floor(map.height/grid)+1,start=clamp(Math.round(a.y/grid),0,rows-1)*cols+clamp(Math.round(a.x/grid),0,cols-1),goal=clamp(Math.round(end[1]/grid),0,rows-1)*cols+clamp(Math.round(end[0]/grid),0,cols-1);
  const visited=new Int16Array(cols*rows).fill(-1),queue=[start];visited[start]=start;let head=0,found=false;
  while(head<queue.length){const at=queue[head++];if(at===goal){found=true;break}const x=at%cols,y=Math.floor(at/cols);
   for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const nx=x+dx,ny=y+dy,id=ny*cols+nx;if(nx<0||nx>=cols||ny<0||ny>=rows||visited[id]!==-1||blocked(nx*grid,ny*grid,map))continue;
    if(dx&&dy&&(blocked(nx*grid,y*grid,map)||blocked(x*grid,ny*grid,map)))continue;
    visited[id]=at;queue.push(id);
   }
  }
  if(!found)return [];
  const path=[];let at=goal;while(at!==start){path.push([at%cols*grid,Math.floor(at/cols)*grid]);at=visited[at]}return path.reverse();
 }
 function rand(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296}
 function log(s,who,msg,kind='radio'){if(s.mutedLog)return;s.radio.push({t:s.time,who,msg,kind})}
 function event(s,e){s.events.push({t:s.time,...e})}
 function factions(){
  if(!Array.isArray(state.rivalPMCs))state.rivalPMCs=[
   {id:'aster',name:'ASTER SECURITY',relation:65,doctrine:'공동 경계',encounters:0},
   {id:'kestrel',name:'KESTREL GROUP',relation:32,doctrine:'독점 경비',encounters:0},
   {id:'meridian',name:'MERIDIAN RISK',relation:50,doctrine:'무장 호송',encounters:0}
  ];return state.rivalPMCs;
 }
 function create(op,m,members,ammoBudget,options={}){
  const seed=(Number(op.fieldProgress?.seed)||177)+Number(m.id||1)*31;
  const roster=options.factions||factions(),rival=roster[Math.abs(seed)%roster.length];
  const hostility=rival.relation<40&&m.risk>=2;
  const s={version:1,map:'sera',time:0,duration:390,rng:seed>>>0,units:[],frames:[],events:[],radio:[],objective:0,retreat:false,done:false,ammoBudget,ammoUsed:0,supportArrived:[],rival:{...rival,hostile:hostility,identified:false},missionType:m.type||'시설 보안',goal:MAP.goals[m.type]||MAP.goals['시설 보안'],contact:false,reserves:members.slice(12).map(p=>p.name)};
  const deployed=members.slice(0,12),allocation=Math.floor(ammoBudget/Math.max(1,deployed.length));
  deployed.forEach((p,i)=>{const ev=typeof personnelEvaluation==='function'?personnelEvaluation(p):{};s.units.push({id:'bl-'+p.id,personId:p.id,name:p.name,role:p.role||'대원',faction:'blackline',x:26+(i%4)*1.1,y:61+Math.floor(i/4),hp:100,ammo:allocation+(i===0?ammoBudget-allocation*deployed.length:0),skill:ev.marksmanship||p.skill||65,medical:ev.medical||40,vision:/정찰|저격/.test(p.role)?30:24,range:/저격|정밀/.test(p.role)?35:23,status:'moving',kills:0,detained:0,actions:[],path:[],destination:''})});
  const contact=options.forceContact??(m.risk>=2&&seed%100<35+m.risk*13);
  const positions=[[57,31],[61,35],[80,29],[89,29],[70,39],[92,33]];
  if(contact)for(let i=0;i<Math.min(6,2+Number(m.risk));i++){const pos=positions[i];s.units.push({id:'red-'+i,name:'무장세력 '+(i+1),faction:'insurgent',role:'무장 인원',x:pos[0],y:pos[1],hp:100,ammo:36,skill:42+m.risk*3,vision:25,range:22,status:'guarding',path:[],destination:''})}
  // A separate PMC is present independently of local armed groups. Neutral firms are not enemy targets.
  for(let i=0;i<3;i++)s.units.push({id:'pmc-'+i,name:rival.name+' '+(i+1),faction:'pmc',role:rival.doctrine,x:90+i*1.6,y:36+i*1.2,hp:100,ammo:45,skill:62,vision:28,range:26,status:'patrol',path:[],destination:''});
  log(s,op.leaderName||'팀장','본부 출발. 작전 좌표로 이동한다. 민간 시설을 우회하고 교전 규칙을 유지한다.');
  if(s.reserves.length)log(s,'작전본부','현장 12명 투입, 나머지 '+s.reserves.length+'명은 후방 예비대로 대기한다.');
  snapshot(s);return s;
 }
 function hostile(s,a,b){if(a.faction===b.faction)return false;if(a.faction==='insurgent'||b.faction==='insurgent')return true;return s.rival.hostile}
 function move(s,u,target,amount){
  if(window.fieldSimulation?.projectToGround)target=window.fieldSimulation.projectToGround(s.terrain||MAP,target);
  const destination=target.map(v=>Math.round(v/2)*2).join(',');
  if(u.destination!==destination||!u.path.length){u.destination=destination;u.path=pathTo(u,target,s.terrain||MAP)}
  let left=amount;
  while(left>0&&u.path.length){const p=u.path[0],d=Math.hypot(p[0]-u.x,p[1]-u.y);if(d<=left){u.x=p[0];u.y=p[1];u.path.shift();left-=d}else{u.x+=(p[0]-u.x)*left/d;u.y+=(p[1]-u.y)*left/d;left=0}}
 }
 function damage(s,target,amount,source){
  const was=target.hp;target.hp=Math.max(0,target.hp-amount);
  if(target.faction==='blackline'&&was>55&&target.hp<=55){log(s,target.name,'피격. 엄폐 후 의무 지원 요청.','medical');event(s,{kind:'wound',target:target.id,x:target.x,y:target.y})}
  if(target.hp===0){
   if(target.faction==='blackline'){target.status=rand(s)<.12?'dead':'wounded';log(s,'의무 담당',target.name+(target.status==='dead'?' 전사 확인.':' 전투 불능. 후송 위치 확보 중.'),'medical')}
   else{target.status='dead';if(source?.faction==='blackline'){source.kills++;source.actions.push({t:s.time,round:Math.ceil(s.time/13),result:'적대 인원 사살',target:target.id})}log(s,source?.name||'작전지원본부',target.name+' 위협 무력화.','combat')}
  }else if(target.faction!=='blackline'&&target.hp<24&&source?.faction==='blackline'&&rand(s)<.55){target.status='captured';source.detained++;source.actions.push({t:s.time,round:Math.ceil(s.time/13),result:'적대 인원 제압·체포',target:target.id});log(s,source.name,target.name+' 투항 확인. 구금 인계.','combat')}
 }
 function support(s,op){
  for(const [i,o] of (op.fieldProgress?.supportOrders||[]).entries()){
   const key=o.name+'-'+i,arrival=o.requestedAt+o.eta;if(s.time<arrival||s.supportArrived.includes(key))continue;s.supportArrived.push(key);
   const kind=/공중/.test(o.name)?'airstrike':/원거리|포병/.test(o.name)?'artillery':null;
   if(!kind){log(s,'작전지원본부',o.name+' 현장 도착.');continue}
   const target=s.units.find(u=>u.faction!=='blackline'&&active(u)&&(u.faction==='insurgent'||s.rival.hostile));
   if(!target){log(s,'작전지원본부',o.name+' 대기 해제. 식별된 표적 없음.');continue}
   const radius=kind==='airstrike'?8:6;
   if(s.units.some(u=>(u.faction==='blackline'||u.faction==='pmc'&&!s.rival.hostile)&&active(u)&&dist(u,target)<radius+3)){log(s,'작전지원본부',o.name+' 타격 취소. 아군 근접으로 안전 기준 미충족.');continue}
   event(s,{kind,x:target.x,y:target.y,radius,source:'support'});log(s,kind==='airstrike'?'FALCON / 항공 지원':'HAMMER / 화력 지원',kind==='airstrike'?'표적 확인. 진입 후 정밀 타격. 이탈한다.':'사격 제원 확인. 탄착 관측, 효과 보고 바란다.','support');
   const center={x:target.x,y:target.y};for(const u of s.units)if(active(u)&&dist(u,center)<radius)damage(s,u,Math.round(85-dist(u,center)*5),null);
  }
 }
 function snapshot(s){s.frames.push({t:s.time,objective:Math.round(s.objective),retreat:s.retreat,units:s.units.map(u=>[+u.x.toFixed(2),+u.y.toFixed(2),u.hp,u.ammo,u.status])})}
 function step(s,op){
  if(s.done)return;
  s.time=Math.min(s.duration,s.time+13);
  const blue=s.units.filter(u=>u.faction==='blackline'),available=blue.filter(active);
  if(!s.rival.identified&&s.units.some(u=>u.faction==='pmc'&&available.some(a=>dist(a,u)<a.vision))){s.rival.identified=true;log(s,'정찰 담당',s.rival.name+' 식별. '+(s.rival.hostile?'독점 경계구역 진입을 저지하며 사격. 적대 접촉으로 판단.':'별도 계약 수행 중. 상호 식별 후 충돌 회피.'),'contact');event(s,{kind:'contact',faction:'pmc'})}
  support(s,op);
  for(const u of s.units){
   if(!active(u))continue;
   const enemies=s.units.filter(v=>active(v)&&hostile(s,u,v)&&dist(u,v)<=u.vision&&clearLine(u,v)).sort((a,b)=>dist(u,a)-dist(u,b));
   const target=enemies[0];
   if(target&&u.faction==='blackline'&&!s.contact){s.contact=true;log(s,u.name,'전방 무장 접촉. 엄폐 확보, 팀별 대응 개시.','contact')}
   const canFire=target&&dist(u,target)<=u.range&&u.ammo>0&&!(s.retreat&&u.faction==='blackline');
   if(canFire){
    if(target.faction==='blackline'&&!s.contact){s.contact=true;log(s,'현장지휘관','외부 사격 확인. 엄폐 후 위협 방향을 식별한다.','contact')}
    u.status='engaging';u.target=target.id;
    const rounds=Math.min(u.ammo,/저격|정밀/.test(u.role)?1:3);u.ammo-=rounds;if(u.faction==='blackline')s.ammoUsed+=rounds;
    const cover=MAP.buildings.some(b=>Math.abs(target.x-b[0])<2.5||Math.abs(target.y-b[3])<2.5)? .12:0;
    const hit=rand(s)<clamp(.25+u.skill/150-dist(u,target)/100-cover,.12,.86);
    event(s,{kind:'shot',actor:u.id,target:target.id,from:[+u.x.toFixed(2),+u.y.toFixed(2)],to:[+target.x.toFixed(2),+target.y.toFixed(2)],hit,rounds});
    if(hit)damage(s,target,Math.round(14+rand(s)*21+(/저격|정밀/.test(u.role)?12:0)),u);
    if(u.faction==='blackline'&&Math.floor(s.time/13)%3===0)log(s,u.name,(hit?'명중 관측.':'적 엄폐 중. 사격 통제 유지.')+' 잔탄 '+u.ammo+'발.','combat');
   }else{
    u.target=null;
    let goal=u.faction==='blackline'?(s.retreat?MAP.base:s.goal):u.faction==='pmc'?[72,36]:[66,33];
    if(u.faction==='blackline'&&s.missionType==='구조'&&s.objective>=65)goal=MAP.base;
    if(target&&u.ammo>0&&u.faction!=='blackline')goal=[target.x,target.y];
    if(u.faction==='pmc'&&!s.rival.hostile&&!target)goal=[73,37];
    const speed=u.faction==='blackline'?4.8:2.5;
    move(s,u,goal,u.hp<55?speed*.55:speed);u.status=s.retreat&&u.faction==='blackline'?'retreating':dist(u,{x:goal[0],y:goal[1]})<4?'holding':'moving';
   }
  }
  const threats=s.units.filter(u=>active(u)&&u.faction!=='blackline'&&(u.faction==='insurgent'||s.rival.hostile));
  const near=available.filter(u=>dist(u,{x:s.goal[0],y:s.goal[1]})<12);
  const danger=threats.some(u=>near.some(a=>dist(a,u)<20));
  const before=s.objective;
  if(near.length&&!danger&&!s.retreat)s.objective=Math.min(s.missionType==='구조'?65:100,s.objective+Math.max(8,near.length*7));
  if(s.missionType==='구조'&&s.objective>=65&&available.some(u=>dist(u,{x:MAP.base[0],y:MAP.base[1]})<6))s.objective=100;
  if(before<65&&s.objective>=65)log(s,'현장지휘관',s.missionType==='구조'?'보호 대상 확보. 후송 경로로 전환한다.':'주요 구역 확보. 잔여 임무 수행 중.','objective');
  if(before<100&&s.objective>=100)log(s,'현장지휘관','현장 목표 달성. 인원 확인 및 복귀 절차 개시.','objective');
  const avg=available.reduce((n,u)=>n+u.hp,0)/Math.max(1,available.length),empty=available.length>0&&available.every(u=>!u.ammo);
  if(!s.retreat&&(available.length<2||(s.contact&&(avg<36||empty)))){s.retreat=true;log(s,'현장지휘관','전력·탄약 한계 도달. 엄호하며 본부 방향으로 철수한다.','command')}
  if(s.time>=s.duration||!available.length){if(!available.length)s.duration=s.time;s.done=true;log(s,'현장지휘관',s.objective>=100&&!s.retreat?'임무 완료. 현장 인계 및 복귀를 보고한다.':'현장 임무 종료. 목표 미달성 사항을 보고한다.','result')}
  snapshot(s);
 }
 function outcome(s){
  const opponents=s.units.filter(u=>u.faction==='insurgent'||(u.faction==='pmc'&&s.rival.hostile));
  return {success:s.objective>=100&&!s.retreat,retreat:s.retreat,used:s.ammoUsed,hostileContact:s.contact,hostileCount:opponents.length,hostileKilled:opponents.filter(u=>u.status==='dead').length,hostileDetained:opponents.filter(u=>u.status==='captured').length,hostileRetreated:opponents.filter(active).length,
   personnelCombat:s.units.filter(u=>u.faction==='blackline').map(u=>({id:u.personId,name:u.name,role:u.role,kills:u.kills,detained:u.detained,actions:u.actions})),
   casualties:s.units.filter(u=>u.faction==='blackline'&&(u.hp<=55||u.status==='dead')).map(u=>({id:u.personId,name:u.name,dead:u.status==='dead',hp:u.hp,severity:u.hp<=0?'중상':u.hp<30?'보통':'경상'}))};
 }
 function settleRelations(s){if(s.relationsSettled)return;s.relationsSettled=true;if(!s.rival.identified)return;const rival=factions().find(p=>p.id===s.rival.id);if(rival){rival.encounters++;rival.relation=clamp(rival.relation+(s.rival.hostile?-8:2),0,100)}}
 window.fieldSimulation={MAP,create,step,outcome,settleRelations,pathTo,clearLine,internals:{rand,move,damage,active,dist}};
})();
