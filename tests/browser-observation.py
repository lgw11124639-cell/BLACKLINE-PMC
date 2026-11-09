"""Run against the app's static server on port 8000. Uses disposable saves only."""
from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(320,740),(390,844),(1440,1000)]:
  context=b.new_context(viewport={'width':width,'height':height});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate('companyClock.toggle()')
  page.get_by_role('button',name='작전 관찰실',exact=True).click();assert page.locator('#tabs button').count()==5
  before=page.evaluate('JSON.stringify(state)')
  page.get_by_role('button',name='훈련 시연 시작',exact=True).click();page.evaluate('fieldSeek(0)')
  assert 'HAMMER' not in page.locator('#field-radio').inner_text()
  page.evaluate('fieldSeek(180)');assert 'HAMMER' in page.locator('#field-radio').inner_text();assert 'FALCON' in page.locator('#field-radio').inner_text()
  page.locator('[data-unit]').first.click();assert '좌표' in page.locator('#field-unit-detail').inner_text()
  page.get_by_role('button',name='지도 확대',exact=True).click();page.get_by_role('button',name='지도 집중 화면',exact=True).click();assert page.locator('.field-focus').count()==1
  page.keyboard.press('Escape');assert page.locator('.field-focus').count()==0
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  page.evaluate('fieldSeek(390)');assert '훈련 종료' in page.locator('#field-after-action').inner_text()
  assert page.evaluate('JSON.stringify(state)')==before,'training mutated company state'
  assert not errors,errors
  page.evaluate('fieldSeek(96)');page.screenshot(path='/tmp/blackline-observation-'+str(width)+'.png',full_page=True)
  print('PASS training/replay',width,'seek, synchronized radio, roster, zoom, focus and no company mutations')
  context.close()
 # Use a real contract fixture to verify actual field-to-accounting integration, without speeding via date clicks.
 context=b.new_context(viewport={'width':390,'height':844});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{state.missions=[{...state.missionTemplates.find(m=>m.id===14),reward:2000000000,risk:3,receivedDate:state.date,expiresDate:'2030-01-20',contractStatus:'검토 가능'}];save()}''')
 initial=page.evaluate('({ammo:state.ammo,cash:state.cash})')
 page.wait_for_function("state.operations.some(o=>o.fieldProgress?.tactical)",timeout=25000)
 page.evaluate('openFieldObservation()');page.wait_for_function('state.operations[0].fieldProgress.tactical.time>=65',timeout=7000)
 page.evaluate('companyClock.toggle()');checkpoint=page.evaluate('JSON.stringify(state.operations[0].fieldProgress.tactical)');ammo_at_checkpoint=page.evaluate('state.ammo')
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();assert page.evaluate('JSON.stringify(state.operations[0].fieldProgress.tactical)')==checkpoint
 assert page.locator('.field-mode.is-live').is_visible(),'observer did not restore on reload'
 page.evaluate('companyClock.toggle()')
 page.wait_for_function('state.history.some(h=>h.tactical)',timeout=25000)
 page.evaluate('companyClock.toggle()');history=page.evaluate('state.history[0]')
 assert history['used']>0,'battle fixture did not engage';assert history['used']==history['tactical']['ammoUsed']
 assert page.evaluate('state.ammo')==initial['ammo']-history['used']
 outcome=page.evaluate('fieldSimulation.outcome(state.history[0].tactical)')
 assert history['success']==outcome['success'];assert history['resolution']['hostileKilled']==outcome['hostileKilled'];assert history['resolution']['personnelCombat']==outcome['personnelCombat']
 for casualty in outcome['casualties']:
  assert page.evaluate('(id)=>state.team.find(p=>p.id===id).dead' if casualty['dead'] else '(id)=>state.team.find(p=>p.id===id).injured',casualty['id'])
 print('PASS autonomous deployment, checkpoint restore, actual casualties and ammunition settlement',history['used'])
 page.evaluate('(id)=>openFieldObservation(id)',history['planId']);page.evaluate('fieldSeek(390)');snapshot=page.evaluate('({cash:state.cash,ammo:state.ammo,history:state.history.length,relations:state.rivalPMCs})')
 page.evaluate('fieldRestart()');page.wait_for_timeout(700);page.evaluate('fieldSeek(390)');assert snapshot==page.evaluate('({cash:state.cash,ammo:state.ammo,history:state.history.length,relations:state.rivalPMCs})')
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();after_reload=page.evaluate('({cash:state.cash,ammo:state.ammo,history:state.history.length,relations:state.rivalPMCs})');assert snapshot==after_reload,(snapshot,after_reload)
 assert page.evaluate("localStorage.getItem('blackline_pmc_v1')===localStorage.getItem('blackline_pmc_v1_backup')")
 assert not errors,errors
 print('PASS replays/reloads never repay or consume ammunition; backups match')
 # Cross midnight through the actual clock, then pause; no duplicate daily settlement.
 page.evaluate('()=>{state.simClock.minutes=1439.95;companyClock.toggle()}');day=page.evaluate('state.day');page.wait_for_function('(d)=>state.day===d+1',arg=day,timeout=2500);page.evaluate('companyClock.toggle()')
 daily=page.evaluate('state.reports.filter(r=>r.title==="일일 운영비 정산 보고").length');page.wait_for_timeout(600);assert page.evaluate('state.day')==day+1;assert page.evaluate('state.reports.filter(r=>r.title==="일일 운영비 정산 보고").length')==daily
 print('PASS automatic midnight and paused clock')
 context.close();b.close()
