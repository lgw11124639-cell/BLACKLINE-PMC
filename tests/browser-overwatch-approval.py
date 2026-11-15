"""HQ assigns real staff, approves an operation, and retains direct UAV support authority."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);q=b.new_page(viewport={'width':844,'height':390});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,hire=role=>P.hire(s,s.market.candidates.find(x=>x.specialty===role).id,30),o=hire('observer'),n=hire('sniper');P.assign(s,'ALPHA',o.id,n.id);st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 ids={}
 for duty in ['controller','instructor']:
  candidate=q.evaluate("d=>OverwatchStorage.create({storage:localStorage}).load().state.commandStaff.market.find(x=>x.duty===d).id",duty)
  q.locator('[data-staff-hire='+candidate+']').click()
  ids[duty]=q.evaluate("d=>OverwatchStorage.create({storage:localStorage}).load().state.commandStaff.members.find(x=>x.duty===d).id",duty)
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.members.length')==2
 for role in ['controller','instructor']:
  q.locator('[data-staff-duty='+role+'] select').select_option(ids[role]);q.locator('[data-staff-duty='+role+'] button').click()
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandStaff.controllerId')==ids['controller']
 q.locator('[data-staff-support]').uncheck();q.screenshot(path='/tmp/overwatch-commandroom-headquarters.png',full_page=True)
 q.locator('nav[aria-label="본부 메뉴"] [data-tab=contracts]').click();q.locator('[data-live-accept]').first.click();q.locator('[data-live-launch]').click();q.wait_for_selector('.field-viewport')
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.activeMission!==null')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,e=s.commandExercise;for(let i=0;i<160&&e.status==='running';i++){for(const a of e.world.actors)a.weapon.nextFireAt=e.time+20;OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);OverwatchCore.validate(s);}s.ui.fieldInspector='support';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 assert q.locator('[data-live-support=drone]').is_enabled();q.locator('[data-live-support=drone]').click()
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.mission.supports.drone')==1
 assert q.locator('[data-live-support=drone]').is_disabled();q.locator('[data-live-drone-retask]').click()
 state=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert state['commandExercise']['mission']['supports']['drone']==1
 assert any(r['from']['id']==ids['controller'] and r['route']=='down' for r in state['commandExercise']['radio'])
 assert len([t for t in state['commandExercise']['mission']['transports'] if t['trip']=='drone'])==1
 q.wait_for_function('!document.querySelector("[data-live-drone-camera]").disabled');q.locator('[data-live-drone-camera]').click();assert q.evaluate('OverwatchIllustratedRenderer.get().stats().viewSpan')>=500
 q.screenshot(path='/tmp/overwatch-commandroom-support.png',full_page=True)
 q.locator('[data-staff-support]').check();q.wait_for_timeout(1500)
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.mission.supports.drone')==1
 assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
 q.locator('nav[aria-label="본부 메뉴"] [data-tab=command]').click();assert not q.locator('.field-viewport').count();assert not q.locator('[data-field-start]').count();assert '훈련 대기' in q.locator('#main').inner_text()
 q.locator('nav[aria-label="본부 메뉴"] [data-tab=field]').click();assert q.locator('.field-viewport').count()==1;assert '실전 작전 관제' in q.locator('.page-title').inner_text()
 assert not errors,errors;b.close();print('PASS real HQ duty forms, contract approval and delegated orders; manual UAV launch/retask; one sortie with automatic support enabled afterward')
