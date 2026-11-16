"""Headquarters preparation first, one scroll, optional staff market and preserved form actions."""
import os
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);q=b.new_page(ignore_https_errors=True,viewport={'width':1920,'height':1080});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel,h=r=>P.hire(s,s.market.candidates.find(c=>c.specialty===r).id,30);for(const call of ['ALPHA','BRAVO'])P.assign(s,call,h('observer').id,h('sniper').id);h('observer');st.save(s,s.revision);}""");q.reload(wait_until='networkidle')
 assert q.locator('.hq-dashboard > .panel').first.get_attribute('class')=='panel operation-brief'
 assert not q.locator('[data-hq-recruitment]').evaluate('(d)=>d.open')
 assert not q.locator('.hq-terrain').count()
 assert q.locator('.hq-team-summary article').count()==2
 assert q.evaluate("[...document.querySelectorAll('.hq-dashboard > .panel')].every(p=>!['auto','scroll'].includes(getComputedStyle(p).overflowY))")
 q.screenshot(path='/tmp/overwatch-headquarters-desktop.png',full_page=True)
 q.locator('[data-hq-recruitment] summary').click();q.locator('[data-staff-hire]').first.click()
 assert q.locator('[data-hq-recruitment]').evaluate('(d)=>d.open')
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.members.length')==5
 staff=q.evaluate("OverwatchStorage.create({storage:localStorage}).load().state.commandStaff.members.find(m=>m.duty==='controller').id")
 q.locator('[data-staff-duty=controller] select').select_option(staff);q.locator('[data-staff-duty=controller] button').click()
 assert q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state.commandStaff.controllerId')==staff
 q.locator('[data-hq-recruitment] summary').click();q.set_viewport_size({'width':844,'height':390});q.wait_for_timeout(300)
 assert abs(q.locator('.operation-brief').bounding_box()['x']-q.locator('.staff-panel').bounding_box()['x'])<2
 main=q.locator('#main');q.mouse.move(600,300);q.mouse.wheel(0,1500);q.wait_for_timeout(300)
 assert main.evaluate('(m)=>m.scrollTop')>0
 assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
 q.screenshot(path='/tmp/overwatch-headquarters-mobile.png',full_page=True)
 assert not errors,errors;b.close();print('PASS HQ preparation first, no nested card scroll, collapsed hiring, real hire/assignment with open-state retained, five field slots preserved, mobile one-column main scroll')
