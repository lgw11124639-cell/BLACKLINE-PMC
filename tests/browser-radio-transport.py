from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(1440,1000),(844,390)]:
  page=b.new_page(viewport={'width':width,'height':height},is_mobile=width<1000,has_touch=width<1000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8040',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('''()=>{state.simClock.paused=true;state.operations=[];const people=['팀장','의무','정찰','소총수','지원','저격수','소총수','정찰'].map((role,i)=>({id:100+i,name:'현장대원'+i,role,skill:90}));const op={id:'FLIGHT-TEST',leaderName:people[0].name,teamIds:people.map(u=>u.id),status:'현장 진행 중',budget:2e7,method:'헬기 수송',fieldProgress:{seed:23,supportOrders:[]},contract:{id:9001,title:'항공 수송 검증',type:'시설 보안',risk:1,mapId:'factory',pinMap:true,objectiveMode:'guard'}};state.team=people;state.operations=[op];const s=fieldSimulation.create(op,op.contract,people,1600,{forceContact:false,medicalBudget:10,factions:[{id:'n',name:'중립',relation:80}]});s.units=s.units.filter(u=>u.faction==='blackline');op.fieldProgress.tactical=s;window.flight=()=>state.operations[0].fieldProgress.tactical;window.advanceFlight=stage=>{const s=flight();for(let i=0;i<4500&&!s.done&&s.journey.stage!==stage;i++)fieldSimulation.step(s,state.operations[0]);fieldSimulation.captureFrame(s);if(s.journey.stage!==stage)throw Error('stage missing '+stage);go('observation');};go('observation');}''')
  page.wait_for_selector('.field-map-shell[data-scene="regional"]')
  assert page.locator('[data-radio-from="air-transport"]').count()>0
  assert '수송 헬기 승무원' in page.locator('.field-radio').inner_text() if page.locator('.field-radio').count() else '수송 헬기 승무원' in page.locator('.field-console').inner_text()
  page.evaluate("advanceFlight('site')");page.wait_for_selector('.field-map-shell[data-scene="site"]')
  assert 'REGIONAL' not in page.locator('.field-map-toolbar>span').inner_text()
  page.evaluate("advanceFlight('homebound')");page.wait_for_selector('.field-map-shell[data-scene="regional"]')
  page.evaluate("advanceFlight('complete')");page.wait_for_selector('.field-map-shell[data-scene="base"]')
  assert '본부 인수 완료' in page.locator('.field-map-toolbar>span').inner_text()
  page.screenshot(path='/tmp/blackline-v52-return-'+str(width)+'.png')
  assert not errors,errors
  print('PASS',width,height,'named radio endpoints; helicopter regional/site/regional/base scenes; complete landed')
  page.close()
 b.close()
