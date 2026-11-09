from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for w,h in [(1440,1000),(390,844),(844,390)]:
  page=b.new_page(viewport={'width':w,'height':h},is_mobile=w<1000,has_touch=w<1000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8041',wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate('state.simClock.paused=true')
  for tab in ['home','people','logistics','missions']:
   page.evaluate('go("'+tab+'")');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),tab
  page.evaluate("go('people')");assert page.locator('[data-personnel]').count()>=2
  name=page.evaluate('state.team[0].name');page.locator('#personnel-search').fill(name);assert page.locator('[data-personnel]:visible').count()>=1
  page.locator('#personnel-search').fill('존재하지않음');assert page.locator('#personnel-empty').is_visible();page.locator('#personnel-search').fill('')
  page.screenshot(path='/tmp/blackline-v54-people-'+str(w)+'.png')
  page.evaluate('openProfile(state.team[0].id,true)');assert page.locator('.operator-dossier').count()==1
  box=page.locator('.operator-dossier').bounding_box();assert abs(box['width']-w)<2 and abs(box['height']-h)<2,box
  for tab in ['overview','gear','operations','medical']:
   page.evaluate('changeProfilePage("'+tab+'")');assert page.locator('.operator-summary').count()==1
   assert page.evaluate("document.querySelector('.profile-body').scrollWidth<=document.querySelector('.profile-body').clientWidth+1"),tab
  page.evaluate("changeProfilePage('overview')");page.screenshot(path='/tmp/blackline-v54-profile-'+str(w)+'.png');page.evaluate('closeProfile();openProfile(state.transportCrew[0].id,true)');assert page.locator('.profile-head').inner_text().find('운전병')>=0
  page.evaluate('closeProfile();save()');before=page.evaluate('state.team.map(p=>p.birthDate).join()');page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();assert page.evaluate('state.team.map(p=>p.birthDate).join()')==before
  assert not errors,errors
  print('PASS',w,h,'all tabs fit, personnel search, full-screen dossier, all record tabs, crew profile, birthdate stable reload')
  page.close()
 b.close()
