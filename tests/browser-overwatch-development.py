"""Coached growth is completed through the real UI and survives reload; new city assets load."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 c=b.new_context(ignore_https_errors=True,viewport={'width':1920,'height':1080});q=c.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)))
 q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,h=r=>P.hire(s,s.market.candidates.find(x=>x.specialty===r).id,30);P.assign(s,'ALPHA',h('observer').id,h('sniper').id);for(const m of s.members){m.fatigue=0;m.stress=0;for(const k of P.SKILLS)m.skills[k]=50;}const teacher=OverwatchStaff.hire(s,s.commandStaff.market.find(m=>m.duty==='instructor').id);OverwatchStaff.assign(s,'instructor',teacher.id);s.ui.tab='personnel';st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');q.wait_for_function("document.querySelector('[data-advance]')&&!document.querySelector('[data-advance]').disabled",timeout=8000)
 before=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');a=next(a for a in before['activities'] if a['status']=='running');assert a['kind']=='training'
 q.locator('[data-advance]').click()
 after=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert after['members'][0]['skills'][a['course']]>before['members'][0]['skills'][a['course']]
 mid=after['members'][0]['id'];q.locator('[data-profile="'+mid+'"]').click();q.locator('[data-development]').wait_for();assert '→' in q.locator('[data-development]').inner_text();assert '권장 훈련' in q.locator('[data-development]').inner_text()
 q.screenshot(path='/tmp/ow-development-profile.png',full_page=True);q.reload(wait_until='networkidle');saved=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state');assert saved['members'][0]['development']==after['members'][0]['development'];assert not errors,errors
 print('PASS coached cohort, next-activity advance, real skill gain, visible development history and save/reload')
 c.close()
 for key,mapid in [('gwangju-rescue','city-gwangju-operation'),('seoul-watch','city-seoul-operation'),('busan-escort','city-busan-operation')]:
  c=b.new_context(ignore_https_errors=True,viewport={'width':1920,'height':1080});q=c.new_page();errs=[];q.on('pageerror',lambda e:errs.append(str(e)));q.goto(BASE,wait_until='networkidle')
  q.evaluate("""key=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,h=r=>P.hire(s,s.market.candidates.find(x=>x.specialty===r).id,30);for(const call of ['ALPHA','BRAVO'])P.assign(s,call,h('observer').id,h('sniper').id);const chief=OverwatchStaff.hire(s,s.commandStaff.market.find(x=>x.duty==='controller').id);OverwatchStaff.assign(s,'controller',chief.id);const contract=s.contracts.find(c=>c.key===key);OverwatchMissions.accept(s,contract.id);OverwatchMissions.launch(s,contract.id);s.ui.tab='field';st.save(s,s.revision);}""",key)
  q.reload(wait_until='networkidle');q.wait_for_function('OverwatchIllustratedRenderer.get()?.stats().assetsReady',timeout=20000)
  f=q.evaluate('OverwatchCommand.frame(OverwatchStorage.create({storage:localStorage}).load().state)');assert f['map']['id']==mapid;assert len(f['map']['buildings'])==24;assert len(set(b[4] for b in f['map']['buildings']))>=4
  assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.contracts.length')==14
  q.screenshot(path='/tmp/ow-'+key+'.png',full_page=True);assert not errs,errs;c.close();print('PASS new illustrated city district',mapid,': real image, 24 varied-height buildings, selectable live contract and persisted geography')
 b.close()
