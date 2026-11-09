/* Stage-aware maps use saved positions, observations and interaction progress. */
(function(){
 const art=window.FieldArt,esc=x=>escapeHTML(String(x??''));let hitPoints=[],hudKey='',sceneKey='';
 const steps=[['outbound','출동'],['site','현장 수색'],['interior','건물 내부'],['extraction','집결'],['boarding','차량 탑승'],['homebound','복귀']];
 const order={outbound:0,site:1,entry:1,interior:2,exit:2,extraction:3,boarding:4,homebound:5,complete:6};
 const phaseName={outbound:'작전지 이동',site:'작전지역 수색',entry:'목표 건물 진입',interior:'건물 내부 수색',exit:'건물 이탈',extraction:'복귀 집결지 이동',boarding:'차량 탑승',homebound:'본부 복귀',complete:'복귀 완료'};
 function draw(canvas,r,t,options){const s=r.tactical,j=s.journey,{a,b,p}=options.frameAt(s,t),f=a.journey||s.liveFrame.journey,next=b.journey||f;if(!f)return;
  const regional=['outbound','homebound','complete'].includes(f.stage),inside=!regional&&['entry','interior','exit'].includes(f.stage)&&f.inside.some(u=>u.faction==='blackline'),scene=regional?'regional':inside?'interior':'site',map=regional?j.transport.map:inside?j.interior.map:s.terrain;
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,1.5),z=options.zoom;
  if(!w||!h)return;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.fillStyle='#e7e8e2';c.fillRect(0,0,w,h);
  let cx=map.width/2,cy=map.height/2;const positions=regional?(f.road.length?f.road:[{id:'vehicle',...f.transport}]):inside?f.inside:s.units.map((u,i)=>({id:u.id,x:a.units[i][0],y:a.units[i][1]}));const selected=positions.find(u=>u.id===options.selectedUnit)||regional&&{...f.transport};
  if(z>1&&selected){cx=Math.max(map.width/2/z,Math.min(map.width-map.width/2/z,selected.x));cy=Math.max(map.height/2/z,Math.min(map.height-map.height/2/z,selected.y))}
  const screen=(x,y)=>[(x-cx)*z/map.width*w+w/2,(y-cy)*z/map.height*h+h/2],scale=w/map.width*z;
  const im=art.image(map.image);c.save();c.translate(w/2,h/2);c.scale(z,z);c.translate(-cx/map.width*w,-cy/map.height*h);if(im.complete&&im.naturalWidth)c.drawImage(im,0,0,w,h);c.restore();
  const root=canvas.closest('.field-console'),shell=canvas.parentElement,key=r.id+':'+scene;
  if(sceneKey!==key||shell.dataset.scene!==scene){sceneKey=key;shell.dataset.scene=scene;shell.classList.remove('scene-arrival');void shell.offsetWidth;shell.classList.add('scene-arrival')}
  const toolbar=root.querySelector('.field-map-toolbar>span');if(toolbar){const text=regional?'REGIONAL / '+(f.stage==='homebound'?'본부 복귀 경로':'작전지 이동 경로'):inside?'INTERIOR / '+j.building.name+' 상세':s.terrain.label;if(toolbar.textContent!==text)toolbar.textContent=text}
  const stamp=shell.querySelector('.field-map-stamp');if(stamp&&stamp.dataset.scene!==scene){stamp.dataset.scene=scene;stamp.innerHTML=(regional?'CONVOY / 광역 기동':inside?'INTERIOR / 건물 내부':'ON SITE / '+esc(s.terrain.name))+'<span>관측 정보 기반 · 자율 현장지휘</span>'}
  const scaleEl=shell.querySelector('.field-map-scale');if(scaleEl)scaleEl.textContent=(inside?'FLOOR':regional?'REGION':'SITE')+' '+map.width+' × '+Math.round(map.height);
  hitPoints=[];
  const drawUnit=(u,v,coords,size)=>{const xy=screen(...coords);art.unit(c,u,v,...xy,size,t,options.selectedUnit===u.id,options.labels);if(u.faction==='blackline')hitPoints.push({id:u.id,x:xy[0],y:xy[1]})};
  if(regional){
   c.strokeStyle='#ffffffc9';c.lineWidth=5;c.beginPath();j.transport.path.forEach((pt,i)=>{const xy=screen(...pt);i?c.lineTo(...xy):c.moveTo(...xy)});c.stroke();c.strokeStyle='#668ac9bb';c.lineWidth=2;c.setLineDash([6,7]);c.stroke();c.setLineDash([]);
   art.marker(c,...screen(...j.transport.path[0]),'본부',null,'#53739b','H');art.marker(c,...screen(...j.transport.path.at(-1)),'작전지역',null,'#a28a51','↗');
   art.aim(c,f.roadAims,screen,t);
   for(const v of f.road){const u=s.units.find(u=>u.id===v.id),n=next.road?.find(n=>n.id===v.id),q=next.stage===f.stage?p:0;drawUnit(u,[v.x,v.y,v.hp,v.ammo,v.status,v.heading],[v.x+((n?.x??v.x)-v.x)*q,v.y+((n?.y??v.y)-v.y)*q],Math.max(24,30*Math.sqrt(z)))}
   const q=next.stage===f.stage?p:0,v=f.transport,n=next.transport;art.vehicle(c,...screen(v.x+(n.x-v.x)*q,v.y+(n.y-v.y)*q),v.heading,Math.max(43,60*Math.sqrt(z)));const xy=screen(v.x,v.y);art.label(c,f.transport.stopped?'접촉 · 차량 정차':'BLACKLINE / '+(f.stage==='homebound'?'복귀 중':'이동 중'),xy[0]+22,xy[1]-25);
  }else if(inside){
   for(let i=0;i<j.interior.rooms.length;i++){const pt=j.interior.rooms[i],cleared=f.rooms.includes(i),found=f.discovered&&j.interior.targetRoom===i;art.marker(c,...screen(...pt),found?'의뢰 대상':cleared?'수색 완료':'미확인 구역 '+(i+1),found?f.tasks[1].progress:cleared?100:null,found?'#3c8a78':cleared?'#8294ac':'#5c7eb3',found?'◆':cleared?'✓':'?')}
   art.marker(c,...screen(...j.interior.exit),'출입구',null,'#78979d','↤');
   art.aim(c,f.aims,screen,t);
   for(const v of f.inside){const u=s.units.find(u=>u.id===v.id),n=next.inside?.find(n=>n.id===v.id),q=next.stage===f.stage?p:0;drawUnit(u,[v.x,v.y,v.hp,v.ammo,v.status,v.heading],[v.x+((n?.x??v.x)-v.x)*q,v.y+((n?.y??v.y)-v.y)*q],Math.max(28,38*Math.sqrt(z)))}
  }else{
   if(f.search.discovered){const bounds=j.building.bounds;if(bounds){const tl=screen(bounds[0],bounds[1]),br=screen(bounds[2],bounds[3]);c.strokeStyle='#507bcfa0';c.lineWidth=2;c.setLineDash([5,5]);c.strokeRect(...tl,br[0]-tl[0],br[1]-tl[1]);c.setLineDash([])}art.marker(c,...screen(...j.building.entrance),j.building.name,a.objective,'#4278ca','▣')}
   else for(const [i,sector]of f.search.points.entries())art.marker(c,...screen(...sector.position),sector.cleared?'구역 확인':'수색 구역 '+(i+1),sector.cleared?100:sector.progress||null,sector.cleared?'#8c9db2':'#7d8d9f',sector.cleared?'✓':'?');
   if(['extraction','boarding'].includes(f.stage)){art.marker(c,...screen(...j.exfil),'복귀 집결지',f.pickup?.boarding||0,'#438c7c','↗');if(f.pickup?.requestedAt!=null){const v=f.pickup,n=next.pickup||v;art.vehicle(c,...screen(v.x+(n.x-v.x)*p,v.y+(n.y-v.y)*p),v.heading,60*Math.sqrt(z));art.label(c,v.arrived?'ROAD 1 / 탑승 대기':'ROAD 1 / 집결지 진입',...screen(v.x+4,v.y-3),'#3f7e79')}}
   if(f.drone&&!f.drone.finished){const d=f.drone,[x,y]=screen(d.x,d.y);c.save();c.strokeStyle='#6f98c244';c.fillStyle='#78a8c00a';c.lineWidth=1;c.setLineDash([4,7]);c.beginPath();c.ellipse(x,y,d.radius*scale,d.radius*scale*h/w*map.width/map.height,0,0,Math.PI*2);c.fill();c.stroke();c.setLineDash([]);c.strokeStyle='#4a678b';c.lineWidth=2;c.beginPath();c.moveTo(x-7,y-5);c.lineTo(x+7,y+5);c.moveTo(x-7,y+5);c.lineTo(x+7,y-5);c.stroke();c.fillStyle='#7c93ad';for(const [dx,dy]of [[-7,-5],[7,-5],[-7,5],[7,5]]){c.beginPath();c.ellipse(x+dx,y+dy,5,2.4,t*8,0,Math.PI*2);c.fill()}c.restore();art.label(c,'UAV / '+d.remaining+'초',x+12,y-11,'#5c83ad')}
   art.aim(c,a.aims,screen,t);
   s.units.forEach((u,i)=>{if(u.roadOnly)return;const v=a.units[i],n=b.units[i]||v;if(f.inside.some(p=>p.id===u.id))return;if(u.faction!=='blackline'){const contact=(a.contacts||[]).find(p=>p[0]===u.id);if(!contact)return;if(!contact[4]){const xy=screen(contact[1],contact[2]);art.marker(c,...xy,'마지막 관측',null,'#bd9b79','?');return}}if(v[4]==='boarded')return;drawUnit(u,v,[v[0]+(n[0]-v[0])*p,v[1]+(n[1]-v[1])*p],Math.max(25,32*Math.sqrt(z)/Math.sqrt(map.width/100)))});
  }
  art.effects(c,s,t,screen,scene,w,h,scale);
  updateHud(root,s,f,scene,r.id);
 }
 function updateHud(root,s,f,scene,id){const key=id+':'+JSON.stringify([f.stage,f.search,f.tasks,f.pickup?.boarding,f.drone?.remaining,scene]);if(hudKey===key&&root.querySelector('.field-journey-panel'))return;hudKey=key;
  let panel=root.querySelector('.field-journey-panel');if(!panel){panel=document.createElement('div');panel.className='field-journey-panel';panel.setAttribute('aria-label','실제 작전 진행 단계');root.querySelector('.field-map-toolbar').before(panel)}
  const idx=order[f.stage],task=f.tasks[f.task],regional=['outbound','homebound','complete'].includes(f.stage),progress=regional?Math.round(f.transport.progress*100):f.stage==='boarding'?f.pickup?.boarding||0:scene==='site'&&!f.search.discovered?f.search.points[f.search.index]?.progress||0:task?.progress||(f.discovered?100:0);
  const title=regional?(f.transport.stopped?'이동 중 접촉 · 차량 정차':phaseName[f.stage]):scene==='interior'?(f.discovered?'의뢰 대상 발견 · 현장 과업':'방별 수색 · 대상 미발견'):f.search.discovered?phaseName[f.stage]:'현장 수색 · 목표 건물 미확인';
  const detail=regional?'수송 차량 이동 중 · 현장 도착 후 하차·경계 전개':f.stage==='extraction'?'집결지 도착 → 수송 차량 진입 → 인원 확인':scene==='interior'?(task?.blocked?'관측된 위협 때문에 과업 중지':task?.name||'출입구로 이동'):'진입조 이동 · 저격·지원·의무 담당 외곽 엄호';
  panel.innerHTML='<ol class="journey-steps">'+steps.map(([stage,name],i)=>'<li class="'+(i<idx?'done':i===idx?'current':'')+'"><span>'+(i<idx?'✓':String(i+1).padStart(2,'0'))+'</span>'+name+'</li>').join('')+'</ol><div class="journey-current"><div><small>'+esc(scene.toUpperCase())+' / '+(scene==='interior'?'건물 상세':scene==='regional'?'기동 지도':'현장 지도')+'</small><strong>'+esc(title)+'</strong><p>'+esc(detail)+'</p></div><b>'+progress+'<em>%</em></b></div><div class="journey-progress" role="progressbar" aria-label="현재 단계 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+progress+'"><i style="width:'+progress+'%"></i></div>'+(f.drone&&!f.drone.finished?'<div class="journey-intel">UAV 정찰 중 · 잔여 '+f.drone.remaining+'초 · 관측 범위 내 실시간 정보</div>':'');
 }
 window.FieldJourneyView={draw,hitTest(x,y){return hitPoints.slice().sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)).find(p=>Math.hypot(p.x-x,p.y-y)<24)?.id||null}};
})();
