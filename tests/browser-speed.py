"""LIVE operations cannot be fast-forwarded by old company speed preferences."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page()
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate("""()=>{blacklineReviewCompany();for(const o of state.operations)if(o.status==='작전 승인'){o.status='사전 연습 완료';o.deployAt=state.day*1440+state.simClock.minutes-1}blacklineRunScheduled();openFieldObservation();state.simClock.speed=3}""")
 page.wait_for_timeout(2200)
 assert page.evaluate('state.operations[0].fieldProgress.tactical.time') in [2,3]
 assert page.get_by_role('button',name='기록 재생 배속',exact=True).count()==0
 assert page.get_by_role('slider',name='작전 기록 시간 이동',exact=True).count()==0
 assert page.get_by_role('button',name='훈련 시연 보기',exact=True).count()==0
 assert page.locator('.field-mode.is-live').is_visible()
 print('PASS LIVE has no replay controls and remains 1:1 at an old 3x preference')
 b.close()
