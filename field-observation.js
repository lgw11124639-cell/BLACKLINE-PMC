/* One observation surface for live coordinate simulation, saved replays and explicitly separate training. */
(function(){
 const esc=x=>escapeHTML(String(x??'')),clock=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
 let expanded=false,savedView=null;try{savedView=JSON.parse(sessionStorage.getItem('blackline_field_view')||'null')}catch(e){}
 let selected=savedView?.open?savedView.id:null,demo=null,playhead=savedView?.time||0,playing=savedView?.playing!==false,follow=savedView?.follow!==false,speed=1,zoom=1,cameraX=50,cameraY=33.333,labels=true,selectedUnit=null,raf=null,last=0,painted=0,radioKey='',rosterKey='',lastTime=-1,changedAt=0,lastPersist=0;
 const mapImage=new Image();mapImage.src=window.fieldSimulation.MAP.image;
 const colors={blackline:'#3567d6',insurgent:'#d25343',pmc:'#bc8c2c'};
 const states={moving:'이동',engaging:'교전',holding:'경계',patrol:'순찰',guarding:'경계',wounded:'전투 불능',dead:'사망',captured:'구금',retreating:'철수',evacuated:'후송',retreated:'이탈'};
 const activeOps=()=>state.operations.filter(o=>o.status==='현장 진행 중'&&o.fieldProgress?.tactical);
 function record(){
  if(selected==='training')return demo;
  const op=state.operations.find(o=>o.id===selected&&o.fieldProgress?.tactical);
  if(op)return {id:op.id,title:op.contract?.title||'현장 작전',date:op.created,tactical:op.fieldProgress.tactical,live:true};
  return state.history.find(h=>String(h.planId||h.id)===String(selected))||null;
 }
 function available(){return [...activeOps().map(o=>({id:o.id,title:o.contract?.title||o.id,live:true})),...state.history.map(h=>({id:h.planId||h.id,title:h.title,date:h.date,legacy:!h.tactical}))]}
 function launchMarkup(){const count=activeOps().length;return '<div class="observation-launch"><div><small>FIELD OBSERVATION</small><strong>'+(count?'현장 작전 '+count+'건 · 실시간 연결 가능':'지도 위에서 작전의 흐름을 읽다')+'</strong><p>대원 이동, 현장 무전, 교전과 화력 지원을 한 화면에서.</p></div><button class="btn" type="button" onclick="openFieldObservation()">작전 관찰 · 다시보기 <span aria-hidden="true">↗</span></button></div>'}
 window.observation=function(){
  const list=available();if(!selected&&list.length)selected=list[0].id;
  const r=record(),s=r?.tactical;
  const title=r?.title||'현장 관찰실';
  return '<section class="field-console"><div class="field-console-head"><div><small>BLACKLINE / FIELD COMMAND</small><h2>'+esc(title)+'</h2><p>'+(r?.live?'현재 진행 중인 좌표 시뮬레이션 · 현장 지휘관 자율 판단':selected==='training'?'훈련 시연 · 회사 자금·탄약·대원 기록에 반영되지 않습니다':r?'저장된 작전 기록 · 재생은 정산과 기록을 변경하지 않습니다':'실제 작전은 준비와 출동이 완료되면 이곳에 표시됩니다.')+'</p></div><span class="field-mode '+(r?.live?'is-live':'')+'">'+(r?.live?'● LIVE':selected==='training'?'TRAINING':r?'REPLAY':'STANDBY')+'</span></div>'+
  '<div class="field-sessionbar"><label>작전 선택<select id="field-record" onchange="openFieldObservation(this.value)"><option value="">기록 선택</option>'+list.map(o=>'<option value="'+esc(o.id)+'" '+(String(o.id)===String(selected)?'selected':'')+'>'+(o.live?'● LIVE · ':o.legacy?'이전 기록 · ':'다시보기 · ')+esc(o.title)+'</option>').join('')+(demo?'<option value="training" '+(selected==='training'?'selected':'')+'>훈련 시연 · 세라 산업지구</option>':'')+'</select></label><button class="btn secondary" type="button" onclick="fieldTraining()">훈련 시연 보기</button></div>'+
  (!r?'<div class="field-empty"><span class="field-empty-symbol">◎</span><h3>먼저 훈련 현장을 살펴보세요</h3><p>좌표 이동과 사격, 포격·공습의 과정을 지금 관찰할 수 있습니다.<br>실제 회사의 작전이 시작되면 LIVE로 연결됩니다.</p><button class="btn" type="button" onclick="fieldTraining()">훈련 시연 시작</button></div>':
  '<div class="field-layout"><div class="field-map-column"><div class="field-map-toolbar"><span><i></i> INDUSTRIAL DISTRICT / TERRAIN 01</span><div><button type="button" aria-label="지도 축소" onclick="fieldZoom(-.25)">−</button><button type="button" aria-label="지도 확대" onclick="fieldZoom(.25)">+</button><button type="button" onclick="fieldExpand()" aria-label="지도 집중 화면">크게</button><button type="button" onclick="fieldLabels()" aria-pressed="'+labels+'">이름</button></div></div><div class="field-map-shell"><canvas id="field-canvas" aria-label="대원 좌표와 교전 및 지원 타격을 표시하는 작전지도" role="img"></canvas><div class="field-map-stamp">TACTICAL OVERLAY <span>좌표 단위 · 가상 현장</span></div><div class="field-map-scale">0 ━━━ 20 <span>GRID</span></div></div><div class="field-legend"><span><i style="background:#3567d6"></i>BLACKLINE</span><span><i style="background:#d25343"></i>무장세력</span><span><i style="background:#bc8c2c"></i>다른 PMC</span><span class="field-map-hint">대원 선택 · 확대 시 추적</span></div>'+
  (!s?'<p class="field-legacy-note">이전 버전의 기록에는 좌표가 저장되지 않았습니다. 원래 무전 기록을 재생합니다.</p><button class="btn secondary" onclick="blacklineOpenLegacyObservation()">기존 3D 관찰 화면</button>':'')+
  '<div class="field-playback"><div><span id="field-play-status"></span><strong id="field-time">00:00</strong></div><input id="field-seek" type="range" min="0" max="'+(s?.time||390)+'" value="0" aria-label="작전 기록 시간 이동" oninput="fieldSeek(this.value)"><div class="field-play-controls"><button class="btn" id="field-play" type="button" onclick="fieldToggle()">일시정지</button><button class="btn secondary" type="button" onclick="fieldRestart()">처음부터</button>'+(r.live?'<button class="field-follow" onclick="fieldFollow()">LIVE 따라가기</button>':'')+'<button class="field-speed" onclick="fieldSpeed()" aria-label="기록 재생 배속">'+speed+'× 재생</button></div></div><div class="field-kpis"><div><small>임무 목표</small><strong id="field-objective">—</strong></div><div><small>아군 현황</small><strong id="field-strength">—</strong></div><div><small>실제 소모 탄약</small><strong id="field-ammo">—</strong></div><div><small>접촉 세력</small><strong id="field-factions">—</strong></div></div><div id="field-roster" class="field-roster"></div><div id="field-unit-detail" class="field-unit-detail"></div></div><aside class="field-radio-column"><div class="field-radio-title"><div><small>COMMS / CHANNEL 01</small><h3>현장 무전</h3></div><span class="field-radio-indicator">수신</span></div><div id="field-radio" class="field-radio" role="log" aria-live="off"></div><div id="field-after-action" class="field-after-action">최종 결과는 작전 종료 시 확인할 수 있습니다.</div></aside></div>')+'</section>';
 };
 window.openFieldObservation=function(id){
  const list=available();selected=id||list[0]?.id||null;playhead=0;playing=true;follow=true;radioKey='';lastTime=-1;selectedUnit=null;zoom=1;
  go('observation');
 };
 window.fieldTraining=function(){
  const people=[{id:901,name:'한서준',role:'팀장',skill:88},{id:902,name:'정도윤',role:'정찰',skill:85},{id:903,name:'박시온',role:'의무',skill:82},{id:904,name:'강태오',role:'저격수',skill:91}];
  const op={leaderName:'한서준',fieldProgress:{seed:271,supportOrders:[{name:'승인된 공중 지원',requestedAt:65,eta:26},{name:'승인된 원거리 지원',requestedAt:143,eta:26}]}};
  const s=window.fieldSimulation.create(op,{id:99,risk:3,type:'시설 보안'},people,240,{forceContact:true,factions:[{id:'training-pmc',name:'KESTREL GROUP',relation:25,doctrine:'독점 경비'}]});
  while(!s.done)window.fieldSimulation.step(s,op);
  demo={id:'training',title:'훈련 시연 · 세라 산업지구',tactical:s,training:true,success:window.fieldSimulation.outcome(s).success};
  selected='training';playhead=0;playing=true;follow=false;radioKey='';lastTime=-1;selectedUnit=null;zoom=1;go('observation');
 };
 window.fieldToggle=()=>{playing=!playing;if(record()?.live)follow=playing;update()};
 window.fieldSeek=v=>{playhead=Math.max(0,Number(v)||0);playing=false;follow=false;update()};
 window.fieldRestart=()=>{playhead=0;follow=false;playing=true;radioKey='';update()};
 window.fieldSpeed=()=>{speed=speed===.5?1:speed===1?2:speed===2?4:.5;const el=document.querySelector('.field-speed');if(el)el.textContent=speed+'× 재생'};
 window.fieldFollow=()=>{follow=true;playing=true;update()};
 window.fieldExpand=()=>{expanded=!expanded;document.querySelector('.field-console')?.classList.toggle('field-focus',expanded);document.body.classList.toggle('field-focus-open',expanded);const b=document.querySelector('[onclick="fieldExpand()"]');if(b)b.textContent=expanded?'닫기':'크게'};
 window.fieldZoom=d=>{zoom=Math.max(1,Math.min(2.5,zoom+d))};
 window.fieldLabels=()=>{labels=!labels;const b=document.querySelector('[onclick="fieldLabels()"]');if(b)b.setAttribute('aria-pressed',String(labels))};
 function frameAt(s,t){let a=s.frames[0],b=a;for(const f of s.frames){if(f.t<=t)a=f;if(f.t>=t){b=f;break}b=f}return {a,b,p:b.t===a.t?1:Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t)))}}
 function screen(canvas,x,y){return [(x-cameraX)*zoom/100*canvas.clientWidth+canvas.clientWidth/2,(y-cameraY)*zoom/66.667*canvas.clientHeight+canvas.clientHeight/2]}
 function drawMap(canvas,r,t){
  const s=r.tactical,dpr=Math.min(devicePixelRatio||1,1.5),w=canvas.clientWidth,h=canvas.clientHeight;
  if(!w||!h)return;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
  const c=canvas.getContext('2d');if(!c)return;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);c.fillStyle='#e1e7dc';c.fillRect(0,0,w,h);
  cameraX=50;cameraY=33.333;if(s&&selectedUnit&&zoom>1){const sample=frameAt(s,t),index=s.units.findIndex(u=>u.id===selectedUnit),v=sample.a.units[index],next=sample.b.units[index];if(v){cameraX=Math.max(50/zoom,Math.min(100-50/zoom,v[0]+((next?.[0]??v[0])-v[0])*sample.p));cameraY=Math.max(33.333/zoom,Math.min(66.667-33.333/zoom,v[1]+((next?.[1]??v[1])-v[1])*sample.p))}}
  c.save();c.translate(w/2,h/2);c.scale(zoom,zoom);c.translate(-cameraX/100*w,-cameraY/66.667*h);if(mapImage.complete&&mapImage.naturalWidth)c.drawImage(mapImage,0,0,w,h);else{c.fillStyle='#bdc7c9';c.fillRect(0,h*31/66.667,w,h*6/66.667);c.fillRect(w*.64,0,w*.06,h);c.fillStyle='#b4c0b5';for(const b of fieldSimulation.MAP.buildings)c.fillRect(b[0]/100*w,b[1]/66.667*h,(b[2]-b[0])/100*w,(b[3]-b[1])/66.667*h)}c.restore();
  c.fillStyle='rgba(245,249,255,.08)';c.fillRect(0,0,w,h);
  c.strokeStyle='rgba(255,255,255,.23)';c.lineWidth=.5;for(let i=1;i<10;i++){c.beginPath();c.moveTo(i*w/10,0);c.lineTo(i*w/10,h);c.stroke()}for(let i=1;i<7;i++){c.beginPath();c.moveTo(0,i*h/7);c.lineTo(w,i*h/7);c.stroke()}
  if(!s)return;
  const {a,b,p}=frameAt(s,t),[gx,gy]=screen(canvas,...s.goal);
  c.beginPath();c.arc(gx,gy,17+Math.sin(t*.25)*2,0,Math.PI*2);c.strokeStyle='#f8e8b8';c.lineWidth=2;c.setLineDash([5,4]);c.stroke();c.setLineDash([]);label(c,'OBJECTIVE',gx+23,gy-9,'#5b4b22');
  for(const e of s.events){const age=t-e.t;if(age<0||age>24)continue;
   if(e.kind==='shot'&&age<10){const from=screen(canvas,...e.from),to=screen(canvas,...e.to),progress=(age*e.rounds/10)%1;const x=from[0]+(to[0]-from[0])*progress,y=from[1]+(to[1]-from[1])*progress;
    c.globalAlpha=Math.max(.12,1-age/10);c.strokeStyle=e.actor.startsWith('bl')?'#ffebac':'#ffb37e';c.lineWidth=1.6;c.beginPath();c.moveTo(x-(to[0]-from[0])*.12,y-(to[1]-from[1])*.12);c.lineTo(x,y);c.stroke();c.fillStyle='#fff4bc';c.beginPath();c.arc(from[0],from[1],2.2+Math.sin(age*2),0,Math.PI*2);c.fill();if(e.hit&&age>2){c.fillStyle='#e3c48b';c.beginPath();c.arc(to[0],to[1],2,0,Math.PI*2);c.fill()}c.globalAlpha=1;
   }
   if(e.kind==='airstrike'||e.kind==='artillery'){
    const [x,y]=screen(canvas,e.x,e.y);const radius=e.radius*w/100*zoom;
    if(e.kind==='airstrike'&&age<14){const flight=age/14,px=x-w*.6+flight*w*1.2,py=y-80+flight*160;c.save();c.translate(px,py);c.rotate(.24);c.fillStyle='#607488';c.shadowColor='#30415266';c.shadowBlur=8;c.beginPath();c.moveTo(18,0);c.lineTo(-9,-4);c.lineTo(-17,-18);c.lineTo(-20,-17);c.lineTo(-16,-2);c.lineTo(-25,-1);c.lineTo(-28,-7);c.lineTo(-31,-6);c.lineTo(-29,0);c.lineTo(-31,6);c.lineTo(-28,7);c.lineTo(-25,1);c.lineTo(-16,2);c.lineTo(-20,17);c.lineTo(-17,18);c.lineTo(-9,4);c.closePath();c.fill();c.restore()}
    if(e.kind==='artillery'&&age<4){const start=screen(canvas,4,62),q=age/4;c.beginPath();c.moveTo(start[0],start[1]);c.quadraticCurveTo((start[0]+x)/2,y-100,x,y);c.setLineDash([3,5]);c.strokeStyle='#d6a758';c.lineWidth=1.3;c.stroke();c.setLineDash([]);c.fillStyle='#fff1bc';c.beginPath();c.arc(start[0]+(x-start[0])*q,start[1]+(y-start[1])*q-Math.sin(q*Math.PI)*70,3,0,Math.PI*2);c.fill()}
    const blastAge=age;if(blastAge>=0){const q=Math.min(1,blastAge/18);c.globalAlpha=(1-q)*.7;const grad=c.createRadialGradient(x,y,0,x,y,radius*(.2+q));grad.addColorStop(0,'#fff3c4');grad.addColorStop(.3,'#f4ae55');grad.addColorStop(.7,'#cba17899');grad.addColorStop(1,'#a89d8b00');c.fillStyle=grad;c.beginPath();c.arc(x,y,radius*(.2+q),0,Math.PI*2);c.fill();c.globalAlpha=(1-q)*.42;c.fillStyle='#c6c4bc';for(let n=0;n<5;n++){c.beginPath();c.arc(x+Math.sin(n*7)*radius*.4,y-blastAge*1.6+Math.cos(n*4)*radius*.25,radius*(.18+q*.5),0,Math.PI*2);c.fill()}c.globalAlpha=1}
   }
  }
  s.units.forEach((u,i)=>{
   const v=a.units[i],next=b.units[i]||v;if(!v)return;const [x,y]=screen(canvas,v[0]+(next[0]-v[0])*p,v[1]+(next[1]-v[1])*p),color=colors[u.faction],down=v[2]<=0||v[4]==='captured';
   if(selectedUnit===u.id){c.beginPath();c.arc(x,y,15,0,Math.PI*2);c.strokeStyle='#fff';c.lineWidth=2;c.stroke();c.beginPath();c.arc(x,y,18,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=1;c.stroke()}
   c.save();c.translate(x,y);if(down){c.strokeStyle=v[4]==='captured'?'#dcbf7e':'#a07970';c.lineWidth=2;c.beginPath();c.moveTo(-4,-4);c.lineTo(4,4);c.moveTo(4,-4);c.lineTo(-4,4);c.stroke()}else{
    const recent=s.events.findLast?.(e=>e.kind==='shot'&&e.actor===u.id&&e.t<=t)||null;const angle=recent?Math.atan2(recent.to[1]-v[1],recent.to[0]-v[0]):Math.atan2(next[1]-v[1],next[0]-v[0]);c.rotate(angle);
    c.fillStyle='#182d4433';c.beginPath();c.ellipse(2,3,7,4,0,0,Math.PI*2);c.fill();c.strokeStyle='#fff';c.lineWidth=1.5;c.strokeStyle=color;c.lineWidth=2;const gait=/moving|retreating/.test(v[4])?Math.sin(t*2+i)*2:0;c.beginPath();c.moveTo(-3,-2);c.lineTo(-7,-3+gait);c.moveTo(-3,2);c.lineTo(-7,3-gait);c.stroke();c.fillStyle=color;c.beginPath();if(c.roundRect)c.roundRect(-5,-4,10,8,2);else c.rect(-5,-4,10,8);c.fill();c.stroke();c.fillStyle='#ead9b8';c.beginPath();c.arc(2,0,2.4,0,Math.PI*2);c.fill();c.fillStyle='#374958';c.fillRect(5,0,7,2);
   }c.restore();
   if(labels&&!down)label(c,u.faction==='blackline'?u.name:u.faction==='pmc'?'PMC '+(i+1):'HOSTILE',x+10,y-11,color);
   if(!down){c.fillStyle='#fff9';c.fillRect(x-7,y+9,14,2);c.fillStyle=v[2]>55?color:'#d2745a';c.fillRect(x-7,y+9,14*v[2]/100,2)}
  });
 }
 function label(c,text,x,y,color){c.font='600 9px -apple-system,sans-serif';const size=c.measureText(text).width;c.fillStyle='#fffffff0';c.fillRect(x-4,y-9,size+8,14);c.fillStyle=color;c.fillText(text,x,y+1)}
 function update(){
  const r=record(),canvas=document.getElementById('field-canvas');if(!r||!canvas)return;
  const s=r.tactical,max=s?(r.live?s.time:s.duration):Math.max(390,...(r.logs||[]).map(x=>x.t));playhead=Math.max(0,Math.min(max,playhead));
  drawMap(canvas,r,playhead);
  const time=document.getElementById('field-time');if(!time)return;
  time.textContent=clock(playhead)+' / '+clock(max);document.getElementById('field-seek').max=max;document.getElementById('field-seek').value=playhead;
  document.getElementById('field-play').textContent=playhead>=max&&!r.live?'다시 재생':playing?'화면 일시정지':'재생 계속';
  document.getElementById('field-play-status').textContent=r.live?(follow?'LIVE · 현장 수신 중':'기록 구간 관찰 · 실제 작전은 계속 진행'):(selected==='training'?'TRAINING · 사격·지원 타격 시연':'RECORDED · 저장된 현장 기록');
  const radio=(s?.radio||r.logs||[]).filter(x=>x.t<=playhead),key=String(selected)+':'+radio.length;
  if(radioKey!==key){radioKey=key;const feed=document.getElementById('field-radio');feed.innerHTML=radio.map(x=>'<div class="field-transmission '+esc(x.kind||'radio')+'"><small>'+clock(x.t)+' <span>'+esc(x.who)+'</span></small><p>'+esc(x.msg)+'</p></div>').join('')||'<p class="empty">첫 현장 무전을 기다리고 있습니다.</p>';feed.scrollTop=feed.scrollHeight}
  if(s){
   const {a}=frameAt(s,playhead),blue=s.units.map((u,i)=>({...u,view:a.units[i]})).filter(u=>u.faction==='blackline');
   document.getElementById('field-objective').textContent=a.objective+'%'+(a.retreat?' · 철수':'');
   document.getElementById('field-strength').textContent=blue.filter(u=>u.view[2]>0).length+' / '+blue.length+'명';
   const used=s.events.filter(e=>e.kind==='shot'&&e.actor.startsWith('bl')&&e.t<=playhead).reduce((n,e)=>n+e.rounds,0);document.getElementById('field-ammo').textContent=used+'발';
   const known=s.radio.some(e=>e.kind==='contact'&&e.who==='정찰 담당'&&e.t<=playhead);document.getElementById('field-factions').textContent=known?(s.rival.hostile?'PMC 적대 접촉':'PMC 식별 · 중립'):'접촉 확인 중';
   const rosterStamp=String(selected)+':'+a.t+':'+selectedUnit;
   if(rosterKey!==rosterStamp){rosterKey=rosterStamp;document.getElementById('field-roster').innerHTML=blue.map(u=>'<button type="button" class="'+(selectedUnit===u.id?'selected':'')+'" data-unit="'+esc(u.id)+'"><i style="background:'+colors.blackline+'"></i><span>'+esc(u.name)+'</span><small>'+esc(states[u.view[4]]||u.view[4])+'</small><strong>'+u.view[2]+'<em> HP</em></strong></button>').join('');
   document.querySelectorAll('[data-unit]').forEach(button=>button.onclick=()=>{selectedUnit=button.dataset.unit;update()});}
   const unit=blue.find(u=>u.id===selectedUnit);document.getElementById('field-unit-detail').innerHTML=unit?'<strong>'+esc(unit.name)+' · '+esc(unit.role)+'</strong><span>좌표 '+unit.view[0].toFixed(1)+' / '+unit.view[1].toFixed(1)+' · 잔탄 '+unit.view[3]+'발 · '+esc(states[unit.view[4]]||unit.view[4])+'</span>':'대원 또는 지도 마커를 선택하면 좌표와 잔탄을 확인할 수 있습니다.';
   document.getElementById('field-after-action').textContent=!r.live&&playhead>=s.duration?(r.training?'훈련 종료 · 실제 정산 없음':(r.success?'임무 성공':'임무 목표 미달')+' · 탄약 '+(r.used??s.ammoUsed)+'발 · 기록 재생 완료'):'최종 결과는 작전 종료 시 확인할 수 있습니다.';
  }
 }
 function loop(now){raf=null;if(tab!=='observation'||document.hidden||document.body.classList.contains('start-visible'))return;const r=record(),delta=Math.min(.2,(now-(last||now))/1000);last=now;
  if(r){
   if(r.live&&follow){const t=r.tactical.time;if(t!==lastTime){lastTime=t;changedAt=now}playhead=Math.min(t,Math.max(0,t-13)+(now-changedAt)/500*13)}
   else if(playing){const max=r.tactical?.duration||390;if(playhead>=max){playing=false}else playhead=Math.min(max,playhead+delta*26*speed)}
   if(now-painted>33){painted=now;update()}
  }if(now-lastPersist>1000){lastPersist=now;try{sessionStorage.setItem('blackline_field_view',JSON.stringify({open:selected!=='training',id:selected,time:playhead,playing,follow}))}catch(e){}}raf=requestAnimationFrame(loop);
 }
 function start(){document.querySelector('.field-console')?.classList.toggle('field-focus',expanded);document.body.classList.toggle('field-focus-open',expanded);if(raf)cancelAnimationFrame(raf);last=performance.now();painted=0;radioKey='';rosterKey='';raf=requestAnimationFrame(loop);const canvas=document.getElementById('field-canvas');if(canvas)canvas.onclick=e=>{const r=record();if(!r?.tactical)return;const a=frameAt(r.tactical,playhead).a,box=canvas.getBoundingClientRect();let nearest=null,d=22;r.tactical.units.forEach((u,i)=>{const p=screen(canvas,a.units[i][0],a.units[i][1]),distance=Math.hypot(p[0]-(e.clientX-box.left),p[1]-(e.clientY-box.top));if(distance<d){nearest=u.id;d=distance}});selectedUnit=nearest;update()}}
 const oldHome=home;home=function(){const html=oldHome();return html.replace('<div class="stats">',launchMarkup()+'<div class="stats">')};
 const oldRender=render;render=function(){oldRender();if(tab==='observation')start();else {if(raf)cancelAnimationFrame(raf);raf=null;expanded=false;document.body.classList.remove('field-focus-open');try{sessionStorage.removeItem('blackline_field_view')}catch(e){}}};
 const legacyOpen=window.blacklineOpenResultReplay;
 window.blacklineOpenResultReplay=i=>{const report=state.reports[Number(i)];if(!report)return;const title=String(report.title||'').replace(/^.*?보고\s*[·ㆍ]\s*/,'').trim();const h=state.history.find(h=>h.title===title&&h.date===report.date)||state.history.find(h=>h.title===title);if(!h)return legacyOpen(i);if(window.closeCompanyReport)window.closeCompanyReport();openFieldObservation(h.planId||h.id)};
 const legacyClose=window.blacklineCloseResultReplay;window.blacklineCloseResultReplay=()=>{legacyClose();if(tab==='observation')start()};
 window.blacklineOpenLegacyObservation=()=>{if(raf)cancelAnimationFrame(raf);raf=null;const r=record();if(!r||r.tactical)return;if(window.liveSelect)window.liveSelect(r.id);const overlay=document.getElementById('blackline-result-replay');window.blacklineReportViewing=true;overlay.hidden=false;overlay.innerHTML='<div class="result-replay-top"><button onclick="blacklineCloseResultReplay()">‹ 관찰실로</button><strong>이전 버전 · 추상 3D</strong></div><div class="result-replay-content">'+history()+'</div>';document.body.classList.add('result-replay-open');window.liveSeek(0)};
 if(savedView?.open&&record())tab='observation';
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded)window.fieldExpand()});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){if(raf)cancelAnimationFrame(raf);raf=null}else if(tab==='observation')start()});
 document.addEventListener('click',e=>{if(e.target.closest('#blackline-continue')&&tab==='observation')start()});
})();
