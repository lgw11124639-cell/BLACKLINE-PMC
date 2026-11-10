/* Verified, ordered mission saves. Keep a last-known-good backup. */
(function(){
 let worker=null,unavailable=false,pending=null,timer=null,busy=false,sequence=0,committed=0,flushedAt=0,lastError='',lastSavedDate='';
 const key='blackline_pmc_v1',backup=key+'_backup';
 const rawGet=k=>window.blacklineSaveCodec?.rawGet?.(k)??localStorage.getItem(k);
 const rawSet=(k,v)=>window.blacklineSaveCodec?.rawSet?window.blacklineSaveCodec.rawSet(k,v):localStorage.setItem(k,v);
 function notify(message){lastError=String(message);console.error('[BLACKLINE SAVE]',lastError);let el=document.getElementById('blackline-save-error');if(!el){el=document.createElement('div');el.id='blackline-save-error';el.setAttribute('role','alert');el.style.cssText='position:fixed;z-index:999999;bottom:15px;left:15px;right:15px;max-width:640px;margin:auto;padding:14px 18px;background:#7f2020;color:white;border-radius:12px;font:600 13px sans-serif;box-shadow:0 4px 25px #0005';document.body.appendChild(el)}el.textContent='저장 실패 · 새로고침하지 마세요. '+lastError;}
 function clearError(){lastError='';document.getElementById('blackline-save-error')?.remove()}
 function commit(value,seq){if(seq<committed)return false;try{
  const prior=rawGet(key);
  rawSet(key,value);
  if(rawGet(key)!==value)throw Error('저장 데이터 검증 실패');
  committed=seq;flushedAt=performance.now();
  try{if(prior&&prior!==value)rawSet(backup,prior);else if(!rawGet(backup))rawSet(backup,value)}catch(e){console.warn('백업 저장 실패',e)}
  try{const decoded=window.blacklineSaveCodec?.unpack(value)||value;lastSavedDate=JSON.parse(decoded).date||''}catch(e){}
  clearError();return true;
 }catch(e){notify(e.message||e);return false}}
 function sync(){if(window.blacklineSaveBlocked||window.blacklineImportingSave)return false;clearTimeout(timer);timer=null;pending=null;const seq=++sequence;try{
  const json=JSON.stringify(state);const packed=window.blacklineSaveCodec?.pack(json);return commit(packed&&packed.length<json.length?packed:json,seq)
 }catch(e){notify(e.message||e);return false}}
 function start(){if(worker||unavailable)return;try{worker=new Worker('save-worker.js?v=2026110957');worker.onmessage=({data})=>{busy=false;if(data.sequence>committed&&!window.blacklineImportingSave&&!window.blacklineSaveBlocked){if(data.error){unavailable=true;sync()}else commit(data.value,data.sequence)}if(pending)dispatch()};worker.onerror=()=>{unavailable=true;busy=false;worker?.terminate();worker=null;sync()}}catch(e){unavailable=true}}
 function dispatch(){timer=null;if(!pending||busy||window.blacklineImportingSave||window.blacklineSaveBlocked)return;start();if(unavailable){sync();return}const value=pending;pending=null;busy=true;try{worker.postMessage({sequence:++sequence,state:value})}catch(e){unavailable=true;busy=false;sync()}}
 window.blacklineQueueSave=value=>{if(window.blacklineImmediateSave)return false;pending=value;if(!timer&&!busy)timer=setTimeout(dispatch,120);return true};
 window.blacklineFlushSave=sync;window.blacklineSaveNow=sync;
 window.blacklineCancelPendingSave=()=>{pending=null;clearTimeout(timer);timer=null;committed=++sequence};
 window.blacklineSaveStatus=()=>({busy,pending:!!pending,sequence,committed,worker:!!worker,fallback:unavailable,lastError,lastSavedDate});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)sync()});
 window.addEventListener('pagehide',sync);window.addEventListener('beforeunload',sync);
})();
