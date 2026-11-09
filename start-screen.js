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
  const serialized=JSON.stringify(data),previousState=state,primary=window.blacklineSaveCodec?.rawGet?.(KEY)??localStorage.getItem(KEY),backup=window.blacklineSaveCodec?.rawGet?.(KEY+'_backup')??localStorage.getItem(KEY+'_backup');
  window.blacklineCancelPendingSave?.();window.blacklineImportingSave=true;
  try{localStorage.setItem(KEY,serialized);localStorage.setItem(KEY+'_backup',serialized);state=data}
  catch(writeError){
   try{if(primary===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,primary);if(backup===null)localStorage.removeItem(KEY+'_backup');else localStorage.setItem(KEY+'_backup',backup)}
   finally{state=previousState;window.blacklineImportingSave=false}
   throw writeError;
  }
  location.reload();
 }catch(e){alert('불러오기 실패: '+e.message)}
}
function resetGame(){
 if(!confirm('회사를 초기화하고 새 게임을 시작할까요? 현재 진행은 초기화 전 저장으로 보관됩니다.'))return;
 window.blacklineCancelPendingSave?.();const primary=localStorage.getItem(KEY),backup=localStorage.getItem(KEY+'_backup');
 try{
  localStorage.setItem(KEY+'_before_reset',JSON.stringify({game:'BLACKLINE PMC',schema:1,exportedAt:new Date().toISOString(),state}));
  window.blacklineSaveBlocked=true;
  localStorage.removeItem(KEY);localStorage.removeItem(KEY+'_backup');location.reload();
 }catch(e){
  if(primary!==null)localStorage.setItem(KEY,primary);if(backup!==null)localStorage.setItem(KEY+'_backup',backup);
  window.blacklineSaveBlocked=false;alert('초기화하지 못했습니다. 기존 진행은 유지됩니다: '+e.message);
 }
}
function downloadBeforeReset(){
 const data=localStorage.getItem(KEY+'_before_reset');if(!data)return;
 const url=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='BLACKLINE-PMC-before-reset.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
window.blacklineExportSave=download;
window.blacklineOpenStart=()=>show();
function close(){shell.innerHTML='';document.body.classList.remove('start-visible');document.querySelectorAll('body>header,body>main,body>nav').forEach(el=>el.inert=false);document.querySelector('.save-management')?.focus({preventScroll:true})}
function show(){
 document.body.classList.add('start-visible');
 document.querySelectorAll('body>header,body>main,body>nav').forEach(el=>el.inert=true);
 const old=hasSave();
 shell.innerHTML='<div class="start-overlay"><section class="start-panel" role="dialog" aria-modal="true" aria-label="BLACKLINE PMC 시작 및 저장 관리"><div class="start-identity"><span class="brand-symbol" aria-hidden="true">B</span><div class="start-logo">BLACKLINE <em>PMC</em></div><div class="start-sub">PRIVATE MILITARY COMPANY</div><h1 class="start-title">큰 그림을 보고,<br>다음을 이끌다.</h1><p class="start-description">당신의 시선 아래 움직이는 하나의 회사.<br>사람과 자원, 현장의 흐름을 읽는<br>자율 경영 시뮬레이션.</p><div class="start-edition">THE EXECUTIVE EDITION</div></div><div class="start-info"><small>COMPANY SAVE / 진행 현황</small><strong>'+esc(state.date)+' · '+Number(state.day||1)+'일차</strong><small>보유 자금 '+money(state.cash)+' · 계약 인력 '+(state.team||[]).length+'명</small></div>'+(saveRecoveryNotice?'<p class="start-warning">'+esc(saveRecoveryNotice)+'</p>':'')+'<button type="button" class="start-main" id="blackline-continue">'+(old?'이어하기':'시작하기')+'</button><button type="button" id="blackline-export">저장 데이터 백업하기</button><label for="blackline-import">백업 파일 불러오기<input id="blackline-import" type="file" accept=".json,application/json"></label><button type="button" id="blackline-reset">게임 초기화 · 새 회사 시작</button>'+(localStorage.getItem(KEY+'_before_reset')?'<button type="button" id="blackline-before-reset">초기화 전 저장 내려받기</button>':'')+'<p class="start-foot">진행 기록은 현재 브라우저에 저장됩니다.<br>다른 브라우저·홈 화면 앱으로 이동할 때는 백업 파일을 옮겨야 할 수 있습니다.</p></section></div>';
 shell.querySelector('#blackline-continue').focus({preventScroll:true});
 shell.querySelector('#blackline-continue').onclick=()=>{close();render()};
 shell.querySelector('#blackline-export').onclick=download;
 shell.querySelector('#blackline-reset').onclick=resetGame;
 const previous=shell.querySelector('#blackline-before-reset');if(previous)previous.onclick=downloadBeforeReset;
 shell.querySelector('#blackline-import').onchange=e=>restore(e.target.files?.[0]);
}
const nav=document.querySelector('header');
if(nav){const button=document.createElement('button');button.type='button';button.textContent='저장 관리';button.className='save-management';button.onclick=show;nav.appendChild(button)}
show();
})();