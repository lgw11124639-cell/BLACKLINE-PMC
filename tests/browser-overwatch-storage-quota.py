"""Use a supplied save and real Chromium localStorage quota; no private data is uploaded."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8067')
FILE=os.environ['BLACKLINE_RECOVERY_FILE']
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1920,1080),(844,390)]:
  c=b.new_context(ignore_https_errors=True,viewport={'width':w,'height':h});q=c.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.on('dialog',lambda d:d.accept());q.goto(BASE,wait_until='networkidle')
  q.evaluate("window.quotaOldCheckpoint=localStorage.getItem('blackline_overwatch_v1')")
  if not q.locator('[data-tab="storage"]').first.is_visible():q.locator('[data-mobile-menu]').click()
  q.locator('[data-tab="storage"]').first.click();q.locator('#import-save').set_input_files(FILE)
  q.wait_for_function('OverwatchStorage.create({storage:localStorage}).load().state.commandExercise?.time>=4005',timeout=30000)
  result=q.evaluate('''()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state;
   localStorage.setItem(st.keys.previous,window.quotaOldCheckpoint);
   // Fill unrelated storage to the actual browser limit, then leave 64 characters.
   let lo=0,hi=8*1024*1024;while(lo<hi){const n=Math.ceil((lo+hi)/2);try{localStorage.setItem('quota-test-other-app','x'.repeat(n));lo=n;}catch(e){if(e.name!=='QuotaExceededError')throw e;hi=n-1;}}
   const fill=Math.max(0,lo-64);localStorage.setItem('quota-test-other-app','x'.repeat(fill));
   s.records.push({id:'quota-test-real-write',time:s.clock.elapsedSeconds,type:'hq-established',message:Array.from({length:28},()=>crypto.randomUUID()).join('').slice(0,990)});if(s.records.length>500)s.records.shift();
   const saved=st.save(s,s.revision),loaded=st.load();
   if(loaded.state.revision!==saved.revision)throw Error('current save lost');
   if(localStorage.getItem('quota-test-other-app').length!==fill)throw Error('unrelated data changed');
   if(!st.status().recoveryWarning)throw Error('quota fallback did not run');
   if(st.raw(st.keys.previous)!==null)throw Error('checkpoint not reclaimed');
   return {time:saved.commandExercise.time,revision:saved.revision,warning:st.status().recoveryWarning};}''')
  q.reload(wait_until='networkidle');saved=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert saved['revision']>=result['revision'];assert saved['commandExercise']['time']>=result['time'];assert not errors,errors
  print('PASS',w,h,'supplied save; real browser quota reclaimed optional checkpoint; latest revision reloads; unrelated data preserved',flush=True);c.close()
 b.close()
