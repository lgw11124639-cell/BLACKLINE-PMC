"""Actual agency combat reaches the illustrated map independently of sniper visibility."""
import os,math
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
SEED="""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,G=OverwatchGeometry,h=r=>P.hire(s,s.market.candidates.find(m=>m.specialty===r).id,30);P.assign(s,'ALPHA',h('observer').id,h('sniper').id);const officer=OverwatchStaff.hire(s,s.commandStaff.market.find(m=>m.duty==='controller').id);OverwatchStaff.assign(s,'controller',officer.id);OverwatchStaff.delegate(s,false);const c=s.contracts.find(c=>c.key==='vip-cover');OverwatchMissions.accept(s,c.id);OverwatchMissions.launch(s,c.id);const e=s.commandExercise;for(const a of e.world.actors.filter(a=>a.side==='red'))a.health.conscious=false;for(let i=0;i<100;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}for(const a of e.world.units)Object.assign(a,{...G.project({x:1100,y:100}),path:[],goal:null,roofId:null,roofTransit:null});for(const [i,a]of e.world.actors.filter(a=>a.side==='ally'&&a.armed).entries())Object.assign(a,{x:400-i*15,y:775,path:[],goal:null,waitingForDeployment:false});const enemy=e.world.actors.find(a=>a.id==='opposition-4');Object.assign(enemy,{x:450,y:775,path:[],goal:null,deployment:null,route:[{x:450,y:775}]});enemy.health.conscious=true;enemy.weapon.nextFireAt=e.time+20;s.ui.tab='field';st.save(s,s.revision);}"""
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1920,1080),(844,390)]:
  c=b.new_context(ignore_https_errors=True,viewport={'width':w,'height':h});q=c.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)))
  q.goto(BASE,wait_until='networkidle');q.evaluate(SEED);q.reload(wait_until='networkidle')
  q.wait_for_function('!!OverwatchIllustratedRenderer.get()')
  q.locator('[data-field-fit]').click()
  q.wait_for_function('OverwatchAudio.status.enabled && OverwatchAudio.status.samples>0',timeout=15000)
  q.evaluate("const r=OverwatchIllustratedRenderer.get();r.focus('agency-guide');r.zoom(5)")
  q.wait_for_function("OverwatchIllustratedRenderer.get().stats().recentShots.some(s=>s.side==='ally'&&s.kind==='shot')",timeout=25000,polling=30)
  q.wait_for_function('OverwatchAudio.status.playedBySide.ally>0',timeout=15000)
  q.screenshot(path=f'/tmp/ow-agency-fire-{w}x{h}.png')
  q.wait_for_function("OverwatchIllustratedRenderer.get().stats().knownIds.includes('opposition-4')",timeout=5000)
  # The delivered contact is attributed to the agency rather than exposing all hostiles.
  q.locator('button[data-inspector=personnel]').click() if q.locator('button[data-inspector=personnel]').count() else None
  assert '기관 식별' in q.locator('[data-field-contacts]').inner_text()
  q.locator('button[data-inspector=support]').click()
  assert q.locator('[data-agency-order]').count()==0
  assert '기관 저격조·보병은 기관 지휘망으로 독립 작전 중' in q.locator('body').inner_text()
  q.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
  s=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');f=q.evaluate('OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state)')
  assert any(x['source']=='agency' for x in f['contacts'] if x['id']=='opposition-4')
  ids=[x['id'] for x in f['contacts']+f['supportActors']];assert len(ids)==len(set(ids)),ids
  assert any(x.get('weapon',{}).get('spent',0)>0 for x in f['supportActors'])
  # Compare the same standing pose: bodyguard and infantry must have identical terrain-relative size.
  q.evaluate("""()=>{const s=OverwatchStorage.create({storage:localStorage}).load().state,f=OverwatchCommand.frame(s);f.paused=true;f.status='running';f.supportActors=f.supportActors.filter(u=>u.armed).map((u,i)=>({...u,x:400+i*5,y:775,pose:'standing',activity:'guarding',health:OverwatchBattle.health(),combatActive:false}));f.contacts=[];OverwatchIllustratedRenderer.get().update(f);}""")
  q.wait_for_function('OverwatchIllustratedRenderer.get().stats().assetsReady');q.wait_for_timeout(100)
  stats=q.evaluate('OverwatchIllustratedRenderer.get().stats()');people=[m for m in stats['motions'] if m['id'].startswith('agency-') and m.get('renderedHeight')]
  assert len(people)>=5,people
  sizes=[max(m['renderedHeight'],m['renderedWidth']) for m in people];assert max(sizes)/min(sizes)<1.01,(sizes,people)
  assert not errors,errors
  print('PASS',w,h,': actual agency muzzle/tracer events, independently discovered enemy marker, one allied marker per person and identical bodyguard/infantry size')
  c.close()
 b.close()
