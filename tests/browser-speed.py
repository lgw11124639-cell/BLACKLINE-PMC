"""Display acceleration must not change tactical decisions or settlement inputs."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 results=[]
 for speed in [1,3]:
  context=browser.new_context();page=context.new_page();page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('''(speed)=>{state.simClock.speed=speed;state.missions=[{...state.missionTemplates.find(m=>m.id===14),reward:2000000000,risk:3,receivedDate:state.date,expiresDate:'2030-01-20',contractStatus:'검토 가능'}];save()}''',speed)
  page.wait_for_function('state.history.some(h=>h.tactical)',timeout=35000);page.evaluate('companyClock.toggle()');results.append(page.evaluate('JSON.stringify(state.history[0].tactical)'));context.close()
 assert results[0]==results[1],'playback rate changed field actions or outcome'
 print('PASS 1x/3x identical movement, combat, support arrival and outcomes')
 browser.close()
