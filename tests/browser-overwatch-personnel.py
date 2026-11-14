"""Phase 2 actual UI transactions, timed activities, migration and mobile dossiers."""
import json, os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8050')
NEW='blackline_overwatch_v1'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.goto(BASE,wait_until='networkidle')
 def saved():return page.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
 def nav(key):page.locator('nav[aria-label="본부 메뉴"] [data-tab="'+key+'"]').click()
 def sub(key):page.locator('nav[aria-label="인원 관리"] [data-personnel-tab="'+key+'"]').click()
 def confirm_click(selector):
  page.once('dialog',lambda d:d.accept());page.locator(selector).click()
 def close():page.locator('[data-close-profile]').click()
 def profile(ident):page.locator('[data-profile="'+ident+'"]').click()
 nav('personnel');sub('market');initial=saved();assert initial['schemaVersion']==2
 candidates=initial['market']['candidates'][:2];cash=initial['headquarters']['funds']
 for c in candidates:confirm_click('[data-hire="'+c['id']+'"]')
 s=saved();assert len(s['members'])==2 and s['headquarters']['funds']==cash-sum(c['dailySalary']*30 for c in candidates)
 observer,sniper=[m['id'] for m in s['members']];sub('squads')
 form=page.locator('[data-squad-form="ALPHA"]');form.locator('[name="observer"]').select_option(observer);form.locator('[name="sniper"]').select_option(sniper);form.locator('button').click()
 assert len(saved()['squads'])==1
 assert page.locator('[data-squad-form="BRAVO"] option[value="'+observer+'"]').count()==0
 page.locator('[data-pair-training="ALPHA"]').click();started=saved();job=started['activities'][-1]
 assert job['status']=='running' and all(m['status']=='training' for m in started['members'])
 assert page.locator('[data-clear-squad="ALPHA"]').is_disabled()
 page.reload(wait_until='networkidle');assert saved()==started
 page.locator('[data-advance]').click();s=saved();assert s['clock']['elapsedSeconds']==14400
 assert s['relationships'][0]['cohesion']==55 and s['activities'][-1]['status']=='completed'
 assert s['headquarters']['funds']==started['headquarters']['funds']
 page.reload(wait_until='networkidle');assert saved()==s
 page.locator('[data-clear-squad="ALPHA"]').click();sub('roster');profile(observer)
 assert page.locator('[role="dialog"]').count()==1
 train=page.locator('[data-training]');train.locator('[name="course"]').select_option('firstAid');train.locator('[name="hours"]').select_option('8')
 train.locator('button').click();assert saved()['members'][0]['status']=='training';close();profile(sniper)
 rest=page.locator('[data-rest]');rest.locator('[name="hours"]').select_option('2');rest.locator('button').click();close()
 page.locator('[data-advance]').click();s=saved();assert s['clock']['elapsedSeconds']==6*3600
 training=next(a for a in s['activities'] if a['kind']=='training');assert training['workedSeconds']==2*3600 and training['status']=='running'
 page.reload(wait_until='networkidle');assert saved()==s
 page.locator('[data-advance]').click();s=saved();assert s['clock']['elapsedSeconds']==12*3600
 assert s['members'][0]['secondarySpecialties']==['firstAid'];assert sum(e['type']=='activity-completed' for e in s['records'])==3
 profile(observer);prior=saved();confirm_click('[data-renew]');assert saved()['members'][0]['contract']['endsAt']==prior['members'][0]['contract']['endsAt']+30*86400
 close();sub('market');cash=saved()['headquarters']['funds'];page.locator('[data-refresh-market]').click();assert saved()['headquarters']['funds']==cash-50000
 page.screenshot(path='/tmp/overwatch-personnel-market.png',full_page=True)
 # Import a genuine typed injury fixture: no gameplay control fabricates injuries.
 page.evaluate("""()=>{const store=OverwatchStorage.create({storage:localStorage}),s=store.load().state;OverwatchPersonnel.casualty(s,{id:'browser-injury',missionId:'fixture',memberId:s.members[0].id,kind:'injury',part:'leftLeg',severity:3,injuryType:'총상'});store.save(s,s.revision);}""")
 page.reload(wait_until='networkidle');sub('roster');profile(observer)
 assert '왼다리 · 총상 · 3단계' in page.locator('[role="dialog"]').inner_text()
 assert page.locator('[data-training] button').is_disabled();page.locator('[data-treatment]').click();close();page.locator('[data-advance]').click()
 s=saved();assert s['members'][0]['injuries'][0]['healed'] and s['members'][0]['aftereffects']
 profile(observer);page.locator('[data-rehab]').click();close();page.locator('[data-advance]').click()
 assert saved()['members'][0]['aftereffects']==[] and len(saved()['members'][0]['injuries'])==1
 # Failed salary write must leave both memory/UI and durable wallet/member state unchanged.
 sub('market');before=saved();page.evaluate("""()=>{const set=Storage.prototype.setItem;let once=true;Storage.prototype.setItem=function(k,v){if(k==='blackline_overwatch_v1_backup'&&once){once=false;throw new DOMException('quota','QuotaExceededError');}return set.call(this,k,v);};}""")
 confirm_click('[data-hire="'+before['market']['candidates'][0]['id']+'"]');assert saved()==before;assert page.get_by_role('alert').count()==1
 page.reload(wait_until='networkidle');sub('roster');profile(sniper);cash=saved()['headquarters']['funds'];confirm_click('[data-release]');assert saved()['headquarters']['funds']==cash
 assert saved()['archive']['members'][0]['id']==sniper;close();sub('archive');profile(sniper);assert '퇴사' in page.locator('[role="dialog"]').inner_text();close()
 # Mobile bounds, internal scrolling and keyboard containment at portrait and landscape sizes.
 sub('roster')
 for width,height in [(390,844),(844,390)]:
  page.set_viewport_size({'width':width,'height':height});profile(observer)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  box=page.locator('[role="dialog"]').bounding_box();assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=width+1 and box['y']+box['height']<=height+1
  page.locator('.dossier-content').evaluate('el=>el.scrollTop=el.scrollHeight');page.locator('[data-close-profile]').focus();page.keyboard.press('Shift+Tab');assert page.evaluate('!!document.activeElement.closest("[role=dialog]")')
  page.screenshot(path='/tmp/overwatch-personnel-'+str(width)+'.png');close()
 assert not errors,errors
 # V1 auto migration keeps original raw saves and grants capital just once.
 migration=browser.new_context();q=migration.new_page();q.goto(BASE)
 original=q.evaluate("""()=>{const s=OverwatchCore.createCampaign({id:'BROWSER-V1',schemaVersion:1});localStorage.setItem('blackline_overwatch_v1',JSON.stringify(s));localStorage.setItem('blackline_overwatch_v1_backup',JSON.stringify(s));localStorage.setItem('blackline_pmc_v1','legacy-untouched');return JSON.stringify(s);}""")
 q.reload(wait_until='networkidle');assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.schemaVersion')==2
 archive=json.loads(q.evaluate("localStorage.getItem('blackline_overwatch_v1_before_migration_v2')"));assert archive['primary']==original and archive['backup']==original
 q.reload(wait_until='networkidle');assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.headquarters.funds')==100000000
 assert q.evaluate("blacklineSaveCodec.rawGet('blackline_pmc_v1')")=='legacy-untouched'
 migration.close();ctx.close();browser.close()
 print('PASS phase 2: recruitment, wages, squads, simultaneous activities, resume, injury/treatment/history, quota rollback, contracts/archive, mobile and V1 migration')
