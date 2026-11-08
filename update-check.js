/* Lightweight release checker; never touches local game saves. */
(function(){
const CURRENT='2026.11.09.5';
let checking=false,latest=null;
const root=document.createElement('div');root.id='blackline-update';(document.querySelector('header')||document.body).appendChild(root);
function paint(){root.innerHTML='<button type="button" id="blackline-check" aria-label="업데이트 확인">버전 '+CURRENT+' · 업데이트 확인</button>'+(latest&&latest!==CURRENT?'<div class="blackline-update-notice"><strong>새 버전 '+latest+' 이용 가능</strong><button type="button" id="blackline-apply">업데이트 적용</button></div>':'');const check=document.getElementById('blackline-check');if(check)check.onclick=()=>checkUpdate(true);const apply=document.getElementById('blackline-apply');if(apply)apply.onclick=()=>{const u=new URL(location.href);u.searchParams.set('release',latest);location.replace(u.toString())}}
async function checkUpdate(manual){if(checking)return;checking=true;try{const res=await fetch('./version.json?t='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('version HTTP '+res.status);const data=await res.json();latest=String(data.version||'');paint();if(manual&&latest===CURRENT)alert('최신 버전입니다. ('+CURRENT+')')}catch(e){if(manual)alert('업데이트 정보를 확인하지 못했습니다. 네트워크 연결을 확인해 주세요.')}finally{checking=false}}
paint();checkUpdate(false);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate(false)});
})();