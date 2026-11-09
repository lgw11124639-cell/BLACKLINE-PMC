/* Lightweight medical and fatigue management: one value per person, no daily history. */
(function(){
 const report=(title,body)=>{state.reports.unshift({date:state.date,category:'의무',title,body})};
 for(const p of state.team){if(typeof p.fatigue!=='number')p.fatigue=0;if(p.injured&&!p.recoveryUntil)p.recoveryUntil=null}
 const oldNext=nextDay;
 nextDay=function(){
  oldNext();
  for(const p of state.team){
   if(p.dead||p.retired)continue;
   p.fatigue=Math.max(0,(p.fatigue||0)-(p.injured?3:7));
   if(p.injured){
    if(!p.recoveryUntil){const d=new Date(state.date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+12+(p.id%9));p.recoveryUntil=d.toISOString().slice(0,10);report('의무팀 부상 회복 계획',p.name+' 용병의 회복 예정일은 '+p.recoveryUntil+'입니다. 부상 정도: '+(p.injurySeverity||'미확인')+'.')}
    if(state.date>=p.recoveryUntil){p.injured=false;p.recoveryUntil=null;p.injurySeverity=null;p.fatigue=Math.max(0,p.fatigue-20);report('의무팀 복귀 승인 보고',p.name+' 용병이 치료를 마치고 출동 가능 상태로 복귀했습니다.')}
   }
  }
  save();render();
 };
 const oldProfile=renderProfile;
 renderProfile=function(){oldProfile();if(!selectedProfile||profilePage!=='medical')return;const p=(selectedProfile.hired?state.team:state.candidates).find(x=>x.id===selectedProfile.id);if(!p)return;const root=document.querySelector('.profile-body');if(!root)return;const entries=(p.injuryHistory||[]).slice(0,12);root.insertAdjacentHTML('beforeend','<div class="dossier-section-label">작전 부상 이력</div><div class="dossier-report">'+(entries.length?entries.map(x=>'<p>'+escapeHTML(x.date)+' · '+escapeHTML(x.mission)+' · '+escapeHTML(x.severity)+' · 회복 예정 '+escapeHTML(x.recoveryUntil)+'</p>').join(''):'<p>기록된 작전 부상 없음</p>')+'</div>')};
 const oldPeople=people;
 people=function(){return oldPeople().replace(/출동 가능<\/p>/g,'출동 가능</p>')};
})();
