/* Qualified fictional applicants replenish the recruitment market without recycling people. */
(function(){
 window.blacklineRefreshApplicants=function(){if(state.candidates.length>=8)return;state.personnelMarket=state.personnelMarket||{sequence:100,lastBatch:null};const market=state.personnelMarket,known=new Set([...state.team,...state.candidates,...(state.alumni||[]),...(state.fallen||[])].map(p=>p.id)),names=['정민재','서진우','한도윤','오지훈','윤서준','강태성','배준혁','신현우','최수빈','김시우','이정훈','박하준'],roles=['소총수','의무','지원','정찰','통신','팀장'];let count=0;
  while(state.candidates.length<10&&count<6){while(known.has(++market.sequence)){}const id=market.sequence,role=roles[id%roles.length],age=27+id%15,year=Number(state.date.slice(0,4)),skill=65+id*7%20;state.candidates.push({id,name:names[id%names.length]+' '+String(Math.floor(id/12)),country:'대한민국',unit:role==='의무'?'군 의무·응급구조 경력':'군 복무·민간 보안 경력',rank:role==='팀장'?'상사':'중사',role,skill,salary:65000000+(id%8)*5000000,birthDate:(year-age)+'-05-12',military:{start:(year-age+20)+'-03-01',discharge:(year-2)+'-03-01',reason:'정상 전역'},applicationDate:state.date,screened:true});known.add(id);count++;}market.lastBatch=state.date;
 };
})();
