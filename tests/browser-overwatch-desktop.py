"""PC has persistent radio plus roster/support, while mobile retains compact inspector tabs."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 q=b.new_page(ignore_https_errors=True,viewport={'width':1920,'height':1080});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel;for(const call of ['ALPHA','BRAVO','CHARLIE']){const h=r=>P.hire(s,s.market.candidates.find(c=>c.specialty===r).id,30);P.assign(s,call,h('observer').id,h('sniper').id);}const c=OverwatchStaff.hire(s,s.commandStaff.market.find(c=>c.duty==='controller').id);OverwatchStaff.assign(s,'controller',c.id);s.ui.tab='contracts';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 select=q.locator('[data-live-region]').first;contract=select.get_attribute('data-live-region');select.select_option('urban-market-operation')
 assert q.evaluate("id=>OverwatchStorage.create({storage:localStorage}).load().state.contracts.find(c=>c.id===id).mapId",contract)=='urban-market-operation'
 q.evaluate("""id=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;OverwatchMissions.accept(s,id);OverwatchMissions.launch(s,id);for(let i=0;i<150;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}s.ui.tab='field';s.ui.fieldInspector='roster';st.save(s,s.revision);}""",contract);q.reload(wait_until='networkidle')
 assert q.locator('[data-field-radio]').is_visible();assert q.locator('[data-field-roster]').is_visible()
 assert q.locator('.field-viewport').bounding_box()['width']>900
 assert q.evaluate('OverwatchIllustratedRenderer.get().stats().viewSpan>=800')
 assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
 q.locator('[data-inspector=support]').click();assert q.locator('[data-field-radio]').is_visible();assert q.locator('[data-control-name]').is_visible()
 q.screenshot(path='/tmp/overwatch-desktop-support.png',full_page=True)
 q.locator('[data-inspector=roster]').click();q.set_viewport_size({'width':1440,'height':900});q.wait_for_timeout(300)
 assert q.locator('[data-field-radio]').is_visible();assert q.locator('[data-field-roster]').is_visible()
 q.screenshot(path='/tmp/overwatch-desktop-roster.png',full_page=True)
 q.set_viewport_size({'width':844,'height':390});q.wait_for_timeout(300)
 assert not q.locator('[data-field-radio]').is_visible();assert q.locator('[data-field-roster]').is_visible()
 assert not errors,errors;b.close();print('PASS real contract terrain selection; PC persistent radio with independent roster/support at 1920 and 1440; compact mobile tabs retained')
