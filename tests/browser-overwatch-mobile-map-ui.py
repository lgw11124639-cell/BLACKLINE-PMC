"""Compact landscape command room, rotated touch coordinates and map gestures."""
import os, math
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
SEED="""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel;for(const call of ['ALPHA','BRAVO','CHARLIE']){const h=r=>P.hire(s,s.market.candidates.find(c=>c.specialty===r).id,30);P.assign(s,call,h('observer').id,h('sniper').id);}const teacher=OverwatchStaff.hire(s,s.commandStaff.market.find(m=>m.duty==='instructor').id);OverwatchStaff.assign(s,'instructor',teacher.id);OverwatchBattle.begin(s,{mapId:'urban-modern',seed:7});for(let i=0;i<8;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}s.ui.tab='command';st.save(s,s.revision);}"""
def pinch(session,r):
 x=r['x']+r['width']/2;y=r['y']+r['height']/2
 def points(d):return [{'x':x-d,'y':y},{'x':x+d,'y':y}]
 session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':points(14)})
 for d in [18,23,28,33,38,42]:session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':points(d)})
 session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
def pan(session,r,portrait):
 x=r['x']+r['width']/2;y=r['y']+r['height']/2
 session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
 for d in [8,16,24,32]:session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x if portrait else x-d,'y':y-d if portrait else y}]})
 session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(844,390),(390,844),(667,375),(320,568)]:
  ctx=b.new_context(ignore_https_errors=True,viewport={'width':w,'height':h},has_touch=True,is_mobile=True)
  q=ctx.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE,wait_until='networkidle');q.evaluate(SEED);q.reload(wait_until='networkidle')
  q.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));document.documentElement.requestFullscreen=undefined;")
  assert q.locator('body').evaluate("e=>e.classList.contains('mobile-ui')")
  assert not q.locator('.sidebar').is_visible()
  q.locator('[data-mobile-menu]').click();assert q.locator('.sidebar').is_visible();q.locator('[data-mobile-menu-close]').click();assert not q.locator('.sidebar').is_visible()
  toolbar=q.locator('.field-stage-toolbar');assert toolbar.evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(w,h,toolbar.evaluate('e=>[e.scrollWidth,e.clientWidth]'))
  vp=q.locator('.field-viewport');assert vp.evaluate('e=>e.clientHeight')>=150,(w,h,vp.evaluate('e=>e.clientHeight'))
  assert not q.locator('[data-field-view-select]').is_visible()
  q.locator('[data-field-tools]').click();assert q.locator('[data-field-view-select]').is_visible();q.keyboard.press('Escape');assert not q.locator('[data-field-view-select]').is_visible()
  before=vp.evaluate('e=>e.clientWidth');q.locator('[data-field-panel-toggle]').click();assert not q.locator('.field-layout>aside').is_visible();assert vp.evaluate('e=>e.clientWidth')>before+150
  q.locator('[data-field-panel-toggle]').click();assert q.locator('button[data-inspector=radio]').is_visible()
  q.locator('[data-field-tools]').click();q.locator('[data-field-overview]').click();q.keyboard.press('Escape');start=q.evaluate('OverwatchIllustratedRenderer.get().stats()');session=ctx.new_cdp_session(q)
  pinch(session,vp.bounding_box());q.wait_for_timeout(200);zoomed=q.evaluate('OverwatchIllustratedRenderer.get().stats()');assert zoomed['viewSpan']<start['viewSpan']*.6,(w,h,start,zoomed)
  assert not q.locator('[data-field-target]').inner_text().startswith('관심 구역 지정됨')
  before=q.evaluate('OverwatchIllustratedRenderer.get().stats().viewCenter');pan(session,vp.bounding_box(),h>w);after=q.evaluate('OverwatchIllustratedRenderer.get().stats().viewCenter');assert math.hypot(before['x']-after['x'],before['y']-after['y'])>1,(w,h,before,after)
  q.locator('[data-field-fullscreen]').click();assert q.locator('.field-fullscreen').count();assert q.locator('button[data-inspector=radio]').is_visible();q.locator('button[data-inspector=roster]').click();assert q.locator('[data-field-person]').count()==6
  q.screenshot(path=f'/tmp/overwatch-mobile-{w}x{h}.png')
  q.locator('[data-field-tools]').click();q.locator('[data-field-view-select]').select_option('2d');q.wait_for_timeout(150)
  vp=q.locator('.field-viewport');start=q.locator('.field-viewport svg').get_attribute('viewBox');pinch(session,vp.bounding_box());q.wait_for_timeout(100);after=q.locator('.field-viewport svg').get_attribute('viewBox');assert float(after.split()[3])<float(start.split()[3])*.6,(w,h,start,after)
  assert not errors,errors
  print(f'PASS {w}x{h}: compact toolbar/map size, menu, settings, expandable map with retained inspector, real one/two-finger gestures in illustrated and tactical map, no accidental target or JS errors')
  ctx.close()
 b.close()
