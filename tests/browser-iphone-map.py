from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(390,844),(844,390),(430,932),(932,430),(320,568)]:
  c=b.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8010',wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate("()=>{state.simClock.paused=true;const members=['팀장','의무','정찰','소총수','지원','저격수','소총수','소총수'].map((role,i)=>({id:101+i,name:'대원'+i,country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000,loadout:{primary:i===5?'Accuracy International AXMC':'M4A1'}}));state.team=members;const m={id:1,title:'모바일 지도 관찰',type:'시설 보안',risk:1,mapId:'urban',pinMap:true},op={id:'MOBILE-PANES',leaderId:101,leaderName:members[0].name,budget:20000000,contract:m,status:'현장 진행 중',teamIds:members.map(p=>p.id),fieldProgress:{seed:25,supportOrders:[]}};state.operations=[op];op.fieldProgress.tactical=fieldSimulation.create(op,m,members,fieldSimulation.ammoPlan(members).total,{forceContact:false,medicalBudget:10,factions:[{id:'n',name:'중립',relation:80}]});openFieldObservation(op.id)}")
  page.locator('[onclick="fieldExpand()"]').click();page.wait_for_timeout(300)
  def check():
   box=page.locator('#field-canvas').bounding_box();assert abs(box['x'])<1 and abs(box['y'])<1,box
   assert abs(box['width']-width)<1 and abs(box['height']-height)<1,box
  check();assert not page.locator('#field-roster').is_visible();assert not page.locator('.field-radio-column').is_visible()
  page.screenshot(path='/tmp/blackline-v46-iphone-'+str(width)+'.png')
  page.get_by_role('button',name='대원',exact=True).click();assert page.locator('#field-roster').is_visible();check()
  page.get_by_role('button',name='무전',exact=True).click();assert page.locator('.field-radio-column').is_visible();assert not page.locator('#field-roster').is_visible();check()
  page.get_by_role('button',name='지도',exact=True).click();assert not page.locator('.field-radio-column').is_visible();check()
  page.set_viewport_size({'width':height,'height':width});width,height=height,width;page.wait_for_timeout(150);check()
  page.locator('[onclick="fieldExpand()"]').click();assert page.locator('.field-focus').count()==0
  assert not errors,errors
  print('PASS iPhone',width,height,'edge-to-edge canvas, overlays, rotation and exit')
  c.close()
 b.close()
