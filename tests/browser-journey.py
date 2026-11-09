"""Isolated production-engine fixtures: all map scales, discovery, transport and replay."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);context=b.new_context(viewport={'width':1440,'height':1100});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{if(!state.simClock.paused)companyClock.toggle();const m={id:1,title:'시가지 인계 작전',type:'시설 보안',risk:2,mapId:'urban'};const people=['팀장','저격수','정찰','의무','지원','전투'].map((role,i)=>({id:101+i,name:role,role,skill:85,salary:10000000}));const op={id:'JOURNEY-CHECK',leaderName:'팀장',budget:20000000,contract:m,status:'현장 진행 중',fieldProgress:{seed:25,supportOrders:[]},teamIds:people.map(p=>p.id)};state.team=people;state.operations=[op];op.fieldProgress.tactical=fieldSimulation.create(op,m,people,300,{forceContact:false,medicalBudget:2,factions:[{id:'n',name:'중립 PMC',relation:80}]});openFieldObservation(op.id)}''')
 for stage,scene in [('outbound','regional'),('site','site'),('interior','interior'),('extraction','site'),('boarding','site'),('homebound','regional')]:
  page.evaluate('''stage=>{const s=state.operations[0].fieldProgress.tactical;let n=0;while(s.journey.stage!==stage&&!s.done&&n++<3000)fieldSimulation.step(s,state.operations[0]);if(s.journey.stage!==stage)throw Error('stage unreachable '+stage+' actual '+s.journey.stage);for(let i=0;i<2;i++)fieldSimulation.step(s,state.operations[0])}''',stage)
  page.wait_for_timeout(1300)
  assert page.locator('.field-map-shell').get_attribute('data-scene')==scene,(stage,scene)
  assert page.locator('.field-journey-panel').is_visible()
  assert page.locator('[data-unit]').count()==6
  assert page.get_by_role('slider',name='작전 기록 시간 이동',exact=True).count()==0
  page.screenshot(path='/tmp/journey-'+stage+'.png',full_page=True)
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(150)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path='/tmp/journey-'+stage+'-mobile.png',full_page=True);page.set_viewport_size({'width':1440,'height':1100})
  print('PASS',stage,scene,'desktop + mobile')
 page.evaluate('''()=>{const op=state.operations[0],s=op.fieldProgress.tactical;while(!s.done)fieldSimulation.step(s,op);state.history.unshift({planId:op.id,title:op.contract.title,tactical:JSON.parse(JSON.stringify(s)),success:!s.retreat});op.status='작전 완료';openFieldReplay(op.id)}''')
 page.evaluate('fieldSeek(450)');page.wait_for_timeout(500);assert page.locator('#field-recording-root').is_visible();assert page.locator('#field-recording-root .field-journey-panel').is_visible()
 assert not errors,errors
 print('PASS stored multi-scene replay, no runtime errors')
 context.close();b.close()
