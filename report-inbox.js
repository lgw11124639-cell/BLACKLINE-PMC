/* Compact executive inbox + full-screen read-only report dossier. */
(function(){
let opened=null;
const esc=x=>escapeHTML(String(x??''));
const date=x=>esc(x.date||state.date);
const reports=()=>Array.isArray(state.reports)?state.reports:[];
const brief=x=>String(x.body||'').replace(/\s+/g,' ').trim();
function rows(){
 const items=reports().slice(0,60);
 if(!items.length)return '<div class="mail-empty">수신된 보고서가 없습니다.</div>';
 return '<section class="mail-inbox" aria-label="부서별 보고서 수신함">'+items.map((x,i)=>'<button type="button" class="mail-item" onclick="openCompanyReport('+i+')"><span class="mail-icon">✉</span><span class="mail-info"><span class="mail-head"><strong>'+esc(x.category||'본부')+'본부</strong><time>'+date(x)+'</time></span><span class="mail-subject">'+esc(x.title||'업무 보고')+'</span><span class="mail-preview">'+esc(brief(x))+'</span></span><span class="mail-chevron">›</span></button>').join('')+'</section>';
}
function dossier(x){
 const body=String(x.body||'').trim();
 const sentences=body.split(/(?<=[.!?。])\s+|;\s+/).filter(Boolean);
 const chunks=sentences.length>1?sentences:[body];
 return '<div class="report-dossier"><header class="report-topbar"><button type="button" class="report-back" onclick="closeCompanyReport()" aria-label="보고서 닫기">‹ <span>수신함</span></button><span class="report-toplabel">BLACKLINE / INTERNAL</span></header><div class="report-scroll"><div class="report-letter"><div class="report-seal">BLACKLINE PMC <span>INTERNAL MEMORANDUM</span></div><div class="report-classification">내부 업무 보고 · 열람 전용</div><h1>'+esc(x.title||'업무 보고')+'</h1><div class="report-fields"><div><span>발신 부서</span><strong>'+esc(x.category||'본부')+'본부</strong></div><div><span>보고 일자</span><strong>'+date(x)+'</strong></div><div><span>수신</span><strong>대표이사 / 경영본부</strong></div><div><span>처리 구분</span><strong>자동 처리 · 결과 보고</strong></div></div><h2>보고 내용</h2><div class="report-prose">'+chunks.map(t=>'<p>'+esc(t)+'</p>').join('')+'</div>'+(x.amount!==undefined?'<div class="report-finance"><span>재무 반영 금액</span><strong>'+money(Number(x.amount)||0)+'</strong></div>':'')+'<div class="report-signature"><span>BLACKLINE PMC</span><strong>'+esc(x.category||'운영')+'본부</strong><small>본 문서는 게임 내 자동 생성된 가상 보고서입니다.</small></div></div></div></div>';
}
function mount(){
 let root=document.getElementById('company-report-root');
 if(!root){root=document.createElement('div');root.id='company-report-root';document.body.appendChild(root)}
 const x=reports()[opened];
 if(opened===null||!x){root.innerHTML='';document.body.classList.remove('report-open');opened=null;return}
 root.innerHTML=dossier(x);document.body.classList.add('report-open');
}
window.openCompanyReport=function(i){if(!Number.isInteger(i)||i<0||i>=reports().length)return;opened=i;mount()};
window.closeCompanyReport=function(){opened=null;mount()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened!==null)window.closeCompanyReport()});
const baseHome=home,baseRender=render,baseGo=go;
home=function(){
 let html=baseHome();
 const start=html.indexOf('<h2>부서별 보고서</h2>');
 const end=html.indexOf('<div class="card"><h3>운영 지침',start);
 if(start>=0&&end>start)html=html.slice(0,start)+'<div class="mail-heading"><h2>부서별 수신함</h2><span>'+reports().length+'건 수신</span></div>'+rows()+html.slice(end);
 // Replace obsolete approval wording in spectator mode.
 html=html.replace('오늘의 사장 결재함','회사 운영 현황').replace('작전 승인서 보기','작전 현황 보기').replace('사장님께서는 보고서를 검토하고 중요한 안건만 결재합니다.','사장은 각 부서의 자율 운영과 현장 작전을 관전합니다.').replace('인사·군수·작전 부서는 보고를 제출하고, 사장님은 승인과 예산 배정에 집중합니다.','각 부서가 자체적으로 운영하며 사장은 결과를 관찰합니다.');
 return html;
};
render=function(){baseRender();if(opened!==null)mount()};
go=function(t){if(opened!==null)window.closeCompanyReport();baseGo(t)};
})();