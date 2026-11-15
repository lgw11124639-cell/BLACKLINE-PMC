"""Continuous game progression, page-only zoom guard, live tab navigation and automatic resume."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8057')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 q=b.new_page(viewport={'width':390,'height':844});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;const a=OverwatchPersonnel.hire(s,s.market.candidates.find(c=>c.specialty==='observer').id,30),n=OverwatchPersonnel.hire(s,s.market.candidates.find(c=>c.specialty==='sniper').id,30);OverwatchPersonnel.assign(s,'ALPHA',a.id,n.id);OverwatchBattle.begin(s,{mapId:'urban-market',seed:7});OverwatchBattle.injure(s,s.commandExercise,s.commandExercise.world.units[1],{eventId:'browser-urgent',part:'leftArm',severity:1});s.ui.tab='field';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 saved=lambda:q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
 assert not q.locator('[data-field-play]').count();assert not saved()['commandExercise']['paused'];assert saved()['commandExercise']['battle']['continuous']
 q.wait_for_function('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.time>=5')
 assert not saved()['commandExercise']['paused']
 # Page gestures are cancelled; map zoom buttons still change the in-game view.
 assert 'maximum-scale=1' in q.locator('meta[name=viewport]').get_attribute('content')
 assert q.evaluate("""()=>{const e=new WheelEvent('wheel',{ctrlKey:true,cancelable:true});document.dispatchEvent(e);return e.defaultPrevented}""")
 assert q.evaluate("""()=>{const e=new Event('touchmove',{cancelable:true});Object.defineProperty(e,'touches',{value:[{},{}]});document.dispatchEvent(e);return e.defaultPrevented}""")
 assert not q.evaluate("""()=>{const e=new Event('touchmove',{cancelable:true});Object.defineProperty(e,'touches',{value:[{}]});document.dispatchEvent(e);return e.defaultPrevented}""")
 span=q.evaluate('OverwatchIllustratedRenderer.get().stats().viewSpan');q.locator('[data-field-zoom=".65"]').click();assert q.evaluate('OverwatchIllustratedRenderer.get().stats().viewSpan')<span
 # Intent orders are directly below the map.
 q.locator('[data-field-quick="hold"]').click();assert saved()['commandExercise']['commands'][-1]['kind']=='hold'
 q.wait_for_selector('[data-field-unit-extra]');q.locator('[data-field-unit-extra] summary').first.click();q.wait_for_timeout(1200);assert q.locator('[data-field-unit-extra]').first.get_attribute('open') is not None
 # HQ navigation must keep the same simulation running without a play button.
 before=saved()['commandExercise']['time'];q.locator('nav[aria-label="본부 메뉴"] [data-tab=headquarters]').click();q.wait_for_function('(t)=>OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.time>t',arg=before);assert not saved()['commandExercise']['paused']
 before=saved()['commandExercise']['time'];q.locator('nav[aria-label="본부 메뉴"] [data-tab=equipment]').click();q.wait_for_function('(t)=>OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.time>t',arg=before)
 # Actual browser suspension stops background work; returning resumes automatically.
 q.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
 stopped=saved()['commandExercise']['time'];q.wait_for_timeout(1500);assert saved()['commandExercise']['time']==stopped
 q.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))")
 q.wait_for_function('(t)=>OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.time>t',arg=stopped);assert not saved()['commandExercise']['paused']
 q.reload(wait_until='networkidle');assert not saved()['commandExercise']['paused']
 assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 b.close();print('PASS no pause/play button; urgent reports, HQ and gear navigation keep progressing; automatic return/reload resume; page pinch blocked, map zoom preserved; quick orders and stable details')
