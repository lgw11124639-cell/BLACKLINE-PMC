"""Agency infantry use allied art, while actual overwatch units physically reach elevated roofs."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for rooftop in [False,True]:
  ctx=b.new_context(ignore_https_errors=True,viewport={'width':1280,'height':590});q=ctx.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
  q.evaluate("""roof=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel;for(const call of (roof?['ALPHA']:['ALPHA','BRAVO'])){const o=P.hire(s,s.market.candidates.find(x=>x.specialty==='observer').id,30),n=P.hire(s,s.market.candidates.find(x=>x.specialty==='sniper').id,30);P.assign(s,call,o.id,n.id);}if(roof){OverwatchBattle.begin(s,{mapId:'urban-modern',scenario:'recon',seed:7});s.commandExercise.battle.observerAutonomy=true;OverwatchCommand.issue(s,'ALPHA','cover');}else{const chief=OverwatchStaff.hire(s,s.commandStaff.market.find(x=>x.duty==='controller').id);OverwatchStaff.assign(s,'controller',chief.id);s.commandStaff.autoSupport=false;const c=s.contracts.find(c=>c.key==='rescue-cover');OverwatchMissions.accept(s,c.id);OverwatchMissions.launch(s,c.id);}const e=s.commandExercise;for(let j=0;j<(roof?800:140)&&e.status==='running';j++){for(const a of e.world.actors)if(a.side==='red')a.health.conscious=false;OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);if(roof&&Object.values(e.knowledge.friends).some(u=>u.roofId))break;}OverwatchCore.validate(s);s.ui.tab=roof?'command':'field';s.ui.fieldInspector='roster';st.save(s,s.revision);}""",rooftop)
  q.reload(wait_until='networkidle');q.wait_for_timeout(500)
  if rooftop:
   assert '옥상 진지' in q.locator('[data-field-roster]').inner_text()
   assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.world.units.some(u=>u.roofId)')
   q.screenshot(path='/tmp/overwatch-rooftop.png',full_page=True)
  else:
   assert q.evaluate("OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state).supportActors.filter(a=>a.armed).every(a=>a.role==='infantry')")
   q.evaluate('OverwatchIllustratedRenderer.get().overview()');q.wait_for_timeout(500)
   assert q.evaluate("(()=>{const f=OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state),ids=f.supportActors.filter(a=>a.armed).map(a=>a.id),motions=OverwatchIllustratedRenderer.get().stats().motions.filter(a=>ids.includes(a.id));return motions.length>=4&&motions.every(a=>a.sprite.startsWith('allied-'));})()")
   q.locator('[data-inspector=support]').click();assert '원거리 관측' in q.locator('.live-field-panel').inner_text();q.screenshot(path='/tmp/overwatch-agency-infantry.png',full_page=True)
   q.locator('[data-field-view-select]').select_option('2d');assert '기관 보병' in q.locator('.field-viewport').inner_text()
  assert not errors,errors;ctx.close()
 b.close();print('PASS actual agency infantry roles/art and 2D support; saved, physically occupied roof position and roster status; no page errors')
