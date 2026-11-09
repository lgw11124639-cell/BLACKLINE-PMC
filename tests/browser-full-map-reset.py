from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(1440,900),(844,390),(390,844)]:
  page=b.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate("()=>{state.simClock.paused=true;const members=['팀장','의무','정찰','소총수','지원','저격수','소총수','소총수'].map((role,i)=>({id:101+i,name:'대원'+i,country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000,loadout:{primary:i===5?'Accuracy International AXMC':'M4A1'}}));state.team=members;const m={id:1,title:'모바일 지도 관찰',type:'시설 보안',risk:1,mapId:'urban',pinMap:true},op={id:'MOBILE-PANES',leaderId:101,leaderName:members[0].name,budget:20000000,contract:m,status:'현장 진행 중',teamIds:members.map(p=>p.id),fieldProgress:{seed:25,supportOrders:[]}};state.operations=[op];op.fieldProgress.tactical=fieldSimulation.create(op,m,members,fieldSimulation.ammoPlan(members).total,{forceContact:false,medicalBudget:10,factions:[{id:'n',name:'중립',relation:80}]});openFieldObservation(op.id)}")
  page.locator('[onclick="fieldExpand()"]').click();page.wait_for_timeout(300)
  box=page.locator('#field-canvas').bounding_box();assert box['height']>height*.65,(width,height,box)
  assert box['x']>=0 and box['y']+box['height']<=height+1,box
  if width>height:
   assert page.locator('#field-roster').is_visible();assert page.locator('.field-radio-column').is_visible()
   side=page.locator('#field-roster').bounding_box();assert side['x']>=box['x']+box['width']-1
  page.screenshot(path='/tmp/blackline-v45-full-'+str(width)+'.png')
  page.keyboard.press('Escape');assert page.locator('.field-focus').count()==0
  page.evaluate("state.cash=123456;save();blacklineOpenStart()")
  page.once('dialog',lambda d:d.dismiss());page.locator('#blackline-reset').click();assert page.evaluate('state.cash')==123456
  page.once('dialog',lambda d:d.accept());page.locator('#blackline-reset').click();page.wait_for_event('load');page.wait_for_selector('#blackline-continue')
  assert page.evaluate('state.day')==1 and page.evaluate('state.cash')!=123456
  assert page.evaluate("JSON.parse(localStorage.getItem('blackline_pmc_v1_before_reset')).state.cash")==123456
  assert page.locator('#blackline-before-reset').is_visible()
  assert not errors,errors
  print('PASS',width,height,'full viewport, side panels, Escape, reset cancel/confirm and retained pre-reset save')
  page.close()
 b.close()
