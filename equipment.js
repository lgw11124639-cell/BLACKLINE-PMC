/* Individually tracked company equipment; old save keys and existing property are retained. */
(function(){
 const primaryPrices={'K2C1':2400000,'K1A':1700000,'K14':6800000,'K15':7800000,'HK416':4500000,'M4A1':3700000,'SIG MCX':5100000,'FN SCAR-L':4900000,'HK G36':3900000,'HK MP7':4200000,'Accuracy International AXMC':11800000,'Barrett MRAD':12500000,'Sako TRG 42':9800000};
 const catalog={},add=(name,slot,price,weight,extra={})=>catalog[name]={name,slot,price,weight,repairable:true,...extra};
 for(const [n,p]of Object.entries(primaryPrices))add(n,'primary',p,/AXMC|MRAD|TRG|K14/.test(n)?6.5:n==='K15'?7.2:n==='K1A'?2.9:3.4);
 const rifles=Object.keys(primaryPrices),precision=rifles.filter(n=>/AXMC|MRAD|TRG|K14/.test(n)),light=rifles.filter(n=>!precision.includes(n)&&n!=='HK MP7');
 add('K5','secondary',550000,.8,{capacity:12,magazines:3,range:14});
 add('Glock 19 Gen5','secondary',950000,.7,{capacity:15,magazines:3,range:14});add('SIG Sauer P320','secondary',1050000,.85,{capacity:17,magazines:3,range:15});
 add('SureFire SOCOM556-RC2','suppressor',1350000,.48,{compatible:light});add('ASE UTRA SL7i .338','suppressor',1750000,.7,{compatible:precision});add('B&T ROTEX-V 7.62','suppressor',1500000,.65,{compatible:['K14']});add('B&T ROTEX-II 4.6','suppressor',1100000,.4,{compatible:['HK MP7']});
 add('Aimpoint CompM5','optic',1150000,.25,{compatible:rifles,optical:'reflex'});add('Nightforce ATACR 5-25x56','optic',3200000,1.1,{compatible:precision,optical:'magnified'});
 add('L3Harris ATPIAL-C','laser',1800000,.21,{compatible:rifles,electronic:true});add('SureFire M600 Scout','light',480000,.16,{compatible:rifles,electronic:true});add('Harris S-BRM','bipod',260000,.37,{compatible:precision});
 add('Crye JPC 2.0','armor',550000,1);add('NIJ IV 세라믹 방탄판','plate',700000,5.5,{repairable:false});add('Ops-Core FAST SF','helmet',850000,1.2,{repairable:false});
 add('ESS Crossbow','eyewear',170000,.04,{repairable:false});add('3M PELTOR ComTac VI','hearing',850000,.34,{electronic:true});add('Mechanix M-Pact','gloves',70000,.15,{repairable:false});add('Salomon Quest 4D Forces','boots',320000,1.3);
 add('L3Harris AN/PRC-152A','radio',2100000,.9,{electronic:true});add('L3Harris AN/PVS-31A','nightVision',6500000,.45,{electronic:true});
 const aliases={'탄도 방호복':'Crye JPC 2.0','탄도 헬멧':'Ops-Core FAST SF','정밀사격 소총':'Accuracy International AXMC'},clone=x=>JSON.parse(JSON.stringify(x)),esc=x=>escapeHTML(String(x??''));
 state.equipment=state.equipment||{version:1,nextId:1,items:[],ledger:[]};const store=state.equipment;store.items=store.items||[];store.ledger=store.ledger||[];store.nextId=store.nextId||1;
 const now=()=>Number(state.day||1)*1440+Number(state.simClock?.minutes??480),byId=id=>store.items.find(i=>i.id===id),model=n=>catalog[aliases[n]||n];
 function item(name,status='stock',personId=null,condition=100){const n=aliases[name]||name,i={id:'EQ-'+store.nextId++,model:n,condition:Math.max(0,Math.min(100,condition)),battery:catalog[n]?.electronic?100:null,status,personId,repairs:0};store.items.push(i);return i}
 function record(kind,i,detail={}){store.revision=(store.revision||0)+1;store.ledger.push({at:now(),date:state.date,kind,id:i?.id,model:i?.model,...detail});store.ledger=store.ledger.slice(-160)}
 function syncStocks(){for(const n of Object.keys(primaryPrices))state.weapons[n]=store.items.filter(i=>i.model===n&&i.status==='stock'&&i.condition>=35).length;}
 function adopt(p,slot,name,condition=100){p.equipmentSlots=p.equipmentSlots||{};const old=byId(p.equipmentSlots[slot]);if(old&&old.personId===p.id&&old.status==='issued')return old;if(!name||name==='미지급')return null;const i=item(name,'issued',p.id,condition);p.equipmentSlots[slot]=i.id;record('기존 지급품 등록',i,{personId:p.id,slot});return i}
 if(!store.migrated){
  for(const [name,count]of Object.entries(state.weapons||{}))if(model(name)?.slot==='primary')for(let i=0;i<Number(count);i++)item(name);
  for(const p of state.team||[]){const l=p.loadout||{};for(const slot of ['primary','secondary','armor','helmet','radio','plate','eyewear','hearing','gloves','boots','nightVision'])if(l[slot]&&l[slot]!=='미지급')adopt(p,slot,l[slot],['plate','armor','helmet'].includes(slot)?p.armorCondition??100:100);
   if(l.armor==='탄도 방호복'&&!p.equipmentSlots?.plate)adopt(p,'plate','NIJ IV 세라믹 방탄판',p.armorCondition??100);
   for(const name of l.attachments||[]){const m=model(typeof name==='string'?name:name.model);if(m)adopt(p,m.slot,m.name);}
  }store.migrated=true;syncStocks();
 }
 function busy(p){return !!p.supportReservation||!!p.recoveryAssignment||!!p.awaitingRecovery||(state.operations||[]).some(o=>o.status==='현장 진행 중'&&o.fieldProgress?.tactical&&!o.fieldProgress.tactical.done&&(o.teamIds||[]).includes(p.id)||o.status==='사전 정찰'&&o.preRecon?.status==='진행'&&(o.preRecon.memberIds||[]).includes(p.id));}
 function rebuild(p){p.loadout=p.loadout||{};const l=p.loadout;for(const slot of ['primary','secondary','armor','plate','helmet','radio','eyewear','hearing','gloves','boots','nightVision']){const i=byId(p.equipmentSlots?.[slot]);if(i&&i.status==='issued'&&i.personId===p.id)l[slot]=i.model;else if(p.equipmentSlots?.[slot])l[slot]='미지급';}
  l.attachments=Object.entries(p.equipmentSlots||{}).filter(([slot])=>['optic','suppressor','laser','light','bipod'].includes(slot)).map(([,id])=>byId(id)).filter(i=>i?.status==='issued'&&i.personId===p.id).map(i=>i.model);const plate=byId(p.equipmentSlots?.plate);if(plate)p.armorCondition=plate.condition;
 }
 function service(i){const m=catalog[i.model];if(!m)return;const charge=i.battery!=null&&i.battery<35;if(i.condition>=35&&!charge)return;
  if(!m.repairable||i.repairs>=5||i.condition<=3){i.status='discarded';record('폐기',i);return;}
  const cost=Math.ceil(m.price*(charge&&i.condition>=35?.002:.1));if(Number(state.cash)-cost<20000000)return;i.status='repair';i.personId=null;i.readyAt=now()+(charge&&i.condition>=35?60:120);i.serviceCondition=charge&&i.condition>=35?i.condition:Math.max(65,95-i.repairs*5);i.repairs+=i.condition<35?1:0;state.cash-=cost;record(charge?'충전·점검':'수리 접수',i,{cost,readyAt:i.readyAt});
 }
 const desiredPrimary=p=>window.blacklineMilitaryPrimary?window.blacklineMilitaryPrimary(p):/저격|정밀사수|지정사수/.test(p.role||'')?'Accuracy International AXMC':/정찰/.test(p.role||'')?'SIG MCX':/의무|메딕|통신/.test(p.role||'')?'M4A1':/지원/.test(p.role||'')?'FN SCAR-L':'HK416';
 function issue(p,slot,name,notes){const m=catalog[name];if(!m)return;let i=byId(p.equipmentSlots?.[slot]);if(i?.status==='issued'&&i.model===name&&i.condition>=35&&(i.battery==null||i.battery>=35))return;
  if(i?.status==='issued'&&i.model!==name&&i.condition>=35&&!store.items.some(x=>x.model===name&&x.status==='stock'&&x.condition>=35)&&Number(state.cash)-m.price<20000000)return;
  if(i?.status==='issued'){i.personId=null;service(i);if(i.status==='issued')i.status='stock';delete p.equipmentSlots[slot];if(p.loadout)p.loadout[slot]='미지급';record('회수',i,{personId:p.id});}
  i=store.items.find(i=>i.model===name&&i.status==='stock'&&i.condition>=35&&(i.battery==null||i.battery>=35));
  if(!i){if(Number(state.cash)-m.price<20000000)return;state.cash-=m.price;i=item(name);record('신규 조달',i,{cost:m.price});notes.push(name+' 조달 '+money(m.price));}
  i.status='issued';i.personId=p.id;p.equipmentSlots=p.equipmentSlots||{};p.equipmentSlots[slot]=i.id;record('지급',i,{personId:p.id,slot});
 }
 window.blacklineReviewEquipment=function(){const before=store.revision||0,notes=[];let changed=false;
  for(const i of store.items)if(i.status==='stock'&&(i.condition<35||i.battery!=null&&i.battery<35))service(i);
  for(const i of store.items)if(i.status==='repair'&&now()>=i.readyAt){i.status='stock';i.condition=i.serviceCondition;i.battery=catalog[i.model]?.electronic?100:null;delete i.readyAt;delete i.serviceCondition;record('수리·충전 완료',i);changed=true;}
  for(const p of (state.team||[]).filter(p=>!p.dead&&!p.retired&&!busy(p))){p.equipmentSlots=p.equipmentSlots||{};const l=p.loadout||{};for(const slot of ['primary','secondary','armor','helmet','radio'])if(l[slot]&&l[slot]!=='미지급'&&!p.equipmentSlots[slot])adopt(p,slot,l[slot],slot==='armor'?p.armorCondition??100:100);
   if(['armor','plate','helmet'].some(k=>!p.equipmentSlots[k])&&state.gear>0){state.gear--;for(const [slot,n]of [['armor','Crye JPC 2.0'],['plate','NIJ IV 세라믹 방탄판'],['helmet','Ops-Core FAST SF']]){const existing=item(n);if(!p.equipmentSlots[slot]){existing.status='issued';existing.personId=p.id;p.equipmentSlots[slot]=existing.id;}record('기존 보호장비 세트 분해',existing,{personId:existing.personId});}}
   issue(p,'primary',desiredPrimary(p),notes);
   const gun=byId(p.equipmentSlots.primary)?.model||l.primary;
   for(const [slot,n]of [['armor','Crye JPC 2.0'],['plate','NIJ IV 세라믹 방탄판'],['helmet','Ops-Core FAST SF'],['radio','L3Harris AN/PRC-152A'],['secondary',state.overseasCommand?'K5':'Glock 19 Gen5'],['eyewear','ESS Crossbow'],['hearing','3M PELTOR ComTac VI'],['gloves','Mechanix M-Pact'],['boots','Salomon Quest 4D Forces']])issue(p,slot,n,notes);
   for(const slot of ['optic','suppressor','laser','light','bipod']){const old=byId(p.equipmentSlots[slot]);if(old&&catalog[old.model]?.compatible&&!catalog[old.model].compatible.includes(gun)){old.status='stock';old.personId=null;delete p.equipmentSlots[slot];record('총기 호환 불일치 회수',old,{personId:p.id});}let choice=slot==='optic'?(/AXMC|MRAD|TRG|K14/.test(gun)?'Nightforce ATACR 5-25x56':'Aimpoint CompM5'):slot==='suppressor'?(gun==='K14'?'B&T ROTEX-V 7.62':/AXMC|MRAD|TRG/.test(gun)?'ASE UTRA SL7i .338':gun==='HK MP7'?'B&T ROTEX-II 4.6':'SureFire SOCOM556-RC2'):slot==='laser'?'L3Harris ATPIAL-C':slot==='light'?'SureFire M600 Scout':'Harris S-BRM';
    if(catalog[choice].compatible?.includes(gun))issue(p,slot,choice,notes);
   }
   if(/정찰|저격|정밀/.test(p.role||''))issue(p,'nightVision','L3Harris AN/PVS-31A',notes);rebuild(p);
  }
  syncStocks();changed=changed||(store.revision||0)!==before;if(notes.length||changed){state.reports.unshift({date:state.date,category:'군수',title:'개인 장비 조달·정비 보고',body:notes.length?notes.slice(0,16).join(' · '):'수리·충전이 완료된 장비를 창고에 입고했습니다.'});state.reports=state.reports.slice(0,90);}return notes.length>0||changed;
 };
 window.blacklineReturnPersonnelEquipment=function(p){for(const id of Object.values(p.equipmentSlots||{})){const i=byId(id);if(i?.status==='issued'&&i.personId===p.id){i.personId=null;i.status='stock';service(i);record('퇴직 장비 회수',i,{personId:p.id});}}p.equipmentSlots={};p.loadout={primary:'미지급',secondary:'미지급',armor:'미지급',helmet:'미지급',radio:'미지급',attachments:[]};syncStocks();};
 window.blacklineEquipmentMovement=u=>{const items=Object.values(u.fieldEquipment?.slots||{}),weight=items.reduce((n,i)=>n+(catalog[i.model]?.weight||0),0),boots=items.find(i=>catalog[i.model]?.slot==='boots');return Math.max(.7,1-Math.max(0,weight-15)*.012)*(boots&&boots.condition<15?.92:1)};
 window.blacklineEquipment={catalog,byId,clone,rebuild,syncStocks,record,now,service};
 window.blacklineEquipmentReadiness=members=>members.flatMap(p=>['primary','armor','plate','helmet','radio'].filter(slot=>{const i=byId(p.equipmentSlots?.[slot]);return !i||i.personId!==p.id||i.status!=='issued'||i.condition<35||(i.battery!=null&&i.battery<10)}).map(slot=>p.name+' '+({primary:'주무장',armor:'방호복',plate:'방탄판',helmet:'헬멧',radio:'통신기'}[slot]||slot)+' 확보·정비 대기'));
 window.blacklineEquipmentProfile=function(p){const live=(state.operations||[]).flatMap(o=>[o.fieldProgress?.tactical,o.preRecon?.operation.fieldProgress.tactical]).filter(s=>s&&!s.done&&!s.equipmentSettled).flatMap(s=>s.units).find(u=>u.personId===p.id)?.fieldEquipment;const slots=Object.entries(p.equipmentSlots||{}).map(([slot,id])=>[slot,live?.slots[slot]?.id===id?live.slots[slot]:byId(id)]).filter(([,i])=>i);return '<div class="dossier-section-label">개별 장비 · 내구도</div><div class="dossier-report">'+slots.map(([slot,i])=>'<div class="line"><span>'+esc(i.model)+'</span><strong>'+Math.round(i.condition)+'%'+(i.battery!=null?' · 배터리 '+Math.round(i.battery)+'%':'')+'</strong></div>').join('')+'<p class="dossier-muted">기지 보유품과 현재 출동품의 실측 내구도입니다. 복귀 후 정비·충전 및 손실을 정산합니다.</p></div>';};
})();
