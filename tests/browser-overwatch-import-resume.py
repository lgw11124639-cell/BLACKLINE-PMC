"""Verify an externally supplied recovery file through the actual import and save UI.
Run with BLACKLINE_RECOVERY_FILE; the file itself is never committed or sent to a server.
"""
import os,json,base64,gzip
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8063')
SAVE=Path(os.environ['BLACKLINE_RECOVERY_FILE'])
raw=SAVE.read_text();data=json.loads(gzip.decompress(base64.b64decode(raw[5:])))
original=data.get('state',data);start=original['commandExercise']['time']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1920,1080),(844,390)]:
  c=b.new_context(ignore_https_errors=True,viewport={'width':w,'height':h});q=c.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept())
  q.goto(BASE,wait_until='networkidle')
  if not q.locator('[data-tab="storage"]').first.is_visible():q.locator('[data-mobile-menu]').click()
  q.locator('[data-tab="storage"]').first.click();q.locator('#import-save').set_input_files(str(SAVE))
  q.wait_for_function('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise?.time >= '+str(start),timeout=15000)
  if not q.locator('[data-tab="field"]').first.is_visible():q.locator('[data-mobile-menu]').click()
  q.locator('[data-tab="field"]').first.click();q.wait_for_function('!!OverwatchIllustratedRenderer.get()',timeout=30000)
  q.wait_for_function('(n)=>{const s=OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state);return !!document.querySelector("[data-field-clock]") && document.querySelector("[data-field-clock]").textContent.split(" / ")[0]!==String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0")}',arg=start,timeout=20000)
  q.locator('[data-save-now]').first.click()
  saved=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert saved['commandExercise']['time']>start
  assert len(saved['commandExercise']['squads'])==len(original['commandExercise']['squads'])
  assert 'Cannot read' not in q.locator('body').inner_text();assert '전장 저장·진행을 중단' not in q.locator('body').inner_text()
  q.reload(wait_until='networkidle');q.wait_for_function('!!OverwatchIllustratedRenderer.get()')
  assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise.time')>=saved['commandExercise']['time']
  assert not errors,errors
  print('PASS',w,h,': supplied save import, infantry-only simulation advances, manual save and reload without rollback',flush=True);c.close()
 b.close()
