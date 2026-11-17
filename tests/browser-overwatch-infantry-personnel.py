"""Separate infantry market/roster, budget staffing and selective multi-squad deployment."""
import os
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BLACKLINE_TEST_URL', 'http://127.0.0.1:8062')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1920,1080),(844,390)]:
  c=b.new_context(ignore_https_errors=True,viewport={'width':w,'height':h});q=c.new_page();errors=[]
  q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
  q.evaluate('''()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,S=OverwatchStaff;P.finance(s,200000000-s.headquarters.funds,'test-funds');const hr=S.hire(s,s.commandStaff.market.find(m=>m.duty==='personnel').id);S.assign(s,'personnel',hr.id);S.managePersonnel(s);s.commandStaff.autoPersonnel=false;s.ui.tab='personnel';s.ui.personnelTab='infantry';st.save(s,s.revision);}''')
  q.reload(wait_until='networkidle');assert q.locator('[data-infantry-squad]').count()==3
  assert '12/20명' in q.locator('summary').first.inner_text()
  assert q.locator('[data-infantry-hire]').count()==0
  q.locator('[data-personnel-tab="infantry-market"]').first.click()
  assert q.locator('[data-infantry-hire]').count()==4
  assert '사격' in q.locator('.member-grid').inner_text()
  q.locator('[data-personnel-tab="infantry"]').first.click()
  q.locator('[data-infantry-squad="CHARLIE"]').uncheck()
  q.evaluate('''()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,S=OverwatchStaff,M=OverwatchMissions;const chief=S.hire(s,s.commandStaff.market.find(m=>m.duty==='controller').id);S.assign(s,'controller',chief.id);const ct=s.contracts.find(c=>c.key==='high-value-target');M.accept(s,ct.id);M.launch(s,ct.id);for(const u of s.commandExercise.world.actors.filter(a=>a.side==='red'))u.health.conscious=false;for(let i=0;i<140;i++){OverwatchBattle.setPaused(s,false);OverwatchCommand.step(s,1);}s.ui.tab='field';s.ui.fieldInspector='roster';st.save(s,s.revision);}''')
  q.reload(wait_until='networkidle');q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().assetsReady')
  state=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
  units=[a for a in state['commandExercise']['world']['actors'] if a.get('hqMemberId')]
  assert len(units)==8;assert len([u for u in units if u['callsign']=='본부 보병 ALPHA'])==4
  assert len([u for u in units if u['callsign']=='본부 보병 BRAVO'])==4
  q.locator('[data-field-view-select]').select_option('2d')
  assert '기관 저격수' in q.locator('.field-viewport svg').text_content()
  assert '기관 관측수' in q.locator('.field-viewport svg').text_content()
  assert not errors,errors
  print('PASS',w,h,': separate infantry roster/market, budget hiring, 3 squads, selected 8 deploy and agency labels',flush=True)
  c.close()
 b.close()
