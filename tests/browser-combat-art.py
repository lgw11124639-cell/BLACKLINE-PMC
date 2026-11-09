"""Observed, authorized support fixtures exercise actual impact timing and rendering."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 for name,kind in [('승인된 공중 지원','airstrike'),('승인된 원거리 지원','artillery')]:
  page.evaluate('''name=>{if(!state.simClock.paused)companyClock.toggle();const m={id:1,title:'확인 표적 지원 관찰',type:'시설 보안',risk:3,mapId:'factory'},people=['팀장','저격수'].map((role,i)=>({id:101+i,name:role,role,skill:85,salary:10000000})),op={id:'SUPPORT-'+name,leaderName:'팀장',budget:20000000,contract:m,status:'현장 진행 중',fieldProgress:{seed:25,supportOrders:[{name,requestedAt:0,eta:5}]},teamIds:people.map(p=>p.id)};state.team=people;state.operations=[op];const s=fieldSimulation.create(op,m,people,200,{forceContact:true,medicalBudget:2,factions:[{id:'n',name:'중립 PMC',relation:80}]});op.fieldProgress.tactical=s;s.journey.stage='site';s.phase='과업';s.units=s.units.filter(u=>u.faction==='blackline'||u.id==='red-0');s.units.forEach((u,i)=>{u.inside=false;u.roadOnly=false;u.x=i===0?50:i===1?64:85;u.y=34;u.spawn=[u.x,u.y];u.waitUntil=9999;u.positionReported=true;u.nextShot=9999});for(let i=0;i<8;i++)fieldSimulation.step(s,op);if(!s.events.some(e=>['airstrike','artillery'].includes(e.kind)))throw Error('no real support event');openFieldObservation(op.id)}''',name)
  page.wait_for_timeout(1500);page.screenshot(path='/tmp/combat-'+kind+'-inbound.png',full_page=True)
  assert page.evaluate('state.operations[0].fieldProgress.tactical.events.some(e=>e.impactAt&&!e.applied)')
  assert page.evaluate('state.operations[0].fieldProgress.tactical.liveFrame.aims.length>0')
  page.evaluate('''()=>{const op=state.operations[0],s=op.fieldProgress.tactical;for(let i=0;i<5;i++)fieldSimulation.step(s,op)}''');page.wait_for_timeout(1200)
  assert page.evaluate('state.operations[0].fieldProgress.tactical.events.some(e=>e.impactAt&&e.applied)')
  page.screenshot(path='/tmp/combat-'+kind+'-impact.png',full_page=True)
  print('PASS',kind,'real observed target, inbound flight, delayed impact and target lines')
 page.evaluate('''()=>{const s=state.operations[0].fieldProgress.tactical;s.units[0].hp=30;s.units[0].woundedAt=s.time;s.units[0].status='wounded';s.units[0].x=66;s.units[0].y=38;fieldSimulation.captureFrame(s)}''');page.wait_for_timeout(1300);page.screenshot(path='/tmp/combat-casualty.png',full_page=True)
 assert not errors,errors
 print('PASS casualty sprite render without runtime exceptions')
 b.close()
