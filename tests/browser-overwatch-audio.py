"""Actual local decoded samples, user gesture, per-shot causality, deduplication and stop lifecycle."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8056')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(1440,1000),(390,844)]:
  q=b.new_page(viewport={'width':width,'height':height});errors=[];q.on('pageerror',lambda e:errors.append(str(e)))
  q.add_init_script("""(()=>{const Native=window.AudioContext;window.audioStarts=0;window.audioContexts=0;window.AudioContext=class extends Native{constructor(){super();audioContexts++;}createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n);n.start=(...args)=>{audioStarts++;return start(...args)};return n;}};})();""")
  q.goto(BASE,wait_until='networkidle');assert q.evaluate('audioContexts')==0
  q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,a=OverwatchPersonnel.hire(s,s.market.candidates.find(x=>x.specialty==='observer').id,30),n=OverwatchPersonnel.hire(s,s.market.candidates.find(x=>x.specialty==='sniper').id,30);OverwatchPersonnel.assign(s,'ALPHA',a.id,n.id);OverwatchBattle.begin(s,{seed:7});OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,10);OverwatchBattle.setPaused(s,true);s.ui.tab='field';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
  assert q.evaluate('audioContexts')==0;q.locator('[data-overwatch-audio]').click();q.wait_for_function('OverwatchAudio.status.enabled&&OverwatchAudio.status.samples===4');assert q.evaluate('audioContexts')==1;assert q.evaluate('audioStarts')==0
  used=q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,D=OverwatchCommand,B=OverwatchBattle,e=s.commandExercise,u=e.world.units[1],v=e.world.actors[0];B.setPaused(s,false);Object.assign(e.world.units[0],{x:80,y:650});Object.assign(u,{x:100,y:700});Object.assign(v,{x:200,y:700});e.squads[0].sector={x:200,y:700};for(const a of e.world.actors)a.weapon.nextFireAt=e.time+20;u.weapon.targetId=v.id;u.weapon.aimSince=e.time-8;const before=u.weapon.loaded;OverwatchAudio.sync(D.frame(s),{active:true});B.fire(s,e,u,{id:v.id,x:v.x,y:v.y,condition:'standing'});D.step(s,4);OverwatchCore.validate(s);window.audible=D.frame(s);OverwatchAudio.sync(audible,{active:true});return before-u.weapon.loaded;}""")
  assert used==1;assert q.evaluate('OverwatchAudio.status.played')==1;assert q.evaluate('audioStarts')==1
  q.evaluate('OverwatchAudio.sync(audible,{active:true})');assert q.evaluate('audioStarts')==1
  q.evaluate('audible.paused=true;OverwatchAudio.sync(audible,{active:false})');assert q.evaluate('OverwatchAudio.status.voices')==0
  q.locator('[data-overwatch-volume]').fill('20');assert q.evaluate('OverwatchAudio.status.volume')==.2
  q.locator('[data-overwatch-audio]').click();assert not q.evaluate('OverwatchAudio.status.enabled');q.locator('[data-overwatch-audio]').click();q.wait_for_function('OverwatchAudio.status.enabled');assert q.evaluate('audioContexts')==1
  q.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))");assert q.evaluate('OverwatchAudio.status.voices')==0
  assert not errors,errors;q.close()
 b.close();print('PASS real AAC shot samples, zero autoplay, trusted activation, exact per-shot sound and deduplication, pause/mute/background, volume and one context on desktop/mobile')
