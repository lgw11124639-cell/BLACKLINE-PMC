"""Production modules: physical magazines, persistent anatomy, no HP UI, names and dismount state."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{state.simClock.paused=true;const members=['팀장','의무','정찰','소총수','지원','저격수','소총수','소총수'].map((role,i)=>({id:101+i,name:'검증대원'+i,country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000,loadout:{primary:i===5?'Sako TRG 42':'M4A1'}}));state.team=members;const m={id:1,title:'산악 보행·탄창·부상 검증',type:'시설 보안',risk:1,mapId:'mountain',pinMap:true,objectiveMode:'recon'},op={id:'ANATOMY-MAGS',leaderName:members[0].name,budget:20000000,contract:m,status:'현장 진행 중',teamIds:members.map(p=>p.id),fieldProgress:{seed:25,supportOrders:[],staffingAudited:true}};state.operations=[op];const plan=fieldSimulation.ammoPlan(members),s=fieldSimulation.create(op,m,members,plan.total,{forceContact:false,medicalBudget:10,factions:[{id:'n',name:'중립',relation:80}]});op.fieldProgress.tactical=s;op.fieldProgress.reservedTacticalAmmo=plan.total;let steps=0;while(s.journey.stage==='outbound'&&steps++<1000)fieldSimulation.step(s,op);for(let i=0;i<5;i++)fieldSimulation.step(s,op);if(s.units.some(u=>u.faction==='blackline'&&u.status==='transporting'))throw Error('false transport after dismount');const patient=s.units.find(u=>u.personId===104);fieldSimulation.applyWound(s,patient,80,null,'leftLeg');fieldSimulation.performAid(s,patient,s.units.find(u=>u.role==='의무'));const gunner=s.units.find(u=>u.personId===101);const before=gunner.ammo;const fired=fieldSimulation.consumeRounds(s,gunner);if(gunner.ammo!==before-fired)throw Error('ammunition not deducted');fieldSimulation.captureFrame(s);openFieldObservation(op.id)}''')
 page.wait_for_timeout(1300)
 assert page.locator('.medical-unit-card').count()==8
 assert 'HP' not in page.locator('.field-console').inner_text()
 patient=page.locator('[data-unit="bl-104"]');assert '왼다리' in patient.inner_text() and '처치 완료' in patient.inner_text()
 assert '전투 불가' in patient.inner_text()
 assert '장전 29/30발' in page.locator('[data-unit="bl-101"]').inner_text()
 assert '장전 5/5발' in page.locator('[data-unit="bl-106"]').inner_text()
 assert '차량 이동' not in page.locator('.field-roster').inner_text()
 assert patient.locator('svg').count()==1
 page.screenshot(path='/tmp/blackline-v41-anatomy-ammo-desktop.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.evaluate("fieldMobilePanel('crew')");page.wait_for_timeout(200)
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path='/tmp/blackline-v41-anatomy-ammo-mobile.png',full_page=True)
 page.evaluate("state.candidates.push({id:999,name:'오지훈 99',role:'소총수',skill:75,salary:60000000});save()")
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click()
 assert page.evaluate("state.candidates.find(p=>p.id===999).name.match(/^[가-힣]{2,4}$/)!==null")
 assert page.evaluate("state.operations.find(o=>o.id==='ANATOMY-MAGS').fieldProgress.tactical.units.find(u=>u.personId===104).health.wounds[0].part")== 'leftLeg'
 assert not errors,errors
 print('PASS desktop/mobile: no HP, anatomy + persistent limb injury, exact loaded/spare magazines, correct walking state, numeric name migration, reload')
 b.close()
