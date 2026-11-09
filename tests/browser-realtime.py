import time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate('openFieldObservation()')
 page.wait_for_function('state.operations.some(o=>o.fieldProgress?.tactical?.version===2)',timeout=90000)
 opid=page.evaluate('state.operations.find(o=>o.fieldProgress?.tactical).id');before=page.evaluate('(id)=>state.operations.find(o=>o.id===id).fieldProgress.tactical.time',opid);stamp=time.monotonic();page.wait_for_timeout(12000);elapsed=time.monotonic()-stamp
 after=page.evaluate('(id)=>state.operations.find(o=>o.id===id).fieldProgress.tactical.time',opid)
 assert abs((after-before)-elapsed)<1.5,(before,after,elapsed)
 assert page.evaluate('(id)=>!state.operations.find(o=>o.id===id).fieldProgress.tactical.done',opid)
 page.screenshot(path='/tmp/operator-live-real-time.png',full_page=True)
 assert not errors,errors
 print('PASS actual wall-clock pacing',round(elapsed,2),'seconds =',after-before,'operation seconds')
 page.evaluate('companyClock.toggle()');saved=page.evaluate('(id)=>JSON.stringify(state.operations.find(o=>o.id===id).fieldProgress.tactical)',opid)
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();assert page.evaluate('(id)=>JSON.stringify(state.operations.find(o=>o.id===id).fieldProgress.tactical)',opid)==saved
 print('PASS paused live operation restores without extra time')
 b.close()
