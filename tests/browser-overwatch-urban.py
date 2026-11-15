"""City geometry/art and saved simulation share a mobile-safe live viewport."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8056')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 q=b.new_page(viewport={'width':1440,'height':1000});errors=[];q.on('pageerror',lambda e:errors.append(str(e)))
 q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;const a=OverwatchPersonnel.hire(s,s.market.candidates.find(x=>x.specialty==='observer').id,30),n=OverwatchPersonnel.hire(s,s.market.candidates.find(x=>x.specialty==='sniper').id,30);OverwatchPersonnel.assign(s,'ALPHA',a.id,n.id);s.ui.tab='field';st.save(s,s.revision)}""")
 q.reload(wait_until='networkidle');q.locator('[data-field-map]').select_option('urban-market');q.locator('[data-field-start]').click();q.locator('[data-field-play]').click()
 q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().assetsReady');q.wait_for_timeout(400)
 f=q.evaluate('OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state)')
 assert f['map']['width']==240 and 'urban-market' in f['map']['image']
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.world.units.length')==2
 q.screenshot(path='/tmp/overwatch-urban-desktop.png',full_page=True)
 q.reload(wait_until='networkidle');assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.mapId')=='urban-market'
 for w,h in [(390,844),(844,390)]:
  q.set_viewport_size({'width':w,'height':h});assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
  q.locator('[data-field-fullscreen]').click();q.screenshot(path='/tmp/overwatch-urban-'+str(w)+'.png');q.locator('[data-field-fullscreen]').click()
 assert not errors,errors
 b.close();print('PASS city selected through UI, real geometry, distinct actors, saved city and mobile fullscreen')
