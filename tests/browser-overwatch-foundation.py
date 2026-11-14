"""Phase 1 HQ, immutable legacy data, actual save UI and browser recovery paths."""
import json,os,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8050')
OLD=json.dumps({'date':'2030-02-02','team':[{'id':i,'name':'이전 대원'} for i in range(36)],'operations':[{'id':'OLD-ACTIVE'}],'history':[{'id':'OLD-HISTORY'}],'reports':[{'title':'실제 이전 기록'}]},ensure_ascii=False)
PACKED=subprocess.check_output(['node','-e',"process.stdout.write(require('./save-codec.js').pack(process.argv[1]))",OLD],text=True)
NEW='blackline_overwatch_v1';BACKUP=NEW+'_backup';LEGACY='blackline_pmc_v1'
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 ctx=browser.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script("if(!localStorage.getItem('blackline_pmc_v1')){localStorage.setItem('blackline_pmc_v1',"+json.dumps(OLD)+");localStorage.setItem('blackline_pmc_v1_backup',"+json.dumps(PACKED)+");}")
 page.goto(BASE,wait_until='networkidle');assert page.title()=='BLACKLINE: OVERWATCH'
 def saved(pg=None): return (pg or page).evaluate("OverwatchStorage.create({storage:localStorage}).load().state")
 initial=saved();assert initial['members']==[] and initial['activeMission'] is None
 assert page.evaluate("typeof fieldSimulation==='undefined' && typeof state==='undefined' && !document.querySelector('canvas')")
 assert not page.locator('script[src*="operations.js"]').count()
 page.wait_for_timeout(1200);assert saved()==initial,'HQ changed without an activity'
 assert page.evaluate("blacklineSaveCodec.rawGet('blackline_pmc_v1')")==OLD
 assert page.evaluate("blacklineSaveCodec.rawGet('blackline_pmc_v1_backup')")==PACKED
 page.screenshot(path='/tmp/overwatch-hq-desktop.png',full_page=True)
 page.locator('nav [data-tab="records"]').click();assert '36명' in page.locator('main').inner_text()
 with page.expect_download() as download: page.locator('[data-raw="blackline_pmc_v1_backup"]').click()
 assert Path(download.value.path()).read_text()==PACKED
 page.locator('nav [data-tab="storage"]').click();page.locator('#reduced-motion').check();page.reload(wait_until='networkidle')
 assert page.locator('#reduced-motion').is_checked();assert saved()['ui']['tab']=='storage'
 with page.expect_download() as download:page.locator('#export-save').click()
 exported=Path(download.value.path()).read_bytes();assert json.loads(exported)['state']['campaignId']==initial['campaignId']
 page.once('dialog',lambda d:d.accept());page.locator('#new-campaign').click();assert saved()['campaignId']!=initial['campaignId']
 before_reset=page.evaluate("localStorage.getItem('blackline_overwatch_v1_before_reset')")
 page.locator('nav [data-tab="storage"]').click();page.once('dialog',lambda d:d.accept());page.locator('#import-save').set_input_files({'name':'before-reset.json','mimeType':'application/json','buffer':before_reset.encode()})
 page.wait_for_function("OverwatchStorage.create({storage:localStorage}).load().state.campaignId==="+json.dumps(initial['campaignId']))
 before_invalid=saved();page.locator('#import-save').set_input_files({'name':'old-pmc.json','mimeType':'application/json','buffer':OLD.encode()});page.get_by_role('alert').wait_for();assert saved()==before_invalid
 # Fail exactly the backup write: original primary, backup and displayed settings must roll back.
 page.reload(wait_until='networkidle');page.evaluate("""()=>{const set=Storage.prototype.setItem;let fail=true;Storage.prototype.setItem=function(k,v){if(k==='blackline_overwatch_v1_backup'&&fail){fail=false;throw new DOMException('quota','QuotaExceededError');}return set.call(this,k,v);};}""")
 before=saved();page.locator('#reduced-motion').evaluate('el=>el.click()');assert '이전 저장을 복원' in page.get_by_role('alert').inner_text();assert saved()==before
 # Another tab sees the revision change and cannot write stale preferences.
 second=ctx.new_page();second.goto(BASE,wait_until='networkidle');page.reload(wait_until='networkidle');page.locator('#reduced-motion').uncheck();second.wait_for_selector('#stale-reload');assert second.locator('#reduced-motion').is_disabled();second.locator('#stale-reload').click();assert not second.locator('#reduced-motion').is_checked();second.close()
 for width,height in [(390,844),(844,390)]:
  page.set_viewport_size({'width':width,'height':height})
  for tab in ['headquarters','personnel','contracts','equipment','records','storage']:
   page.locator('nav [data-tab="'+tab+'"]').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,tab)
  page.locator('nav [data-tab="headquarters"]').click();page.screenshot(path='/tmp/overwatch-hq-'+str(width)+'.png',full_page=True)
 assert page.evaluate("blacklineSaveCodec.rawGet('blackline_pmc_v1')")==OLD
 assert page.evaluate("blacklineSaveCodec.rawGet('blackline_pmc_v1_backup')")==PACKED
 assert not errors,errors
 ctx.close()
 # No automatic corruption overwrite: recover the actual backup and archive damaged primary.
 ctx=browser.new_context();page=ctx.new_page();page.goto(BASE,wait_until='networkidle');original=saved();page.evaluate("localStorage.setItem('blackline_overwatch_v1','broken-primary')");page.reload(wait_until='networkidle');page.locator('nav [data-tab="storage"]').click();assert page.locator('#recover-backup').count();assert page.evaluate("localStorage.getItem('blackline_overwatch_v1')")=='broken-primary';page.once('dialog',lambda d:d.accept());page.locator('#recover-backup').click();assert saved()['campaignId']==original['campaignId'];assert json.loads(page.evaluate("localStorage.getItem('blackline_overwatch_v1_before_import')"))['primary']=='broken-primary'
 page.evaluate("localStorage.setItem('blackline_overwatch_v1','broken-1');localStorage.setItem('blackline_overwatch_v1_backup','broken-2')");page.reload(wait_until='networkidle');assert page.locator('#export-save').is_disabled();assert page.evaluate("localStorage.getItem('blackline_overwatch_v1')")=='broken-1';assert page.evaluate("localStorage.getItem('blackline_overwatch_v1_backup')")=='broken-2'
 with page.expect_download() as download:page.locator('[data-raw="blackline_overwatch_v1"]').click()
 assert Path(download.value.path()).read_text()=='broken-1'
 ctx.close();browser.close()
 print('PASS HQ/no legacy timers; immutable 36-person legacy JSON+compressed originals; real export/import/reset/recovery; failed writes; stale tabs; reload; desktop/mobile layouts')
