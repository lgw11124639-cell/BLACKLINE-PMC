"""Actual reconnaissance coverage display, HR market and live save persistence."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 q=b.new_page(ignore_https_errors=True,viewport={'width':1920,'height':1080});errors=[]
 q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel;const h=r=>P.hire(s,s.market.candidates.find(x=>x.specialty===r).id,30);P.assign(s,'ALPHA',h('observer').id,h('sniper').id);const controller=OverwatchStaff.hire(s,s.commandStaff.market.find(m=>m.duty==='controller').id);OverwatchStaff.assign(s,'controller',controller.id);s.ui.tab='headquarters';st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');assert q.locator('[data-staff-duty=personnel]').count()==1
 assert q.locator('[data-staff-personnel]').count()==1
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;const c=s.contracts.find(c=>c.key==='ridge-watch');OverwatchMissions.accept(s,c.id);OverwatchMissions.launch(s,c.id);const e=s.commandExercise,m=e.mission;m.fieldStartedAt=e.time;m.phase='field';for(const a of e.world.actors.filter(a=>a.side==='ally'))a.waitingForDeployment=a.id!=='agency-infantry-0';m.securityControl.everAuthorized=true;m.securityControl.authorized=true;for(let i=0;i<23;i++){e.time++;s.clock.elapsedSeconds=e.startedAt+e.time;OverwatchMissions.tick(s,e);}const report=e.radio.findLast(r=>r.payload?.reconProgress);if(!report)throw Error('no actual checkpoint report');OverwatchMissions.applyPayload(e,report);s.ui.tab='field';st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');q.locator('button[data-inspector=support]').click()
 q.wait_for_function("document.querySelector('[data-live-objective]')?.textContent.includes('구역 확인 1/6')")
 assert not q.locator('[data-live-support="supply"]').count()
 q.screenshot(path='/tmp/overwatch-v22-recon-coverage.png',full_page=True)
 q.reload(wait_until='networkidle');state=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
 assert state['commandExercise']['mission']['reconPlan']['areas'][0]['checkedAt'] is not None
 assert state['commandExercise']['mission']['objective'] is False
 assert not errors,errors
 print('PASS personnel officer controls and market; actual recon checkpoint progress 1/6, no premature objective, no primary resupply control, live save/reload, no JS errors')
 b.close()
