/* Foreground simulation time. Offline sessions resume from the saved minute; no fabricated offline battles. */
(function(){
 if(!state.simClock)state.simClock={version:1,minutes:480,paused:false,speed:1};
 const clock=state.simClock;clock.minutes=Math.max(0,Math.min(1439.999,Number(clock.minutes)||0));clock.speed=[1,3].includes(clock.speed)?clock.speed:1;
 const migrating=state.operations.filter(o=>['작전 승인','사전 연습 완료','추가 연습 필요','계획 검토'].includes(o.status)&&!o.rehearsalAt);
 for(const op of migrating){op.originalSchedule={rehearsalDate:op.rehearsalDate,deployDate:op.deployDate};op.rehearsalAt=state.day*1440+clock.minutes+.5;op.deployAt=state.day*1440+clock.minutes+3;op.rehearsalDate=state.date;op.deployDate=state.date}
 if(migrating.length)state.reports.unshift({date:state.date,category:'작전',title:'시간 흐름 기반 작전 일정 이관',body:migrating.length+'건의 준비 일정을 연속 시간 방식으로 이관했습니다. 이전 일정은 작전 기록에 보존했습니다.'});
 let last=performance.now(),lastSave=last,lastReview=0,lastMarket=-1;
 const text=()=>String(Math.floor(clock.minutes/60)).padStart(2,'0')+':'+String(Math.floor(clock.minutes%60)).padStart(2,'0');
 function paint(){
  document.querySelectorAll('[data-company-time]').forEach(el=>el.textContent=state.date+' · '+text());
  document.querySelectorAll('[data-clock-toggle]').forEach(el=>{el.textContent=clock.paused?'시간 계속':'시간 일시정지';el.setAttribute('aria-pressed',String(clock.paused))});
  document.querySelectorAll('[data-clock-speed]').forEach(el=>el.textContent=clock.speed+'× 흐름');
  document.querySelectorAll('[data-clock-state]').forEach(el=>el.textContent=clock.paused?'시간 정지':'자동 시간 흐름');
 }
 function mount(){
  const crumb=app.querySelector('.workspace-breadcrumb');
  if(crumb&&!app.querySelector('.company-timebar'))crumb.insertAdjacentHTML('afterend','<div class="company-timebar"><div><span class="clock-dot"></span><strong data-company-time></strong><small data-clock-state></small></div><div><button type="button" data-clock-toggle onclick="companyClock.toggle()"></button><button type="button" data-clock-speed onclick="companyClock.speed()" aria-label="자동 시간 배속 변경"></button></div></div>');
  paint();
 }
 const baseRender=render;render=function(){baseRender();mount()};
 window.companyClock={toggle(){clock.paused=!clock.paused;last=performance.now();save();paint()},speed(){clock.speed=clock.speed===1?3:1;save();paint()},text};
 setInterval(()=>{
  const now=performance.now(),delta=Math.min(1,Math.max(0,(now-last)/1000));last=now;
  if(window.blacklineImportingSave||clock.paused||document.hidden||document.body.classList.contains('start-visible'))return;
  clock.minutes+=delta*(26/60)*clock.speed;
  if(clock.minutes>=1440){clock.minutes-=1440;nextDay()}
  if(now-lastReview>1000){lastReview=now;const bucket=Math.floor((state.day*1440+clock.minutes)/30);if(bucket!==lastMarket){lastMarket=bucket;window.contractWorld.refresh();save();render()}if(window.blacklineReviewCompany)window.blacklineReviewCompany();if(window.blacklineRunScheduled)window.blacklineRunScheduled()}
  paint();if(now-lastSave>5000){lastSave=now;save()}
 },250);
 document.addEventListener('visibilitychange',()=>{last=performance.now();if(document.hidden&&!window.blacklineImportingSave)save()});
 render();
})();
