"""Real contract UI, no coordinate fields, auto-running insertion, transport views and restore."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8057')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-webgl'])
 q=b.new_page(viewport={'width':1440,'height':1000});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;const a=OverwatchPersonnel.hire(s,s.market.candidates.find(c=>c.specialty==='observer').id,30),n=OverwatchPersonnel.hire(s,s.market.candidates.find(c=>c.specialty==='sniper').id,30);OverwatchPersonnel.assign(s,'ALPHA',a.id,n.id);s.ui.tab='contracts';st.save(s,s.revision)}""");q.reload(wait_until='networkidle')
 assert q.locator('[data-live-accept]').count()==5
 q.locator('[data-live-accept]').nth(1).click();q.locator('[data-live-launch]').click()
 q.wait_for_timeout(8500);saved=lambda:q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
 s=saved();assert s['activeMission'] and not s['commandExercise']['paused'];assert s['commandExercise']['time']>=5
 assert not q.locator('input[type=number]').count();assert q.locator('[data-live-phase]').count()==1
 q.locator('[data-field-play]').click();q.reload(wait_until='networkidle');assert saved()['commandExercise']['paused']
 assert q.evaluate('OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state).transports.length')==1
 q.locator('[data-field-view="3d"]').click();q.wait_for_function('OverwatchFieldRenderer.get()?.stats().transports===1')
 q.locator('[data-field-view="illustrated"]').click();q.wait_for_function('!!OverwatchIllustratedRenderer.get()')
 q.screenshot(path='/tmp/overwatch-live-contract-desktop.png',full_page=True)
 for w,h in [(390,844),(844,390)]:
  q.set_viewport_size({'width':w,'height':h});assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
  q.locator('[data-field-fullscreen]').click();q.wait_for_timeout(250);q.screenshot(path='/tmp/overwatch-live-contract-'+str(w)+'.png');q.locator('[data-field-fullscreen]').click()
 # Run the same physical engine to actual return/debrief; never grant results directly.
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;for(let i=0;i<150;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}OverwatchMissions.requestReturn(s,{abort:true});for(let i=0;i<600&&s.commandExercise.status==='running';i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}OverwatchCore.validate(s);st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');assert saved()['commandExercise']['status']=='ended';assert q.locator('.live-debrief').count()==1
 assert saved()['operations']['reports'][0]['refund']+saved()['operations']['reports'][0]['consumed']==saved()['operations']['reports'][0]['escrow']
 q.locator('[data-field-clear-contract]').click();assert saved()['commandExercise'] is None and len(saved()['operations']['reports'])==1
 assert q.locator('[data-field-start]').count()==1
 # A separate saved real treatment state selects the medic art only at its actual patient.
 care=b.new_page(viewport={'width':844,'height':390});care.on('pageerror',lambda e:errors.append(str(e)));care.goto(BASE,wait_until='networkidle')
 care.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;const a=OverwatchPersonnel.hire(s,s.market.candidates.find(c=>c.specialty==='observer').id,30),n=OverwatchPersonnel.hire(s,s.market.candidates.find(c=>c.specialty==='sniper').id,30);OverwatchPersonnel.assign(s,'ALPHA',a.id,n.id);const c=s.contracts.find(c=>c.key==='aid-cover');OverwatchMissions.accept(s,c.id);OverwatchMissions.launch(s,c.id);const e=s.commandExercise;for(const a of e.world.actors.filter(a=>a.side==='red'))a.health.conscious=false;const step=()=>{OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1)};for(let i=0;i<80;i++)step();OverwatchBattle.injure(s,e,e.world.units[0],{eventId:'care-browser',part:'leftLeg',severity:3});for(let i=0;i<10;i++)step();OverwatchMissions.requestSupport(s,'medical');for(let i=0;i<400&&e.mission.transports.at(-1).crew?.state!=='treating';i++)step();if(e.mission.transports.at(-1).crew?.state!=='treating')throw Error('Treatment was not reached');step();step();OverwatchBattle.setPaused(s,true);s.ui.tab='field';OverwatchCore.validate(s);st.save(s,s.revision);}""")
 care.reload(wait_until='networkidle');care.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().assetsReady')
 care.wait_for_function('OverwatchIllustratedRenderer.get().stats().motions.some(m=>m.sprite==="medic-aid")');care.locator('[data-field-fullscreen]').click();care.wait_for_timeout(400);care.screenshot(path='/tmp/overwatch-medical-treatment-live.png');care.close()
 assert not errors,errors
 b.close();print('PASS contract acceptance, auto-play launch, physical transport in both renderers, no coordinates, paused reload, mobile fullscreen, actual debrief and report-preserving training reset')
