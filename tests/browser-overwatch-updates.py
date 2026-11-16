"""Installed-app update discovery, resume, safe application and failure handling."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8060')
CURRENT=json.loads(Path('version.json').read_text())['version']
NEXT='2026.11.16.99'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for size in [(390,844),(844,390),(320,568),(1920,1080)]:
  c=b.new_context(viewport={'width':size[0],'height':size[1]},ignore_https_errors=True)
  c.add_init_script("Object.defineProperty(navigator,'standalone',{value:true});")
  q=c.new_page();errors=[];q.on('pageerror',lambda e:errors.append(str(e)))
  release={'version':CURRENT};requests=[]
  def manifest(route):
   requests.append(route.request.url);route.fulfill(json=release,headers={'Cache-Control':'no-store'})
  q.route('**/version.json?*',manifest)
  q.goto(BASE,wait_until='networkidle');q.locator('#version-check').click()
  q.get_by_text('최신 버전입니다.',exact=False).wait_for();assert q.locator('#version-check').is_visible()
  box=q.locator('#version-check').bounding_box();assert box['x']>=0 and box['x']+box['width']<=size[0]+1
  q.locator('[data-close-update]').click();release['version']='2026.11.16.05'
  q.locator('#version-check').click();q.get_by_text('최신 버전입니다.',exact=False).wait_for();assert not q.locator('[data-apply-update]').is_visible()
  release['version']=NEXT
  q.locator('#version-check').click();q.locator('[data-apply-update]').wait_for()
  before=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
  # Simulate the newly deployed bundle while letting the actual same-origin navigation occur.
  def bundle(route):
   response=route.fetch();route.fulfill(response=response,body=response.text().replace('const VERSION = "'+CURRENT+'"','const VERSION = "'+NEXT+'"'))
  q.route('**/overwatch/app.js?*',bundle)
  q.locator('[data-apply-update]').click();q.wait_for_url('**/*appVersion='+NEXT+'*');q.wait_for_load_state('networkidle')
  after=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
  assert before['campaignId']==after['campaignId'];assert before['members']==after['members'];assert before['headquarters']['funds']==after['headquarters']['funds']
  assert 'update=' in q.url;assert NEXT in q.locator('#version-check').get_attribute('title')
  assert not errors,errors
  print('PASS installed-app',size,': visible update control, no downgrade, cache-busting in-app navigation and preserved campaign')
  c.close()
 # Resume checks and offline status without rebuilding the game screen.
 c=b.new_context(viewport={'width':390,'height':844},ignore_https_errors=True);q=c.new_page();release={'version':CURRENT};offline=[False]
 def version_route(route):
  if offline[0]:route.abort('internetdisconnected')
  else:route.fulfill(json=release)
 q.route('**/version.json?*',version_route);q.goto(BASE,wait_until='networkidle')
 release['version']=NEXT
 q.evaluate("""()=>{const base=Date.now();Date.now=()=>base+61000;window.dispatchEvent(new Event('pageshow'));}""")
 q.locator('[data-apply-update]').wait_for();q.locator('[data-close-update]').click()
 offline[0]=True;q.locator('#version-check').click();q.get_by_text('업데이트를 확인하지 못했습니다.',exact=False).wait_for()
 # A rejected save blocks navigation while retaining a retry button.
 q.evaluate("""()=>{window.__updateTest=OverwatchUpdates.create({version:'2026.11.16.14',beforeUpdate(){throw Error('저장 공간 부족');},navigate(){window.__unexpectedNavigation=true}})}""")
 offline[0]=False;q.evaluate('window.__updateTest.check(true)');q.locator('[data-apply-update]').last.click()
 q.get_by_text('업데이트를 적용하지 않았습니다. 저장 공간 부족',exact=False).wait_for()
 assert not q.evaluate('!!window.__unexpectedNavigation')
 print('PASS resume discovery, offline recovery and failed-save navigation block')
 c.close()
 # The real app's update hook must flush a running operation and refuse a quota-failed flush.
 c=b.new_context(viewport={'width':844,'height':390},ignore_https_errors=True);q=c.new_page()
 q.route('**/version.json?*',lambda route:route.fulfill(json={'version':NEXT}))
 q.goto(BASE,wait_until='networkidle')
 q.evaluate("""()=>{const st=OverwatchStorage.create({storage:localStorage}),s=st.load().state,P=OverwatchPersonnel;for(const role of ['observer','sniper'])P.hire(s,s.market.candidates.find(x=>x.specialty===role).id,30);P.assign(s,'ALPHA',s.members.find(x=>x.specialty==='observer').id,s.members.find(x=>x.specialty==='sniper').id);const officer=OverwatchStaff.hire(s,s.commandStaff.market.find(x=>x.duty==='controller').id);OverwatchStaff.assign(s,'controller',officer.id);const contract=s.contracts.find(x=>x.key==='ridge-watch');OverwatchMissions.accept(s,contract.id);OverwatchMissions.launch(s,contract.id);s.ui.tab='field';st.save(s,s.revision);}""")
 q.reload(wait_until='networkidle');q.locator('[data-apply-update]').wait_for();q.wait_for_timeout(300)
 old=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
 q.evaluate("""()=>{window.__normalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}}""")
 original_url=q.url;q.locator('[data-apply-update]').click()
 q.get_by_text('진행을 저장하지 못했습니다.',exact=False).wait_for();assert q.url==original_url
 q.evaluate('()=>{Storage.prototype.setItem=window.__normalSetItem;}')
 q.route('**/overwatch/app.js?*',bundle)
 q.locator('[data-apply-update]').click();q.wait_for_url('**/*appVersion='+NEXT+'*');q.wait_for_load_state('networkidle')
 saved=q.evaluate('OverwatchStorage.create({storage:localStorage}).load().state')
 assert saved['campaignId']==old['campaignId'];assert saved['activeMission']['id']==old['activeMission']['id'];assert saved['commandExercise']['time']>old['commandExercise']['time']
 assert '전장 저장·진행을 중단했습니다' not in q.locator('#main').inner_text()
 print('PASS actual running-operation save failure blocks update; retry flushes elapsed operation and resumes same mission')
 c.close();b.close()
