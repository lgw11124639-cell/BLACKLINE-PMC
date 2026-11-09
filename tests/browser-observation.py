from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.clock.install(time=datetime(2026,11,9,tzinfo=timezone.utc))
 page.goto('http://127.0.0.1:8000',wait_until='domcontentloaded');page.evaluate("document.getElementById('blackline-continue').click()")
 page.clock.pause_at(datetime(2026,11,9,0,0,10,tzinfo=timezone.utc))
 page.clock.run_for(60000)
 print('after60',page.evaluate('state.operations.map(o=>({id:o.id,status:o.status,t:o.fieldProgress?.tactical?.time}))'))
 assert page.evaluate('state.operations.some(o=>o.fieldProgress?.tactical?.version===3)')
 opid=page.evaluate('state.operations.find(o=>o.fieldProgress?.tactical).id')
 page.evaluate('window.blacklineReviewCompany=()=>{};go("home")')
 for i in range(60):
  if page.evaluate('(id)=>state.history.some(h=>h.planId===id)',opid):break
  page.clock.run_for(30000)
 assert page.evaluate('(id)=>state.history.some(h=>h.planId===id)',opid)
 result=page.evaluate('(id)=>{const s=state.history.find(h=>h.planId===id).tactical;return {time:s.time,stage:s.journey.stage,manifest:s.journey.manifest.length,team:s.units.filter(u=>u.faction==="blackline").length,objective:s.objective}}',opid)
 assert result['stage']=='complete',result
 assert result['manifest']==result['team'],result
 assert result['objective']==100,result
 print('PASS production real-time timers settle after actual return:',result['time'],'seconds')
 snapshot=page.evaluate('({cash:state.cash,count:state.history.length})')
 page.clock.run_for(3000)
 assert snapshot==page.evaluate('({cash:state.cash,count:state.history.length})')
 print('PASS no duplicate settlement')
 page.evaluate('companyClock.toggle();openFieldObservation()');page.clock.run_for(100)
 assert page.get_by_role('button',name='훈련 시연 보기',exact=True).count()==0
 assert page.get_by_role('slider',name='작전 기록 시간 이동',exact=True).count()==0
 assert page.locator('.field-standby').count()==1
 page.evaluate('(id)=>openFieldReplay(id)',opid);page.evaluate('fieldSeek(300)');page.clock.run_for(100)
 assert page.locator('#field-recording-root').is_visible();assert page.locator('#field-recording-root #field-seek').is_visible()
 page.screenshot(path='/tmp/operator-recording-3d.png',full_page=True)
 page.evaluate('closeFieldReplay()');assert page.locator('#field-recording-root').count()==0
 assert not errors,errors
 print('PASS LIVE-only route and separate report replay; no JS exceptions')
 b.close()
