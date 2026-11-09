/* Ongoing commander decisions, based on confirmed contacts and approved budgets. */
(function(){const api=window.fieldSimulation,{active,dist}=api.internals,tick=api.sceneTick;
 api.reviewFireSupport=function(s,op){if(!s.journey||s.done||s.retreat||s.remoteRecon||!['site','outdoor'].includes(s.journey.stage)||!op.fieldProgress||op.fieldProgress.finalized)return;
  const fp=op.fieldProgress,known=s.units.filter(u=>active(u)&&!u.inside&&!u.roadOnly&&(u.faction==='insurgent'||u.faction==='pmc'&&s.rival.hostile)&&s.contacts[u.id]?.visible&&s.contacts[u.id].identified!==false&&s.time-s.contacts[u.id].lastSeen<=5),team=s.units.filter(u=>u.faction==='blackline'&&active(u));if(!known.length)return;
  const artillery=['authorized','restricted'].includes(op.artillery)&&known.length>=(op.artillery==='authorized'?2:3),air=['authorized','restricted'].includes(op.air)&&(op.air==='authorized'||known.length>=3||team.some(u=>u.woundedAt!=null));
  const choices=[...(artillery?[{kind:'artillery',name:'승인된 원거리 지원',cost:11000000,radius:6}]:[]),...(air?[{kind:'airstrike',name:'승인된 공중 지원',cost:14000000,radius:8}]:[])];
  fp.supportOrders=fp.supportOrders||[];
  for(const choice of choices){if(fp.supportOrders.some(o=>o.kind===choice.kind||o.name===choice.name))continue;
   const target=known.find(t=>!s.units.some(u=>active(u)&&!u.inside&&!u.roadOnly&&(u.faction==='blackline'||u.faction==='pmc'&&!s.rival.hostile)&&dist(u,t)<choice.radius+3)&&!(s.civilians||[]).some(c=>c.found&&c.hp>0&&dist(c,t)<choice.radius+3));
   const cost=choice.cost,spent=Number(fp.reservedSupportCost)||0;
   if(!target||Number(op.budget)<spent+cost||Number(state.cash)<cost){s.fireSupportReview=s.fireSupportReview||{};if(s.time-(s.fireSupportReview[choice.kind]??-100)>=60){s.fireSupportReview[choice.kind]=s.time;api.transmit(s,'작전지원본부',choice.name+' 보류. '+(!target?'아군·보호 대상 근접, 안전한 타격 구역 없음.':'승인 예산 또는 가용 자금 부족.'),'support');}continue;}
   const order={id:op.id+'-FIRE-'+choice.kind,kind:choice.kind,name:choice.name,cost,requestedAt:s.time,eta:35,charged:true,reason:'확인된 위협과 안전거리 검토 후 현장지휘관 요청'};
   state.cash-=cost;fp.reservedSupportCost=spent+cost;fp.supportOrders.push(order);api.transmit(s,'현장지휘관',choice.name+' 요청. 확인 표적 '+known.length+'개, 안전거리 확인. 예산 '+Math.round(cost/10000)+'만원 집행, 지원 도착 예상 35초.','support',true);break;
  }
 };
 api.sceneTick=function(s,op){tick?.(s,op);api.reviewFireSupport(s,op)};
})();
