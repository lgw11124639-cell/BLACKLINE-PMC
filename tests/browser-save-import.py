"""Import safety checks with disposable browser storage."""
import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 context=b.new_context();page=context.new_page();page.goto('http://127.0.0.1:8000',wait_until='networkidle')
 page.evaluate('state.simClock.paused=true;save()')
 snapshot='({state:JSON.stringify(state),primary:localStorage.getItem("blackline_pmc_v1"),backup:localStorage.getItem("blackline_pmc_v1_backup")})'
 before=page.evaluate(snapshot);data=json.loads(before['state']);data['importQuotaTest']=True
 page.evaluate('''()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='blackline_pmc_v1_backup'&&String(v).includes('importQuotaTest'))throw new DOMException('test quota','QuotaExceededError');return original.call(this,k,v)}}''')
 dialogs=[]
 def handle(d):
  dialogs.append(d.type)
  if d.type=='confirm':d.accept()
  else:d.dismiss()
 page.on('dialog',handle)
 page.locator('#blackline-import').set_input_files({'name':'quota.json','mimeType':'application/json','buffer':json.dumps({'state':data}).encode()});page.wait_for_timeout(200)
 assert before==page.evaluate(snapshot);assert page.evaluate('!window.blacklineImportingSave');assert 'alert' in dialogs
 print('PASS failed import restores primary, backup and memory')
 context.close()
 context=b.new_context();page=context.new_page();page.goto('http://127.0.0.1:8000',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.wait_for_function('state.operations.some(o=>o.fieldProgress?.tactical)',timeout=25000);page.evaluate('companyClock.toggle()');data=page.evaluate('JSON.parse(JSON.stringify(state))');data['cash']=123456789
 page.locator('.save-management').click();page.on('dialog',lambda d:d.accept())
 with page.expect_navigation(wait_until='networkidle'):
  page.locator('#blackline-import').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps({'state':data}).encode()})
 assert page.evaluate('state.cash')==123456789;assert page.evaluate('state.simClock.paused')
 print('PASS live-operation import is not overwritten by autosave')
 page.locator('#blackline-continue').click()
 page.evaluate('''()=>{state.history.unshift({id:123,planId:'legacy-check',date:state.date,title:'이전 작전',team:['이전 대원'],logs:[{t:0,who:'이전 팀장',msg:'이전 현장 무전'}],supportDecisions:[],budget:0,reward:0,success:true});openFieldObservation('legacy-check')}''')
 page.get_by_role('button',name='기존 3D 관찰 화면',exact=True).click();assert page.locator('#blackline-result-replay').is_visible();assert '이전 현장 무전' in page.locator('#live-radio').inner_text();page.get_by_role('button',name='관찰실로',exact=False).click()
 assert page.locator('#blackline-result-replay').is_hidden()
 print('PASS original legacy 3D/radio entrypoint remains accessible')
 context.close();b.close()
