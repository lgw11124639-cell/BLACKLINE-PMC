/* Optional operation replay is opened from completed operation reports only. */
(function(){
window.blacklineDisableAutoObservation=true;
window.blacklineReportViewing=false;
const originalRender=render,originalGo=go;
function cleanNav(){
 const nav=document.getElementById('tabs');if(!nav)return;
 nav.querySelectorAll('button').forEach(b=>{if(/기록/.test(b.textContent))b.remove()});
 nav.style.gridTemplateColumns='repeat(4,minmax(0,1fr))';
}
render=function(){if(tab==='history')tab='home';originalRender();cleanNav()};
go=function(t){if(t==='history')t='home';originalGo(t);cleanNav()};
const overlay=document.createElement('div');overlay.id='blackline-result-replay';overlay.hidden=true;document.body.appendChild(overlay);
window.blacklineOpenResultReplay=function(reportIndex){
 const report=state.reports[Number(reportIndex)];if(!report)return;
 const title=String(report.title||'').replace(/^.*?보고\s*[·ㆍ]\s*/,'').trim();
 let idx=state.history.findIndex(h=>h.date===report.date&&h.title===title);
 if(idx<0)idx=state.history.findIndex(h=>h.title===title);
 if(idx<0){alert('이 보고서의 작전 관전 기록을 찾을 수 없습니다.');return}
 if(window.closeCompanyReport)window.closeCompanyReport();
 replayIndex=idx;
 // The replay module selects the mission ID without navigating away from the inbox.
 if(window.liveSelect)window.liveSelect(state.history[idx].id);
 window.blacklineReportViewing=true;
 overlay.hidden=false;
 overlay.innerHTML='<div class="result-replay-top"><button type="button" onclick="blacklineCloseResultReplay()">‹ 작전 결과 보고서로</button><strong>BLACKLINE / 작전 다시보기</strong></div><div class="result-replay-content">'+history()+'</div>';
 document.body.classList.add('result-replay-open');
 if(window.liveSeek)window.liveSeek(0);
 if(window.ops3dInit)try{window.ops3dInit()}catch(e){console.warn(e)}
};
window.blacklineCloseResultReplay=function(){
 if(window.liveToggle&&document.getElementById('live-play')?.textContent==='일시정지')window.liveToggle();
 if(window.ops3dDispose)window.ops3dDispose();
 overlay.hidden=true;overlay.innerHTML='';window.blacklineReportViewing=false;
 document.body.classList.remove('result-replay-open');
};
cleanNav();
})();
