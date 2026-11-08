/* Autonomous quartermaster: procurement, assignment, replacement, and returns. */
(function(){
 const prices={'HK416':4500000,'M4A1':3700000,'SIG MCX':5100000,'FN SCAR-L':4900000,'HK G36':3900000,'HK MP7':4200000,'정밀사격 소총':7800000};
 const fee=350000;
 if(!state.armoryPolicy||typeof state.armoryPolicy!=='object')state.armoryPolicy={};
 const policy=state.armoryPolicy;
 policy.mode='autonomous';delete policy.pending;
 const active=()=>state.team.filter(p=>!p.dead&&!p.retired);
 const suitable=p=>/저격수|정밀사수/.test(p.role||'')?'정밀사격 소총':/정찰/.test(p.role||'')?'SIG MCX':/의무|통신/.test(p.role||'')?'M4A1':/지원/.test(p.role||'')?'FN SCAR-L':'HK416';
 const log=(title,body,amount)=>{state.reports.unshift({date:state.date,category:'군수',title,body,...(amount===undefined?{}:{amount})});state.reports=state.reports.slice(0,90)};
 const availableFunds=()=>Math.max(0,state.cash-20000000);
 function review(){
  const notes=[];let spent=0,assigned=0,replaced=0,procured=0;
  const personnel=active();
  for(const p of personnel){
   const desired=suitable(p),old=p.loadout?.primary||'미지급';
   if(old===desired)continue;
   // Avoid churn: existing nonstandard weapons remain serviceable until a periodic review.
   if(old!=='미지급'&&policy.lastReplacementMonth===state.date.slice(0,7))continue;
   const stock=state.weapons[desired]||0,required=(stock>0?0:prices[desired])+(old==='미지급'?0:fee);
   if(availableFunds()<required)continue;
   state.cash-=required;spent+=required;
   if(stock>0)state.weapons[desired]--;
   else procured++;
   if(old!=='미지급'){state.weapons[old]=(state.weapons[old]||0)+1;replaced++;policy.lastReplacementMonth=state.date.slice(0,7)}
   p.loadout=p.loadout||{};p.loadout.primary=desired;assigned++;
   notes.push(p.name+' ('+p.role+'): '+(old==='미지급'?'신규 지급':old+' → '+desired+' 교체')+' · '+desired);
  }
  if(notes.length)log('군수본부 자율 무장 운용 보고','군수본부 자체 검토로 '+assigned+'명 지급·교체, 신규 조달 '+procured+'정, 교체 '+replaced+'명. 총 지출 '+money(spent)+'. '+notes.slice(0,8).join('; ')+(notes.length>8?'; 외 '+(notes.length-8)+'명':''),-spent);
 }
 const original=logistics;
 logistics=function(){
  const roster=active(),equipped=roster.filter(p=>p.loadout?.primary&&p.loadout.primary!=='미지급').length;
  const inventory=Object.entries(state.weapons).filter(([n])=>Object.hasOwn(prices,n));
  return '<h2>군수본부 · 자율 무장 운영</h2><div class="card"><div class="line"><strong>군수본부 자동 운영</strong><span class="tag">사장 관찰 전용</span></div><p class="muted">군수본부가 인원별 역할과 회사 자금을 고려하여 내부 무장 조달, 지급, 교체 및 회수를 자체 결정합니다.</p><div class="line"><span>무장 지급 인원</span><strong>'+equipped+'명 / '+roster.length+'명</strong></div><div class="line"><span>군수본부 자금 보호선</span><strong>2,000만원</strong></div></div><h2>용병별 무장 배정</h2>'+roster.map(p=>'<div class="card"><div class="line"><strong>'+escapeHTML(p.name)+'</strong><span>'+escapeHTML(p.role||'')+'</span></div><div class="line"><span>군수본부 지급 무장</span><strong>'+escapeHTML(p.loadout?.primary||'미지급')+'</strong></div></div>').join('')+'<h2>내부 창고</h2><div class="card">'+inventory.map(([n,q])=>'<div class="line"><span>'+escapeHTML(n)+'</span><strong>'+q+'정</strong></div>').join('')+'</div><h2>보급 재고</h2><div class="card"><div class="line"><span>탄약</span><strong>'+state.ammo.toLocaleString()+'발</strong></div><div class="line"><span>의료 키트</span><strong>'+state.med+'개</strong></div><div class="line"><span>보호장비</span><strong>'+state.gear+'세트</strong></div></div><p class="empty">총기 구매·교체 버튼은 없습니다. 세부 변경 사항은 군수본부 보고서에 자동 기록됩니다.</p>';
 };
 const oldNext=nextDay;
 nextDay=function(){oldNext();review();save();render()};
 review();save();
})();