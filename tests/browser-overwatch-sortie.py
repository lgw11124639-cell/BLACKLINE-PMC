"""Choose a single pair from three through real controls; retain HQ formation and readable actors."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);q=b.new_page(ignore_https_errors=True,viewport={'width':1920,'height':1080});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,h=r=>P.hire(s,s.market.candidates.find(c=>c.specialty===r).id,30);for(const call of ['ALPHA','BRAVO','CHARLIE'])P.assign(s,call,h('observer').id,h('sniper').id);const c=OverwatchStaff.hire(s,s.commandStaff.market.find(c=>c.duty==='controller').id);OverwatchStaff.assign(s,'controller',c.id);s.ui.tab='contracts';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 cid=q.evaluate("OverwatchStorage.create({storage:localStorage}).load().state.contracts.find(c=>c.key==='aid-cover').id")
 q.locator('[data-live-accept='+cid+']').click()
 for call in ['ALPHA','CHARLIE']:q.locator('[data-sortie-teams] input[value='+call+']').uncheck()
 assert '1개 조 / 2명' in q.locator('[data-sortie-teams] legend').inner_text()
 assert q.evaluate("id=>OverwatchStorage.create({storage:localStorage}).load().state.contracts.find(c=>c.id===id).teamCallsigns",cid)==['BRAVO']
 q.reload(wait_until='networkidle');assert q.locator('[data-sortie-teams] input:checked').count()==1
 q.locator('[data-live-launch]').click();q.wait_for_selector('.field-viewport')
 result=q.evaluate('''()=>{const s=OverwatchStorage.create({storage:localStorage}).load().state;return {actual:s.commandExercise.world.units.length,teams:s.commandExercise.squads.map(q=>q.callsign),hq:s.squads.length,roster:s.members.length};}''')
 assert result=={'actual':2,'teams':['BRAVO'],'hq':3,'roster':6},result
 q.evaluate('''()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;for(let i=0;i<160;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}OverwatchCore.validate(s);st.save(s,s.revision);}''');q.reload(wait_until='networkidle');q.evaluate('OverwatchIllustratedRenderer.get().overview()');q.wait_for_timeout(500)
 scales=q.evaluate('OverwatchIllustratedRenderer.get().stats().motions.map(m=>m.entityScale).filter(Boolean)');assert len(scales)>=2 and min(scales)>=12,scales
 q.screenshot(path='/tmp/overwatch-sortie-readable.png',full_page=True);assert not errors,errors;b.close();print('PASS persisted one-pair sortie selection through actual UI, two physical operators, three HQ formations retained, readable shared display scale')
