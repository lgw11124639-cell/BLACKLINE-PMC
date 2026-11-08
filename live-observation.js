/* BLACKLINE PMC: read-only live operations room. In-memory clock, compact event stream. */
(function(){
let timer=null,elapsed=0,currentId=null,playing=false,speed=1,renderedCount=-1;
const baseRender=render,baseGo=go,baseNext=nextDay,baseHistory=history;
const esc=x=>escapeHTML(String(x??''));
const clock=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');
const current=()=>state.history.find(x=>x.id===currentId)||state.history[replayIndex]||state.history[0];
const duration=r=>Math.max(390,...(r.logs||[]).map(x=>x.t));
function stop(){if(timer)clearInterval(timer);timer=null;playing=false}
function status(r){if(elapsed>=duration(r))return '작전 종료 · 최종 보고 접수';if(playing)return '현장 무전 수신 중';return '관전 일시정지'}
function events(r){return [...(r.logs||[])].sort((a,b)=>a.t-b.t)}
function draw(){
 const r=current(),feed=document.getElementById('live-radio');if(!r||!feed)return;
 const max=duration(r),logs=events(r).filter(x=>x.t<=elapsed);
 const time=document.getElementById('live-clock'),range=document.getElementById('live-progress'),st=document.getElementById('live-status');
 if(time)time.textContent=clock(elapsed);if(range){range.value=elapsed;range.max=max}if(st)st.textContent=status(r);
 const label=document.getElementById('live-phase');if(label)label.textContent=elapsed<90?'투입 및 상태 확인':elapsed<220?'현장 임무 수행':elapsed<330?'상황 대응 및 복귀 준비':'종료 보고';
 const budget=document.getElementById('live-spent');if(budget){const spent=(r.supportDecisions||[]).filter(x=>x.requestedAt<=elapsed).reduce((a,x)=>a+x.cost,0);budget.textContent=money(spent)+' / '+money(r.budget||0)}
 const support=document.getElementById('live-support');if(support){const items=(r.supportDecisions||[]).filter(x=>x.requestedAt<=elapsed);support.innerHTML=items.length?items.map(x=>'<div class="ops-support-item"><strong>'+esc(x.name)+'</strong><span>'+ (elapsed>=x.requestedAt+x.eta?'지원 처리 완료':'지원 대기 · 예상 '+clock(x.requestedAt+x.eta))+'</span></div>').join(''):'<p class="empty">현장 지원 요청 없음</p>'}
 if(renderedCount!==logs.length){feed.innerHTML=logs.map(x=>'<div class="ops-radio-line"><small>'+clock(x.t)+' · '+esc(x.who)+'</small><p>'+esc(x.msg)+'</p></div>').join('')||'<p class="empty">현장 지휘관의 첫 무전을 기다리고 있습니다.</p>';feed.scrollTop=feed.scrollHeight;renderedCount=logs.length}
 const dots=document.querySelectorAll('.ops-team-dot');dots.forEach((dot,i)=>{const progress=elapsed/max;dot.style.left=(14+i*13+progress*30)+'%';dot.style.top=(48+(i%2)*10+Math.sin(progress*4+i)*6)+'%'});
 const result=document.getElementById('live-result');if(result)result.innerHTML=elapsed>=max?'<strong class="'+(r.success?'ops-ok':'ops-danger')+'">'+(r.success?'임무 성공':'임무 실패')+'</strong><span> · 정산 '+money(r.reward-(r.supportCost||0))+' · '+(r.injury?'부상 발생':'부상 없음')+'</span>':'<span>최종 결과는 작전 종료 후 공개됩니다.</span>';
 const play=document.getElementById('live-play');if(play)play.textContent=elapsed>=max?'다시 관전':playing?'일시정지':'관전 계속';
 if(window.ops3dUpdate)window.ops3dUpdate(elapsed,max);
 if(elapsed>=max){stop();if(state.liveMissionId===r.id){state.liveMissionId=null;save()}}
}
function play(){const r=current();if(!r)return;stop();if(elapsed>=duration(r))elapsed=0;playing=true;draw();timer=setInterval(()=>{if((tab!=='history'&&!window.blacklineReportViewing)||document.hidden){stop();draw();return}elapsed=Math.min(duration(r),elapsed+Math.max(1,Math.round(4*speed)));draw()},200)}
window.liveToggle=()=>{if(playing){stop();draw()}else play()};
window.liveRestart=()=>{elapsed=0;renderedCount=-1;play()};
window.liveSpeed=v=>{speed=Number(v)||1;document.querySelectorAll('.ops-speed').forEach(x=>x.classList.toggle('active',Number(x.dataset.speed)===speed))};
window.liveSeek=v=>{elapsed=Math.max(0,Number(v)||0);renderedCount=-1;draw()};
window.liveSelect=id=>{const idx=state.history.findIndex(x=>String(x.id)===String(id));if(idx<0)return;stop();replayIndex=idx;currentId=state.history[idx].id;elapsed=0;renderedCount=-1;render();draw()};
window.liveObserve=id=>{if(window.blacklineDisableAutoObservation){state.liveMissionId=null;save();return;}const idx=state.history.findIndex(x=>x.id===id);if(idx<0)return;stop();replayIndex=idx;currentId=id;elapsed=0;renderedCount=-1;tab='history';render();play();window.scrollTo(0,0)};
function markup(r){
 const isActive=state.liveMissionId===r.id&&elapsed<duration(r);
 return '<section class="ops-room"><div class="ops-room-top"><span class="ops-eyebrow">BLACKLINE / OPERATIONS CENTER</span><span class="ops-live-dot">'+(isActive?'● LIVE':'● REPLAY')+'</span></div><h2>'+esc(r.title)+'</h2><div class="ops-meta"><span>'+esc(r.date)+'</span><span>현장지휘관 자율 지휘</span><span>사장 관찰 전용</span></div><div class="ops-map ops-map-3d"><div id="ops-3d" data-mission="'+esc(r.id)+'" data-team="'+r.team.length+'"></div><div id="ops-3d-fallback"><div class="ops-grid"></div><div class="ops-map-head">FIELD OBSERVATION · SIMULATED</div><div class="ops-zone ops-zone-a"></div><div class="ops-zone ops-zone-b"></div><div class="ops-route"></div>'+r.team.map((n,i)=>'<span class="ops-team-dot" title="'+esc(n)+'" style="left:'+(14+i*13)+'%;top:'+(48+(i%2)*10)+'%">'+(i+1)+'</span>').join('')+'</div><span class="ops-map-foot">현장 인원 '+r.team.length+'명 · 저사양 3D 관전 / 추상 위치</span></div><div class="ops-stats"><div><small>작전 단계</small><strong id="live-phase">투입 및 상태 확인</strong></div><div><small>현장 지원비 / 한도</small><strong id="live-spent">0원</strong></div></div><div class="ops-progress"><span id="live-status">무전 수신 대기</span><strong id="live-clock">00:00</strong></div><input aria-label="작전 시간 이동" type="range" id="live-progress" min="0" max="'+duration(r)+'" value="0" oninput="liveSeek(this.value)"><div class="ops-controls"><button class="btn" id="live-play" onclick="liveToggle()">관전 시작</button><button class="btn secondary" onclick="liveRestart()">처음부터</button><div class="ops-speeds"><button class="ops-speed active" data-speed="1" onclick="liveSpeed(1)">1×</button><button class="ops-speed" data-speed="2" onclick="liveSpeed(2)">2×</button><button class="ops-speed" data-speed="4" onclick="liveSpeed(4)">4×</button></div></div><div class="ops-columns"><section><h3>현장 무전 · 자동 수신</h3><div id="live-radio" class="ops-radio" role="log" aria-live="off"></div></section><section><h3>지원 요청 및 도착 현황</h3><div id="live-support" class="ops-support"></div><h3>작전 결과</h3><div id="live-result" class="ops-result"></div></section></div><p class="ops-disclaimer">관찰 전용 상황실 · 지휘 및 지원 결정은 현장지휘관이 자동 수행합니다. 무전과 지도는 게임 내 가상 시뮬레이션입니다.</p></section><div class="ops-archive"><label>작전 다시보기 <select onchange="liveSelect(this.value)">'+state.history.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===r.id?'selected':'')+'>'+esc(x.date)+' · '+esc(x.title)+'</option>').join('')+'</select></label></div>';
}
history=function(){const r=current();if(!r)return baseHistory();if(currentId!==r.id){currentId=r.id;elapsed=0;renderedCount=-1;stop()}return markup(r)};
render=function(){baseRender();if(tab==='history')draw()};
go=function(t){if(t!=='history'){stop();if(window.ops3dDispose)window.ops3dDispose()}baseGo(t);if(t==='history')draw()};
nextDay=function(){const old=state.history[0]?.id;baseNext();const newest=state.history[0];if(newest&&newest.id!==old){state.liveMissionId=newest.id;save();window.liveObserve(newest.id)}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
window.addEventListener('pagehide',stop);
})();