"""Manual/automatic saves, previous recovery, portable backups and quota emergency export."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 q=b.new_page(ignore_https_errors=True,viewport={'width':1920,'height':1080});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;OverwatchPersonnel.hire(s,s.market.candidates[0].id,30);s.ui.tab='storage';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 assert '이 브라우저에 저장' in q.locator('.save-checkpoints').inner_text()
 assert q.locator('#recover-previous').is_enabled()
 before=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.revision');q.locator('.save-checkpoints [data-save-now]').click();after=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.revision');assert after>before
 with q.expect_download() as dl:q.locator('#export-save').click()
 portable=Path(dl.value.path()).read_text();assert portable.startswith('OWG1:');assert dl.value.suggested_filename.endswith('.blz')
 assert q.evaluate('text=>OverwatchStorage.create({storage:localStorage}).parseImport(text).members.length',portable)==1
 q.once('dialog',lambda d:d.accept());q.locator('#recover-previous').click();assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.members.length')==0
 assert q.evaluate("OverwatchStorage.create({storage:localStorage}).parseImport(localStorage.getItem('blackline_overwatch_v1_before_import')).members.length")==1
 q.reload(wait_until='networkidle');q.locator('nav [data-tab=storage]').click();q.once('dialog',lambda d:d.accept());q.locator('#import-save').set_input_files({'name':'portable.blz','mimeType':'text/plain','buffer':portable.encode()});q.wait_for_function('OverwatchStorage.create({storage:localStorage}).load().state.members.length===1')
 print('PASS manual save, readable save/previous status, compressed portable export/import, previous restore with preserved replaced record and reload')
 # Actual HQ automation must flush the most recent unsaved tick on mobile pagehide.
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;const hr=OverwatchStaff.hire(s,s.commandStaff.market.find(m=>m.duty==='personnel').id);OverwatchStaff.assign(s,'personnel',hr.id);OverwatchPersonnel.start(s,{kind:'rest',memberIds:[s.members[0].id],hours:6});s.ui.tab='headquarters';st.save(s,s.revision);}""");q.reload(wait_until='networkidle');q.wait_for_timeout(1300)
 q.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pagehide'))")
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.activities.some(a=>a.workedSeconds>=60)')
 print('PASS pagehide flushes actual recent HQ activity rather than losing ticks before the regular checkpoint')
 q.close()
 q=b.new_page(ignore_https_errors=True,viewport={'width':844,'height':390});q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel;const h=r=>P.hire(s,s.market.candidates.find(c=>c.specialty===r).id,30);P.assign(s,'ALPHA',h('observer').id,h('sniper').id);const instructor=OverwatchStaff.hire(s,s.commandStaff.market.find(m=>m.duty==='instructor').id);OverwatchStaff.assign(s,'instructor',instructor.id);OverwatchBattle.begin(s,{mapId:'urban-modern',seed:7});s.ui.tab='command';st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 raw=q.evaluate("localStorage.getItem('blackline_overwatch_v1')");old=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.time')
 q.evaluate("""()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='blackline_overwatch_v1')throw new DOMException('The quota has been exceeded.','QuotaExceededError');return window.originalStorageSet.call(this,k,v);};}""")
 q.wait_for_function("document.querySelector('#export-unsaved')",timeout=20000)
 assert q.evaluate("localStorage.getItem('blackline_overwatch_v1')")==raw
 with q.expect_download() as dl:q.locator('#export-unsaved').click()
 emergency=Path(dl.value.path()).read_text();savedTime=q.evaluate('text=>OverwatchStorage.create({storage:localStorage}).parseImport(text).commandExercise.time',emergency);assert savedTime>old,(old,savedTime)
 q.evaluate('()=>{Storage.prototype.setItem=window.originalStorageSet;}')
 q.evaluate('text=>OverwatchStorage.create({storage:localStorage}).importSave(text)',emergency)
 q.reload(wait_until='networkidle');assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.time')>=savedTime
 q.screenshot(path='/tmp/overwatch-save-emergency-recovered.png',full_page=True)
 assert not errors,errors;q.close()
 q=b.new_page(ignore_https_errors=True,viewport={'width':844,'height':390});q.on('dialog',lambda d:d.accept());q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;OverwatchPersonnel.hire(s,s.market.candidates[0].id,30);s.ui.tab='storage';st.save(s,s.revision);localStorage.setItem('blackline_overwatch_v1_before_reset','old reset bytes');localStorage.setItem('blackline_overwatch_extra_slot','old future slot');}""")
 q.reload(wait_until='networkidle');old=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.campaignId');q.locator('#new-campaign').click()
 fresh=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert fresh['campaignId']!=old;assert fresh['members']==[];assert fresh['squads']==[];assert fresh['activities']==[];assert fresh['clock']['elapsedSeconds']==0;assert fresh['activeMission'] is None;assert fresh['operations']['reports']==[]
 assert q.evaluate("localStorage.getItem('blackline_overwatch_v1_before_reset')") is None
 assert q.evaluate("localStorage.getItem('blackline_overwatch_extra_slot')") is None
 assert q.evaluate("localStorage.getItem('blackline_overwatch_v1_previous')") is None
 q.reload(wait_until='networkidle');assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.campaignId')==fresh['campaignId']
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandStaff.market.some(m=>m.duty==="personnel")')
 b.close();print('PASS new HQ actually clears personnel, progress and old recovery slots, starts a fresh campaign and stays fresh after reload')
print('PASS a genuine quota write failure preserves primary bytes and exports newer unsaved valid progress that imports and resumes; no JS errors')
