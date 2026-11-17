"""Team formation, report briefing, no-minimum solo infantry launch and distinct faction art."""
import os,re
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8062')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1920,1080),(844,390)]:
  c=b.new_context(ignore_https_errors=True,viewport={'width':w,'height':h});q=c.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept())
  q.goto(BASE,wait_until='networkidle')
  q.evaluate('''()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,S=OverwatchStaff;P.finance(s,200000000-s.headquarters.funds,'test-funds');for(const role of ['personnel','controller']){const m=S.hire(s,s.commandStaff.market.find(m=>m.duty===role).id);S.assign(s,role,m.id);}S.managePersonnel(s);s.commandStaff.autoPersonnel=false;s.ui.tab='personnel';s.ui.personnelTab='infantry-squads';st.save(s,s.revision);}''')
  q.reload(wait_until='networkidle');assert q.locator('[data-infantry-formation]').count()==3
  assert '본부 1팀' in q.locator('body').inner_text();assert 'ALPHA' not in q.locator('body').inner_text()
  q.locator('[data-infantry-formation="ALPHA"] button[type="submit"]').click()
  q.evaluate('''()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,c=s.contracts.find(c=>c.key==='rescue-cover');OverwatchMissions.accept(s,c.id);OverwatchMissions.setTeams(s,c.id,['ALPHA']);s.infantry.deploy=false;s.ui.tab='contracts';st.save(s,s.revision);}''')
  q.reload(wait_until='networkidle');assert q.locator('[data-live-launch]').is_enabled()
  q.locator('.contract-proposal summary').first.click();q.locator('.operation-report img').first.wait_for()
  assert '작전' in q.locator('.operation-report').first.inner_text()
  assert q.locator('.operation-report img').first.evaluate('(im)=>im.complete && im.naturalWidth>0')
  assert not re.search(r'최소\s+\d',q.locator('.accepted-contract').inner_text())
  q.screenshot(path=f'/tmp/ow20-briefing-{w}.png')
  q.evaluate('''()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,c=s.contracts.find(c=>c.status==='accepted');OverwatchMissions.setTeams(s,c.id,[]);s.infantry.deploy=true;s.infantry.disabledSquads=['BRAVO','CHARLIE'];st.save(s,s.revision);}''')
  q.reload(wait_until='networkidle');q.locator('[data-live-launch]').click()
  q.wait_for_function('!!OverwatchIllustratedRenderer.get()',timeout=25000)
  q.evaluate('''()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;for(const u of s.commandExercise.world.actors.filter(a=>a.side==='red'))u.health.conscious=false;for(let i=0;i<160;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}s.ui.fieldInspector='support';st.save(s,s.revision);}''')
  q.reload(wait_until='networkidle');q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().assetsReady',timeout=30000)
  q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().motions.some(m=>m.sprite?.startsWith("hq-infantry-"))',timeout=15000)
  q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().motions.some(m=>m.sprite?.startsWith("agency-sniper-"))',timeout=15000)
  assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.world.units.length')==0
  assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.mission.hqInfantry.memberIds.length')==4
  q.locator('[data-infantry-command-team]').select_option('ALPHA');q.locator('[data-infantry-order="hold"]').click()
  q.wait_for_function('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.mission.hqInfantry.teamDirectives?.ALPHA?.mode==="hold"',timeout=12000)
  assert q.locator('[data-infantry-command-team]').input_value()=='ALPHA'
  assert not q.evaluate('OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state).radio.some(r=>r.channel==="internal")')
  q.screenshot(path=f'/tmp/ow20-units-{w}.png');assert not errors,errors
  print('PASS',w,h,': manual four-person teams, public names, map briefing, no minimum, infantry-only sortie, distinct art, team command and hidden internal radio',flush=True)
  c.close()
 b.close()
