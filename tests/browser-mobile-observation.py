"""Phone viewport is map-first; crew/radio are independent panes, and real gun names survive paused reload."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(320,640),(390,844),(430,932),(844,390)]:
  context=b.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
  page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('''()=>{state.simClock.paused=true;const members=['팀장','의무','정찰','소총수','지원','저격수','소총수','소총수'].map((role,i)=>({id:101+i,name:'대원'+i,country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000,loadout:{primary:i===5?'Accuracy International AXMC':'M4A1'}}));state.team=members;const m={id:1,title:'모바일 지도 관찰',type:'시설 보안',risk:1,mapId:'urban',pinMap:true},op={id:'MOBILE-PANES',leaderId:101,leaderName:members[0].name,budget:20000000,contract:m,status:'현장 진행 중',teamIds:members.map(p=>p.id),fieldProgress:{seed:25,supportOrders:[]}};state.operations=[op];op.fieldProgress.tactical=fieldSimulation.create(op,m,members,fieldSimulation.ammoPlan(members).total,{forceContact:false,medicalBudget:10,factions:[{id:'n',name:'중립',relation:80}]});openFieldObservation(op.id)}''')
  page.wait_for_timeout(250)
  assert not page.locator('#tabs').is_visible()
  assert page.locator('#field-canvas').is_visible()
  assert not page.locator('#field-roster').is_visible()
  assert not page.locator('.field-radio-column').is_visible()
  box=page.locator('.field-map-shell').bounding_box();assert box['height']>=120,(width,height,box)
  assert box['y']>=0 and box['y']+box['height']<=height,(width,height,box)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.screenshot(path='/tmp/blackline-v43-map-'+str(width)+'.png')
  canvas=page.locator('#field-canvas').evaluate('(c)=>{window.mobileCanvas=c;return true}')
  page.get_by_role('button',name='대원',exact=True).click()
  assert page.locator('#field-roster').is_visible()
  assert not page.locator('.field-map-shell').is_visible()
  assert 'Accuracy International AXMC' in page.locator('[data-unit="bl-106"]').inner_text()
  assert 'M4A1' in page.locator('[data-unit="bl-101"]').inner_text()
  page.evaluate('''()=>{const op=state.operations[0],s=op.fieldProgress.tactical;const w=s.units.find(u=>u.personId===106).weaponState;w.weapon='정밀소총';window.roundsBeforeReload=s.units.find(u=>u.personId===106).ammo;save()}''')
  page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate("openFieldObservation('MOBILE-PANES')");page.wait_for_timeout(1300)
  page.get_by_role('button',name='대원',exact=True).click()
  assert 'Accuracy International AXMC' in page.locator('[data-unit="bl-106"]').inner_text()
  assert page.evaluate("state.operations[0].fieldProgress.tactical.units.find(u=>u.personId===106).weaponState.weapon")== 'Accuracy International AXMC'
  assert page.evaluate("state.operations[0].fieldProgress.tactical.units.find(u=>u.personId===106).ammo")==50
  page.get_by_role('button',name='무전',exact=True).click();assert page.locator('.field-radio-column').is_visible();assert not page.locator('.field-map-column').is_visible()
  page.get_by_role('button',name='지도',exact=True).click();assert page.locator('#field-canvas').is_visible()
  page.get_by_role('button',name='지도 집중 화면',exact=True).click();page.wait_for_timeout(150)
  assert page.locator('.field-console').bounding_box()['y']<=1
  assert not page.locator('#tabs').is_visible()
  page.get_by_role('button',name='지도 집중 화면',exact=True).click()
  page.get_by_role('button',name='본부 메뉴로 이동',exact=True).click()
  assert page.locator('#tabs').is_visible()
  assert not errors,errors
  print('PASS',width,height,'map viewport + hidden bottom nav, crew/radio panes, fullscreen, real gun migration and exact ammunition, home navigation')
  context.close()
 b.close()
