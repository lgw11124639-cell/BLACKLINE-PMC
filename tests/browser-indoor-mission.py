from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1440,1000),(390,844),(844,390)]:
  page=b.new_page(viewport={'width':w,'height':h},is_mobile=w<1000,has_touch=w<1000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8041',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('''()=>{state.simClock.paused=true;state.cash=1e9;state.operations=[];const members=Array.from({length:8},(_,id)=>({id:201+id,name:'진입대원'+id,role:['팀장','의무','정찰','전투','지원','저격수','전투','전투'][id],skill:90,birthDate:'1995-01-01',country:'대한민국',unit:'가상 부대',rank:'중사',salary:60000000,loadout:{primary:'M4A1'}}));state.team=members;const m={id:9001,title:'민간인 구출',type:'구조',risk:2},op={id:'INDOOR-TEST',contract:m,status:'현장 진행 중',budget:3e7,method:'헬기 수송',teamIds:members.map(p=>p.id),fieldProgress:{supportOrders:[]}};blacklineReserveTransport(op,'helicopter');const s=fieldSimulation.create(op,m,members,1500,{forceContact:false,medicalBudget:8});s.units=s.units.filter(u=>u.faction==='blackline');op.fieldProgress.tactical=s;state.operations=[op];for(let i=0;i<4500&&!s.done&&!s.units.some(u=>u.faction==='blackline'&&u.inside);i++)fieldSimulation.step(s,op);if(s.scenario.mode!=='interior'||!s.units.some(u=>u.inside))throw Error('indoor mission not entered');fieldSimulation.captureFrame(s);openFieldObservation(op.id);}''')
  page.wait_for_selector('.field-map-shell[data-scene="interior"]')
  assert '실내 진입' in page.locator('.field-objective-kind').inner_text()
  page.locator('[data-field-audio]').click();page.wait_for_function('FieldAudio.status.samples===10&&FieldAudio.status.enabled')
  page.evaluate('fieldExpand()');page.screenshot(path='/tmp/blackline-v56-indoor-'+str(w)+'.png')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.evaluate('''()=>{const op=state.operations[0],s=op.fieldProgress.tactical;for(let i=0;i<4500&&!s.done;i++)fieldSimulation.step(s,op);if(!s.done||!s.journey.transitions.some(t=>t.stage==='exit'))throw Error('CQB return stuck');}''')
  assert not errors,errors;print('PASS',w,h,'implicit indoor contract -> physical entry -> interior floor map -> room tasks -> exit -> completed return; ten sound samples loaded')
  page.close()
 b.close()
