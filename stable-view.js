/* Build background renders off-screen; reconcile once without replacing live surfaces. */
(function(){
 const baseRender=render;
 let rendering=false,lastTab=tab;
 const key=node=>node.nodeType===1?(node.id?'id:'+node.id:node.getAttribute('data-view-key')||''):'';
 const same=(a,b)=>a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName&&key(a)===key(b));
 function patchNode(current,next){
  if(current.nodeType!==1){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return}
  // The live renderer owns its canvas, controls, radio and selection between sessions.
  if(current.matches('.field-console')&&current.dataset.session===next.dataset.session&&current.querySelector('#field-canvas'))return;
  const focused=current===document.activeElement;
  for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name)&&!(focused&&['value','checked','selected'].includes(attr.name)))current.removeAttribute(attr.name);
  for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value&&!(focused&&['value','checked','selected'].includes(attr.name)))current.setAttribute(attr.name,attr.value);
  if(current.tagName==='CANVAS')return;
  patchChildren(current,next);
  if(!focused&&current.tagName==='INPUT'&&current.value!==next.value)current.value=next.value;
  if(!focused&&current.tagName==='SELECT'&&current.value!==next.value)current.value=next.value;
 }
 function patchChildren(parent,next){
  let cursor=parent.firstChild;
  for(const desired of [...next.childNodes]){
   let match=cursor;
   if(!match||!same(match,desired)){
    const wanted=key(desired);
    match=wanted?[...parent.childNodes].find(n=>same(n,desired)):null;
    if(!match){match=desired.cloneNode(true);parent.insertBefore(match,cursor)}else if(match!==cursor)parent.insertBefore(match,cursor);
   }
   patchNode(match,desired);cursor=match.nextSibling;
  }
  while(cursor){const following=cursor.nextSibling;cursor.remove();cursor=following}
 }
 render=function(){
  if(rendering)return;
  const liveApp=app,samePage=lastTab===tab,position={x:window.scrollX,y:window.scrollY};
  const scrolls=samePage?[...document.querySelectorAll('#app *,#profile-root *,#company-report-root *')].filter(el=>el.scrollTop||el.scrollLeft).map(el=>({el,top:el.scrollTop,left:el.scrollLeft})):[];
  const staged=liveApp.cloneNode(false),nav=document.getElementById('tabs'),stagedNav=nav?.cloneNode(false);rendering=true;window.blacklineRenderingView=true;window.blacklineViewNav=stagedNav;
  try{app=staged;baseRender()}
  finally{app=liveApp;window.blacklineRenderingView=false;window.blacklineViewNav=null;rendering=false}
  if(nav&&stagedNav)patchNode(nav,stagedNav);
  if(samePage)patchNode(liveApp,staged);else{liveApp.replaceChildren(...staged.childNodes);liveApp.dataset.page=staged.dataset.page||tab;}
  // Stable pixel positioning prevents browser scroll anchoring from following new reports.
  liveApp.style.overflowAnchor='none';
  if(samePage){for(const {el,top,left}of scrolls)if(el.isConnected){if(el.scrollTop!==top)el.scrollTop=top;if(el.scrollLeft!==left)el.scrollLeft=left}if(window.scrollY!==position.y||window.scrollX!==position.x)window.scrollTo(position.x,position.y)}
  lastTab=tab;window.blacklineRefreshObservation?.();window.companyClock?.paint?.();
 };
})();
