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
 if(!root){root=document.createElement('dialog');root.id='company-report-root';root.setAttribute('aria-label','부서 보고서 상세');document.body.appendChild(root);root.addEventListener('close',()=>{opened=null;document.body.classList.remove('report-open')})}
 const x=opened===null?null:reports()[opened];
 if(!x){if(root.open)root.close();root.innerHTML='';document.body.classList.remove('report-open');opened=null;return}
 try{root.innerHTML=dossier(x)}catch(error){console.error('보고서 상세 렌더링 오류',error);root.innerHTML='<div class="report-dossier"><header class="report-topbar"><button type="button" class="report-back" onclick="closeCompanyReport()">‹ 수신함</button></header><div class="report-scroll"><article class="report-letter"><h2>'+esc(x.title||'업무 보고')+'</h2><p>'+esc(x.body||'본문 없음')+'</p><p class="empty">상세 구성에 오류가 있어 원문으로 표시합니다.</p></article></div></div>'}document.body.classList.add('report-open');if(typeof root.showModal==='function'&&!root.open)root.showModal();else if(!root.open)root.setAttribute('open','');
}
window.openCompanyReport=i=>{try{i=Number(i);if(!Number.isInteger(i)||i<0||i>=reports().length)return;opened=i;mount()}catch(error){console.error('보고서 열기 오류',error);const x=reports()[i];if(x){let root=document.getElementById('company-report-root');if(!root){root=document.createElement('dialog');root.id='company-report-root';document.body.appendChild(root)}root.innerHTML='<div class="report-dossier"><button type="button" onclick="closeCompanyReport()">‹ 수신함</button><div class="report-scroll"><article class="report-letter"><h2>'+esc(x.title)+'</h2><p>'+esc(x.body)+'</p></article></div></div>';document.body.classList.add('report-open');if(typeof root.showModal==='function'&&!root.open)root.showModal();else root.setAttribute('open','')}}};
document.addEventListener('click',e=>{const item=e.target.closest?.('#company-inbox .mail-item[data-report-index]');if(!item)return;window.openCompanyReport(item.dataset.reportIndex)},true);
window.closeCompanyReport=()=>{opened=null;mount()};
window.companyReportMove=offset=>{const next=opened+offset;if(next>=0&&next<reports().length){opened=next;mount()}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened!==null)window.closeCompanyReport()});
const baseHome=home,baseRender=render,baseGo=go;
home=function(){
 const all=reports(),active=(state.operations||[]).filter(o=>!['작전 완료','작전 보류'].includes(o.status));
 const stats='<div class="stats"><div class="stat"><small>현재 날짜</small><strong>'+esc(state.date)+'</strong></div><div class="stat"><small>가용 자금</small><strong>'+money(state.cash)+'</strong></div><div class="stat"><small>계약 인력</small><strong>'+(state.team||[]).filter(p=>!p.dead&&!p.retired).length+'명</strong></div></div>';
 const advance='<div class="card daily-progress"><div class="line"><div><small>DAILY OPERATIONS</small><h3>일일 운영 진행</h3></div><span class="tag">'+esc(state.date)+'</span></div><p class="empty">하루를 진행하면 각 부서가 자율적으로 업무를 처리하고 새 보고서를 발송합니다.</p><button class="btn" type="button" onclick="nextDay()">다음 날 진행</button></div>';
 const ops='<h2>진행 중인 작전</h2>'+(active.length?active.slice(0,5).map(o=>'<div class="card"><div class="line"><strong>'+esc((state.missions||[]).find(m=>m.id===o.missionId)?.title||'진행 중인 작전')+'</strong><span class="tag">'+esc(o.status)+'</span></div><p class="empty">현장지휘관 '+esc(o.leaderName||'미배정')+' · 투입 '+esc(o.deployDate||'미정')+'</p></div>').join(''):'<div class="card"><p class="empty">현재 진행 중인 작전이 없습니다.</p></div>');
 return '<div class="hero"><small>BLACKLINE PMC / EXECUTIVE OVERVIEW</small><h1>회사 운영 현황</h1><p>각 부서가 자율적으로 운영하며, 사장은 업무 보고와 작전 진행을 관전합니다.</p></div>'+stats+advance+'<div class="mail-heading"><div><small>COMPANY CORRESPONDENCE</small><h2>부서별 수신함</h2></div><span>'+all.length+'건 수신</span></div><div id="company-inbox">'+rows()+'</div>'+ops;
};
render=function(){baseRender();if(opened!==null)mount()};
go=function(t){if(opened!==null)window.closeCompanyReport();baseGo(t)};
})();