"""Illustrated battlefield assets, click-only HQ interest areas, radio placement and renderer lifecycle."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8056')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-webgl'])
 ctx=b.new_context(viewport={'width':1440,'height':1000});q=ctx.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;for(let i=0;i<2;i++){const a=OverwatchPersonnel.hire(s,s.market.candidates.find(v=>v.specialty==='observer').id,30),n=OverwatchPersonnel.hire(s,s.market.candidates.find(v=>v.specialty==='sniper').id,30);OverwatchPersonnel.assign(s,['ALPHA','BRAVO'][i],a.id,n.id);}s.ui.tab='field';OverwatchBattle.begin(s,{seed:7});OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,8);OverwatchBattle.setPaused(s,true);st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().assetsReady');q.wait_for_timeout(300)
 assert not q.locator('[data-field-command] input[type=number]').count()
 assert q.locator('.field-comms [data-field-radio]').count()==1
 canvas=q.locator('.field-viewport canvas');m=canvas.bounding_box();r=q.locator('.field-comms').bounding_box();assert m['y']+m['height']<=r['y']<=m['y']+m['height']+80
 frame=q.evaluate('OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state)');ids=q.evaluate('OverwatchIllustratedRenderer.get().stats().knownIds');assert set(ids)=={x['id'] for x in frame['friends']+frame['contacts'] if not x.get('expired')}
 assert q.evaluate('OverwatchIllustratedRenderer.get().stats().framesPending')==0
 # Tap chooses an optional interest area; no typed coordinates and no individual unit movement command.
 canvas.click(position={'x':m['width']*.5,'y':m['height']*.7});assert '관심 구역 지정됨' in q.locator('[data-field-target]').inner_text()
 q.screenshot(path='/tmp/overwatch-illustrated-desktop.png',full_page=True)
 q.locator('[data-field-command] [name=kind]').select_option('cover');q.locator('[data-field-command] button[type=submit]').click()
 s=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert s['commandExercise']['commands'][-1]['kind']=='cover';assert s['commandExercise']['commands'][-1]['target'] is not None;assert not s['commandExercise']['paused'];q.locator('[data-field-play]').click()
 # Drag pans the map without selecting a point; changing renderer retains the optional interest area.
 q.locator('[data-field-clear-target]').click();canvas=q.locator('.field-viewport canvas');m=canvas.bounding_box();q.mouse.move(m['x']+100,m['y']+100);q.mouse.down();q.mouse.move(m['x']+160,m['y']+120,steps=8);q.mouse.up();assert '관측수 자율 판단' in q.locator('[data-field-target]').inner_text()
 q.locator('[data-field-view="2d"]').click();svg=q.locator('.field-viewport svg');bb=svg.bounding_box();svg.click(position={'x':bb['width']*.2,'y':bb['height']*.75});assert '관심 구역 지정됨' in q.locator('[data-field-target]').inner_text()
 q.locator('[data-field-view="3d"]').click();q.wait_for_function('!!OverwatchFieldRenderer.get()');assert q.evaluate('OverwatchIllustratedRenderer.get()===null')
 q.locator('[data-field-clear-target]').click();q.locator('.field-viewport canvas').click(position={'x':200,'y':250});assert '관심 구역 지정됨' in q.locator('[data-field-target]').inner_text()
 q.locator('[data-field-view="illustrated"]').click();q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().assetsReady');assert q.evaluate('OverwatchFieldRenderer.get()===null')
 for w,h in [(390,844),(844,390)]:
  q.set_viewport_size({'width':w,'height':h});assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
  q.locator('[data-field-fullscreen]').click();box=q.locator('.field-fullscreen').bounding_box();assert abs(box['width']-w)<3 and abs(box['height']-h)<3;q.screenshot(path='/tmp/overwatch-illustrated-full-'+str(w)+'.png');q.locator('[data-field-fullscreen]').click()
 q.locator('nav[aria-label="본부 메뉴"] [data-tab=personnel]').click();assert q.evaluate('OverwatchIllustratedRenderer.get()===null')
 assert q.locator('.member-role-art.observer').count()>0 and q.locator('.member-role-art.sniper').count()>0
 assert not errors,errors
 ctx.close();b.close();print('PASS illustrated map + new role assets, delivered-only actors, click targets / drag rejection in 2.5D/2D/3D, radio beneath map, mobile fullscreen and cleanup')
