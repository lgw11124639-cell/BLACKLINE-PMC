"""Phase-four real UI/clock/WebGL, shared knowledge, state preservation and lifecycle checks."""
import json,os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8050')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-webgl'])
 ctx=b.new_context(viewport={'width':1440,'height':1000});q=ctx.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const store=OverwatchStorage.create({storage:localStorage}),s=store.load().state;const o=OverwatchPersonnel.hire(s,s.market.candidates[0].id,30),n=OverwatchPersonnel.hire(s,s.market.candidates[0].id,30);OverwatchPersonnel.assign(s,'ALPHA',o.id,n.id);s.ui.tab='field';localStorage.setItem('blackline_pmc_v1','LEGACY-IMMUTABLE');store.save(s,s.revision);}""")
 q.reload(wait_until='networkidle')
 def saved():return q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
 def nav(tab):q.locator('nav[aria-label="본부 메뉴"] [data-tab="'+tab+'"]').click()
 q.locator('[data-field-start]').click();q.locator('[data-field-view="3d"]').click();q.wait_for_function('!!OverwatchFieldRenderer.get()');assert q.locator('.field-viewport canvas').count()==1
 assert saved()['commandExercise']['paused'] is False
 q.locator('[data-field-play]').click() # explicit pause after automatic departure
 q.locator('[data-field-command] [name="kind"]').select_option('roe');q.locator('[data-field-command] [name="kind"]').focus()
 q.evaluate("window.fieldNode=document.querySelector('.field-viewport canvas');window.fieldInput=document.querySelector('[data-field-command] [name=kind]');document.querySelector('[data-field-play]').click();window.fieldScroll=scrollY;")
 q.wait_for_timeout(3400)
 assert q.evaluate("fieldNode===document.querySelector('.field-viewport canvas')&&fieldInput===document.querySelector('[data-field-command] [name=kind]')&&document.activeElement===fieldInput")
 assert q.locator('[data-field-command] [name="kind"]').input_value()=='roe'
 assert q.evaluate('Math.abs(scrollY-fieldScroll)<3'),'automatic ticking reset scroll'
 q.locator('[data-field-play]').evaluate('el=>el.click()');s=saved();assert 2<=s['commandExercise']['time']<=6
 q.wait_for_timeout(700);assert q.evaluate('OverwatchFieldRenderer.get().stats().framesPending')==0,'paused renderer is burning frames'
 ids=q.evaluate('OverwatchFieldRenderer.get().stats().knownIds');project=q.evaluate('OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state)');assert set(ids)=={x['id'] for x in project['friends']}
 # Both renderers use the same saved frame; switching does not advance, regenerate or duplicate actors.
 before=saved()['commandExercise']
 for i in range(2):
  q.locator('[data-field-view="2d"]').click();assert q.locator('.field-viewport canvas').count()==0;assert q.locator('.field-viewport svg').count()==1;assert saved()['commandExercise']==before
  q.locator('[data-field-view="3d"]').click();q.wait_for_function('!!OverwatchFieldRenderer.get()');assert q.locator('.field-viewport canvas').count()==1;assert saved()['commandExercise']==before
 # Fixed RNG/AI state prepared through the same public simulation functions; no display-only fake enemies.
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;OverwatchCommand.issue(s,'ALPHA','move',{x:220,y:200});OverwatchCommand.issue(s,'ALPHA','roe',null,'authorized');for(let i=0;i<6;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,100);}OverwatchBattle.setPaused(s,true);st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');q.wait_for_timeout(500);s=saved();assert s['commandExercise']['battle']['totalShots']>0
 ids=set(q.evaluate('OverwatchFieldRenderer.get().stats().knownIds'));f=q.evaluate('OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state)');expected={x['id'] for x in f['friends']+f['contacts'] if not x.get('expired')};assert ids==expected
 q.screenshot(path='/tmp/overwatch-field-desktop.png',full_page=True)
 # Injury/aid is a typed simulation fixture, displayed only after actual telemetry delivery.
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;OverwatchBattle.injure(s,s.commandExercise,s.commandExercise.world.units[0],{eventId:'browser-arm-shot',part:'leftArm',severity:2});for(let i=0;i<20;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}OverwatchBattle.setPaused(s,true);st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');assert '왼팔' in q.locator('[data-field-roster]').inner_text();assert q.locator('[data-field-roster] svg [fill="#c57266"]').count()>0;assert ' HP' not in q.locator('[data-field-roster]').inner_text()
 # 4x real-time UI advances and unload flushes; reloading always pauses without offline catch-up.
 q.locator('[data-field-speed="4"]').click();before=saved()['commandExercise']['time'];q.locator('[data-field-play]').click();q.wait_for_timeout(1800);q.reload(wait_until='networkidle');after=saved();assert after['commandExercise']['paused'];assert before<after['commandExercise']['time']<=before+9
 frozen=after['commandExercise']['time'];q.wait_for_timeout(1200);assert saved()['commandExercise']['time']==frozen
 # Background event stores a real pause; returning to visible never starts the clock on its own.
 q.locator('[data-field-play]').click();q.wait_for_timeout(400);q.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
 frozen=saved()['commandExercise']['time'];assert saved()['commandExercise']['paused'];q.wait_for_timeout(700);assert saved()['commandExercise']['time']==frozen
 q.evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))")
 # Fullscreen map fits landscape/portrait without changing the field state.
 q.locator('[data-field-view="2d"]').click()
 for w,h in [(390,844),(844,390)]:
  q.set_viewport_size({'width':w,'height':h});assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
  before=saved()['commandExercise'];q.locator('[data-field-fullscreen]').click();box=q.locator('.field-fullscreen').bounding_box();assert abs(box['width']-w)<3 and abs(box['height']-h)<3,(w,h,box)
  assert saved()['commandExercise']==before
  q.screenshot(path='/tmp/overwatch-field-full-'+str(w)+'.png');q.locator('[data-field-fullscreen]').click()
 q.set_viewport_size({'width':1440,'height':1000});q.locator('[data-field-view="3d"]').click();q.wait_for_function('!!OverwatchFieldRenderer.get()')
 # Actual WebGL loss switches to usable 2D; it must preserve the model and pause state.
 before=saved()['commandExercise'];q.evaluate("()=>{const canvas=document.querySelector('.field-viewport canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');gl.getExtension('WEBGL_lose_context').loseContext();}")
 q.wait_for_function("OverwatchStorage.create({storage:localStorage}).load().state.fieldPreferences.view==='2d'");assert saved()['commandExercise']==before;assert q.locator('.field-viewport svg').count()==1
 # Fail the automatic checkpoint after the play command itself has successfully saved.
 before=saved()['commandExercise']['time'];q.evaluate("""()=>{const old=Storage.prototype.setItem;let writes=0;Storage.prototype.setItem=function(k,v){if(k==='blackline_overwatch_v1_backup'&&++writes===2)throw new DOMException('quota','QuotaExceededError');return old.call(this,k,v);};}""")
 q.locator('[data-field-play]').click();q.get_by_role('alert').wait_for(timeout=10000);assert saved()['commandExercise']['time']==before;assert '마지막 저장' in q.get_by_role('alert').inner_text()
 q.reload(wait_until='networkidle');assert saved()['commandExercise']['paused'];q.locator('[data-field-play]').click();q.wait_for_timeout(400);nav('personnel');assert saved()['commandExercise']['paused'];assert q.locator('.field-viewport canvas').count()==0;assert q.evaluate('OverwatchFieldRenderer.get()===null')
 nav('field');second=ctx.new_page();second.goto(BASE,wait_until='networkidle');second.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;s.settings.reducedMotion=!s.settings.reducedMotion;st.save(s,s.revision);}""");q.locator('#stale-reload').wait_for();assert q.locator('[data-field-play]').is_disabled();second.close();q.locator('#stale-reload').click()
 q.once('dialog',lambda d:d.accept());q.locator('[data-field-end]').click();assert saved()['commandExercise']['status']=='ended';assert saved()['commandExercise']['battle']['result']['returned'] is False
 assert q.evaluate("blacklineSaveCodec.rawGet('blackline_pmc_v1')")=='LEGACY-IMMUTABLE'
 assert not errors,errors
 ctx.close();b.close();print('PASS field: actual realtime/WebGL and shared 2D knowledge, stable canvas/input/scroll, pause/reload/background, speed, injury telemetry, fullscreen, GL fallback, checkpoint rollback, stale tabs and no campaign losses')
