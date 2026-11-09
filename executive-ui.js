/* Presentation only. Simulation and storage remain in the existing modules. */
(function(){
 const paths={observation:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',home:'M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',logistics:'m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5',missions:'M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 0 1 18 0ZM12 7v6M9 10h6',calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z',funds:'M3 5h16v4M3 5v14h18V9H7a4 4 0 0 1-4-4ZM17 13h4M17 13v2',reputation:'m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z',save:'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8',shield:'M12 22s9-4 9-11V4l-9-3-9 3v7c0 7 9 11 9 11ZM8 11l3 3 5-6'};
 const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';
 const pages={observation:['작전 관찰실','LIVE FIELD OBSERVATION','입체 지도 위에서 이동과 교전, 무전과 현장 판단의 흐름을 관찰하세요.'],home:['회사 운영 현황','EXECUTIVE OVERVIEW'],people:['인사본부','PEOPLE & ORGANIZATION','회사의 역량은 사람에서 시작됩니다. 인력 현황과 팀 편제, 개인별 기록을 확인하세요.'],logistics:['군수본부','LOGISTICS & RESOURCES','현장을 뒷받침하는 자원. 무장 지급과 보급 재고를 한곳에서 확인하세요.'],missions:['작전본부','OPERATIONS & INTELLIGENCE','지역의 변화가 새로운 의뢰로 이어집니다. 계약과 현장 지휘의 흐름을 살펴보세요.']};
 const originalRender=render;
 function decorate(){
  const nav=window.blacklineViewNav||document.getElementById('tabs');
  nav.setAttribute('aria-label','주요 메뉴');
  nav.querySelectorAll('button').forEach(button=>{
   const key=Object.keys(pages).find(key=>button.getAttribute('onclick')?.includes("'"+key+"'"));if(!key)return;
   button.querySelector('.ico').innerHTML=icon(key);
   button.setAttribute('aria-label',pages[key][0]);
   button.classList.toggle('active',key===tab);if(key===tab)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  });
  nav.insertAdjacentHTML('afterbegin','<div class="nav-caption">WORKSPACE</div>');
  nav.insertAdjacentHTML('beforeend','<div class="nav-footer"><strong>BLACKLINE PMC</strong>PRIVATE MILITARY COMPANY<br>EXECUTIVE EDITION</div>');
  app.dataset.page=tab;
  const title=pages[tab];
  if(title){
   app.insertAdjacentHTML('afterbegin','<div class="workspace-breadcrumb"><span>워크스페이스 &nbsp; / &nbsp; '+title[0]+'</span><span><i aria-hidden="true"></i> 자율 운영</span></div>');
   if(tab!=='home'){
    const first=app.querySelector(':scope > h2');if(first)first.remove();
    app.querySelector('.workspace-breadcrumb').insertAdjacentHTML('afterend','<div class="department-heading"><small>'+title[1]+'</small><h1>'+title[0]+'</h1><p>'+title[2]+'</p></div>');
   }
  }
  app.querySelectorAll('.stats .stat').forEach((stat,i)=>stat.insertAdjacentHTML('afterbegin','<span class="stat-icon">'+icon(['calendar','funds','people','reputation'][i]||'shield')+'</span>'));
 }
 render=function(){originalRender();decorate()};
 const header=document.querySelector('body>header');
 const update=document.getElementById('blackline-update'),saveButton=header.querySelector('.save-management');
 header.replaceChildren();
 header.insertAdjacentHTML('afterbegin','<div class="brand-lockup"><span class="brand-symbol" aria-hidden="true">B</span><div><div class="brand-wordmark">BLACKLINE<em>PMC</em></div><small>PRIVATE MILITARY COMPANY</small></div></div><span class="header-divider" aria-hidden="true"></span><span class="header-caption">Executive workspace</span><div class="header-tools"></div>');
 const tools=header.querySelector('.header-tools');if(update)tools.appendChild(update);if(saveButton){saveButton.innerHTML=icon('save')+'저장 관리';saveButton.setAttribute('aria-label','시작 화면 및 저장 관리');tools.appendChild(saveButton)}
 tools.insertAdjacentHTML('beforeend','<span class="header-account" aria-label="사장 워크스페이스">BL</span>');
 document.addEventListener('keydown',event=>{
  const dialog=document.querySelector('.start-panel')||document.querySelector('.report-dossier')||document.querySelector('#blackline-result-replay:not([hidden])')||document.querySelector('#field-recording-root')||document.querySelector('.profile-sheet');
  if(!dialog)return;
  if(event.key==='Escape'&&dialog.classList.contains('profile-sheet')){closeProfile();return}
  if(event.key!=='Tab')return;
  const controls=[...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
  if(!controls.length)return;
  const first=controls[0],last=controls[controls.length-1];
  if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus()}
 });
 render();
})();
