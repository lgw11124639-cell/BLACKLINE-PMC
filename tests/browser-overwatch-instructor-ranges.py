"""Instructor automation, stable multiple overlays and observed corpse art in the running UI."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 q=b.new_page(ignore_https_errors=True,viewport={'width':1920,'height':1080});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,S=OverwatchStaff;for(const c of ['ALPHA','BRAVO']){const h=r=>P.hire(s,s.market.candidates.find(x=>x.specialty===r).id,30);P.assign(s,c,h('observer').id,h('sniper').id);}const teacher=S.hire(s,s.commandStaff.market.find(x=>x.duty==='instructor').id);S.assign(s,'instructor',teacher.id);s.ui.tab='headquarters';st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');q.wait_for_function("OverwatchStorage.create({storage:localStorage}).load().state.activities.some(a=>a.status==='running'&&a.instructorId)")
 s=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');a=next(a for a in s['activities'] if a['status']=='running');assert len(a['memberIds'])==4;assert len(s['squads'])==2
 q.wait_for_timeout(5200);assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.clock.elapsedSeconds')>=240
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;OverwatchBattle.begin(s,{mapId:'urban-market',seed:7});for(let i=0;i<20;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}s.ui.tab='command';s.ui.fieldInspector='roster';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 buttons=q.locator('[data-field-range]');assert buttons.count()==4
 ids=[buttons.nth(i).get_attribute('data-field-range') for i in range(2)]
 for id in ids:q.locator('[data-field-range="'+id+'"]').click()
 q.wait_for_function('OverwatchIllustratedRenderer.get().stats().rangeIds.length===2');assert q.locator('[data-field-range][aria-pressed=true]').count()==2
 q.locator('[data-field-view-select]').select_option('2d');assert q.locator('[data-range-overlay]').count()==2
 q.locator('[data-field-view-select]').select_option('illustrated');q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().rangeIds.length===2')
 q.locator('[data-field-range-clear]').click();assert q.locator('[data-field-range][aria-pressed=true]').count()==0
 # The renderer consumes delivered contacts, without needing or reading enemy health.
 q.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
 q.evaluate("""()=>{const R=OverwatchIllustratedRenderer.get(),f=OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state);f.contacts=[{id:'confirmed-corpse',x:f.friends[0].x+3,y:f.friends[0].y,classification:'armed-person',faction:'regular',pose:'dead',medicalCondition:'dead',confidence:1,current:true}];R.update(f);}""")
 q.wait_for_function("OverwatchIllustratedRenderer.get().stats().motions.some(m=>m.id==='confirmed-corpse'&&m.sprite==='regular-dead'&&m.renderedWidth>0)")
 q.screenshot(path='/tmp/overwatch-v18-ranges-corpse.png',full_page=True)
 assert not errors,errors;b.close();print('PASS automatic four-member instructor activity with retained formations, actual HQ clock, multiple range overlays across 2D/illustrated remount, clear selection and confirmed corpse artwork')
