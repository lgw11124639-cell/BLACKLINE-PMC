"""A saved legacy rooftop sniper + two living incapacitated patients must return and settle once."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{state.simClock.paused=true;state.operations=[];const members=['저격수','팀장','정찰'].map((role,i)=>({id:101+i,name:'복구대원'+i,country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000}));state.team=members;const m={id:1,title:'기존 저장 복귀 복구',type:'시설 보안',risk:1,mapId:'urban',pinMap:true};const op={id:'LEGACY-STUCK-RETURN',leaderName:members[1].name,leaderId:102,budget:20000000,contract:m,status:'현장 진행 중',teamIds:members.map(p=>p.id),fieldProgress:{seed:25,stage:4,staffingAudited:true,events:[],supportOrders:[],reservedTacticalAmmo:300,reservedTacticalMed:1,teamSnapshot:members.map(p=>p.id),startedDay:state.day,startedDate:state.date}};state.operations=[op];const s=fieldSimulation.create(op,m,members,300,{forceContact:false,medicalBudget:1,factions:[{id:'n',name:'중립',relation:80}]});op.fieldProgress.tactical=s;s.version=3;delete s.scenario;s.units=s.units.filter(u=>u.faction==='blackline');s.journey.stage='site';s.phase='수색';for(const [i,u]of s.units.entries()){u.inside=false;u.x=52+i*3;u.y=34;u.hp=i?0:100;u.status=i?'wounded':'overwatch';u.stabilized=!!i}const sniper=s.units[0];sniper.onRoof=true;sniper.elevation=12;sniper.assignment={kind:'후방 저격 엄호',position:[52,34],entry:[50,40],roof:true,height:12};s.units[1].carriedBy=sniper.id;fieldSimulation.journeyTools.beginExtraction(s);fieldSimulation.captureFrame(s);save()}''')
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{const op=state.operations.find(o=>o.id==='LEGACY-STUCK-RETURN'),s=op.fieldProgress.tactical;for(let i=0;i<1800&&!s.done;i++)fieldSimulation.step(s,op);if(s.journey.stage!=='complete')throw Error('return still blocked: '+s.journey.stage);if(s.journey.manifest.length!==3)throw Error('casualty missing');state.simClock.paused=false}''')
 page.wait_for_function("state.history.some(h=>h.planId==='LEGACY-STUCK-RETURN')",timeout=6000)
 page.evaluate('state.simClock.paused=true;save()')
 assert page.evaluate("state.history.filter(h=>h.planId==='LEGACY-STUCK-RETURN').length")==1
 page.reload(wait_until='networkidle');page.locator('#blackline-continue').click()
 assert page.evaluate("state.history.filter(h=>h.planId==='LEGACY-STUCK-RETURN').length")==1
 assert not errors,errors
 print('PASS legacy saved rooftop carrier + two zero-health casualties: return, finalize, reload without duplicate settlement')
 b.close()
