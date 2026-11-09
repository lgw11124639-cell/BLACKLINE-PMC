"""Legacy regional save with a casualty left at the objective: visible vehicle, real crew, reload and settlement."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{state.simClock.paused=true;const members=['저격수','팀장','의무','정찰'].map((role,i)=>({id:101+i,name:['이도현','James Walker','김태훈','Alex Morgan'][i],country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000,birthDate:'1995-01-01'}));state.team=members;const m={id:1,title:'광역 부상자 회수',type:'무장세력 대응',risk:1,mapId:'regional',pinMap:true};const op={id:'LEGACY-VEHICLE-RESCUE',leaderId:102,leaderName:members[1].name,budget:20000000,contract:m,status:'현장 진행 중',teamIds:members.map(p=>p.id),fieldProgress:{seed:25,stage:4,events:[],supportOrders:[],staffingAudited:true,reservedTacticalAmmo:500,reservedTacticalMed:1,teamSnapshot:members.map(p=>p.id)}};state.operations=[op];const s=fieldSimulation.create(op,m,members,500,{forceContact:false,medicalBudget:1,factions:[{id:'n',name:'중립',relation:80}]});op.fieldProgress.tactical=s;delete s.journey;delete s.scenario;s.version=2;s.time=882;s.phase='복귀';s.objective=100;s.units=s.units.filter(u=>u.faction==='blackline');s.units.forEach(u=>{u.inside=false;u.onRoof=false;u.x=s.terrain.base[0];u.y=s.terrain.base[1];u.status='transporting'});const patient=s.units[2];patient.x=220;patient.y=126;fieldSimulation.applyWound(s,patient,80,null,'leftLeg');fieldSimulation.performAid(s,patient,s.units[0]);for(let i=0;i<35;i++)fieldSimulation.step(s,op);if(s.legacyRecovery.stage!=='outbound')throw Error('vehicle did not depart');if(patient.x!==220)throw Error('patient teleported');openFieldObservation(op.id);save()}''')
 page.wait_for_timeout(1300)
 assert '환자 회수' in page.locator('[data-live-field-phase]').inner_text()
 assert page.locator('#field-roster').get_by_text('회수 차량 이동',exact=True).count()==2
 assert page.evaluate('state.operations[0].fieldProgress.tactical.liveFrame.recovery.eta')>0
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert page.evaluate('''()=>{const s=state.operations[0].fieldProgress.tactical,r=s.legacyRecovery,c=fieldCameraState,canvas=document.getElementById('field-canvas'),x=(r.position.x-c.x)*1.8/c.width*canvas.clientWidth+canvas.clientWidth/2,y=(r.position.y-c.y)*1.8/c.height*canvas.clientHeight+canvas.clientHeight/2;return x>10&&x<canvas.clientWidth-10&&y>10&&y<canvas.clientHeight-10}''')
 page.screenshot(path='/tmp/blackline-v42-legacy-rescue-mobile.png',full_page=True)
 point=page.evaluate('JSON.stringify(state.operations[0].fieldProgress.tactical.legacyRecovery.position)')
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click()
 assert page.evaluate('JSON.stringify(state.operations[0].fieldProgress.tactical.legacyRecovery.position)')==point
 page.evaluate('''()=>{const op=state.operations[0],s=op.fieldProgress.tactical;for(let i=0;i<500&&!s.done;i++)fieldSimulation.step(s,op);if(!s.done||s.legacyRecovery.stage!=='complete')throw Error('return incomplete');if(!s.units.find(u=>u.personId===103).evacComplete)throw Error('patient not handed over');state.simClock.paused=false}''')
 page.wait_for_function("state.history.some(h=>h.planId==='LEGACY-VEHICLE-RESCUE')",timeout=6000)
 page.evaluate('state.simClock.paused=true;save()')
 assert page.evaluate("state.history.filter(h=>h.planId==='LEGACY-VEHICLE-RESCUE').length")==1
 assert not errors,errors
 print('PASS mobile: real crew/vehicle and ETA, patient stays in place until pickup, saved travel resumes, base handover and single settlement')
 b.close()
