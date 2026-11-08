/* Internal standardized equipment program. No external market; compact persistent policy. */
(function(){
 const catalog=['HK416','M4A1','SIG MCX','FN SCAR-L','HK G36'];
 const price=4500000,changeFee=650000;
 if(!state.armoryPolicy||typeof state.armoryPolicy!=='object')state.armoryPolicy={standard:'HK416',pending:null,lastReport:null};
 const policy=state.armoryPolicy;
 if(!catalog.includes(policy.standard))policy.standard='HK416';
 const report=(title,body,amount)=>{state.reports.unshift({date:state.date,category:'군수',title,body,...(amount===undefined?{}:{amount})})};
 const eligible=()=>state.team.filter(p=>!p.dead&&!p.retired);
 const needs=p=>!p.loadout||!p.loadout.primary||p.loadout.primary==='미지급'||p.loadout.primary!==policy.standard;
 const outstanding=()=>eligible().filter(needs);
 function standardize(){
  let issued=0,replaced=0,purchased=0,spent=0;
  for(const p of outstanding()){
   const old=p.loadout?.primary;
   const isReplace=!!old&&old!=='미지급';
   const inStock=(state.weapons[policy.standard]||0)>0;
   const cost=(inStock?0:price)+(isReplace?changeFee:0);
   if(state.cash<cost)continue;
   state.cash-=cost;spent+=cost;
   if(!inStock)purchased++;
   else state.weapons[policy.standard]--;
   if(isReplace){state.weapons[old]=(state.weapons[old]||0)+1;replaced++}
   p.loadout=p.loadout||{};
   p.loadout.primary=policy.standard;issued++;
  }
  if(issued){report('군수본부 제식무장 지급·교체 보고',policy.standard+' 제식 기준에 따라 '+issued+'명 지급 완료. 교체 '+replaced+'명, 내부 조달 '+purchased+'정. 총 지출 '+money(spent)+'. 반환 무장은 창고에 재입고했습니다.',-spent)}
  return issued;
 }
 const oldLogistics=logistics;
 logistics=function(){
  const assigned=eligible().filter(p=>p.loadout?.primary===policy.standard).length;
  const pending=outstanding().length;
  return '<h2>군수본부 · 제식무장 관리</h2><div class="card"><h3>회사 공식 제식소총</h3><div class="line"><strong>'+escapeHTML(policy.standard)+'</strong><span class="tag">운용 표준</span></div><p class="muted">총기 조달·지급·회수는 군수본부가 담당합니다. 사장은 회사 제식 규격만 승인합니다.</p><div class="line"><span>제식무장 지급 인원</span><strong>'+assigned+'명 / '+eligible().length+'명</strong></div><div class="line"><span>지급·교체 대기</span><strong>'+pending+'명</strong></div><div class="line"><span>내부 신규 조달 기준</span><strong>'+money(price)+'/정</strong></div><div class="line"><span>기존 총기 교체 수수료</span><strong>'+money(changeFee)+'/명</strong></div><label>제식소총 변경 검토<select id="standard-rifle">'+catalog.map(n=>'<option value="'+escapeHTML(n)+'" '+(n===policy.standard?'selected':'')+'>'+escapeHTML(n)+'</option>').join('')+'</select></label><div class="btnrow"><button class="btn" onclick="approveStandardRifle()">회사 제식 규격 승인</button></div><p class="empty">변경 승인 후 군수본부가 보유 재고를 우선 지급하고 부족한 수량만 내부 조달합니다. 자금 부족 시 일부 지급은 다음 날 재검토합니다. 기존 장비는 창고로 회수합니다.</p></div><div class="card"><h3>내부 무장 자산</h3>'+Object.entries(state.weapons).map(([name,n])=>'<div class="line"><span>'+escapeHTML(name)+'</span><strong>'+n+'정</strong></div>').join('')+'</div><div class="card"><h3>보급 재고</h3><div class="line"><span>탄약</span><strong>'+state.ammo.toLocaleString()+'발</strong></div><div class="line"><span>의료 키트</span><strong>'+state.med+'개</strong></div><div class="line"><span>보호장비</span><strong>'+state.gear+'세트</strong></div></div><p class="muted">총기 외 일반 보급품 구매는 기존 군수 관리 절차를 유지합니다.</p>'+oldLogistics().split('<h2>구매 결재</h2>')[1]?.replace(/^/,'<h2>일반 보급품 결재</h2>')||'';
 };
 window.approveStandardRifle=function(){
  const next=document.getElementById('standard-rifle')?.value;
  if(!catalog.includes(next))return;
  if(next===policy.standard){standardize();save();render();return}
  const count=eligible().filter(p=>p.loadout?.primary&&p.loadout.primary!=='미지급').length;
  const estimate=outstanding().length*price+count*changeFee;
  if(!confirm('제식소총을 '+next+'(으)로 변경할까요?\n기존 지급 장비 교체 시 인당 '+money(changeFee)+'의 비용이 발생하며, 신규 장비는 재고를 우선 사용합니다.'))return;
  policy.standard=next;report('회사 제식소총 변경 승인','공식 제식소총을 '+next+'(으)로 변경했습니다. 군수본부가 인력별 장비 지급 및 회수를 순차 진행합니다.');
  standardize();save();render();
 };
 const oldNext=nextDay;
 nextDay=function(){oldNext();if(outstanding().length){standardize();save();render()}};
 // One-time migration for current staff; no daily history retained.
 if(outstanding().length){standardize();save()}
})();