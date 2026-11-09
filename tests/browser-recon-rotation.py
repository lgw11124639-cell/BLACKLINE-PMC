from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8010',wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate("()=>{state.simClock.paused=true;const members=['팀장','의무','정찰','소총수','지원','저격수','소총수','소총수'].map((role,i)=>({id:101+i,name:'대원'+i,country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000,loadout:{primary:i===5?'Accuracy International AXMC':'M4A1'}}));state.team=members;const m={id:1,title:'모바일 지도 관찰',type:'시설 보안',risk:1,mapId:'urban',pinMap:true},op={id:'MOBILE-PANES',leaderId:101,leaderName:members[0].name,budget:20000000,contract:m,status:'현장 진행 중',teamIds:members.map(p=>p.id),fieldProgress:{seed:25,supportOrders:[]}};state.operations=[op];op.fieldProgress.tactical=fieldSimulation.create(op,m,members,fieldSimulation.ammoPlan(members).total,{forceContact:false,medicalBudget:10,factions:[{id:'n',name:'중립',relation:80}]});openFieldObservation(op.id)}")
 page.locator('[onclick="fieldExpand()"]').click();page.wait_for_timeout(300)
 assert page.locator('.field-phone-landscape').count()==1
 assert page.locator('.field-focus').evaluate('(e)=>Math.abs(e.clientWidth-844)<1&&Math.abs(e.clientHeight-390)<1')
 page.evaluate('''()=>{const c=document.querySelector('#field-canvas'),b=c.getBoundingClientRect(),p=fieldPointerPosition(c,{clientX:b.right-120,clientY:b.top+200});if(Math.abs(p.x-200)>1||Math.abs(p.y-120)>1)throw Error('rotated pointer incorrect');window.hitPoint=null;FieldJourneyView.hitTest=(x,y)=>{window.hitPoint=[x,y];return null};}''')
 box=page.locator('#field-canvas').bounding_box();page.mouse.click(box['x']+box['width']-120,box['y']+200);assert page.evaluate('Math.abs(hitPoint[0]-200)<1&&Math.abs(hitPoint[1]-120)<1')
 page.get_by_role('button',name='대원',exact=True).click();assert page.locator('#field-roster').is_visible()
 page.screenshot(path='/tmp/blackline-v48-rotated-map.png')
 page.locator('[onclick="fieldExpand()"]').click();assert page.locator('.field-phone-landscape').count()==0
 page.evaluate('''()=>{const op=state.operations[0],members=state.team;const m={id:2,title:'능선 관측 검증',type:'정밀 지원',risk:1,mapId:'regional',pinMap:true,objectiveMode:'recon'};op.contract=m;op.fieldProgress.tactical=fieldSimulation.create(op,m,members,fieldSimulation.ammoPlan(members).total,{forceContact:false,medicalBudget:10});const s=op.fieldProgress.tactical;s.units=s.units.filter(u=>u.faction==='blackline');for(let i=0;i<1400&&!s.remoteRecon.index&&!s.done;i++)fieldSimulation.step(s,op);if(!s.remoteRecon.index)throw Error('never surveyed ridge');if(s.units.some(u=>u.inside||Math.hypot(u.x-s.remoteRecon.center[0],u.y-s.remoteRecon.center[1])<24))throw Error('entered operation area');openFieldObservation(op.id);save();}''')
 page.get_by_role('button',name='지도',exact=True).click();page.wait_for_timeout(1400)
 assert '외곽 능선' in page.locator('.field-journey-panel').text_content()
 page.screenshot(path='/tmp/blackline-v48-ridge.png')
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();assert page.evaluate('state.operations[0].fieldProgress.tactical.remoteRecon.index')>0
 assert not errors,errors
 print('PASS portrait fullscreen rotates only map; pointer/selection and crew panel; real remote ridge survey, HUD and saved reload')
 b.close()
