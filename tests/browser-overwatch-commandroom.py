"""Landscape command room, assigned staff delegation, observed UAV support, and independent panels."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 q=b.new_page(viewport={'width':844,'height':390});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel;const o=P.hire(s,s.market.candidates.find(x=>x.specialty==='observer').id,30),n=P.hire(s,s.market.candidates.find(x=>x.specialty==='sniper').id,30),c=P.hire(s,s.market.candidates.find(x=>x.specialty==='observer').id,30),i=P.hire(s,s.market.candidates.find(x=>x.specialty==='sniper').id,30);P.assign(s,'ALPHA',o.id,n.id);OverwatchStaff.assign(s,'controller',c.id);OverwatchStaff.assign(s,'instructor',i.id);OverwatchBattle.begin(s,{mapId:'urban-market',seed:7});for(let j=0;j<30;j++){for(const a of s.commandExercise.world.actors)a.weapon.nextFireAt=s.commandExercise.time+20;OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}OverwatchCore.validate(s);s.ui.tab='field';st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');assert not errors,errors
 assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert q.evaluate('document.documentElement.scrollHeight<=innerHeight+2')
 box=q.locator('.field-viewport').bounding_box();assert box['height']>=170,box;assert box['y']+box['height']<=390,box
 assert not q.locator('select[name=roe]').count();assert not q.locator('[data-field-command]').count();assert not q.locator('[data-field-quick=cover]').count()
 assert q.evaluate("OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.radio.some(r=>r.from.role==='훈련 교관'&&r.route==='down')")
 q.locator('button[data-inspector=roster]').click();assert q.locator('[data-field-roster]').is_visible();assert not q.locator('[data-field-radio]').is_visible()
 q.locator('button[data-inspector=support]').click();assert q.locator('[data-control-name]').is_visible();assert '훈련 교관' in q.locator('[data-control-name]').inner_text()
 q.locator('button[data-inspector=radio]').click();q.screenshot(path='/tmp/overwatch-commandroom-phone.png',full_page=True)
 q.set_viewport_size({'width':667,'height':375});q.wait_for_timeout(300);assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');assert q.locator('.field-viewport').bounding_box()['height']>=120
 for button in q.locator('.field-stage-toolbar button').all():
  rect=button.bounding_box();stage=q.locator('.field-stage').bounding_box();assert rect['x']+rect['width']<=stage['x']+stage['width']+1,(button.inner_text(),rect,stage)
 q.set_viewport_size({'width':844,'height':320});q.wait_for_timeout(300);assert q.evaluate('document.documentElement.scrollHeight<=innerHeight+2');assert q.locator('.field-viewport').bounding_box()['height']>=100
 q.set_viewport_size({'width':1440,'height':900});q.wait_for_timeout(300);box=q.locator('.field-viewport').bounding_box();assert box['height']>550,box;q.screenshot(path='/tmp/overwatch-commandroom-desktop.png',full_page=True)
 q.set_viewport_size({'width':390,'height':844});q.wait_for_timeout(300);assert q.locator('.rotate-hint').is_visible();assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');q.screenshot(path='/tmp/overwatch-commandroom-portrait.png',full_page=True)
 assert not errors,errors
 b.close();print('PASS assigned instructor sends actual squad orders; one delegated command surface; independent radio/roster/support panels; landscape phone and desktop fit; portrait rotate guidance remains usable')
