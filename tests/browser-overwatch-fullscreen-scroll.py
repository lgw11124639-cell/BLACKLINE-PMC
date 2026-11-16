"""Six-unit fullscreen roster scrolls with a wheel and native touch in rotated portrait."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
SEED="""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel;for(const call of ['ALPHA','BRAVO','CHARLIE']){const o=P.hire(s,s.market.candidates.find(x=>x.specialty==='observer').id,30),n=P.hire(s,s.market.candidates.find(x=>x.specialty==='sniper').id,30);P.assign(s,call,o.id,n.id);}const i=OverwatchStaff.hire(s,s.commandStaff.market.find(x=>x.duty==='instructor').id);OverwatchStaff.assign(s,'instructor',i.id);OverwatchBattle.begin(s,{mapId:'urban-modern',seed:7});for(let j=0;j<8;j++){for(const a of s.commandExercise.world.actors)a.weapon.nextFireAt=s.commandExercise.time+20;OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}s.ui.tab='command';st.save(s,s.revision);}"""
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for portrait in [False,True]:
  ctx=b.new_context(ignore_https_errors=True,viewport={'width':390 if portrait else 844,'height':844 if portrait else 390},has_touch=portrait,is_mobile=portrait)
  q=ctx.new_page();q.set_default_timeout(8000);errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle');q.evaluate(SEED);q.reload(wait_until='networkidle')
  q.evaluate('document.documentElement.requestFullscreen=undefined');q.locator('[data-field-fullscreen]').click();q.locator('[data-inspector=roster]').click();q.wait_for_timeout(250)
  pane=q.locator('.field-layout.field-fullscreen > aside');assert q.locator('[data-field-person]').count()==6
  assert pane.evaluate('e=>getComputedStyle(e).overflowY')=='auto'
  assert pane.evaluate('e=>e.scrollHeight>e.clientHeight')
  if not portrait:
   r=pane.bounding_box();q.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);q.mouse.wheel(0,4000);q.wait_for_timeout(400)
  else:
   session=ctx.new_cdp_session(q)
   for j in range(24):
    r=pane.bounding_box();x=r['x']+r['width']*.18;y=r['y']+r['height']*.5
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    for k in range(1,9):
     session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+r['width']*.65*k/8,'y':y}]});q.wait_for_timeout(16)
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});q.wait_for_timeout(120)
    if not q.locator('.field-fullscreen').count():q.screenshot(path='/tmp/ow-v12-touch-lost.png');raise AssertionError('fullscreen lost during native swipe')
    if pane.evaluate('e=>e.scrollTop>=e.scrollHeight-e.clientHeight-2'):break
  assert pane.evaluate('e=>e.scrollTop>=e.scrollHeight-e.clientHeight-2'),pane.evaluate('e=>({top:e.scrollTop,height:e.scrollHeight,client:e.clientHeight})')
  assert q.locator('[data-inspector=radio]').is_visible();q.locator('[data-inspector=radio]').click();assert q.locator('[data-field-radio]').is_visible()
  q.locator('[data-field-fullscreen]').click()
  q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;OverwatchCommand.end(s);s.ui.tab='command';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
  main=q.locator('#main');assert not q.locator('.battle-screen').count();assert main.evaluate('e=>getComputedStyle(e).overflowY')=='auto';assert main.evaluate('e=>e.scrollHeight>e.clientHeight')
  if portrait:
   r=main.bounding_box();x=r['x']+r['width']*.2;y=r['y']+r['height']*.6
   session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
   for k in range(1,9):session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+r['width']*.6*k/8,'y':y}]});q.wait_for_timeout(16)
   session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  else:
   r=main.bounding_box();q.mouse.move(r['x']+r['width']/2,r['y']+r['height']/2);q.mouse.wheel(0,2000)
  q.wait_for_timeout(300);assert main.evaluate('e=>e.scrollTop')>0
  q.locator('[data-field-fullscreen]').click();assert q.locator('.field-layout.field-fullscreen').evaluate('e=>e.clientHeight')==(390 if not portrait else 390);q.locator('[data-field-fullscreen]').click()
  q.locator('[data-mobile-menu]').click();q.locator('nav[aria-label="본부 메뉴"] [data-tab=field]').click();assert not q.locator('.field-viewport').count();assert not q.locator('[data-field-start]').count();assert '실전 작전 없음' in main.inner_text()
  q.locator('[data-mobile-menu]').click();q.locator('nav[aria-label="본부 메뉴"] [data-tab=command]').click();assert q.locator('[data-field-start]').count()==1
  assert not errors,errors;ctx.close()
 b.close();print('PASS fullscreen six-member roster reaches the bottom with wheel and native touch in rotated portrait; inspector tabs remain usable; ended training scrolls and operation/training tabs are separate')
