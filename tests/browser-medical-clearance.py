from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1440,1000),(844,390)]:
  page=b.new_page(viewport={'width':w,'height':h},is_mobile=w<1000,has_touch=w<1000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8043',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('''()=>{state.simClock.paused=true;state.cash=2e9;state.operations=[];state.team=Array.from({length:8},(_,i)=>({id:301+i,name:'현장'+i,role:['팀장','의무','정찰','전투','지원','저격수','전투','전투'][i],skill:90,country:'대한민국',unit:'가상 부대',rank:'중사',birthDate:'1995-01-01',salary:60000000,loadout:{primary:i===5?'Accuracy International AXMC':'M4A1'}}));const op={id:'MED-CLEAR',status:'현장 진행 중',budget:4e7,teamIds:state.team.map(p=>p.id),contract:{id:9901,title:'의료후송 안전 검증',type:'시설 보안',mapId:'urban',pinMap:true,objectiveMode:'guard',transport:'ground'},fieldProgress:{supportOrders:[]}};blacklineReserveTransport(op,'ground');const s=fieldSimulation.create(op,op.contract,state.team,1500,{forceContact:false,medicalBudget:12});s.units=s.units.filter(u=>u.faction==='blackline');op.fieldProgress.tactical=s;state.operations=[op];fieldSimulation.step(s,op);window.medOp=()=>state.operations[0];window.medSim=()=>medOp().fieldProgress.tactical;openFieldObservation(op.id);fieldMobilePanel('crew');}''')
  page.wait_for_function("document.querySelectorAll('[data-crew-profile]').length===2")
  page.evaluate('''()=>{const s=medSim();s.journey.stage='site';s.phase='수색';for(const u of s.units){u.inside=false;u.onRoof=false;u.x=50;u.y=34;}s.rng=1000;const u=s.units[2];u.personalAidKits=0;fieldSimulation.applyWound(s,u,10,null,'leftArm');const at=[u.x,u.y];fieldSimulation.internals.move(s,u,[80,34],10);if(u.x!==at[0]||u.y!==at[1]||u.health.canWalk)throw Error('untreated actor walked');fieldSimulation.performAid(s,u,s.units[1]);if(!u.health.canWalk)throw Error('minor treated arm failed to release');fieldSimulation.applyWound(s,u,70,null,'leftLeg');fieldSimulation.performAid(s,u,s.units[1]);if(u.health.canWalk)throw Error('broken leg walking');fieldSimulation.step(s,medOp());fieldSimulation.captureFrame(s);go('observation');fieldMobilePanel('crew');}''')
  page.wait_for_function("document.querySelector('.field-map-shell').dataset.scene==='site'")
  page.wait_for_function("document.querySelectorAll('[data-crew-profile]').length===0")
  assert page.evaluate("medSim().journey.medevac.stage") in ['awaiting-lz','preparing']
  page.evaluate('''()=>{const s=medSim(),f=s.journey.medevac;const remaining=f.readyAt-s.time-1;for(let i=0;i<remaining;i++)fieldSimulation.step(s,medOp());if(!['awaiting-lz','preparing'].includes(f.stage)||f.distance!==0)throw Error('premature medical flight');save();}''')
  ready=page.evaluate('medSim().journey.medevac.readyAt');page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate("window.medOp=()=>state.operations[0];window.medSim=()=>medOp().fieldProgress.tactical")
  assert page.evaluate('medSim().journey.medevac.readyAt')==ready
  page.evaluate('''()=>{const s=medSim();for(let i=0;i<1600&&s.journey.medevac.stage!=='landed'&&!s.done;i++)fieldSimulation.step(s,medOp());if(s.journey.medevac.stage!=='landed')throw Error('delayed flight failed to land '+s.journey.medevac.waitReason);if(s.journey.medevac.launchedAt<s.journey.medevac.readyAt)throw Error('dispatch deadline ignored');fieldSimulation.captureFrame(s);openFieldObservation(medOp().id);fieldMobilePanel('crew');fieldCameraState.follow=false;fieldCameraState.scene='site';fieldCameraState.x=s.journey.medevac.lz[0];fieldCameraState.y=s.journey.medevac.lz[1];}''')
  page.wait_for_function("document.querySelectorAll('[data-crew-profile]').length===3")
  page.evaluate("fieldZoom(3);fieldCameraState.x=95;fieldCameraState.y=5")
  page.wait_for_function("document.querySelectorAll('[data-crew-profile]').length===0")
  page.evaluate('''()=>{const s=medSim();for(let i=0;i<1600&&!s.done;i++)fieldSimulation.step(s,medOp());if(!s.done||s.journey.medevac.stage!=='complete')throw Error('return never completed');}''')
  assert not errors,errors
  print('PASS',w,h,'no untreated walking, persistent leg disability, cleared/prepared/delayed medevac, exact reload deadline, crew cards only for visible aircraft, actual completed return')
  page.close()
 b.close()
