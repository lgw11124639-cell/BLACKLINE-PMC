"""Presentation fixtures use the production tactical engine; no user save is touched."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for mapid in ['factory','urban','mountain','regional']:
  context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('''(mapId)=>{companyClock.toggle();const m={id:1,title:'역할 분담 검증',type:'시설 보안',risk:1,mapId};const people=['팀장','저격수','정찰','의무','지원'].map((role,i)=>({id:101+i,name:role,role,skill:85,salary:10000000}));const op={id:'MAP-CHECK',leaderName:'팀장',contract:m,status:'현장 진행 중',fieldProgress:{seed:25,supportOrders:[]},teamIds:people.map(p=>p.id)};state.team=people;state.operations=[op];op.fieldProgress.tactical=fieldSimulation.create(op,m,people,200,{forceContact:false,medicalBudget:2,factions:[{id:'n',name:'중립 PMC',relation:80}]});for(let i=0;i<400;i++)fieldSimulation.step(op.fieldProgress.tactical,op);openFieldObservation(op.id)}''',mapid)
  page.wait_for_timeout(1100)
  assert page.locator('.field-mode.is-live').is_visible()
  assert page.locator('[data-unit]').count()==5
  page.locator('[data-unit="bl-102"]').click();assert '저격' in page.locator('#field-unit-detail').inner_text()
  assert page.get_by_role('slider',name='작전 기록 시간 이동',exact=True).count()==0
  assert page.get_by_role('button',name='훈련 시연 보기',exact=True).count()==0
  page.screenshot(path='/tmp/tactics-'+mapid+'.png',full_page=True)
  if mapid=='urban':
   page.get_by_role('button',name='지도 확대',exact=True).click();page.get_by_role('button',name='지도 집중 화면',exact=True).click();page.screenshot(path='/tmp/tactics-urban-roof.png');page.keyboard.press('Escape')
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path='/tmp/tactics-'+mapid+'-mobile.png',full_page=True)
  assert not errors,errors
  print('PASS',mapid,'LIVE map, 3D operators, tactical roster, mobile layout')
  context.close()
 browser.close()
