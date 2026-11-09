/* In-place updates for installed BLACKLINE PMC. Never delete local game saves. */
(function(){
const CURRENT='2026.11.09.37';
let checking=false,latest=null,applying=false;const AUTO_KEY='blackline_auto_updated_release';const isNewer=(a,b)=>a.split('.').map(Number).some((v,i,arr)=>v>(b.split('.').map(Number)[i]||0)&&arr.slice(0,i).every((x,j)=>x===(b.split('.').map(Number)[j]||0)));
const root=document.createElement('div');root.id='blackline-update';(document.querySelector('header')||document.body).appendChild(root);
function paint(){
 root.innerHTML='<button type="button" id="blackline-check" aria-label="업데이트 확인">버전 '+CURRENT+' · 업데이트 확인</button>'+(latest&&isNewer(latest,CURRENT)?'<div class="blackline-update-notice"><strong>새 버전 '+latest+' 이용 가능</strong><button type="button" id="blackline-apply">업데이트 적용</button></div>':'');
 const check=document.getElementById('blackline-check');if(check)check.onclick=()=>checkUpdate(true);
 const apply=document.getElementById('blackline-apply');if(apply)apply.onclick=()=>applyUpdate();
}
async function applyUpdate(){
 if(applying)return;applying=true;
 const btn=document.getElementById('blackline-apply')||document.getElementById('blackline-check');
 if(btn){btn.disabled=true;btn.textContent='업데이트 적용 중…'}
 try{
  // Only remove app asset caches; localStorage and IndexedDB saves are untouched.
  if('serviceWorker' in navigator){
   try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.unregister()}catch(e){console.warn('SW update:',e)}
  }
  if('caches' in window){
   try{const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)))}catch(e){console.warn('Cache update:',e)}
  }
  const u=new URL('./index.html',location.href);u.searchParams.set('appVersion',latest||CURRENT);u.searchParams.set('refresh',String(Date.now()));sessionStorage.setItem('blackline_expected_version',latest||CURRENT);
  // Reload in the same installed standalone window, not a new Safari tab or installation.
  location.replace(u.href);
 }catch(e){applying=false;alert('업데이트 중 오류가 발생했습니다. 다시 시도해 주세요.');paint()}
}
async function checkUpdate(manual){
 if(checking)return;checking=true;
 try{
  const res=await fetch('./version.json?check='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();latest=String(data.version||'');
  paint();
  if(!manual&&latest&&isNewer(latest,CURRENT)&&sessionStorage.getItem(AUTO_KEY)!==latest){sessionStorage.setItem(AUTO_KEY,latest);await applyUpdate();return}if(manual){if(!isNewer(latest,CURRENT)){if(confirm('현재 버전 '+CURRENT+'입니다. 화면에 이전 내용이 보이면 최신 파일을 다시 불러올까요?'))await applyUpdate()}else if(latest){await applyUpdate()}}
 }catch(e){if(manual)alert('업데이트 정보를 확인하지 못했습니다. 네트워크 연결을 확인해 주세요.')}finally{checking=false}
}
paint();const expected=sessionStorage.getItem('blackline_expected_version');if(expected&&!isNewer(expected,CURRENT)){sessionStorage.removeItem('blackline_expected_version')}checkUpdate(false);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate(false)});window.addEventListener('focus',()=>checkUpdate(false));
window.blacklineApplyUpdate=applyUpdate;
})();