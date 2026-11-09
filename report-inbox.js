/* BLACKLINE executive inbox: editorial reports, not raw log dumps. */
(function(){
let opened=null,filter='전체',query='';
const esc=x=>escapeHTML(String(x??''));
const reports=()=>Array.isArray(state.reports)?state.reports.filter(x=>x&&typeof x==='object'):[];
const clean=x=>String(x||'').replace(/\s+/g,' ').trim();
const category=x=>String(x?.category||'운영').replace(/본부$/,'');
const moneyText=n=>money(Number(n)||0);
const stamp=x=>esc(x?.date||state.date);
const group=x=>/재무/.test(category(x))?'재무':/군수/.test(category(x))?'군수':/인사/.test(category(x))?'인사':/작전|임무/.test(category(x))?'작전':'기타';
const palette=x=>({재무:'finance',군수:'logistics',인사:'people',작전:'ops',기타:'general'})[group(x)];
const icon=x=>({재무:'₩',군수:'▣',인사:'♙',작전:'◇',기타:'✉'})[group(x)];
function sentences(s){
 return clean(s).replace(/([.!?。])(?=\S)/g,'$1 ').split(/(?<=[.!?。])\s+|;\s+/).map(v=>v.trim()).filter(Boolean);
}
function extract(x){
 const list=sentences(x?.body),main=list[0]||'부서에서 업무 처리 결과를 보고했습니다.';
 const metrics=[];
 const body=clean(x?.body);
 if(x.amount!==undefined)metrics.push({label:'재무 반영',value:moneyText(x.amount)});
 const limit=body.match(/(?:예산 상한|총 한도|승인 예산 한도)\s*([\d,]+(?:만원|원))/);
 if(limit)metrics.push({label:'예산 한도',value:limit[1]});
 const deployment=body.match(/(\d{4}-\d{2}-\d{2})\s*(?:투입 예정|작전 투입)/);
 if(deployment)metrics.push({label:'투입 예정',value:deployment[1]});
 const headcount=body.match(/(?:총\s*)?(\d+)명\s*(?:지급|편성|투입|계약)/);
 if(headcount)metrics.push({label:'관련 인원',value:headcount[1]+'명'});
 return {main,details:list.slice(1),metrics:metrics.slice(0,3)};
}
function rows(){
 const all=reports().map((x,i)=>({x,i})),items=all.filter(({x})=>(filter==='전체'||group(x)===filter)&&(!query||[x.title,x.body,x.category].join(' ').toLowerCase().includes(query.toLowerCase()))).slice(0,65);
 return '<div class="mail-toolbar"><div class="mail-filters">'+['전체','작전','재무','인사','군수'].map(v=>'<button type="button" class="'+(filter===v?'selected':'')+'" onclick="companyMailFilter(\''+v+'\')">'+v+'</button>').join('')+'</div><label class="mail-search"><span>⌕</span><input aria-label="보고서 검색" placeholder="제목 · 내용 검색" value="'+esc(query)+'" oninput="companyMailSearch(this.value)"></label></div><div class="mail-summary"><span>수신 문서</span><strong>'+items.length+'건</strong></div><section class="mail-inbox" aria-label="부서별 보고서 수신함">'+(items.length?items.map(({x,i})=>'<button type="button" class="mail-item mail-'+palette(x)+'" data-report-index="'+i+'" onclick="openCompanyReport('+i+')"><span class="mail-icon">'+icon(x)+'</span><span class="mail-info"><span class="mail-head"><strong>'+esc(category(x))+'본부</strong><time>'+stamp(x)+'</time></span><span class="mail-subject">'+esc(x.title||'업무 보고')+'</span><span class="mail-preview">'+esc(clean(x.body))+'</span></span><span class="mail-chevron">›</span></button>').join(''):'<div class="mail-empty">조건에 맞는 보고서가 없습니다.</div>')+'</section>';
}
window.companyMailFilter=v=>{filter=v;const holder=document.getElementById('company-inbox');if(holder)holder.innerHTML=rows()};
window.companyMailSearch=v=>{query=v;const holder=document.getElementById('company-inbox');if(holder){holder.innerHTML=rows();const input=holder.querySelector('.mail-search input');if(input){input.focus();input.setSelectionRange(v.length,v.length)}}};
function dossier(x){
 const data=extract(x),cat=category(x),index=reports().indexOf(x),structured=x.detail&&Array.isArray(x.detail.sections)?x.detail:null;
 if(structured){data.main=structured.summary||data.main;data.metrics=Array.isArray(structured.metrics)?structured.metrics.slice(0,4):data.metrics}
 const detail=structured?structured.sections.filter(Boolean).map((section,i)=>'<section class="report-structured-section"><h3>'+esc(section.title||'세부 보고')+'</h3><div class="report-findings">'+(Array.isArray(section.items)?section.items:[]).map((item,j)=>'<div class="report-finding"><span class="report-finding-num">'+String(j+1).padStart(2,'0')+'</span><p>'+esc(item)+'</p></div>').join('')+'</div></section>').join(''):data.details.length?data.details.map((s,i)=>'<div class="report-finding"><span class="report-finding-num">'+String(i+1).padStart(2,'0')+'</span><p>'+esc(s)+'</p></div>').join(''):'<p class="report-no-detail">추가 확인 사항은 보고되지 않았습니다.</p>';
 return '<div class="report-dossier report-'+palette(x)+'"><header class="report-topbar"><button type="button" class="report-back" onclick="closeCompanyReport()" aria-label="보고서 닫기"><span class="report-back-arrow">‹</span> 수신함</button><span class="report-toplabel">BLACKLINE / DOCUMENTS</span></header><div class="report-scroll"><article class="report-letter"><div class="report-doc-header"><span class="report-brand">BLACKLINE <em>PMC</em></span><span class="report-doc-type">EXECUTIVE REPORT</span></div><div class="report-document-id"><span class="report-pill">'+esc(cat)+'본부</span><span>INTERNAL · '+stamp(x)+'</span></div><h1>'+esc(x.title||'업무 보고')+'</h1><div class="report-overview"><div class="report-overview-label">핵심 요약 <span>EXECUTIVE SUMMARY</span></div><p>'+esc(data.main)+'</p></div>'+ (data.metrics.length?'<div class="report-kpis">'+data.metrics.map(m=>'<div class="report-kpi"><small>'+esc(m?.label)+'</small><strong>'+esc(m?.value)+'</strong></div>').join('')+'</div>':'')+'<div class="report-section-title"><span>01</span><h2>업무 처리 내역</h2></div><div class="report-findings">'+detail+'</div><div class="report-section-title"><span>02</span><h2>보고 및 기록</h2></div><div class="report-info"><div><span>작성 부서</span><strong>'+esc(cat)+'본부</strong></div><div><span>보고 일자</span><strong>'+stamp(x)+'</strong></div><div><span>수신 대상</span><strong>대표이사</strong></div><div><span>처리 상태</span><strong>자동 처리 / 열람 전용</strong></div></div><div class="report-signature"><span>BLACKLINE PMC</span><strong>'+esc(cat)+'본부</strong><small>게임 내 생성된 가상 업무 기록 · 원문 내용을 기반으로 구성</small></div></article></div><div class="report-bottom"><span>'+(index+1)+' / '+reports().length+'</span><div><button type="button" onclick="companyReportMove(1)" '+(index>=reports().length-1?'disabled':'')+'>이전 문서</button><button type="button" onclick="companyReportMove(-1)" '+(index<=0?'disabled':'')+'>다음 문서</button></div></div></div>';
}
function mount(){
 let root=document.getElementById('company-report-root');
 if(!root){root=document.createElement('div');root.id='company-report-root';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','부서 보고서 상세');document.body.appendChild(root)}
 const x=opened===null?null:reports()[opened];
 if(!x){root.hidden=true;root.innerHTML='';document.body.classList.remove('report-open');opened=null;return}
 try{root.innerHTML=dossier(x)}catch(error){console.error('보고서 상세 렌더링 오류',error);root.innerHTML='<div class="report-dossier"><header class="report-topbar"><button type="button" class="report-back" onclick="closeCompanyReport()">‹ 수신함</button></header><div class="report-scroll"><article class="report-letter"><h2>'+esc(x.title||'업무 보고')+'</h2><p>'+esc(x.body||'본문 없음')+'</p><p class="empty">상세 구성에 오류가 있어 원문으로 표시합니다.</p></article></div></div>'}root.hidden=false;document.body.classList.add('report-open');
}
window.openCompanyReport=i=>{try{i=Number(i);if(!Number.isInteger(i)||i<0||i>=reports().length)return;opened=i;mount()}catch(error){console.error('보고서 열기 오류',error);const x=reports()[i];if(!x)return;let root=document.getElementById('company-report-root');if(!root){root=document.createElement('div');root.id='company-report-root';document.body.appendChild(root)}root.hidden=false;root.innerHTML='<div class="report-dossier"><header class="report-topbar"><button type="button" onclick="closeCompanyReport()">‹ 수신함</button></header><div class="report-scroll"><article class="report-letter"><h2>'+esc(x.title)+'</h2><p>'+esc(x.body)+'</p></article></div></div>';document.body.classList.add('report-open')}};
window.closeCompanyReport=()=>{opened=null;mount()};
window.companyReportMove=offset=>{const next=opened+offset;if(next>=0&&next<reports().length){opened=next;mount()}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened!==null)window.closeCompanyReport()});
const baseHome=home,baseRender=render,baseGo=go;
home=function(){
 const all=reports(),active=(state.operations||[]).filter(o=>!['작전 완료','작전 보류'].includes(o.status));
 const stats='<div class="stats"><div class="stat"><small>현재 날짜</small><strong>'+esc(state.date)+'</strong><span class="stat-foot">운영 '+Number(state.day||1)+'일차</span></div><div class="stat"><small>가용 자금</small><strong>'+money(state.cash)+'</strong><span class="stat-foot">회사 가용 자금</span></div><div class="stat"><small>계약 인력</small><strong>'+(state.team||[]).filter(p=>!p.dead&&!p.retired).length+'명</strong><span class="stat-foot">현직 계약 인원</span></div><div class="stat"><small>회사 평판</small><strong>'+Number(state.reputation||0)+'<span style="font-size:12px;font-weight:500"> / 100</span></strong><span class="stat-foot">계약시장 신뢰 지표</span></div></div>';
 const advance='<div class="card daily-progress"><div class="line"><div><small>DAILY OPERATIONS</small><h3>일일 운영 진행</h3></div><span class="tag">'+esc(state.date)+'</span></div><p class="empty">하루를 진행하면 각 부서가 자율적으로 업무를 처리하고 새 보고서를 발송합니다.</p><button class="btn" type="button" aria-label="다음 날 진행" onclick="nextDay()">다음 날 진행</button></div>';
 const ops='<h2>진행 중인 작전</h2>'+(active.length?active.slice(0,5).map(o=>'<div class="card"><div class="line"><strong>'+esc((o.contract||(state.missions||[]).find(m=>m.id===o.missionId))?.title||'진행 중인 작전')+'</strong><span class="tag">'+esc(o.status)+'</span></div><p class="empty">현장지휘관 '+esc(o.leaderName||'미배정')+' · 투입 '+esc(o.deployDate||'미정')+'</p></div>').join(''):'<div class="card"><p class="empty">현재 진행 중인 작전이 없습니다.</p></div>');
 return '<div class="hero"><div class="hero-copy"><small class="eyebrow">THE EXECUTIVE BRIEFING</small><h1>회사의 오늘을,<br>한눈에.</h1><p>사람과 자원, 그리고 현장의 흐름.<br>각 부서의 판단을 살펴보고 회사의 다음을 읽어보세요.</p><div class="hero-note">BLACKLINE PMC · 회사 운영 현황</div></div><svg class="hero-map" viewBox="0 0 500 270" fill="none" aria-hidden="true"><g stroke="#ccd7eb" stroke-width=".7"><path d="M0 50h500M0 100h500M0 150h500M0 200h500M0 250h500M50 0v270M100 0v270M150 0v270M200 0v270M250 0v270M300 0v270M350 0v270M400 0v270M450 0v270"/></g><g fill="#d4dfee" stroke="#f5f8fc" stroke-width="2"><path d="m60 58 35-20 35 3 18 22 31-8 25 19-18 24-37 7-9 30-20-13-15-26-28-2-7-18Z"/><path d="m150 137 28 5 26 30-9 25-22 36-16-15-2-26-17-28Z"/><path d="m239 66 24-15 29 7 15-10 41 10 26-4 45 23 9 27-40 9-16 29-25-9-25-22-24 2-24-17-31-5Z"/><path d="m248 108 29 4 32 20-9 43-23 30-22-15-6-39-14-20Z"/><path d="m377 184 35-10 25 17-6 23-42 2-17-15Z"/></g><g stroke="#7796d6" stroke-width="1.5" stroke-dasharray="4 5"><path d="M124 86Q212 12 268 82Q355 100 393 194"/><path d="M268 82q-60 35-104 80"/></g><g fill="#5476c2" stroke="#f3f6fc" stroke-width="4"><circle cx="124" cy="86" r="6"/><circle cx="268" cy="82" r="6"/><circle cx="164" cy="162" r="5"/><circle cx="393" cy="194" r="5"/></g><circle cx="268" cy="82" r="18" stroke="#7898d5" opacity=".35"/><circle cx="268" cy="82" r="30" stroke="#7898d5" opacity=".15"/></svg><span class="hero-index">GLOBAL PERSPECTIVE / LOCAL INSIGHT</span></div>'+stats+'<div class="executive-grid"><section aria-label="부서별 수신함"><div class="mail-heading"><div><small>COMPANY CORRESPONDENCE</small><h2>부서별 수신함</h2></div><span>'+all.length+'건 수신</span></div><div id="company-inbox">'+rows()+'</div></section><aside aria-label="일일 운영 및 진행 중 작전">'+advance+ops+'<div class="aside-note"><strong>AUTONOMOUS BY DESIGN</strong>각 부서와 현장 지휘관이 자율적으로 판단합니다. 사장은 운영의 흐름과 결과를 관찰합니다.</div></aside></div>';
};
render=function(){baseRender();if(opened!==null)mount()};
go=function(t){if(opened!==null)window.closeCompanyReport();baseGo(t)};
})();