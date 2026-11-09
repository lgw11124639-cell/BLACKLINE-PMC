"""Regression: accelerated days must not replace maps, reset scroll or interrupt dossier reading."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(1440,1000),(390,844)]:
  context=b.new_context(viewport={'width':width,'height':height});page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('''()=>{state.simClock.paused=true;state.operations=[];state.team=Array.from({length:10},(_,i)=>({id:101+i,name:'대원'+i,country:'대한민국',unit:'가상 부대',rank:'중사',role:['팀장','의무','정찰','소총수','지원','저격'][i%6],skill:85,salary:60000000}));state.reports=Array.from({length:35},(_,i)=>({date:state.date,category:i%2?'작전':'재무',title:'검증 보고 '+i,body:'보고서 내용입니다. '.repeat(80)}));const m={id:1,title:'지도 연속 관찰 검증',type:'시설 보안',risk:1,mapId:'urban',pinMap:true};const op={id:'STABLE-LIVE',leaderName:'대원0',budget:20000000,contract:m,status:'현장 진행 중',teamIds:state.team.slice(0,8).map(p=>p.id),fieldProgress:{seed:25,supportOrders:[]}};state.operations=[op];op.fieldProgress.tactical=fieldSimulation.create(op,m,state.team.slice(0,8),400,{forceContact:false,medicalBudget:2,factions:[{id:'n',name:'중립',relation:80}]});openFieldObservation(op.id)}''')
  page.wait_for_selector('#field-canvas');page.evaluate('''()=>{const s=state.operations[0].fieldProgress.tactical;for(let i=0;i<80;i++)s.radio.push({t:0,who:'검증 채널',msg:'읽던 무전 '+i,kind:'radio'})}''');page.wait_for_timeout(300)
  page.locator('[data-camera-toggle]').click()
  if width<=700:page.get_by_role('button',name='대원',exact=True).click()
  page.locator('[data-unit]').first.click()
  if width<=700:page.get_by_role('button',name='지도',exact=True).click()
  page.evaluate('''()=>{window.stableCanvas=document.getElementById('field-canvas');window.stablePointer=stableCanvas.onpointerdown;window.stableRadio=document.getElementById('field-radio');stableRadio.scrollTop=120;window.radioY=stableRadio.scrollTop;window.stableMessage=stableRadio.firstElementChild;window.stableCamera={...fieldCameraState};window.scrollTo(0,Math.min(400,document.documentElement.scrollHeight-innerHeight));window.stableY=scrollY;state.simClock.minutes=1439.9;state.simClock.speed=48;state.simClock.paused=false;window.stableDay=state.day;window.stableRenders=setInterval(()=>render(),120)}''')
  page.wait_for_function('state.day>window.stableDay',timeout=5000);page.wait_for_timeout(2200)
  page.evaluate('''()=>{clearInterval(window.stableRenders);state.simClock.paused=true;if(document.getElementById('field-canvas')!==window.stableCanvas)throw Error('canvas replaced');if(stableCanvas.onpointerdown!==window.stablePointer)throw Error('pointer handler restarted');if(Math.abs(scrollY-stableY)>2)throw Error('scroll reset '+scrollY+' / '+stableY);if(fieldCameraState.follow)throw Error('camera follow reset');if(stableRadio.firstElementChild!==stableMessage)throw Error('radio replaced');if(Math.abs(stableRadio.scrollTop-radioY)>2)throw Error('radio scrolled away from reading position');if(!document.querySelector('[data-unit].selected'))throw Error('selected unit lost');}''')
  assert page.locator('.workspace-breadcrumb').count()==1
  assert page.locator('.company-timebar').count()==1
  page.evaluate("go('home')")
  assert page.locator('.mail-item').count()==6
  assert page.locator('.mail-inbox').bounding_box()['height']<650
  page.screenshot(path='/tmp/blackline-v39-inbox-'+str(width)+'.png',full_page=True)
  before=int(page.locator('.mail-item').first.get_attribute('data-report-index'));page.get_by_role('button',name='다음 보고서 페이지',exact=True).click()
  assert page.locator('.mail-item').count()==6
  assert int(page.locator('.mail-item').first.get_attribute('data-report-index'))>before
  page.locator('.mail-item').first.click()
  title=page.locator('.report-letter h1').inner_text()
  page.evaluate('''()=>{window.stableReport=document.querySelector('.report-dossier');window.stableReportScroll=document.querySelector('.report-scroll');stableReportScroll.scrollTop=200;window.reportY=stableReportScroll.scrollTop;state.reports.unshift({date:state.date,category:'작전',title:'새 보고',body:'새로운 보고서'});for(let i=0;i<12;i++)render();if(document.querySelector('.report-dossier')!==stableReport)throw Error('dossier remounted');if(stableReportScroll.scrollTop!==reportY)throw Error('report scroll reset')}''')
  assert page.locator('.report-letter h1').inner_text()==title
  page.locator('.report-back').click();page.evaluate("go('people');openProfile(101,true)")
  page.evaluate('''()=>{window.stableProfile=document.querySelector('.profile-sheet');const body=document.querySelector('.profile-body');body.scrollTop=150;window.profileY=body.scrollTop;for(let i=0;i<12;i++)render();if(document.querySelector('.profile-sheet')!==stableProfile)throw Error('profile remounted');if(body.scrollTop!==profileY)throw Error('profile scroll reset')}''')
  assert not errors,errors
  print('PASS',width,'px: midnight + 48x dates, repeated renders preserve canvas/scroll/camera/selection, compact paginated inbox, pinned report and profile')
  context.close()
 b.close()
