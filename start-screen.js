/* BLACKLINE start screen and user-controlled save backup. Never resets progress automatically. */
(function(){
const KEY='blackline_pmc_v1';
const esc=x=>escapeHTML(String(x??''));
const shell=document.createElement('div');
shell.id='blackline-start-root';document.body.appendChild(shell);
function hasSave(){try{return !!localStorage.getItem(KEY)||!!localStorage.getItem(KEY+'_backup')}catch(e){return false}}
function download(){
 try{
  save();
  const data=JSON.stringify({game:'BLACKLINE PMC',schema:1,exportedAt:new Date().toISOString(),state},null,2);
  const blob=new Blob([data],{type:'application/json'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='BLACKLINE-PMC-'+state.date+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)
 }catch(e){alert('백업 파일을 만들지 못했습니다: '+e.message)}
}
async function restore(file){
 if(!file)return;
 try{
  if(file.size>5000000)throw Error('백업 파일이 너무 큽니다.');
  const parsed=JSON.parse(await file.text()),data=parsed.state||parsed;
  if(!data||typeof data!=='object'||!Array.isArray(data.reports)||!Array.isArray(data.team)||!Number.isFinite(Number(data.day))||! /^\d{4}-\d{2}-\d{2}$/.test(data.date))throw Error('BLACKLINE 저장 형식이 아닙니다.');
  if(!confirm('현재 저장을 백업 파일의 진행 상태로 교체할까요?'))return;
  localStorage.setItem(KEY,JSON.stringify(data));localStorage.setItem(KEY+'_backup',JSON.stringify(data));location.reload();
 }catch(e){alert('불러오기 실패: '+e.message)}
}
window.blacklineExportSave=download;
window.blacklineOpenStart=()=>show();
function close(){shell.innerHTML='';document.body.classList.remove('start-visible')}
function show(){
 document.body.classList.add('start-visible');
 const old=hasSave();
 shell.innerHTML='<div class="start-overlay"><section class="start-panel"><div class="start-logo">BLACKLINE <em>PMC</em></div><div class="start-sub">PRIVATE MILITARY COMPANY · OBSERVER MODE</div><div class="start-info"><small>COMPANY SAVE / 진행 현황</small><strong>'+esc(state.date)+' · '+Number(state.day||1)+'일차</strong><small>보유 자금 '+money(state.cash)+' · 계약 인력 '+(state.team||[]).length+'명</small></div>'+(saveRecoveryNotice?'<p class="start-warning">'+esc(saveRecoveryNotice)+'</p>':'')+'<button type="button" class="start-main" id="blackline-continue">'+(old?'이어하기':'시작하기')+'</button><button type="button" id="blackline-export">저장 데이터 백업하기</button><label for="blackline-import">백업 파일 불러오기<input id="blackline-import" type="file" accept=".json,application/json"></label><p class="start-foot">진행 기록은 현재 브라우저에 저장됩니다.<br>다른 브라우저·홈 화면 앱으로 이동할 때는 백업 파일을 옮겨야 할 수 있습니다.</p></section></div>';
 shell.querySelector('#blackline-continue').onclick=()=>{close();render()};
 shell.querySelector('#blackline-export').onclick=download;
 shell.querySelector('#blackline-import').onchange=e=>restore(e.target.files?.[0]);
}
const nav=document.querySelector('header');
if(nav){const button=document.createElement('button');button.type='button';button.textContent='시작 화면 · 저장 관리';button.style.cssText='margin-top:7px;border:1px solid #39544c;border-radius:7px;background:#1d302b;color:#b5dcc4;padding:6px 10px;font-size:11px';button.onclick=show;nav.appendChild(button)}
show();
})();