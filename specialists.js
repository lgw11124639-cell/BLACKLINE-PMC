/* Sniper specialization and interdepartmental support reports. */
(function(){
 if(!Object.hasOwn(state.weapons,'정밀사격 소총'))state.weapons['정밀사격 소총']=0;
 const specialistsCatalog=[{id:7,name:'이도현',country:'대한민국',unit:'육군 특수전사령부 (경력 주장)',rank:'중사',role:'저격수',skill:86,salary:108000000},{id:8,name:'Alex Morgan',country:'영국',unit:'Royal Marines (경력 주장)',rank:'하사(환산)',role:'정밀사수',skill:83,salary:104000000}];
 for(const p of specialistsCatalog){if(!state.team.some(x=>x.id===p.id)&&!state.candidates.some(x=>x.id===p.id)&&!(state.alumni||[]).some(x=>x.id===p.id)&&!(state.fallen||[]).some(x=>x.id===p.id)){state.candidates.push(p)}}
 const isPrecision=p=>/저격수|정밀사수/.test(p.role||'');
 const eligible=()=>state.team.filter(p=>!p.dead&&!p.retired&&!p.injured);
 const send=(category,title,body)=>{state.reports.unshift({date:state.date,category,title,body});state.reports=state.reports.slice(0,160)};
 function support(op){
  if(!op||op.supportDispatched)return;
  op.supportDispatched=true;
  const assigned=op.teamIds.map(id=>state.team.find(p=>p.id===id)).filter(Boolean);
  const specialists=assigned.filter(isPrecision);
  op.precisionSupport=specialists.length?{personnel:specialists.map(p=>p.id),status:'편성 완료'}:{personnel:[],status:'전문 인력 미편성'};
  send('작전','작전본부 지원 요청 · '+op.id,'인사본부에 작전 인원 편성, 군수본부에 개인 장비 및 보급 상태 확인을 요청했습니다.');
  send('인사','인사본부 편성 회신 · '+op.id,'팀장 '+op.leaderName+' 외 포함 총 '+assigned.length+'명 편성. '+(specialists.length?'정밀사격 전문 인력 '+specialists.map(p=>p.name).join(', ')+' 포함.':'저격수·정밀사수 미편성. 일반 인력으로 임무를 준비합니다.'));
  const unarmed=assigned.filter(p=>!p.loadout||p.loadout.primary==='미지급').length;
  send('군수','군수본부 준비 현황 회신 · '+op.id,'편성 인원 '+assigned.length+'명 중 주무장 미지급 '+unarmed+'명. 보유 탄약 '+state.ammo.toLocaleString('ko-KR')+'발, 의료물자 '+state.med+'개. 추가 구매 및 장비 지급은 군수 운영 절차에 따릅니다.');
  send('작전','현장 팀장 임무 수령 · '+op.id,op.leaderName+' 팀장이 임무를 수령했습니다. 작전 브리핑과 사전 연습을 준비합니다. 전문 인력 배치 현황: '+op.precisionSupport.status+'.');
 }
 const oldApprove=window.approveScheduled;
 window.approveScheduled=function(){oldApprove();const op=state.operations[0];if(op?.status==='작전 승인'){support(op);save();render()}};
 const oldPrepare=prepare;
 prepare=function(id){oldPrepare(id);const op=state.pending?.plan;if(op){const all=eligible();const specialists=all.filter(isPrecision);if(specialists.length&&op.teamIds.length>=2&&!op.teamIds.some(pid=>specialists.some(p=>p.id===pid))){op.teamIds[op.teamIds.length-1]=specialists.sort((a,b)=>personnelEvaluation(b).precision-personnelEvaluation(a).precision)[0].id;send('인사','작전 전문 인력 편성 검토 · '+op.id,'정밀사격 전문 인력 1명을 작전팀 편제에 포함하도록 팀장에게 배정했습니다.');save();render()}}};
 const oldNext=nextDay;
 nextDay=function(){oldNext();for(const op of state.operations){if(op.status==='작전 승인'&&!op.supportDispatched)support(op)}save();render()};
 const oldMissions=missions;
 missions=function(){const html=oldMissions();if(state.pending)return html;return html+'<div class="card"><h3>전문 인력 운영 보고</h3><p class="empty">저격수 및 정밀사수는 인사본부가 자동 계약하고 팀장이 임무별 필요성에 따라 배정합니다. 전문 인력의 정밀사격 평가는 프로필에서 확인할 수 있습니다.</p></div>'};
})();
