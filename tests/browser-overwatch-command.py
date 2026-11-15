"""Real-time command training: actual AI, continuous clock, safe pause and no manual step buttons."""
import json,os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8056')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-webgl'])
 ctx=b.new_context(viewport={'width':1440,'height':1000});q=ctx.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 def saved():return q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
 def nav(tab):q.locator('nav[aria-label="본부 메뉴"] [data-tab="'+tab+'"]').click()
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;const a=OverwatchPersonnel.hire(s,s.market.candidates.find(x=>x.specialty==='observer').id,30),n=OverwatchPersonnel.hire(s,s.market.candidates.find(x=>x.specialty==='sniper').id,30);OverwatchPersonnel.assign(s,'ALPHA',a.id,n.id);s.ui.tab='command';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 q.locator('[data-field-start]').click();q.wait_for_function('!!OverwatchIllustratedRenderer.get()')
 assert saved()['commandExercise']['paused'] is False
 assert not q.locator('[data-range-step]').count()
 q.wait_for_timeout(3200)
 # Pause flushes the latest automatic ticks to the transactional store.
 q.locator('[data-field-play]').click();s=saved();assert s['commandExercise']['time']>=2
 before=s['commandExercise']['time'];form=q.locator('[data-field-command]');assert not form.locator('[name="x"], [name="y"]').count();form.locator('[name="kind"]').select_option('cover');form.locator('button[type=submit]').click()
 assert saved()['commandExercise']['commands'][-1]['status']=='queued'
 assert not saved()['commandExercise']['paused']
 q.evaluate("window.stableCanvas=document.querySelector('.field-viewport canvas');window.stableForm=document.querySelector('[data-field-command]');window.stableScroll=scrollY;")
 q.wait_for_timeout(8500)
 assert q.evaluate("stableCanvas===document.querySelector('.field-viewport canvas')&&stableForm===document.querySelector('[data-field-command]')&&Math.abs(scrollY-stableScroll)<3")
 q.locator('[data-field-play]').click();s=saved();assert s['commandExercise']['time']>=before+2
 assert s['commandExercise']['commands'][-1]['status']!='queued'
 # Navigation between command and field preserves one world and the canvas.
 nav('field');assert q.evaluate("stableCanvas===document.querySelector('.field-viewport canvas')")
 nav('command');assert saved()['commandExercise']==s['commandExercise']
 # Failed command persistence must not start simulation or retain an unsaved order.
 q.evaluate("""()=>{const set=Storage.prototype.setItem;let once=true;Storage.prototype.setItem=function(k,v){if(k==='blackline_overwatch_v1_backup'&&once){once=false;throw new DOMException('quota','QuotaExceededError');}return set.call(this,k,v);};}""")
 q.locator('[data-field-command] button[type=submit]').click();assert saved()['commandExercise']==s['commandExercise'];q.get_by_role('alert').wait_for();q.wait_for_timeout(1200);assert saved()['commandExercise']==s['commandExercise']
 q.reload(wait_until='networkidle')
 # Previously stored phase-three training is archived before entering the real-time 3D exercise.
 q.once('dialog',lambda d:d.accept());q.locator('[data-field-end]').click()
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;OverwatchCommand.begin(s);st.save(s,s.revision);}""");q.reload(wait_until='networkidle');q.locator('[data-range-upgrade]').click()
 assert saved()['commandExercise']['battle'];assert len(saved()['commandArchive'])==2
 # Reload safely pauses and never catches up wall-clock time.
 q.reload(wait_until='networkidle');before=saved()['commandExercise'];assert before['paused'];q.wait_for_timeout(1400);assert saved()['commandExercise']==before
 for w,h in [(390,844),(844,390)]:
  q.set_viewport_size({'width':w,'height':h});assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
 q.set_viewport_size({'width':1440,'height':1000})
 q.locator('[data-field-view="3d"]').click();q.wait_for_function('!!OverwatchFieldRenderer.get()')
 # Generate an actual engine shot; feed only its delivered HQ frame to the already mounted renderer.
 data=q.evaluate("""()=>{const C=OverwatchCore,P=OverwatchPersonnel,D=OverwatchCommand,B=OverwatchBattle,s=C.createCampaign({id:'MOTION-EVIDENCE'});const a=P.hire(s,s.market.candidates.find(x=>x.specialty==='observer').id,30),n=P.hire(s,s.market.candidates.find(x=>x.specialty==='sniper').id,30);P.assign(s,'ALPHA',a.id,n.id);B.begin(s,{seed:7});B.setPaused(s,false);D.step(s,10);const e=s.commandExercise,u=e.world.units[1],v=e.world.actors[0];Object.assign(e.world.units[0],{x:80,y:650});Object.assign(u,{x:100,y:700});Object.assign(v,{x:200,y:700});e.squads[0].sector={x:200,y:700};for(const x of e.world.actors)x.weapon.nextFireAt=e.time+20;u.weapon.targetId=v.id;u.weapon.aimSince=e.time-8;const ammo=u.weapon.loaded;B.fire(s,e,u,{id:v.id,x:v.x,y:v.y,condition:'standing'});D.step(s,4);C.validate(s);window.motionFrame=D.frame(s);OverwatchFieldRenderer.get().update(motionFrame);return {spent:ammo-u.weapon.loaded,effects:motionFrame.battle.effects,shooter:u.id};}""")
 assert data['spent']==1 and any(x.get('actorId')==data['shooter'] for x in data['effects'])
 q.wait_for_function("OverwatchFieldRenderer.get().stats().motions.some(x=>x.mode==='fire')",timeout=1500)
 q.screenshot(path='/tmp/overwatch-live-shot.png')
 q.wait_for_timeout(1250);assert not any(x['flash'] for x in q.evaluate('OverwatchFieldRenderer.get().stats().motions'))
 q.evaluate('OverwatchFieldRenderer.get().update(motionFrame)');q.wait_for_timeout(150)
 assert not any(x['mode']=='fire' for x in q.evaluate('OverwatchFieldRenderer.get().stats().motions')),'same packet replayed firing'
 q.evaluate("motionFrame.paused=true;OverwatchFieldRenderer.get().update(motionFrame)");q.wait_for_timeout(300);assert q.evaluate('OverwatchFieldRenderer.get().stats().framesPending')==0
 assert not errors,errors
 ctx.close();b.close();print('PASS realtime training/orders, stable view, rollback, old range archive, mobile, actual shot recoil and bounded paused renderer')
