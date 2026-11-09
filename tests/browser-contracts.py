import json
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8000'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 old=b.new_page();old.goto('http://127.0.0.1:8001',wait_until='networkidle')
 old.evaluate('''()=>{state.team.push(...state.candidates.splice(0,3));for(let i=0;i<8;i++)nextDay()}''')
 legacy=old.evaluate('JSON.stringify(state)');assert old.evaluate("state.operations.some(o=>o.status==='현장 진행 중')")
 old.close();ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(URL,wait_until='networkidle');page.evaluate('(s)=>{localStorage.clear();localStorage.setItem("blackline_pmc_v1",s);localStorage.setItem("blackline_pmc_v1_backup",s)}',legacy)
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click()
 print('PASS old v28 save migration',page.evaluate('state.missionTemplates.length'))
 assert page.evaluate("state.operations.filter(o=>o.status==='현장 진행 중').every(o=>!!o.contract)")
 page.wait_for_timeout(2100)
 checkpoint=page.evaluate('state.operations[0].fieldProgress.stage');assert checkpoint>0
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click()
 assert page.evaluate('state.operations[0].fieldProgress.stage')>=checkpoint
 page.wait_for_function('state.history.length===1',timeout=16000)
 assert page.evaluate('!!state.operations[0].worldSettlement')
 assert page.evaluate('state.history[0].worldSettlement.after.trust!==state.history[0].worldSettlement.before.trust')
 print('PASS active-operation reload and settlement',page.evaluate('state.history[0].worldSettlement'))
 snapshot=page.evaluate('({cash:state.cash,history:state.history.length,trust:state.contractWorld.clients.map(c=>c.trust),ids:state.missions.filter(m=>m.contractStatus!=="정산 완료").map(m=>m.id)})')
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();page.wait_for_timeout(2200)
 assert snapshot==page.evaluate('({cash:state.cash,history:state.history.length,trust:state.contractWorld.clients.map(c=>c.trust),ids:state.missions.filter(m=>m.contractStatus!=="정산 완료").map(m=>m.id)})')
 print('PASS no duplicate reward, trust or offer on reload')
 for label in ['인력','장비','작전','본부']:
  page.locator('#tabs button').filter(has_text=label).click();assert len(page.locator('#app').inner_text())>80
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 print('PASS mobile menus and no horizontal overflow')
 day=page.evaluate('state.day');page.evaluate('()=>{nextDay();nextDay()}');assert page.evaluate('state.day')==day+1
 print('PASS duplicate daily action suppressed')
 # Validate bounded state over many real daily transactions without waiting for wall-clock debounce.
 for i in range(20):
  page.wait_for_timeout(360);page.evaluate('nextDay()')
 assert page.evaluate('state.missions.filter(m=>m.contractStatus==="검토 가능").length<=7')
 assert page.evaluate('state.contractWorld.events.length<=30')
 assert page.evaluate("localStorage.getItem('blackline_pmc_v1')===localStorage.getItem('blackline_pmc_v1_backup')")
 assert page.evaluate("new Blob([localStorage.getItem('blackline_pmc_v1')]).size<1000000")
 print('PASS 20-day simulation and bounded saves',page.evaluate("new Blob([localStorage.getItem('blackline_pmc_v1')]).size"))
 # Corrupt primary must recover from backup, keeping world and progress.
 saved_day=page.evaluate('state.day');page.evaluate("localStorage.setItem('blackline_pmc_v1','{broken')")
 page.reload(wait_until='networkidle');assert page.evaluate('state.day')==saved_day
 print('PASS damaged primary recovered from backup')
 assert not errors,errors
 print('PASS no uncaught JS exceptions')
 # Pre-market saves must retain an approved template beyond the first five offers.
 ancient=json.loads(legacy);ancient['missions']=ancient.pop('missionTemplates');ancient.pop('contractWorld',None)
 op=ancient['operations'][0];op['missionId']=18;op['id']='OP-legacy-18';op['status']='작전 승인';op['deployDate']='2031-01-01';op['rehearsalDate']='2031-01-01';op.pop('fieldProgress',None);op.pop('contract',None)
 page.evaluate('(s)=>{localStorage.setItem("blackline_pmc_v1",s);localStorage.setItem("blackline_pmc_v1_backup",s)}',json.dumps(ancient))
 page.reload(wait_until='networkidle')
 assert page.evaluate('state.missionTemplates.length===18&&state.missions.some(m=>m.id===18)&&state.operations[0].contract.id===18')
 print('PASS pre-market save retains approved template 18')
 ctx.close();b.close()
