from playwright.sync_api import sync_playwright
import json
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 errors=[]
 for width,height in [(320,740),(390,844),(768,1024),(1440,1000)]:
  ctx=b.new_context(viewport={'width':width,'height':height},accept_downloads=True)
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8000',wait_until='networkidle')
  assert page.locator('#blackline-continue').evaluate('(el)=>el===document.activeElement')
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  if width==390:page.screenshot(path='/tmp/blackline-final-start-mobile.png',full_page=True)
  page.locator('#blackline-continue').click()
  assert page.locator('nav').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(255, 255, 255)'
  assert page.locator('.stats .stat').count()==4
  tools=page.locator('.header-tools').bounding_box();assert tools['x']+tools['width']<=width,(width,'header clipped')
  for label in ['인력','장비','작전','본부']:
   page.locator('#tabs button').filter(has_text=label).click()
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,label)
   assert page.locator('.workspace-breadcrumb').count()==1
   assert page.locator('.nav-caption').count()==1
   if label=='인력':
    page.locator('.person-click').first.click()
    assert page.locator('.profile-sheet').is_visible()
    for tab in page.locator('.profile-tabs button').all():
     tab.click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    if width==390:page.screenshot(path='/tmp/blackline-final-profile-mobile.png')
    page.locator('.profile-close').click()
  # Inbox filters/search retain their existing behavior.
  page.get_by_role('button',name='재무',exact=True).click();assert page.locator('.mail-item').count()==0
  page.get_by_role('button',name='전체',exact=True).click()
  page.locator('.mail-search input').fill('신규 계약');assert page.locator('.mail-item').count()>0
  page.locator('.mail-search input').fill('')
  page.locator('.mail-item').first.click();assert page.locator('.report-dossier').is_visible()
  assert page.locator('.report-letter').evaluate('(el)=>getComputedStyle(el).backgroundColor')=='rgb(255, 255, 255)'
  if width==390:page.screenshot(path='/tmp/blackline-final-report-mobile.png')
  if width==1440:page.screenshot(path='/tmp/blackline-final-report-desktop.png')
  page.locator('.report-back').click()
  day=page.evaluate('state.day');page.get_by_role('button',name='다음 날 진행',exact=True).click();assert page.evaluate('state.day')==day+1
  assert page.evaluate("JSON.parse(localStorage.getItem('blackline_pmc_v1')).day")==day+1
  page.locator('.save-management').click();assert page.locator('.start-panel').is_visible()
  with page.expect_download() as d:page.locator('#blackline-export').click()
  download=d.value;download.save_as('/tmp/blackline-ui-save-'+str(width)+'.json')
  data=json.load(open('/tmp/blackline-ui-save-'+str(width)+'.json'));assert data['state']['day']==day+1
  page.locator('#blackline-continue').click()
  page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();assert page.evaluate('state.day')==day+1
  if width==1440:page.screenshot(path='/tmp/blackline-final-desktop.png',full_page=True)
  if width==390:page.screenshot(path='/tmp/blackline-final-mobile.png',full_page=True)
  print('PASS UI',width,'navigation, profiles, filters, report reader, next day, export, persistence')
  ctx.close()
 assert not errors,errors
 print('PASS no uncaught JavaScript exceptions')
 b.close()
