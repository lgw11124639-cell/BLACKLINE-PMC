/* Live mission observation: accelerated, synchronized radio feed. Only replay cursor in memory. */
(function(){
let timer=null,elapsed=0,currentId=null,playing=false;
const originalHistory=history;
const originalGo=go;
const originalRender=render;
function current(){return state.history.find(x=>x.id===currentId)||state.history[0]}
function clock(t){return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}
function stop(){if(timer){clearInterval(timer);timer=null}playing=false}
function draw(){
 const r=current(),el=document.getElementById('live-radio');
 if(!r||!el)return;
 const max=Math.max(390,...r.logs.map(x=>x.t));const shown=r.logs.filter(x=>x.t<=elapsed);
 document.getElementById('live-clock').textContent=clock(elapsed);
 document.getElementById('live-progress').value=elapsed;
 document.getElementById('live-progress').max=max;
 document.getElementById('live-status').textContent=elapsed>=max?'작전 종료 · 최종 보고 접수':playing?'작전 진행 중 · 무전 수신':'일시정지';
 el.innerHTML=shown.map(x=>'<div class="live-message"><small>'+clock(x.t)+' · '+escapeHTML(x.who)+'</small><p>'+escapeHTML(x.msg)+'</p></div>').join('')||'<p class="empty">작전 개시 신호를 대기하고 있습니다.</p>';
 const dots=document.querySelectorAll('.live-operator');
 dots.forEach((dot,i)=>{const progress=elapsed/max;dot.style.left=(12+i*12+progress*35)+'%';dot.style.top=(40+(i%2)*11+Math.sin(progress*4+i)*8)+'%'});
 if(elapsed>=max){stop();if(state.liveMissionId===r.id){state.liveMissionId=null;save()}document.getElementById('live-status').textContent='작전 종료 · 최종 보고 접수';document.getElementById('live-play').textContent='다시 재생'}
}
function play(){const r=current();if(!r)return;stop();const max=Math.max(390,...r.logs.map(x=>x.t));if(elapsed>=max)elapsed=0;playing=true;draw();timer=setInterval(()=>{if(tab!=='history'){stop();return}elapsed=Math.min(max,elapsed+5);draw()},250)}
window.liveToggle=function(){if(playing){stop();draw()}else play()};
window.liveSeek=function(v){elapsed=Number(v)||0;draw()};
window.liveRestart=function(){elapsed=0;play()};
window.liveObserve=function(id){const idx=state.history.findIndex(x=>x.id===id);if(idx<0)return;replayIndex=idx;currentId=id;elapsed=0;tab='history';originalRender();play();window.scrollTo(0,0)};
function liveMarkup(r){
 const max=Math.max(390,...r.logs.map(x=>x.t));
 return '<div class="live-view"><div class="line"><strong>작전 상황실 · LIVE</strong><span class="live-pill">SIMULATED FEED</span></div><h2>'+escapeHTML(r.title)+'</h2><div class="live-map"><div class="live-map-grid"></div>'+r.team.map((name,i)=>'<div class="live-operator" title="'+escapeHTML(name)+'" style="left:'+(12+i*12)+'%;top:'+(40+(i%2)*11)+'%"></div>').join('')+'<div class="live-map-label">OBSERVATION 01 · '+escapeHTML(r.date||'')+'</div></div><div class="line"><span id="live-status">작전 진행 중</span><strong id="live-clock">00:00</strong></div><input type="range" id="live-progress" min="0" max="'+max+'" value="0" oninput="liveSeek(this.value)" style="width:100%;accent-color:#a6dfc0"><div class="btnrow"><button class="btn" id="live-play" onclick="liveToggle()">재생 / 일시정지</button><button class="btn secondary" onclick="liveRestart()">처음부터</button></div><h3>현장 무전 수신</h3><div id="live-radio" class="live-radio"></div><p class="empty">실제 통신이 아닌 게임 시뮬레이션 무전입니다. 1초에 작전 시간 20초가 흐르며, 데이터는 기존 작전 기록을 재사용합니다.</p></div>';
}
history=function(){const r=state.history[replayIndex]||state.history[0];if(!r)return originalHistory();if(currentId!==r.id){currentId=r.id;elapsed=0;stop()}return liveMarkup(r)+originalHistory()};
render=function(){originalRender();if(tab==='history')draw()};
go=function(t){if(t!=='history')stop();originalGo(t);if(t==='history')draw()};
const oldNext=nextDay;
nextDay=function(){const previous=state.history[0]?.id;oldNext();const newest=state.history[0];if(newest&&newest.id!==previous){state.liveMissionId=newest.id;save();window.liveObserve(newest.id)}};
window.addEventListener('pagehide',stop);
})();
