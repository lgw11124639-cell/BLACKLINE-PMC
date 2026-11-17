import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8067')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1920,1080),(844,390)]:
  c=b.new_context(ignore_https_errors=True,viewport={'width':w,'height':h});q=c.new_page();errs=[];q.on('pageerror',lambda e:errs.append(str(e)));q.goto(BASE,wait_until='networkidle')
  expected=q.evaluate("fetch('version.json',{cache:'no-store'}).then(r=>r.json()).then(v=>v.version)")
  q.wait_for_function("v=>document.querySelector('#version-check')?.getAttribute('title').includes(v)",arg=expected)
  q.evaluate('''()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,I=OverwatchInfantry,M=OverwatchMissions;P.finance(s,200000000,'fixture');const S=OverwatchStaff,chief=S.hire(s,s.commandStaff.market.find(m=>m.duty==='controller').id);S.assign(s,'controller',chief.id);I.initialize(s);for(let i=0;i<3;i++)for(const c of s.infantry.market)I.hire(s,c.id);I.formTeams(s);s.infantry.disabledSquads=['ALPHA'];const c=s.contracts.find(c=>c.key==='rescue-cover');M.accept(s,c.id);M.setTeams(s,c.id,[]);M.launch(s,c.id);const e=s.commandExercise,m=e.mission;for(const u of I.units(e))u.home=true;m.objective=true;m.protectedHome=true;m.finalizing=true;e.status='ended';const r=M.settle(s,e);if(!r.success)throw Error('new infantry result failed');const payment=r.reward+r.bonus;P.finance(s,-payment,'legacy-fixture');Object.assign(r,{success:false,returnComplete:false,reward:0,bonus:0});s.ui.tab='field';st.save(s,s.revision);}''')
  q.reload(wait_until='networkidle')
  q.wait_for_function("OverwatchStorage.create({storage:localStorage}).load().state.operations.reports[0].success===true")
  state=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');r=state['operations']['reports'][0];assert r['reward']>0 and r['returnComplete']
  text=q.locator('body').inner_text();assert '본부 1팀 · 미출격' in text and '출격 선택 해제' in text and '계약 목표 달성' in text,text[-2500:]
  q.screenshot(path=f'/tmp/ow23-result-{w}.png',full_page=True)
  money=state['headquarters']['funds'];q.reload(wait_until='networkidle');assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.headquarters.funds')==money
  assert not errs,errs;print('PASS',w,h,'infantry rescue success; legacy result/payment corrected exactly once; first-team absence reason visible',flush=True);c.close()
 b.close()
