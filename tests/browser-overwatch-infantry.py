"""Own infantry roster, paid training, independent commands and saved visible smoke through the actual UI."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8062')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1920,1080),(844,390)]:
  c=b.new_context(ignore_https_errors=True,viewport={'width':w,'height':h});q=c.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)))
  q.goto(BASE,wait_until='networkidle')
  if not q.locator('[data-tab="personnel"]').first.is_visible():q.locator('[data-mobile-menu]').click()
  q.locator('[data-tab="personnel"]').first.click();q.locator('[data-personnel-tab="infantry"]').click();q.locator('[data-infantry-init]').click()
  for role in ['leader','rifleman','gunner','medic']:q.locator('[data-infantry-hire="hq-candidate-'+role+'"]').click()
  assert q.locator('[data-profile]').count()==0
  before=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert len(before['members'])==0;assert len(before['infantry']['members'])==4
  q.locator('[data-infantry-train]').click();q.locator('[data-infantry-advance]').click();q.reload(wait_until='networkidle')
  after=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert all(a['skills']['teamwork']>z['skills']['teamwork'] for a,z in zip(after['infantry']['members'],before['infantry']['members']))
  q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,h=r=>P.hire(s,s.market.candidates.find(m=>m.specialty===r).id,30);P.assign(s,'ALPHA',h('observer').id,h('sniper').id);const chief=OverwatchStaff.hire(s,s.commandStaff.market.find(m=>m.duty==='controller').id);OverwatchStaff.assign(s,'controller',chief.id);const contract=s.contracts.find(c=>c.key==='high-value-target');OverwatchMissions.accept(s,contract.id);OverwatchMissions.launch(s,contract.id);for(const u of s.commandExercise.world.actors.filter(a=>a.side==='red'))u.health.conscious=false;for(let i=0;i<150;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}s.ui.tab='field';s.ui.fieldInspector='roster';st.save(s,s.revision);}""")
  q.reload(wait_until='networkidle');q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().assetsReady',timeout=25000)
  assert q.locator('[data-field-person]').count()==6
  assert '본부 지원화기병' in q.locator('[data-inspector-panel="roster"]').first.inner_text()
  q.locator('button[data-inspector="support"]').click();assert q.locator('[data-agency-order]').count()==0;assert q.locator('[data-infantry-order]').count()==4
  q.locator('[data-infantry-order="hold"]').click();q.wait_for_function("document.querySelector('[data-infantry-order=hold]').getAttribute('aria-pressed')==='true'",timeout=12000)
  assert '본부 직접' in q.locator('[data-infantry-doctrine]').inner_text()
  q.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
  q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,e=s.commandExercise;for(const [i,u]of OverwatchInfantry.units(e).entries())Object.assign(u,{x:100+i*4,y:775,path:[],goal:null,waitingForDeployment:false,roofId:null});OverwatchInfantry.command(s,'hold',{x:100,y:775});for(let i=0;i<12;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}s.ui.fieldInspector='support';st.save(s,s.revision);}""")
  q.reload(wait_until='networkidle');q.wait_for_function('!!OverwatchIllustratedRenderer.get()');q.locator('[data-infantry-throw="smoke"]').click()
  q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().ordnance.smokes>0',timeout=12000,polling=40)
  q.evaluate("OverwatchIllustratedRenderer.get().focus(OverwatchStorage.create({storage:localStorage}).load().state.infantry.members[0].id)")
  q.wait_for_function('OverwatchAudio.status.ordnancePlayed>0',timeout=5000)
  q.screenshot(path=f'/tmp/ow18-infantry-smoke-{w}.png')
  q.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
  saved=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert sum(u.get('grenades',{}).get('spent',{}).get('smoke',0) for u in saved['commandExercise']['world']['actors'])==1,[(u['id'],u.get('grenades')) for u in saved['commandExercise']['world']['actors'] if u.get('hqMemberId')]
  if w==1920:
   q.locator('[data-field-view-select]').select_option('3d');q.wait_for_function('OverwatchFieldRenderer.get()?.stats().ordnance>0',timeout=12000);q.screenshot(path='/tmp/ow18-smoke-3d.png')
   q.locator('[data-field-view-select]').select_option('2d');q.locator('.field-viewport svg circle[fill="#ccd5ce"]').first.wait_for()
  assert not errors,errors
  print('PASS',w,h,': separate roster, actual hire/train/save, 4 own roles, independent command receipt, visible smoke and conserved inventory',flush=True)
  c.close()
 b.close()
