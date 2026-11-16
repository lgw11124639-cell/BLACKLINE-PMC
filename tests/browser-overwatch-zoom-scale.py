"""Actual rendered actor/transport dimensions track terrain zoom; phone map fills both axes."""
import os, math
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
SEED="""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,h=r=>P.hire(s,s.market.candidates.find(m=>m.specialty===r).id,30);P.assign(s,'ALPHA',h('observer').id,h('sniper').id);const officer=OverwatchStaff.hire(s,s.commandStaff.market.find(m=>m.duty==='controller').id);OverwatchStaff.assign(s,'controller',officer.id);const c=s.contracts.find(c=>c.key==='aid-cover');OverwatchMissions.accept(s,c.id);OverwatchMissions.launch(s,c.id);for(let i=0;i<150;i++){for(const a of s.commandExercise.world.actors.filter(a=>a.side==='red'))a.weapon.nextFireAt=s.commandExercise.time+20;OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}s.ui.tab='field';st.save(s,s.revision);}"""
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(844,390),(390,844),(320,568),(1920,1080)]:
  ctx=b.new_context(ignore_https_errors=True,viewport={'width':w,'height':h},has_touch=True)
  q=ctx.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle');q.evaluate(SEED);q.reload(wait_until='networkidle')
  q.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));document.documentElement.requestFullscreen=undefined;")
  q.locator('[data-field-fullscreen]').click();q.wait_for_timeout(150)
  mobile=min(w,h)<=600
  if mobile:
   q.locator('[data-field-panel-toggle]').click();q.wait_for_timeout(150)
   vp=q.locator('.field-viewport');height=vp.evaluate('e=>e.clientHeight');assert height>=min(w,h)*.94,(w,h,height)
   assert not q.locator('[data-field-quick-team]').is_visible();assert not q.locator('[data-field-speed]').first.is_visible()
   q.locator('[data-field-hud]').click();assert q.locator('[data-field-quick-team]').is_visible();q.locator('[data-field-hud]').click();assert vp.evaluate('e=>e.clientHeight')==height
  # The renderer consumes a paused delivered-frame fixture, independent of AI animation/poses.
  q.evaluate("""()=>{const s=OverwatchStorage.create({storage:localStorage}).load().state,f=OverwatchCommand.frame(s);f.paused=true;f.status='running';const center={x:f.map.width/2,y:f.map.height/2};f.friends=f.friends.map((u,i)=>({...u,...center,x:center.x+i*5,pose:'standing',activity:'guarding',state:'holding',roofId:null,stale:false,home:false,boardedBy:null,waitingForDeployment:false,health:OverwatchBattle.health()}));const enemy={...f.friends[0],id:'render-observed-enemy',name:'식별된 적',x:center.x-5,callsign:null,role:undefined,faction:'regular',classification:'armed-person',confidence:1,expired:false,medicalCondition:'normal'};f.contacts=[enemy];f.supportActors=[];f.transports=[{id:'render-known-helicopter',name:'헬기',...center,type:'helicopter',state:'holding',altitude:0,manifest:[]},{id:'render-known-vehicle',name:'차량',...center,type:'vehicle',state:'holding',altitude:0,manifest:[]}];window.renderTestId=f.friends[0].id;OverwatchIllustratedRenderer.get().update(f);OverwatchIllustratedRenderer.get().overview();}""")
  q.wait_for_function('OverwatchIllustratedRenderer.get().stats().assetsReady');q.wait_for_timeout(200)
  q.locator('[data-field-fit]').click();q.wait_for_timeout(150)
  def stats():return q.evaluate('OverwatchIllustratedRenderer.get().stats()')
  initial=stats();vp=q.locator('.field-viewport');vw=vp.evaluate('e=>e.clientWidth');vh=vp.evaluate('e=>e.clientHeight')
  assert vw/initial['pixelsPerMetre']<=initial['worldExtent']['width']+.1,(w,h,initial)
  assert initial['viewSpan']<=initial['worldExtent']['height']+.1
  start=[m for m in initial['motions'] if m.get('renderedHeight')];assert len(start)>=3,(w,h,initial)
  ratio={m['id']:max(m['renderedWidth'],m['renderedHeight'])/initial['pixelsPerMetre'] for m in start}
  prior={m['id']:max(m['renderedWidth'],m['renderedHeight']) for m in start}
  for i in range(4):
   q.locator('[data-field-zoom=".65"]').click();q.wait_for_timeout(140);current=stats()
   for m in [x for x in current['motions'] if x['id'] in ratio]:
    extent=max(m['renderedWidth'],m['renderedHeight']);assert extent>prior[m['id']]*1.45,(w,h,i,m,prior)
    assert math.isclose(extent/current['pixelsPerMetre'],ratio[m['id']],rel_tol=.002),(w,h,i,m,ratio)
    prior[m['id']]=extent
   for t in current['transportSizes']:
    before=next(x for x in initial['transportSizes'] if x['id']==t['id']);assert math.isclose(t['pixels']/current['pixelsPerMetre'],before['pixels']/initial['pixelsPerMetre'],rel_tol=.002)
  q.locator('[data-field-fit]').click();q.wait_for_timeout(150);q.screenshot(path=f'/tmp/overwatch-fill-{w}x{h}.png')
  if mobile:
   toolbar=q.locator('.field-stage-toolbar');assert toolbar.evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(w,h,toolbar.evaluate('e=>[e.scrollWidth,e.clientWidth]'))
   q.locator('[data-field-panel-toggle]').click();assert q.locator('button[data-inspector=radio]').is_visible();assert q.locator('[data-field-radio]').is_visible()
  assert not errors,errors;ctx.close();print(f'PASS {w}x{h}: full-height mobile map, reversible HUD drawer, image fills both axes, four zoom steps grow friendly/enemy sprites and transports in exact terrain proportion')
 b.close()
