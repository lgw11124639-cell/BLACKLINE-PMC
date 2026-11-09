"""The radio and anatomy card describe the same real victim; enemy injuries and misses do not create friendly casualties."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{state.simClock.paused=true;const members=['팀장','의무','정찰','소총수','지원','저격수','소총수','소총수'].map((role,i)=>({id:101+i,name:['김태훈','박준서','James Walker','이도현','강태성','Alex Morgan','오태성','장태성'][i],country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000,birthDate:'1995-01-01',loadout:{primary:'M4A1'}}));state.team=members;const m={id:1,title:'의료 보고 일치 검증',type:'시설 보안',risk:2,mapId:'urban',pinMap:true},op={id:'INJURY-REPORT-LINK',leaderName:members[0].name,budget:20000000,contract:m,status:'현장 진행 중',teamIds:members.map(p=>p.id),fieldProgress:{seed:25,supportOrders:[]}};state.operations=[op];const s=fieldSimulation.create(op,m,members,1600,{forceContact:true,medicalBudget:10,factions:[{id:'n',name:'중립',relation:80}]});op.fieldProgress.tactical=s;s.time=60;s.journey.stage='site';s.phase='수색';s.radio=[];s.events=[];s.contact=false;s.rng=0;const blue=s.units[0],enemy=s.units.find(u=>u.faction==='insurgent');for(const u of [blue,enemy]){u.inside=false;u.roadOnly=false;u.onRoof=false;u.health.armor=null;u.nextShot=0;}blue.x=56;blue.y=34;enemy.x=50;enemy.y=34;enemy.skill=0;fieldSimulation.tacticalFire(s,enemy,blue);if(s.events.find(e=>e.kind==='shot').hit)throw Error('fixture did not miss');fieldSimulation.captureFrame(s);openFieldObservation(op.id)}''')
 page.wait_for_timeout(1300)
 assert page.locator('.field-transmission.medical').count()==0
 assert page.locator('.medical-condition').all_inner_texts()==['특이사항 없음']*8
 page.evaluate('''()=>{const s=state.operations[0].fieldProgress.tactical,blue=s.units[0],enemy=s.units.find(u=>u.faction==='insurgent');fieldSimulation.applyWound(s,enemy,20,blue,'leftArm');fieldSimulation.captureFrame(s)}''')
 page.wait_for_timeout(200)
 assert page.locator('.field-transmission.medical').count()==0
 assert page.locator('.medical-condition').all_inner_texts()==['특이사항 없음']*8
 page.evaluate('''()=>{const s=state.operations[0].fieldProgress.tactical,blue=s.units[0],enemy=s.units.find(u=>u.faction==='insurgent');fieldSimulation.applyWound(s,blue,20,enemy,'leftArm');fieldSimulation.captureFrame(s)}''')
 page.wait_for_timeout(250)
 patient=page.locator('[data-unit="bl-101"]')
 assert '왼팔 총상' in patient.inner_text()
 assert '특이사항 없음' not in patient.inner_text()
 assert patient.locator('[data-body-part="leftArm"]').get_attribute('fill')!='#d9e6eb'
 assert page.locator('.field-transmission.medical').filter(has_text='김태훈 · 왼팔 총상 확인').count()==1
 page.evaluate('''()=>{const s=state.operations[0].fieldProgress.tactical;fieldSimulation.performAid(s,s.units[0],s.units[1]);fieldSimulation.captureFrame(s);save()}''')
 page.wait_for_timeout(250)
 assert '왼팔 총상 · 처치 완료' in patient.inner_text()
 page.screenshot(path='/tmp/blackline-v44-wound-radio-linked-desktop.png',full_page=True)
 page.set_viewport_size({'width':390,'height':844});page.evaluate("fieldMobilePanel('crew')");page.wait_for_timeout(150)
 assert patient.is_visible()
 assert '왼팔 총상 · 처치 완료' in patient.inner_text()
 page.screenshot(path='/tmp/blackline-v44-wound-card-mobile.png')
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate("openFieldObservation('INJURY-REPORT-LINK');fieldMobilePanel('crew')");page.wait_for_timeout(1300)
 assert '왼팔 총상 · 처치 완료' in page.locator('[data-unit="bl-101"]').inner_text()
 assert not errors,errors
 print('PASS enemy wound and missed fire leave friendly cards healthy; real friendly wound matches radio, colored part and persistent treated gunshot label')
 b.close()
