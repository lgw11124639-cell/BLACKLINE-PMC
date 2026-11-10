"""National rank/weapon images, military dossier and integrated utility helicopter sprite."""
import os
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1280,'height':850});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8047'),wait_until='networkidle');page.locator('#blackline-continue').click();page.evaluate('state.simClock.paused=true')
 page.evaluate("go('home')");assert page.locator('.headquarters-roster .rank-badge').count()==5
 page.locator('.headquarters-roster button').first.click();assert '사령관' in page.locator('.military-rank-heading').inner_text();page.evaluate('closeProfile()')
 page.evaluate('openProfile(state.team[0].id,true)');assert page.locator('.military-rank-heading .rank-badge').count()==1
 assert page.locator('.military-service').count()==1
 page.evaluate("changeProfilePage('gear')");assert page.locator('.issued-weapon .military-equipment-image').count()==1
 page.screenshot(path='/tmp/national-gear-desktop.png')
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path='/tmp/national-gear-mobile.png')
 page.evaluate("closeProfile();go('logistics');FieldArt.image('images/military/equipment-atlas.png')")
 page.wait_for_function("FieldArt.image('images/military/equipment-atlas.png').naturalWidth>0")
 assert page.locator('.command-asset').count()==4
 page.evaluate("""()=>{const c=document.createElement('canvas').getContext('2d'),positions=[];c.drawImage=(im,...a)=>{if(!im.src.includes('equipment-atlas'))throw Error('wrong helicopter');const t=c.getTransform();positions.push([t.e,t.f]);};for(const altitude of [0,35])FieldArt.helicopter(c,150,160,Math.PI/3,80,3,altitude);if(positions.length!==2||Math.abs(positions[0][0]-positions[1][0])>.01||Math.abs(positions[0][1]-positions[1][1]-4.2)>.01)throw Error('rotor/body atlas displacement');}""")
 assert not errors,errors
 print('PASS command ranks, current assignment, Korean weapon images, mobile dossier, four asset cards, single-piece utility helicopter alignment')
 b.close()
