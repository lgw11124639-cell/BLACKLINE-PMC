"""New contract UI, navigable new map art, and unrelated HQ rest during real deployment."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 q=b.new_page(ignore_https_errors=True,viewport={'width':1920,'height':1080});errors=[];q.on('dialog',lambda d:d.accept());q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel;for(const call of ['ALPHA','BRAVO']){const h=r=>P.hire(s,s.market.candidates.find(x=>x.specialty===r).id,30);P.assign(s,call,h('observer').id,h('sniper').id);}const extra=P.hire(s,s.market.candidates.find(x=>x.specialty==='observer').id,30);P.start(s,{kind:'rest',memberIds:[extra.id],hours:6});const c=OverwatchStaff.hire(s,s.commandStaff.market.find(x=>x.duty==='controller').id);OverwatchStaff.assign(s,'controller',c.id);s.ui.tab='contracts';st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');assert q.locator('[data-live-accept]').count()==14
 for name in ['지정 표적 암살','대저격 작전','표적 이동 차단']:assert name in q.locator('#main').inner_text()
 id=q.evaluate("OverwatchStorage.create({storage:localStorage}).load().state.contracts.find(c=>c.key==='high-value-target').id")
 region=q.locator('[data-live-region="'+id+'"]')
 for map in ['urban-embassy-operation','urban-rail-operation','urban-research-operation']:assert region.locator('option[value="'+map+'"]').count()==1
 q.locator('[data-live-accept="'+id+'"]').click();assert q.locator('[data-live-launch]').is_enabled()
 q.locator('[data-live-launch]').click();q.wait_for_timeout(4500)
 if not q.locator('[data-inspector=support]').count():
  q.screenshot(path='/tmp/v20-launch-error.png',full_page=True);raise AssertionError(q.locator('#main').inner_text()[:2000]+' ERRORS '+str(errors))
 q.locator('[data-inspector=support]').click();assert 'RAVEN' in q.locator('[data-agency-control]').inner_text()
 saved=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert saved['activeMission'];assert saved['commandExercise']['time']>0;assert any(a['kind']=='rest' and a['status']=='running' and a['workedSeconds']>0 for a in saved['activities'])
 assert q.evaluate("OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state).map.image.endsWith('urban-embassy.svg')")
 q.wait_for_function("[...document.images].every(x=>x.complete)");q.screenshot(path='/tmp/overwatch-v20-embassy.png',full_page=True)
 q.reload(wait_until='networkidle');assert q.evaluate("OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.mission.targetIds.length") ==1
 assert not errors,errors;b.close();print('PASS three target contract types, three selectable new districts, unrelated HQ rest does not block launch and progresses in parallel, actual clock, target status and save/reload on the new map')
