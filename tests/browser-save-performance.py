from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':844,'height':390},is_mobile=True,has_touch=True);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8043',wait_until='networkidle');page.locator('#blackline-continue').click()
 result=page.evaluate('''()=>{state.simClock.paused=true;state.saveStress=Array.from({length:24000},(_,i)=>({id:i,date:'2030-01-01',position:[i%100,i%67],text:'저장·복구 성능 검증'}));const durations=[];for(let i=0;i<20;i++){state.saveProof=i;const t=performance.now();save();durations.push(performance.now()-t);}return {bytes:JSON.stringify(state).length,maxRequestMs:Math.max(...durations)};}''')
 page.wait_for_function("!blacklineSaveStatus().busy&&!blacklineSaveStatus().pending&&JSON.parse(localStorage.getItem('blackline_pmc_v1')).saveProof===19",timeout=30000)
 assert page.evaluate("localStorage.getItem('blackline_pmc_v1')===localStorage.getItem('blackline_pmc_v1_backup')")
 assert result['maxRequestMs']<25,result
 page.evaluate('state.saveProof=777;save()');page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();assert page.evaluate('state.saveProof')==777
 assert page.evaluate('state.saveStress.length')==24000
 page.evaluate('state.saveProof=888;save();blacklineCancelPendingSave();window.blacklineSaveBlocked=true;localStorage.removeItem("blackline_pmc_v1");localStorage.removeItem("blackline_pmc_v1_backup")');page.wait_for_timeout(800)
 assert page.evaluate('localStorage.getItem("blackline_pmc_v1")') is None
 assert not errors,errors
 print('PASS',result,'worker round trip, primary/backup consistency, immediate reload flush, reset cannot be overwritten by an old worker')
 b.close()
