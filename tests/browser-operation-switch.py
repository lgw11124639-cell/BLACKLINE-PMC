from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1440,1000),(390,844),(844,390)]:
  page=b.new_page(viewport={'width':w,'height':h},is_mobile=w<1000,has_touch=w<1000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8041',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('''()=>{state.simClock.paused=true;state.operations=[];for(let i=0;i<2;i++){const op={id:'SWITCH-'+i,status:'현장 진행 중',budget:3e7,contract:{id:9000+i,title:'선택 검증 '+i,type:'시설 보안',mapId:i?'mountain':'urban',pinMap:true,objectiveMode:'guard'},fieldProgress:{supportOrders:[]},teamIds:state.team.map(p=>p.id)};op.fieldProgress.tactical=fieldSimulation.create(op,op.contract,state.team,400,{forceContact:false,medicalBudget:5});state.operations.push(op);}state.operations.push({id:'PREPARING',status:'계획 검토',contract:{title:'준비 중 검증'}});openFieldObservation('SWITCH-0');}''')
  select=page.locator('.field-operation-switcher select');assert select.is_visible();assert select.locator('option:enabled').count()==2
  select.select_option('SWITCH-1');page.wait_for_function("document.querySelector('.field-console').dataset.session==='SWITCH-1'")
  assert '선택 검증 1' in page.locator('.field-console-head h2').inner_text();assert select.locator('optgroup option').get_attribute('disabled') is not None
  page.evaluate('fieldExpand()');assert select.is_visible();select.select_option('SWITCH-0');page.wait_for_function("document.querySelector('.field-console').dataset.session==='SWITCH-0'")
  assert page.locator('.field-console.field-focus').count()==1
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.screenshot(path='/tmp/blackline-v55-switch-'+str(w)+'.png');assert not errors,errors
  print('PASS',w,h,'live operation switch on normal/full map, preparing shown separately, camera/session isolation')
  page.close()
 b.close()
