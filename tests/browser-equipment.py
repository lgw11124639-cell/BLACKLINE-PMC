from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(1440,1000),(844,390)]:
  page=b.new_page(viewport={'width':width,'height':height},is_mobile=width<1000,has_touch=width<1000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('http://127.0.0.1:8030',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('window.testInterior='+('true' if width<1000 else 'false'))
  data=page.evaluate('''()=>{state.simClock.paused=true;state.team=['팀장','의무','정찰','저격수','지원','전투','전투','전투'].map((role,i)=>({id:101+i,name:'장비대원'+i,country:'대한민국',unit:'가상 부대',rank:'중사',role,skill:85,salary:60000000,birthDate:'1995-01-01',loadout:{primary:'미지급'}}));blacklineReviewArmory();const cash=state.cash,ids=JSON.stringify(state.team.map(p=>p.equipmentSlots));blacklineReviewArmory();if(state.cash!==cash||ids!==JSON.stringify(state.team.map(p=>p.equipmentSlots)))throw Error('duplicate procurement');const op={id:'GEAR-LIVE',status:'현장 진행 중',leaderName:state.team[0].name,budget:2e7,teamIds:state.team.map(p=>p.id),contract:{id:1,title:'개인 장비 실전 검증',type:'시설 보안',risk:1,mapId:'urban',pinMap:true,objectiveMode:window.testInterior?'interior':'guard',interiorId:'office'},fieldProgress:{seed:25,supportOrders:[]}};state.operations=[op];const ammo=fieldSimulation.ammoPlan(state.team).total;state.ammo-=ammo;op.fieldProgress.reservedTacticalAmmo=ammo;const s=op.fieldProgress.tactical=fieldSimulation.create(op,op.contract,state.team,ammo,{forceContact:false,medicalBudget:10}),u=s.units.find(u=>u.personId===101);if(!u.loadout.attachments.includes('SureFire SOCOM556-RC2'))throw Error('actual suppressor not transferred');if(u.secondaryWeaponState.loaded!==15)throw Error('pistol magazines missing');u.fieldEquipment.slots.primary.condition=0;s.time=50;fieldSimulation.consumeRounds(s,u);s.time=53;if(fieldSimulation.consumeRounds(s,u)!==1||u.activeWeapon!=='secondary')throw Error('pistol transition failed');fieldSimulation.captureFrame(s);save();go('logistics');return {ammo:u.ammo,secondary:u.secondaryWeaponState.loaded};}''')
  assert '부착물·보호구·부무장 창고' in page.locator('#app').inner_text()
  page.evaluate("openProfile(101,true);changeProfilePage('gear')")
  assert '개별 장비 · 내구도' in page.locator('.profile-body').inner_text();assert 'SureFire SOCOM556-RC2' in page.locator('.profile-body').inner_text();assert '배터리' in page.locator('.profile-body').inner_text();assert page.locator('.profile-body .line').filter(has_text='HK416').last.locator('strong').inner_text()=='0%'
  if height<500:assert page.locator('.profile-body').bounding_box()['height']>height*.45
  page.screenshot(path='/tmp/blackline-v50-profile-'+str(width)+'.png');page.evaluate('closeProfile()')
  page.evaluate("openFieldObservation('GEAR-LIVE')");page.wait_for_timeout(1300)
  if width<1000:page.get_by_role('button',name='대원',exact=True).click()
  assert 'Glock 19 Gen5' in page.locator('[data-unit="bl-101"]').inner_text()
  page.reload(wait_until='networkidle');page.locator('#blackline-continue').click()
  assert page.evaluate("state.operations[0].fieldProgress.tactical.units.find(u=>u.personId===101).ammo")==data['ammo']
  assert page.evaluate("state.operations[0].fieldProgress.tactical.units.find(u=>u.personId===101).secondaryWeaponState.loaded")==data['secondary']
  page.evaluate('''()=>{const op=state.operations[0],s=op.fieldProgress.tactical;s.units=s.units.filter(u=>u.faction==='blackline');for(let i=0;i<5000&&!s.done;i++)fieldSimulation.step(s,op);if(!s.done||s.journey.stage!=='complete')throw Error('equipped operation failed physical return '+JSON.stringify({time:s.time,phase:s.phase,stage:s.journey.stage,gate:s.journey.insertionRecon,units:s.units.map(u=>({id:u.id,x:u.x,y:u.y,roof:u.onRoof,status:u.status,role:u.tacticalRole,assignment:u.assignment.position,reported:u.positionReported}))}));const ledger=fieldSimulation.ammoAccounting(s,op);if(ledger.issued!==ledger.fired+ledger.returned+ledger.lost)throw Error('ammunition conservation');fieldSimulation.settleFieldEquipment(s,op);if(!s.equipmentSettled)throw Error('gear not settled');}''')
  assert not errors,errors
  print('PASS',width,height,'actual procurement/profile/warehouse, compatible suppressor transfer, real pistol fire and exact ammunition after reload')
  page.close()
 b.close()
