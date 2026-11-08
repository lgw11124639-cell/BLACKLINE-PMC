/* Director's command chain: mission orders descend through the organization. */
(function(){
const esc=escapeHTML;
const originalMissions=missions;
missions=function(){
 if(state.pending)return approval();
 const open=state.operations.filter(o=>o.status!=='작전 완료');
 return '<div class="chain-header"><small>BLACKLINE PMC / OPERATIONS COMMAND</small><h2>임무 하달 및 지휘일지</h2><p>사장은 임무를 하달합니다. 작전본부장과 현장 팀장이 세부 계획과 인원 편성, 준비 및 실행을 담당하고 결과를 보고합니다.</p></div>'
 +'<h3>01 · 접수된 의뢰</h3>'+state.missions.map(m=>'<div class="card command-card"><div class="line"><strong>'+esc(m.title)+'</strong><span class="tag">'+(m.risk>1?'고위험':'일반')+'</span></div><p class="muted">의뢰기관 · '+esc(m.client)+'</p><p>'+esc(m.description)+'</p><div class="line"><span>계약 보수</span><strong>'+money(m.reward)+'</strong></div>'+btn('작전본부에 임무 하달','prepare('+m.id+')')+'</div>').join('')
 +'<h3>02 · 지휘계통 진행 현황</h3>'+(open.length?open.map(op=>'<div class="card command-card"><strong>'+esc(op.id)+'</strong><p class="muted">'+esc(op.status)+' · 투입 예정 '+op.deployDate+'</p>'+chain(op)+'</div>').join(''):'<p class="empty">현재 진행 중인 하달 임무가 없습니다.</p>')
 +'<h3>03 · 최근 작전 보고</h3>'+state.reports.filter(r=>r.category==='작전').slice(0,8).map(r=>'<div class="card"><small class="muted">'+esc(r.date)+'</small><h3>'+esc(r.title)+'</h3><p class="empty">'+esc(r.body)+'</p></div>').join('');
};
function chain(op){
 const steps=[['사장','임무 하달 및 작전 승인'],['작전본부장','임무 분석 및 인원 편성'],['현장 팀장','작전 브리핑 및 사전 연습'],['작전팀','예정일 현장 투입'],['작전본부','최종 결과 보고']];
 const progress=op.status==='작전 완료'?5:op.status==='작전 승인'?2:op.status==='사전 연습 완료'?3:op.status==='추가 연습 필요'?2:op.status==='작전 보류'?2:1;
 return '<div class="command-chain">'+steps.map(([role,action],i)=>'<div class="command-step '+(i<progress?'done':'')+'"><span class="command-index">'+(i+1)+'</span><div><strong>'+role+'</strong><small>'+action+'</small></div><span class="command-status">'+(i<progress?'접수':'대기')+'</span></div>').join('')+'</div>';
}
const originalApproval=approval;
approval=function(){
 const op=state.pending?.plan;
 if(!op)return originalApproval();
 return '<div class="chain-header"><small>DIRECTOR / MISSION ORDER</small><h2>작전본부 임무 하달</h2><p>최종 결재 이후 팀장이 사전 연습과 준비를 진행하며 예정일에 자동 투입합니다.</p></div><div class="card"><h3>지휘계통</h3>'+chain(op)+'</div>'+originalApproval().replace('팀장 사전 작전계획서','작전본부장 검토 및 팀장 브리핑').replace('작전계획 승인 · 일정 등록','임무 하달 승인 · 일정 등록');
};
})();
