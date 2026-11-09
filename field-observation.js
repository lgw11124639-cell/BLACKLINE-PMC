/* One observation surface for live coordinate simulation, saved replays and explicitly separate training. */
(function(){
 const esc=x=>escapeHTML(String(x??'')),clock=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
 let replayMode=false,expanded=false,savedView=null;try{savedView=JSON.parse(sessionStorage.getItem('blackline_field_view')||'null')}catch(e){}
 let selected=savedView?.open?savedView.id:null,demo=null,playhead=savedView?.time||0,playing=true,follow=true,speed=1,zoom=1.8,cameraX=50,cameraY=33.333,mapWidth=100,mapHeight=66.667,labels=true,selectedUnit=null,raf=null,last=0,painted=0,radioKey='',rosterKey='',lastTime=-1,changedAt=0,lastPersist=0;
 window.fieldCameraState={follow:true,x:null,y:null,width:100,height:66.667,dragged:false};
 const viewRoot=()=>replayMode?document.getElementById('field-recording-root'):app;
 const fieldElement=id=>viewRoot()?.querySelector('#'+id);
 const operatorImage=new Image();operatorImage.src='images/operators/pmc-directions.webp';
 const mapCache=new Map();function imageFor(path){if(!mapCache.has(path)){const image=new Image();image.src=path;mapCache.set(path,image)}return mapCache.get(path)}
 const colors={blackline:'#3567d6',insurgent:'#d25343',pmc:'#bc8c2c'};
 const states={reloading:'탄창 교환',airlifting:'헬기 수송',medevac:'의료 헬기 탑승','evac-home':'의료 기지 인계','door-stack':'진입 준비','door-cover':'출입구 엄호','rear-security':'후방 경계','room-clear':'실내 수색','contract-patrol':'타사 계약 순찰',investigating:'총성 조사',flanking:'측면 우회',fleeing:'이탈', 'taking-cover':'엄폐 이동','vehicle-repair':'차량 정비','escort-security':'호송 엄호','rescue-moving':'구조 이동','site-inspection':'현장 확인','room-search':'실내 수색','objective-work':'목표 과업',entering:'출입구 접근',breaching:'진입 확인',exiting:'건물 이탈','pickup-security':'집결지 경계',boarding:'차량 탑승',boarded:'탑승 완료',carrying:'부상자 후송','casualty-recovery':'부상자 회수','road-cover':'하차 엄호','road-boarding':'차량 재탑승',transporting:'차량 이동',repositioning:'전술 재배치',positioning:'진지 확보',overwatch:'저격 엄호',scouting:'고지 정찰','high-ground':'고지 관측','medical-hold':'의료 대기','medical-moving':'부상자 접근',treating:'응급처치',covering:'측면 엄호',descending:'관측층 하강',searching:'수색',scanning:'경계 확인',moving:'이동',engaging:'교전',holding:'경계',patrol:'순찰',guarding:'경계',wounded:'전투 불능',dead:'사망',captured:'구금',retreating:'철수',evacuated:'후송 대기',retreated:'이탈'};
 const activeOps=()=>state.operations.flatMap(o=>o.status==='현장 진행 중'&&o.fieldProgress?.tactical?[o]:o.status==='사전 정찰'&&o.preRecon?.operation.fieldProgress.tactical?[{...o,id:o.id,contract:{...o.contract,title:(o.contract?.title||'작전')+' · 사전 정찰'},fieldProgress:o.preRecon.operation.fieldProgress}]:[]);
 function record(){
  if(!replayMode){const op=activeOps().find(o=>o.id===selected)||activeOps()[0];if(!op)return null;selected=op.id;return {id:op.id,title:op.contract?.title||'현장 작전',date:op.created,tactical:op.fieldProgress.tactical,live:true}}
  if(selected==='training')return demo;
  const op=state.operations.find(o=>o.id===selected&&o.fieldProgress?.tactical);
  if(op)return {id:op.id,title:op.contract?.title||'현장 작전',date:op.created,tactical:op.fieldProgress.tactical,live:true};
  return state.history.find(h=>String(h.planId||h.id)===String(selected))||null;
 }
 function available(){return [...activeOps().map(o=>({id:o.id,title:o.contract?.title||o.id,live:true})),...state.history.map(h=>({id:h.planId||h.id,title:h.title,date:h.date,legacy:!h.tactical}))]}
 function launchMarkup(){const count=activeOps().length;return '<div class="observation-launch"><div><small>FIELD OBSERVATION</small><strong>'+(count?'현장 작전 '+count+'건 · 실시간 연결 가능':'지도 위에서 작전의 흐름을 읽다')+'</strong><p>대원 이동, 현장 무전, 교전과 화력 지원을 한 화면에서.</p></div><button class="btn" type="button" onclick="openFieldObservation()">실시간 작전 관찰 <span aria-hidden="true">↗</span></button></div>'}
 const archiveMarkup=function(){
  const list=replayMode?available().filter(o=>!o.live):available();if(!selected&&list.length)selected=list[0].id;
  const r=record(),s=r?.tactical;
  const title=r?.title||'현장 관찰실';
  return '<section class="field-console"><div class="field-console-head"><div><small>BLACKLINE / FIELD COMMAND</small><h2>'+esc(title)+'</h2><p>'+(r?.live?'현재 진행 중인 좌표 시뮬레이션 · 현장 지휘관 자율 판단':selected==='training'?'훈련 시연 · 회사 자금·탄약·대원 기록에 반영되지 않습니다':r?'저장된 작전 기록 · 재생은 정산과 기록을 변경하지 않습니다':'실제 작전은 준비와 출동이 완료되면 이곳에 표시됩니다.')+'</p></div><span class="field-mode '+(r?.live?'is-live':'')+'">'+(r?.live?'● LIVE':selected==='training'?'TRAINING':r?'REPLAY':'STANDBY')+'</span></div>'+
  '<div class="field-sessionbar"><label>작전 선택<select id="field-record" onchange="openFieldObservation(this.value)"><option value="">기록 선택</option>'+list.map(o=>'<option value="'+esc(o.id)+'" '+(String(o.id)===String(selected)?'selected':'')+'>'+(o.live?'● LIVE · ':o.legacy?'이전 기록 · ':'다시보기 · ')+esc(o.title)+'</option>').join('')+(demo?'<option value="training" '+(selected==='training'?'selected':'')+'>훈련 시연 · 세라 산업지구</option>':'')+'</select></label><button class="btn secondary" type="button" onclick="fieldTraining()">훈련 시연 보기</button></div>'+
  (!r?'<div class="field-empty"><span class="field-empty-symbol">◎</span><h3>먼저 훈련 현장을 살펴보세요</h3><p>좌표 이동과 사격, 포격·공습의 과정을 지금 관찰할 수 있습니다.<br>실제 회사의 작전이 시작되면 LIVE로 연결됩니다.</p><button class="btn" type="button" onclick="fieldTraining()">훈련 시연 시작</button></div>':
  '<div class="field-layout"><div class="field-map-column"><div class="field-map-toolbar"><span><i></i> '+esc(s?.terrain?.label||'INDUSTRIAL DISTRICT / TERRAIN 01')+'</span><div><button type="button" aria-label="지도 축소" onclick="fieldZoom(-.25)">−</button><button type="button" aria-label="지도 확대" onclick="fieldZoom(.25)">+</button><button type="button" data-camera-toggle onclick="fieldCameraToggle()" aria-label="아군 카메라 추적 전환" aria-pressed="true">추적 고정</button><button type="button" onclick="fieldExpand()" aria-label="지도 집중 화면">크게</button><button type="button" onclick="fieldLabels()" aria-pressed="'+labels+'">이름</button></div></div><div class="field-map-shell"><canvas id="field-canvas" aria-label="대원 좌표와 교전 및 지원 타격을 표시하는 작전지도" role="img"></canvas><div class="field-map-stamp">TACTICAL OVERLAY <span>좌표 단위 · 가상 현장</span></div><div class="field-map-scale">0 ━━━ 20 <span>GRID</span></div></div><div class="field-legend"><span><i style="background:#3567d6"></i>BLACKLINE</span><span><i style="background:#d25343"></i>무장세력</span><span><i style="background:#bc8c2c"></i>다른 PMC</span><span class="field-map-hint">대원 선택 · 확대 시 추적</span></div>'+
  (!s?'<p class="field-legacy-note">이전 버전의 기록에는 좌표가 저장되지 않았습니다. 원래 무전 기록을 재생합니다.</p><button class="btn secondary" onclick="blacklineOpenLegacyObservation()">기존 3D 관찰 화면</button>':'')+
  '<div class="field-playback"><div><span id="field-play-status"></span><strong id="field-time">00:00</strong></div><input id="field-seek" type="range" min="0" max="'+(s?.time||390)+'" value="0" aria-label="작전 기록 시간 이동" oninput="fieldSeek(this.value)"><div class="field-play-controls"><button class="btn" id="field-play" type="button" onclick="fieldToggle()">일시정지</button><button class="btn secondary" type="button" onclick="fieldRestart()">처음부터</button>'+(r.live?'<button class="field-follow" onclick="fieldFollow()">LIVE 따라가기</button>':'')+'<button class="field-speed" onclick="fieldSpeed()" aria-label="기록 재생 배속">'+speed+'× 재생</button></div></div><div class="field-kpis"><div><small>임무 목표</small><strong id="field-objective">—</strong></div><div><small>전투 가용</small><strong id="field-strength">—</strong></div><div><small>실제 소모 탄약</small><strong id="field-ammo">—</strong></div><div><small>접촉 세력</small><strong id="field-factions">—</strong></div></div><div id="field-roster" class="field-roster"></div><div id="field-unit-detail" class="field-unit-detail"></div></div><aside class="field-radio-column"><div class="field-radio-title"><div><small>COMMS / CHANNEL 01</small><h3>현장 무전</h3></div><span class="field-radio-indicator">수신</span></div><div id="field-radio" class="field-radio" role="log" aria-live="off"></div><div id="field-after-action" class="field-after-action">최종 결과는 작전 종료 시 확인할 수 있습니다.</div></aside></div>')+'</section>';
 };
 window.observation=function(){
  const mode=replayMode,old=selected;replayMode=false;
  const session=record()?.id||'standby';const template=document.createElement('template');template.innerHTML=archiveMarkup();replayMode=mode;if(mode)selected=old;
  template.content.querySelector('.field-sessionbar')?.remove();
  const consoleEl=template.content.querySelector('.field-console');consoleEl.classList.add('live-only');consoleEl.dataset.session=String(session);
  template.content.querySelectorAll('.field-playback').forEach(el=>el.hidden=true);
  template.content.querySelector('.field-console-head').insertAdjacentHTML('afterend','<div class="field-live-meta"><span>REAL TIME / 시각 확인 기반</span><strong data-live-field-time>00:00 / 현장 진행</strong><span data-live-field-phase>출동 대기</span></div>');
  const empty=template.content.querySelector('.field-empty');
  if(empty){empty.className='field-standby';empty.innerHTML='<div><span>LIVE FIELD / STANDBY</span><h3>실시간 현장 연결 대기</h3><p data-live-departure>준비를 마친 팀이 출발하면 현재 작전만 표시됩니다.</p></div>'}
  const info=template.content.querySelector('.field-console-head p');if(info&&record())info.textContent='출동부터 내부 수색·과업·차량 복귀까지 · 완료 시간은 실제 현장 진행에 따라 달라집니다.';
  return template.innerHTML;
 };
 window.openFieldObservation=function(id){
  if(id&&state.history.some(h=>String(h.planId||h.id)===String(id)))return window.openFieldReplay(id);
  if(document.getElementById('field-recording-root'))window.closeFieldReplay();
  replayMode=false;selected=id||activeOps()[0]?.id||null;playing=true;follow=true;radioKey='';lastTime=-1;selectedUnit=null;zoom=1.8;go('observation');
 };
 window.openFieldReplay=function(id){
  if(window.closeCompanyReport)window.closeCompanyReport();
  selected=id;replayMode=true;playhead=0;playing=false;follow=false;radioKey='';lastTime=-1;selectedUnit=null;zoom=1.8;
  let overlay=document.getElementById('field-recording-root');if(!overlay){overlay=document.createElement('div');overlay.id='field-recording-root';overlay.className='field-recording-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','저장된 작전 다시보기');document.body.appendChild(overlay)}
  overlay.innerHTML='<div class="field-recording-header"><strong>저장된 작전 다시보기</strong><button class="btn secondary" onclick="closeFieldReplay()">닫기</button></div>'+archiveMarkup();
  overlay.querySelectorAll('[onclick="fieldTraining()"],.field-empty').forEach(el=>el.remove());
  app.querySelectorAll('[id^="field-"]').forEach(el=>el.id='background-'+el.id);app.inert=true;document.getElementById('tabs').inert=true;document.body.classList.add('field-recording-open');overlay.querySelector('button')?.focus({preventScroll:true});start();
 };
 window.closeFieldReplay=function(){document.getElementById('field-recording-root')?.remove();replayMode=false;playing=true;follow=true;selected=activeOps()[0]?.id||null;expanded=false;app.inert=false;document.getElementById('tabs').inert=false;document.body.classList.remove('field-recording-open','field-focus-open');render()};
 window.fieldToggle=()=>{if(!replayMode)return;playing=!playing;if(record()?.live)follow=playing;update()};
 window.fieldSeek=v=>{if(!replayMode)return;playhead=Math.max(0,Number(v)||0);playing=false;follow=false;update()};
 window.fieldRestart=()=>{if(!replayMode)return;playhead=0;follow=false;playing=true;radioKey='';update()};
 window.fieldSpeed=()=>{if(!replayMode)return;speed=speed===.5?1:speed===1?2:speed===2?4:.5;const el=viewRoot()?.querySelector('.field-speed');if(el)el.textContent=speed+'× 재생'};
 window.fieldFollow=()=>{follow=true;playing=true;update()};
 window.fieldExpand=()=>{expanded=!expanded;viewRoot()?.querySelector('.field-console')?.classList.toggle('field-focus',expanded);document.body.classList.toggle('field-focus-open',expanded);const b=viewRoot()?.querySelector('[onclick="fieldExpand()"]');if(b)b.textContent=expanded?'닫기':'크게'};
 window.fieldCameraToggle=()=>{const camera=window.fieldCameraState;camera.follow=!camera.follow;viewRoot()?.querySelectorAll('[data-camera-toggle]').forEach(b=>{b.textContent=camera.follow?'추적 고정':'자유 시점';b.setAttribute('aria-pressed',String(camera.follow))});const canvas=fieldElement('field-canvas');if(canvas)canvas.style.touchAction=camera.follow?'pan-y':'none';update()};
 window.fieldZoom=d=>{zoom=Math.max(1,Math.min(4,zoom+d))};
 window.fieldLabels=()=>{labels=!labels;const b=viewRoot()?.querySelector('[onclick="fieldLabels()"]');if(b)b.setAttribute('aria-pressed',String(labels))};
 function frameAt(s,t){if(s.liveFrame&&t>=s.liveFrame.t&&!s.done)return {a:s.liveFrame,b:s.liveFrame,p:1};if(s.version>=2&&!s.done&&s.previousLiveFrame&&t>=s.previousLiveFrame.t){const a=s.previousLiveFrame,b=s.liveFrame;return {a,b,p:Math.max(0,Math.min(1,(t-a.t)/Math.max(1,b.t-a.t)))}}let a=s.frames[0]||s.previousLiveFrame||s.liveFrame,b=a;for(const f of s.frames){if(f.t<=t)a=f;if(f.t>=t){b=f;break}b=f}return {a,b,p:b.t===a.t?1:Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t)))}}
 function screen(canvas,x,y){return [(x-cameraX)*zoom/mapWidth*canvas.clientWidth+canvas.clientWidth/2,(y-cameraY)*zoom/mapHeight*canvas.clientHeight+canvas.clientHeight/2]}
 function drawMap(canvas,r,t){
  const s=r.tactical;if(s?.journey&&window.FieldJourneyView)return FieldJourneyView.draw(canvas,r,t,{zoom,labels,selectedUnit,frameAt,clock,replayMode});const terrain=s?.terrain||fieldSimulation.maps?.factory||fieldSimulation.MAP,mapImage=imageFor(terrain.image),dpr=Math.min(devicePixelRatio||1,1.5),w=canvas.clientWidth,h=canvas.clientHeight;
  mapWidth=terrain.width;mapHeight=terrain.height;const scale=canvas.parentElement.querySelector('.field-map-scale');const scaleText='GRID '+mapWidth+' × '+Number(mapHeight.toFixed(1));if(scale&&scale.textContent!==scaleText)scale.textContent=scaleText;
  if(!w||!h)return;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  const c=canvas.getContext('2d');if(!c)return;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.fillStyle='#e1e7dc';c.fillRect(0,0,w,h);
  cameraX=mapWidth/2;cameraY=mapHeight/2;if(s&&selectedUnit&&zoom>1){const sample=frameAt(s,t),index=s.units.findIndex(u=>u.id===selectedUnit),v=sample.a.units[index],next=sample.b.units[index];if(v){cameraX=Math.max(mapWidth/2/zoom,Math.min(mapWidth-mapWidth/2/zoom,v[0]+((next?.[0]??v[0])-v[0])*sample.p));cameraY=Math.max(mapHeight/2/zoom,Math.min(mapHeight-mapHeight/2/zoom,v[1]+((next?.[1]??v[1])-v[1])*sample.p))}}
  c.save();c.translate(w/2,h/2);c.scale(zoom,zoom);c.translate(-cameraX/mapWidth*w,-cameraY/mapHeight*h);if(mapImage.complete&&mapImage.naturalWidth)c.drawImage(mapImage,0,0,w,h);else{c.fillStyle='#bdc7c9';c.fillRect(0,h*31/66.667,w,h*6/66.667);c.fillRect(w*.64,0,w*.06,h);c.fillStyle='#b4c0b5';for(const b of terrain.buildings)c.fillRect(b[0]/mapWidth*w,b[1]/mapHeight*h,(b[2]-b[0])/mapWidth*w,(b[3]-b[1])/mapHeight*h)}c.restore();
  c.fillStyle='rgba(245,249,255,.08)';c.fillRect(0,0,w,h);
  c.strokeStyle='rgba(255,255,255,.23)';c.lineWidth=.5;for(let i=1;i<10;i++){c.beginPath();c.moveTo(i*w/10,0);c.lineTo(i*w/10,h);c.stroke()}for(let i=1;i<7;i++){c.beginPath();c.moveTo(0,i*h/7);c.lineTo(w,i*h/7);c.stroke()}
  if(!s)return;
  const {a,b,p}=frameAt(s,t),[gx,gy]=screen(canvas,...s.goal);
  if(labels)for(const spot of terrain.positions?.highGrounds||[]){const point=screen(canvas,spot.x,spot.y);label(c,'△ '+spot.id,point[0],point[1],'#8b744a')}
  if(selectedUnit){const order=(s.orders||[]).filter(o=>o.actor===selectedUnit&&o.t<=t).slice(-1)[0];const index=s.units.findIndex(u=>u.id===selectedUnit);if(order&&a.units[index]){const from=screen(canvas,a.units[index][0],a.units[index][1]),to=screen(canvas,...order.position);c.setLineDash([4,5]);c.strokeStyle='#4c75b577';c.lineWidth=1;c.beginPath();c.moveTo(...from);c.lineTo(...to);c.stroke();c.setLineDash([]);label(c,order.kind,to[0]+5,to[1]-10,'#5275a2')}}
  FieldArt.marker(c,gx,gy,'임무 목표',a.objective,'#6a8bba','◆');
  if(window.FieldArt){FieldArt.aim(c,a.aims, (x,y)=>screen(canvas,x,y),t);FieldArt.effects(c,s,t,(x,y)=>screen(canvas,x,y),'site',w,h,w/mapWidth*zoom);}
  s.units.forEach((u,i)=>{if((u.joinedAt||0)>t)return;
   const v=a.units[i],next=b.units[i]||v;if(!v)return;
   if(s.version>=2&&u.faction!=='blackline'){const contact=fieldSimulation.visibleAt(s,t).find(c=>c[0]===u.id);if(!contact)return;if(!contact[4]){const point=screen(canvas,contact[1],contact[2]);c.globalAlpha=.45;c.beginPath();c.arc(point[0],point[1],8,0,Math.PI*2);c.strokeStyle=colors[u.faction];c.setLineDash([2,3]);c.stroke();c.setLineDash([]);if(labels)label(c,'마지막 관측',point[0]+10,point[1]-10,colors[u.faction]);c.globalAlpha=1;return}}const [x,y]=screen(canvas,v[0]+(next[0]-v[0])*p,v[1]+(next[1]-v[1])*p),color=colors[u.faction],down=v[2]<=0||v[4]==='captured';
   if(v[4]==='transporting'&&u.faction==='blackline'){if(i%4===0)FieldArt.vehicle(c,x,y,v[5]||0,50*Math.sqrt(zoom));return;}
   FieldArt.unit(c,u,v,x,y,(w<500?26:32)*Math.sqrt(zoom)/Math.sqrt(mapWidth/100),t,selectedUnit===u.id,labels);
  });
 }
 function label(c,text,x,y,color){c.font='600 9px -apple-system,sans-serif';const size=c.measureText(text).width;c.fillStyle='#fffffff0';c.fillRect(x-4,y-9,size+8,14);c.fillStyle=color;c.fillText(text,x,y+1)}
 function update(){
  const r=record(),canvas=fieldElement('field-canvas');if(!canvas)return;if(!r){drawMap(canvas,{tactical:null},0);return;}
  const s=r.tactical,max=s?(r.live?s.time:s.duration):Math.max(390,...(r.logs||[]).map(x=>x.t));playhead=Math.max(0,Math.min(max,playhead));
  drawMap(canvas,r,playhead);
  viewRoot()?.querySelectorAll('[data-live-field-time]').forEach(el=>el.textContent=clock(playhead)+' / 현장 진행');viewRoot()?.querySelectorAll('[data-live-field-phase]').forEach(el=>el.textContent=s?.journey?(frameAt(s,playhead).a.journey?.phase||s.phase):s?.phase||'현장 진행');
  const time=fieldElement('field-time');if(!time)return;
  time.textContent=clock(playhead)+' / '+clock(r.live?(s.plannedDuration||max):max);fieldElement('field-seek').max=max;fieldElement('field-seek').value=playhead;
  fieldElement('field-play').textContent=playhead>=max&&!r.live?'다시 재생':playing?'화면 일시정지':'재생 계속';
  fieldElement('field-play-status').textContent=r.live?(follow?'LIVE · 현장 수신 중':'기록 구간 관찰 · 실제 작전은 계속 진행'):(selected==='training'?'TRAINING · 사격·지원 타격 시연':'RECORDED · 저장된 현장 기록');
  const radio=(s?.radio||r.logs||[]).filter(x=>x.t<=playhead),key=String(selected)+':'+radio.length;
  if(radioKey!==key){radioKey=key;const feed=fieldElement('field-radio'),top=feed.scrollTop,nearBottom=feed.scrollHeight-feed.clientHeight-top<40,previous=feed._fieldMessages||[],append=previous.length>0&&previous.length<=radio.length&&previous.every((m,i)=>m===radio[i]);
   const markup=messages=>messages.map(x=>'<div class="field-transmission '+esc(x.kind||'radio')+'"><small>'+clock(x.t)+' <span>'+esc(x.from?x.from+' → '+x.to:x.who)+'</span></small><p>'+esc(x.msg)+'</p></div>').join('');
   if(append){if(radio.length>previous.length)feed.insertAdjacentHTML('beforeend',markup(radio.slice(previous.length)))}else feed.innerHTML=markup(radio)||'<p class="empty">첫 현장 무전을 기다리고 있습니다.</p>';
   feed._fieldMessages=radio;feed.scrollTop=nearBottom?feed.scrollHeight:top;
  }
  if(s){
   const {a}=frameAt(s,playhead),sceneUnits=a.journey?[...a.journey.inside,...(a.journey.road||[])]:[],blue=s.units.map((u,i)=>{if(!a.units[i]||(u.joinedAt||0)>playhead)return {...u,view:null};const scene=sceneUnits.find(v=>v.id===u.id),transport=a.journey&&['outbound','homebound','complete'].includes(a.journey.stage)&&!a.journey.transport.stopped?a.journey.transport:null;const data=scene?[scene.x,scene.y,scene.hp,scene.ammo,scene.status,scene.heading,0]:transport&&u.faction==='blackline'&&!['wounded','evacuated','medevac','evac-home','dead'].includes(a.units[i][4])?[transport.x,transport.y,a.units[i][2],a.units[i][3],transport.kind==='helicopter'?'airlifting':'transporting',transport.heading,0]:a.units[i];if(!data)return {...u,view:null};const view=[...data];view[7]=a.units[i]?.[7];view[8]=a.units[i]?.[8];if(view[4]==='transporting'&&a.journey&&!['outbound','homebound'].includes(a.journey.stage))view[4]='moving';return {...u,view}}).filter(u=>u.view&&u.faction==='blackline'&&(u.joinedAt||0)<=playhead);
   fieldElement('field-objective').textContent=a.objective+'%'+(a.retreat?' · 철수':'');
   fieldElement('field-strength').textContent=blue.filter(u=>(u.view[7]?u.view[7].f:u.view[2]>0)&&!['wounded','evacuated','medevac','evac-home','dead'].includes(u.view[4])).length+' / '+blue.length+'명';
   const used=s.events.filter(e=>e.kind==='shot'&&e.actor.startsWith('bl')&&e.t<=playhead).reduce((n,e)=>n+e.rounds,0);fieldElement('field-ammo').textContent=used+'발';
   const known=s.radio.some(e=>e.kind==='contact'&&e.msg.includes(s.rival.name)&&e.t<=playhead);const jf=a.journey,enemyCount=jf?((['outbound','homebound'].includes(jf.stage)?jf.road:['entry','interior','exit'].includes(jf.stage)&&jf.inside.some(u=>u.faction==='blackline')?jf.inside:(a.contacts||[]).filter(c=>c[4]&&c[6]!==false).map(c=>({faction:s.units.find(u=>u.id===c[0])?.faction}))).filter(u=>u.faction==='insurgent').length):(a.contacts||[]).filter(c=>c[4]&&c[6]!==false&&s.units.find(u=>u.id===c[0])?.faction==='insurgent').length;fieldElement('field-factions').textContent=enemyCount?'적 관측 '+enemyCount+'명':known?(s.rival.hostile?'PMC 적대 접촉':'PMC 식별 · 중립'):'접촉 확인 중';
   const rosterStamp=String(selected)+':'+a.t+':'+selectedUnit;
   if(rosterKey!==rosterStamp){rosterKey=rosterStamp;fieldElement('field-roster').innerHTML=blue.map(u=>FieldMedicalUI.card(u,u.view,states[u.view[4]]||u.view[4],selectedUnit===u.id)).join('');
   viewRoot().querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>{selectedUnit=button.dataset.unit;update()});}
   const unit=blue.find(u=>u.id===selectedUnit),aims=a.journey?([...a.journey.aims,...(a.journey.roadAims||[]),...(a.aims||[])]):(a.aims||[]),aim=aims.find(x=>x.actor===selectedUnit),targetName=aim?s.units.find(u=>u.id===aim.target)?.name:null;fieldElement('field-unit-detail').innerHTML=unit?'<strong>'+esc(unit.name)+' · '+esc(unit.role)+' · '+esc((s.orders||[]).filter(o=>o.actor===unit.id&&o.t<=playhead).slice(-1)[0]?.kind||'임무 수행')+'</strong><span>좌표 '+unit.view[0].toFixed(1)+' / '+unit.view[1].toFixed(1)+' · '+FieldMedicalUI.ammo(unit.view[8],unit.view[3])+(targetName?' · 조준 '+esc(targetName):'')+' · 상대 고도 '+Number(unit.view[6]||0)+(a.journey?.ambient?.sectors.find(v=>v.id===unit.id)?' · '+esc(a.journey.ambient.sectors.find(v=>v.id===unit.id).sector):'')+' · '+esc(states[unit.view[4]]||unit.view[4])+'</span>':'대원 또는 지도 마커를 선택하면 좌표와 잔탄을 확인할 수 있습니다.';
   fieldElement('field-after-action').textContent=!r.live&&playhead>=s.duration?(r.training?'훈련 종료 · 실제 정산 없음':(r.success?'임무 성공':'임무 목표 미달')+' · 탄약 '+(r.used??s.ammoUsed)+'발 · 기록 재생 완료'):'최종 결과는 작전 종료 시 확인할 수 있습니다.';
  }
 }
 function loop(now){raf=null;if((tab!=='observation'&&!replayMode)||document.hidden||document.body.classList.contains('start-visible'))return;const r=record(),delta=Math.min(.2,(now-(last||now))/1000);last=now;
  if(r){
   if(r.live&&follow){const t=r.tactical.time;if(t!==lastTime){lastTime=t;changedAt=now}playhead=Math.min(t,Math.max(0,t-(r.tactical.version>=2?1:13))+(now-changedAt)/(r.tactical.version>=2?1000:500)*(r.tactical.version>=2?1:13))}
   else if(playing){const max=r.tactical?.duration||390;if(playhead>=max){playing=false}else playhead=Math.min(max,playhead+delta*(r.tactical?.version>=2?1:26)*speed)}
   if(now-painted>33){painted=now;update()}
  }if(now-lastPersist>1000){lastPersist=now;try{sessionStorage.setItem('blackline_field_view',JSON.stringify({open:selected!=='training',id:selected,time:playhead,playing,follow}))}catch(e){}}raf=requestAnimationFrame(loop);
 }
 function start(){viewRoot()?.querySelectorAll('[data-camera-toggle]').forEach(b=>{b.textContent=window.fieldCameraState.follow?'추적 고정':'자유 시점';b.setAttribute('aria-pressed',String(window.fieldCameraState.follow))});viewRoot()?.querySelector('.field-console')?.classList.toggle('field-focus',expanded);document.body.classList.toggle('field-focus-open',expanded);if(raf)cancelAnimationFrame(raf);last=performance.now();painted=0;radioKey='';rosterKey='';raf=requestAnimationFrame(loop);const canvas=fieldElement('field-canvas');if(canvas){let drag=null;canvas.onpointerdown=e=>{window.fieldCameraState.dragged=false;if(!window.fieldCameraState.follow){drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId)}};canvas.onpointermove=e=>{if(!drag)return;const camera=window.fieldCameraState,dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>2)camera.dragged=true;camera.x-=dx/canvas.clientWidth*camera.width/zoom;camera.y-=dy/canvas.clientHeight*camera.height/zoom;drag={x:e.clientX,y:e.clientY};update()};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;}if(canvas)canvas.onclick=e=>{if(window.fieldCameraState.dragged)return;const r=record();if(!r?.tactical)return;const a=frameAt(r.tactical,playhead).a,box=canvas.getBoundingClientRect();if(r.tactical.journey){selectedUnit=FieldJourneyView.hitTest(e.clientX-box.left,e.clientY-box.top);update();return}let nearest=null,d=22;r.tactical.units.forEach((u,i)=>{if(u.faction!=='blackline')return;const p=screen(canvas,a.units[i][0],a.units[i][1]),distance=Math.hypot(p[0]-(e.clientX-box.left),p[1]-(e.clientY-box.top));if(distance<d){nearest=u.id;d=distance}});selectedUnit=nearest;update()}}
 const oldHome=home;home=function(){const html=oldHome();return html.replace('<div class="stats">',launchMarkup()+'<div class="stats">')};
 let mountedCanvas=null;
 window.blacklineRefreshObservation=function(){const canvas=fieldElement('field-canvas');if(tab==='observation'||replayMode){if(canvas!==mountedCanvas||!raf){mountedCanvas=canvas;start()}}else{if(raf)cancelAnimationFrame(raf);raf=null;mountedCanvas=null;expanded=false;document.body.classList.remove('field-focus-open');try{sessionStorage.removeItem('blackline_field_view')}catch(e){}}};
 const oldRender=render;render=function(){oldRender();if(replayMode)app.querySelectorAll('[id^="field-"]').forEach(el=>el.id='background-'+el.id);if(window.blacklineRenderingView)return;if(tab==='observation'||replayMode)start();else {if(raf)cancelAnimationFrame(raf);raf=null;expanded=false;document.body.classList.remove('field-focus-open');try{sessionStorage.removeItem('blackline_field_view')}catch(e){}}};
 const legacyOpen=window.blacklineOpenResultReplay;
 window.blacklineOpenResultReplay=i=>{const report=state.reports[Number(i)];if(!report)return;const title=String(report.title||'').replace(/^.*?보고\s*[·ㆍ]\s*/,'').trim();const h=state.history.find(h=>h.title===title&&h.date===report.date)||state.history.find(h=>h.title===title);if(!h)return legacyOpen(i);if(window.closeCompanyReport)window.closeCompanyReport();openFieldObservation(h.planId||h.id)};
 const legacyClose=window.blacklineCloseResultReplay;window.blacklineCloseResultReplay=()=>{legacyClose();if(tab==='observation'||replayMode)start()};
 window.blacklineOpenLegacyObservation=()=>{if(raf)cancelAnimationFrame(raf);raf=null;const r=record();if(!r||r.tactical)return;if(window.liveSelect)window.liveSelect(r.id);const overlay=document.getElementById('blackline-result-replay');window.blacklineReportViewing=true;overlay.hidden=false;overlay.innerHTML='<div class="result-replay-top"><button onclick="blacklineCloseResultReplay()">‹ 관찰실로</button><strong>이전 버전 · 추상 3D</strong></div><div class="result-replay-content">'+history()+'</div>';document.body.classList.add('result-replay-open');window.liveSeek(0);if(raf)cancelAnimationFrame(raf);raf=null};
 if(savedView?.open&&activeOps().length)tab='observation';
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(expanded)window.fieldExpand();else if(replayMode)window.closeFieldReplay()}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=null}else if(tab==='observation'||replayMode)start()});
 document.addEventListener('click',e=>{if(e.target.closest('#blackline-continue')&&tab==='observation')start()});
})();
