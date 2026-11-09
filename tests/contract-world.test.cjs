const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
 const state={date:'2030-01-01',day:1,reputation:80,reports:[],history:[],operations:[],missions:[],missionTemplates:[
  {id:1,title:'발전소 방호',client:'노르덴 에너지',type:'시설 보안',risk:2,reward:100000000},
  {id:2,title:'구조',client:'구호단',type:'구조',risk:2,reward:100000000},
  {id:3,title:'항만 경비',client:'항만청',type:'시설 보안',risk:3,reward:100000000}
 ]};
 const context={state,window:{addEventListener(){}},money:String,escapeHTML:String};vm.createContext(context);vm.runInContext(fs.readFileSync('contract-world.js','utf8'),context);
 return {state,api:context.window.contractWorld};
}
test('daily refresh is idempotent and persists unique offers and bounded events',()=>{
 const {state,api}=setup();api.refresh();const initial=JSON.stringify(state);api.refresh();assert.equal(JSON.stringify(state),initial);
 assert.ok(state.missions.some(m=>m.eventId));assert.ok(state.missions.filter(m=>m.eventId).every(m=>m.type==='시설 보안'));
 for(let day=2;day<120;day++){state.day=day;state.date=new Date(Date.UTC(2030,0,day)).toISOString().slice(0,10);api.refresh()}
 assert.ok(state.contractWorld.events.length<=30);assert.ok(state.missions.length<=7);
 assert.equal(new Set(state.missions.map(m=>m.id)).size,state.missions.length);
 assert.ok(state.contractWorld.clients.every(c=>c.budget>=0));
});
test('expiration releases reserved budget once; accepted contracts survive deadlines',()=>{
 const {state,api}=setup();api.refresh();const offer=state.missions[0],client=state.contractWorld.clients.find(c=>c.id===offer.clientId);
 const budget=client.budget;offer.expiresDate='2029-12-31';api.refresh();assert.equal(client.budget,budget+offer.reward);api.refresh();assert.equal(client.budget,budget+offer.reward);
 const accepted=state.missions[0];state.operations.push({id:'active',missionId:accepted.id,status:'현장 진행 중'});accepted.expiresDate='2029-12-31';api.refresh();assert.ok(state.missions.includes(accepted));assert.equal(state.operations[0].contract.id,accepted.id);
});
test('success changes trust and region, creates attributable follow-up, settles once',()=>{
 const {state,api}=setup();api.refresh();const m=state.missions[0];m.contractStatus='수주 완료';const op={id:'op-1',missionId:m.id,status:'현장 진행 중',contract:{...m}};state.operations.push(op);
 const result={success:true,reward:m.reward,death:false,resolution:{hostileRetreated:0}};
 api.settle(op,m,result);assert.equal(op.worldSettlement.after.trust,58);assert.equal(op.worldSettlement.after.security,op.worldSettlement.before.security+5);
 assert.ok(state.missions.some(x=>x.parentContractId===m.id));assert.equal(result.contract.id,m.id);
 const snapshot=JSON.stringify(state);api.settle(op,m,result);assert.equal(JSON.stringify(state),snapshot);
});
test('failure reduces customer trust, worsens security and does not offer follow-up',()=>{
 const {state,api}=setup();api.refresh();const m=state.missions[0],op={id:'failed',missionId:m.id,status:'현장 진행 중'};state.operations.push(op);
 api.settle(op,m,{success:false,death:true,reward:1000,resolution:{hostileRetreated:4}});
 assert.equal(op.worldSettlement.after.trust,37);assert.equal(op.worldSettlement.after.security,op.worldSettlement.before.security-4);assert.ok(!state.missions.some(x=>x.parentContractId===m.id));
});
test('legacy operation snapshot survives board removal; history is not retroactively rewarded',()=>{
 const {state,api}=setup();state.missions.push({...state.missionTemplates[0],receivedDate:'2029-12-01',expiresDate:'2029-12-31'});state.operations.push({id:'legacy',missionId:1,status:'작전 승인'});state.history.push({planId:'old',reward:123});api.refresh();
 assert.equal(state.operations[0].contract.id,1);assert.ok(state.missions.some(m=>m.id===1));assert.equal(state.history.length,1);assert.equal(state.history[0].reward,123);
});
test('insufficient reputation and customer budget prevent new offers',()=>{
 const {state,api}=setup();state.reputation=0;state.missionTemplates.forEach(t=>t.risk=4);api.refresh();assert.equal(state.missions.length,0);
 state.contractWorld.clients.forEach(c=>c.budget=0);state.reputation=100;state.date='2030-01-02';api.refresh();assert.equal(state.missions.length,0);
});
test('paused contracts release reserved funds exactly once',()=>{
 const {state,api}=setup();api.refresh();const m=state.missions[0],c=state.contractWorld.clients.find(c=>c.id===m.clientId),budget=c.budget;
 state.operations.push({id:'paused',missionId:m.id,status:'작전 보류'});api.refresh();assert.equal(c.budget,budget+m.reward);api.refresh();assert.equal(c.budget,budget+m.reward);
});
test('actual field harm, rescue and escaped groups affect the world once and migrate later',()=>{const {state,api}=setup();api.refresh();const m=state.missions[0],op={id:'field-effect-op',missionId:m.id,status:'현장 진행 중',contract:{...m}};state.operations.push(op);const result={success:true,death:false,reward:m.reward,resolution:{hostileRetreated:1},tactical:{version:4,journey:{impact:{infrastructureDamage:40,civiliansRescued:3,escaped:[{id:'red-1',faction:'insurgent'}]}},civilians:[{hp:0,rescued:false}]}};api.settle(op,m,result);assert.equal(op.fieldWorldEffects.rescued,3);assert.ok(op.fieldWorldEffects.after.infrastructure<op.fieldWorldEffects.before.infrastructure);assert.equal(state.contractWorld.roamingGroups.length,1);const snapshot=JSON.stringify(state);api.settle(op,m,result);assert.equal(JSON.stringify(state),snapshot);state.date='2030-01-02';state.day=2;api.refresh();assert.equal(state.contractWorld.roamingGroups[0].arrived,true);assert.ok(state.contractWorld.events.some(e=>e.id==='arrival-field-effect-op'));const second=JSON.stringify(state);api.refresh();assert.equal(JSON.stringify(state),second)});
