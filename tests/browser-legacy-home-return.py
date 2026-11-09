"""Saved legacy convoy already at home at 13:48 must finish before the old 15-minute gate."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{state.simClock.paused=true;const members=['팀장','의무','정찰','저격수'].map((role,i)=>({id:101+i,name:'복귀검증'+i,country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000}));state.team=members;const m={id:1,title:'반군 보급 거점 차단',type:'무장세력 대응',risk:1,mapId:'regional',pinMap:true};const op={id:'LEGACY-HOME-1348',leaderId:101,leaderName:members[0].name,budget:20000000,contract:m,status:'현장 진행 중',teamIds:members.map(p=>p.id),fieldProgress:{seed:25,stage:4,supportOrders:[],events:[],staffingAudited:true,reservedTacticalAmmo:200,reservedTacticalMed:1,teamSnapshot:members.map(p=>p.id)}};const s=fieldSimulation.create(op,m,members,200,{forceContact:false,medicalBudget:1,factions:[{id:'n',name:'중립',relation:80}]});op.fieldProgress.tactical=s;delete s.journey;delete s.scenario;delete s.physiologyVersion;s.version=2;s.time=828;s.phase='복귀';s.objective=100;s.units=s.units.filter(u=>u.faction==='blackline');for(const [i,u]of s.units.entries()){delete u.health;u.inside=false;u.onRoof=false;u.x=s.terrain.base[0]+i*.5;u.y=s.terrain.base[1];u.hp=i===1?54:100;u.status='transporting'}s.frames=[];delete s.liveFrame;delete s.previousLiveFrame;fieldSimulation.captureFrame(s);state.operations=[op];save()}''')
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate("openFieldObservation('LEGACY-HOME-1348');state.simClock.paused=false")
 page.wait_for_function("state.history.some(h=>h.planId==='LEGACY-HOME-1348')",timeout=6000)
 page.evaluate('state.simClock.paused=true;save()')
 assert page.evaluate("state.history.find(h=>h.planId==='LEGACY-HOME-1348').tactical.time")<900
 assert page.evaluate("state.history.filter(h=>h.planId==='LEGACY-HOME-1348').length")==1
 assert not errors,errors
 print('PASS saved 13:48 legacy convoy: actual home arrival completes and settles immediately, without 15-minute wait')
 b.close()
