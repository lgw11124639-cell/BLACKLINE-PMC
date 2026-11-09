"""An isolated casualty fixture exercises actual reservation/final settlement."""
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page();page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('''()=>{companyClock.toggle();state.team=['팀장','저격수','정찰','의무','지원'].map((role,i)=>({id:101+i,name:role,role,skill:85,salary:10000000}));state.missions=[{...state.missionTemplates[0],id:1,type:'시설 보안',mapId:'factory',contractStatus:'검토 가능'}];blacklineReviewCompany();const op=state.operations[0];op.status='사전 연습 완료';op.deployAt=state.day*1440+state.simClock.minutes-1;blacklineRunScheduled();const s=op.fieldProgress.tactical;s.phase='과업';s.time=500;const patient=s.units[0],medic=s.units.find(u=>u.tacticalRole==='medic');patient.x=63;patient.y=44;patient.hp=30;patient.worstHP=30;patient.woundedAt=499;patient.waitUntil=9999;medic.x=62;medic.y=44;for(let i=0;i<30;i++)fieldSimulation.step(s,op);if(s.medUsed!==1)throw Error('first aid did not execute');s.phase='복귀';s.time=899;s.objective=100;s.done=false;for(const u of s.units.filter(u=>u.faction==='blackline')){u.x=s.terrain.base[0];u.y=s.terrain.base[1];u.onRoof=false;u.waitUntil=0}op.fieldProgress.stage=4;companyClock.toggle()}''')
 page.wait_for_function('state.history.some(h=>h.tactical)',timeout=4000);page.evaluate('companyClock.toggle()')
 assert page.evaluate('state.history[0].medUsed')==1
 assert page.evaluate('state.med')==13
 assert page.evaluate('state.team.find(p=>p.id===101).injured')
 assert page.evaluate('state.history[0].resolution.casualties[0].stabilized')
 assert page.evaluate('state.history[0].resolution.personnelCombat.find(p=>p.role==="의무").actions.some(a=>a.result.includes("응급처치"))')
 print('PASS actual medical aid consumes one reserved kit, refunds the rest, and records injury/care')
 b.close()
