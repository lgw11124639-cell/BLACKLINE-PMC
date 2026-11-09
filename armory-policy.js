/* Autonomous quartermaster: procurement, assignment, replacement, and returns. */
(function(){
 const prices={'HK416':4500000,'M4A1':3700000,'SIG MCX':5100000,'FN SCAR-L':4900000,'HK G36':3900000,'HK MP7':4200000,'Accuracy International AXMC':11800000,'Barrett MRAD':12500000,'Sako TRG 42':9800000};
 const fee=350000;
 // Migrate old placeholder rifles without erasing the existing armory stock.
 if(Object.hasOwn(state.weapons,'정밀사격 소총')){state.weapons['Accuracy International AXMC']=(state.weapons['Accuracy International AXMC']||0)+(state.weapons['정밀사격 소총']||0);delete state.weapons['정밀사격 소총']}
 state.team.forEach(p=>{if(p.loadout?.primary==='정밀사격 소총')p.loadout.primary='Accuracy International AXMC'});
 if(!state.armoryPolicy||typeof state.armoryPolicy!=='object')state.armoryPolicy={};
 const policy=state.armoryPolicy;
 policy.mode='autonomous';delete policy.pending;
 const active=()=>state.team.filter(p=>!p.dead&&!p.retired);
 const suitable=p=>/저격수|정밀사수/.test(p.role||'')?'Accuracy International AXMC':/정찰/.test(p.role||'')?'SIG MCX':/의무|통신/.test(p.role||'')?'M4A1':/지원/.test(p.role||'')?'FN SCAR-L':'HK416';
 const log=(title,body,amount,detail)=>{state.reports.unshift({date:state.date,category:'군수',title,body,...(amount===undefined?{}:{amount}),...(detail?{detail}:{})});state.reports=state.reports.slice(0,90)};
 const availableFunds=()=>Math.max(0,state.cash-20000000);
 function review(){
  window.blacklineReviewMunitions?.();
  for(const p of active()){p.loadout=p.loadout||{};if(!p.loadout.armor||p.loadout.armor==='미지급'){if(state.gear>0){state.gear--;p.loadout.armor='탄도 방호복';p.loadout.helmet='탄도 헬멧';p.armorCondition=100}else if(availableFunds()>=950000){state.cash-=950000;p.loadout.armor='탄도 방호복';p.loadout.helmet='탄도 헬멧';p.armorCondition=100;log('보호장비 지급',p.name+' 방호복·헬멧 신규 조달 지급.',-950000)}}}
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
  if(notes.length)log('군수본부 자율 무장 운용 보고','군수본부 자체 검토로 '+assigned+'명 지급·교체, 신규 조달 '+procured+'정, 교체 '+replaced+'명. 총 지출 '+money(spent)+'. '+notes.slice(0,8).join('; ')+(notes.length>8?'; 외 '+(notes.length-8)+'명':''),-spent,{summary:'군수본부가 인원별 역할과 재고를 확인하여 무장 지급 및 조달을 자체 집행했습니다.',metrics:[{label:'지급·교체',value:assigned+'명'},{label:'신규 조달',value:procured+'정'},{label:'총 집행액',value:money(spent)}],sections:[{title:'집행 결과',items:['신규 조달: '+procured+'정','기존 장비 교체: '+replaced+'명','총 지급·교체: '+assigned+'명','총 지출: '+money(spent)]},{title:'인원별 지급 내역',items:notes.slice(0,20)},{title:'재고 및 자금 처리',items:['보유 재고를 우선 사용하고 부족한 장비만 신규 조달했습니다.','교체된 기존 무장은 회사 창고로 회수했습니다.','회사 운영자금 보호선을 적용하여 지출을 제한했습니다.']} ]});
 }
 const original=logistics;
 logistics=function(){
  const roster=active(),equipped=roster.filter(p=>p.loadout?.primary&&p.loadout.primary!=='미지급').length;
  const inventory=Object.entries(state.weapons).filter(([n])=>Object.hasOwn(prices,n));
  return '<h2>군수본부 · 자율 무장 운영</h2><div class="card"><div class="line"><strong>군수본부 자동 운영</strong><span class="tag">사장 관찰 전용</span></div><p class="muted">군수본부가 인원별 역할과 회사 자금을 고려하여 내부 무장 조달, 지급, 교체 및 회수를 자체 결정합니다.</p><div class="line"><span>무장 지급 인원</span><strong>'+equipped+'명 / '+roster.length+'명</strong></div><div class="line"><span>군수본부 자금 보호선</span><strong>2,000만원</strong></div></div><h2>내부 창고</h2><div class="card">'+inventory.map(([n,q])=>'<div class="line"><span>'+escapeHTML(n)+'</span><strong>'+q+'정</strong></div>').join('')+'</div><h2>개인별 출동 탄약 기준</h2><div class="card"><p class="empty">장전 탄창을 포함한 총 휴대 탄창 수입니다. 출동 때 창고에서 실물 차감하고, 발사·분실을 제외한 실제 잔탄만 회수합니다.</p>'+roster.map(p=>{const a=window.fieldSimulation.ammoPlan([p]).allocations[0];return '<div class="line"><span>'+escapeHTML(p.name)+' · '+escapeHTML(a.weapon)+'</span><strong>'+a.capacity+'발 × '+a.magazines+'탄창 = '+a.load+'발</strong></div>'}).join('')+'</div><h2>보급 재고</h2><div class="card"><div class="line"><span>탄약</span><strong>'+state.ammo.toLocaleString()+'발</strong></div><div class="line"><span>의료 키트</span><strong>'+state.med+'개</strong></div><div class="line"><span>보호장비</span><strong>'+state.gear+'세트</strong></div></div><p class="empty">총기 구매·교체 버튼은 없습니다. 세부 변경 사항은 군수본부 보고서에 자동 기록됩니다.</p>';
 };
 const oldNext=nextDay;
 nextDay=function(){oldNext();review();save();render()};
 window.blacklineReviewArmory=review;review();save();
})();