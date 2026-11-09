from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{state.simClock.paused=true;state.operations=[];state.team=Array.from({length:12},(_,i)=>({id:100+i,name:'대원'+i,role:['팀장','의무','정찰','저격','소총수','지원'][i%6],skill:85,salary:60000000}));state.ammo=1000;state.med=10;state.missions=[{...state.missionTemplates[0],risk:1,type:'시설 보안',contractStatus:'검토 가능'}];blacklineReviewCompany();if(state.operations[0]?.status!=='사전 정찰')throw Error('recon not created');openFieldObservation()}''')
 assert '사전 정찰' in page.locator('body').inner_text()
 assert page.evaluate('state.operations[0].teamIds.length')==0
 page.evaluate('''()=>{const op=state.operations[0],s=op.preRecon.operation.fieldProgress.tactical;s.done=true;blacklineReconTick();if(op.status!=='작전 승인')throw Error(op.status);op.status='사전 연습 완료';op.deployAt=state.day*1440+state.simClock.minutes-1;blacklineRunScheduled();if(!op.fieldProgress?.tactical)throw Error('deployment failed');if(!op.fieldProgress.tactical.units.some(u=>u.taskGroup))throw Error('no task groups');save();render()}''')
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click()
 assert page.evaluate('state.operations[0].preRecon.settled')
 assert page.evaluate('state.operations[0].taskGroups.length')>=2
 assert not errors,errors
 print('PASS browser: scout live view, post-recon assembly, real deployment, save reload; zero page errors')
 b.close()
