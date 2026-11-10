"""Restore a v01 neutral-PMC approach stall and finish by real movement with fire still prohibited."""
from playwright.sync_api import sync_playwright
import os,subprocess
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8047')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 old=subprocess.check_output(['git','show','75f322a:field-contact-procedure.js'],text=True)
 page.route('**/field-contact-procedure.js*',lambda route:route.fulfill(body=old,content_type='application/javascript'))
 page.goto(BASE,wait_until='networkidle');page.locator('#blackline-continue').click()
 before=page.evaluate("()=>{state.simClock.paused=true;state.cash=2e9;state.ammo=30000;state.med=100;state.operations=[];state.team=Array.from({length:16},(_,i)=>({id:901+i,name:'관측대원'+i,role:['팀장','의무','정찰','전투','지원','저격수','전투','전투'][i%8],skill:88,country:'대한민국',unit:'가상 부대',rank:'중사',birthDate:'1995-01-01',salary:6e7,loadout:{primary:'미지급'}}));blacklineReviewArmory();const people=state.team.slice(0,6),op={id:'LIVE-CONTACT',leaderName:people[0].name,status:'현장 진행 중',budget:1e8,teamIds:people.map(p=>p.id),contract:{id:20801,title:'실시간 접촉 절차 검증',type:'시설 보안',risk:2,mapId:'urban-market',pinMap:true,objectiveMode:'guard'},air:'off',artillery:'off',fieldProgress:{seed:25,supportOrders:[],reservedTacticalMed:12}};state.operations=[op];blacklineReserveTransport(op,'ground');const ammo=fieldSimulation.ammoPlan(people).total;op.fieldProgress.reservedTacticalAmmo=ammo;const s=fieldSimulation.create(op,op.contract,people,ammo,{forceContact:false,medicalBudget:12,factions:[{id:'n',name:'중립 PMC',relation:80}]});op.fieldProgress.tactical=s;for(let i=0;i<260;i++)fieldSimulation.step(s,op);if(!s.journey.insertionRecon?.complete||s.journey.stage!=='site'||s.phase!=='접근')throw Error('old stalled approach not reproduced '+JSON.stringify({phase:s.phase,stage:s.journey.stage,recon:s.journey.insertionRecon,units:s.units.map(u=>({id:u.id,status:u.status,x:u.x,y:u.y}))}));save();blacklineFlushSave();return {time:s.time,radio:s.radio.length,stage:s.journey.stage};}")
 page.unroute('**/field-contact-procedure.js*');page.reload(wait_until='networkidle');page.locator('#blackline-continue').click()
 assert page.evaluate('state.operations[0].fieldProgress.tactical.time')==before['time']
 result=page.evaluate("""()=>{const op=state.operations[0],s=op.fieldProgress.tactical;for(let i=0;i<1800&&!s.done;i++)fieldSimulation.step(s,op);if(!s.done||s.objective!==100)throw Error('approach remains stalled '+s.time+'/'+s.phase);const pmc=new Set(s.units.filter(u=>u.faction==='pmc').map(u=>u.id)),own=new Set(s.units.filter(u=>u.faction==='blackline').map(u=>u.id));if(s.events.some(e=>e.kind==='shot'&&own.has(e.actor)&&pmc.has(e.target)))throw Error('neutral PMC fired on');return {done:s.done,time:s.time,objective:s.objective,stage:s.journey.stage};}""")
 assert not errors,errors
 print('PASS persisted neutral-PMC insertion stall -> real search, escort and complete return; no neutral fire',result)
 b.close()
