"""Real phase-three UI, delivered-only map/radio, deterministic restore and mobile bounds."""
import json,os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8050')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);ctx=b.new_context(viewport={'width':1440,'height':1000});q=ctx.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 def saved():return q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
 def nav(tab):q.locator('nav[aria-label="본부 메뉴"] [data-tab="'+tab+'"]').click()
 def sub(tab):q.locator('nav[aria-label="인원 관리"] [data-personnel-tab="'+tab+'"]').click()
 nav('personnel');sub('market')
 for i in range(2):q.once('dialog',lambda d:d.accept());q.locator('[data-hire]').first.click()
 people=saved()['members'];sub('squads');f=q.locator('[data-squad-form="ALPHA"]');f.locator('[name="observer"]').select_option(people[0]['id']);f.locator('[name="sniper"]').select_option(people[1]['id']);f.locator('button').click()
 nav('command');q.locator('[data-range-start]').click();assert saved()['commandExercise']['status']=='running';assert q.locator('[data-known-unit]').count()==0
 form=q.locator('[data-range-command]');form.locator('[name="x"]').fill('220');form.locator('[name="y"]').fill('200');form.locator('button').click();assert '전달·회신 대기' in q.locator('.range-order-list').inner_text()
 q.locator('[data-range-step="10"]').click();assert q.locator('[data-known-unit]').count()==2
 before=saved();q.wait_for_timeout(500);assert saved()==before
 q.reload(wait_until='networkidle');assert saved()==before
 for i in range(5):q.locator('[data-range-step="120"]').click()
 assert saved()['commandExercise']['commands'][0]['status']=='completed';assert '완료 보고 수신' in q.locator('.range-order-list').inner_text()
 assert q.locator('.range-contact').count()>0
 assert q.locator('[data-channel="internal"]').count()>0
 assert q.locator('[data-channel="internal"]:visible').count()==0
 q.locator('[data-range-internal]').check();assert q.locator('[data-channel="internal"]:visible').count()>0
 q.locator('[data-range-step="10"]').click();assert q.locator('[data-range-internal]').is_checked()
 assert q.locator('[data-radio-id] details code').count()>0
 # No truth actor/route is inserted in DOM. Already received knowledge remains byte-identical if hidden truth is changed.
 snapshot=q.locator('.command-map').inner_html();q.evaluate("""()=>{const store=OverwatchStorage.create({storage:localStorage}),s=store.load().state;s.commandExercise.world.actors[0].x=1150;store.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');assert q.locator('.command-map').inner_html()==snapshot
 # HQ/personnel UI cannot mutate deployed pair while the command exercise owns it.
 nav('personnel');sub('squads');assert q.locator('[data-clear-squad="ALPHA"]').is_disabled();nav('command')
 # A failed save must roll back command queue and clock. UI must show the same delivered map.
 before=saved();q.evaluate("""()=>{const set=Storage.prototype.setItem;let once=true;Storage.prototype.setItem=function(k,v){if(k==='blackline_overwatch_v1_backup'&&once){once=false;throw new DOMException('quota','QuotaExceededError');}return set.call(this,k,v);};}""")
 q.locator('[data-range-step="30"]').click();assert saved()==before;assert q.get_by_role('alert').count()==1
 q.reload(wait_until='networkidle')
 for w,h in [(390,844),(844,390)]:
  q.set_viewport_size({'width':w,'height':h});assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
  q.locator('.command-map').scroll_into_view_if_needed();q.screenshot(path='/tmp/overwatch-command-'+str(w)+'.png',full_page=True)
  form=q.locator('[data-range-command]');form.locator('[name="kind"]').select_option('observe');form.locator('[name="x"]').fill('800');form.locator('[name="y"]').fill('150');form.locator('button').click();q.locator('[data-range-step="30"]').click();assert not q.get_by_role('alert').count()
 q.set_viewport_size({'width':1440,'height':1000});q.screenshot(path='/tmp/overwatch-command-desktop.png',full_page=True)
 # Another tab must block stale advancement; reloading does not advance simulated time.
 second=ctx.new_page();second.goto(BASE,wait_until='networkidle');previous=saved()['commandExercise']['time'];q.locator('[data-range-step="10"]').click();second.locator('#stale-reload').wait_for();assert second.locator('[data-range-step="10"]').is_disabled();second.close();assert saved()['commandExercise']['time']==previous+10
 q.once('dialog',lambda d:d.accept());q.locator('[data-range-end]').click();assert saved()['commandExercise']['status']=='ended';assert saved()['records'][-1]['type']=='command-exercise-ended';assert len(saved()['commandArchive'])==1;nav('records');assert '지휘 훈련 결과 · 1건' in q.locator('main').inner_text();nav('command');q.locator('[data-range-start]').click();assert len(saved()['commandArchive'])==1;q.once('dialog',lambda d:d.accept());q.locator('[data-range-end]').click()
 # Existing phase-two campaigns receive one safe schema upgrade and keep the exact old raw saves.
 other=b.new_context();r=other.new_page();r.goto(BASE)
 old=r.evaluate("""()=>{const s=OverwatchCore.createCampaign({id:'V2-MIGRATION',schemaVersion:2});const o=OverwatchPersonnel.hire(s,s.market.candidates[0].id,30),n=OverwatchPersonnel.hire(s,s.market.candidates[0].id,30);OverwatchPersonnel.assign(s,'ALPHA',o.id,n.id);const raw=JSON.stringify(s);localStorage.setItem('blackline_overwatch_v1',raw);localStorage.setItem('blackline_overwatch_v1_backup',raw);localStorage.setItem('blackline_pmc_v1','PMC-untouched');return raw;}""")
 r.reload(wait_until='networkidle');migrated=r.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert migrated['schemaVersion']==3 and migrated['squads']==json.loads(old)['squads'] and migrated['headquarters']['funds']==json.loads(old)['headquarters']['funds']
 archive=json.loads(r.evaluate("localStorage.getItem('blackline_overwatch_v1_before_migration_v3')"));assert archive['primary']==old and archive['backup']==old
 assert r.evaluate("blacklineSaveCodec.rawGet('blackline_pmc_v1')")=='PMC-untouched'
 assert not errors,errors
 other.close();ctx.close();b.close();print('PASS command UI: real recruitment/pair, order/observer/movement/report, delivered-only map, restore/no offline ticks, quota rollback, stale tabs, desktop/mobile and schema 2 migration')
