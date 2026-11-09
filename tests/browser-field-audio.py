from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for width,height in [(1440,1000),(390,844)]:
  page=b.new_page(viewport={'width':width,'height':height},is_mobile=width<1000,has_touch=width<1000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.add_init_script('''(()=>{const Native=window.AudioContext;window.audioStarts=0;window.audioContexts=0;window.AudioContext=class extends Native{constructor(){super();window.audioContexts++;}createBufferSource(){const n=super.createBufferSource(),start=n.start.bind(n);n.start=(...args)=>{window.audioStarts++;return start(...args)};return n}}})();''')
  page.goto('http://127.0.0.1:8041',wait_until='networkidle');page.locator('#blackline-continue').click()
  page.evaluate('''()=>{state.simClock.paused=true;go('observation');const b=document.createElement('button');b.id='audio-test';b.onclick=()=>fieldAudioToggle();document.body.append(b);}''')
  assert page.evaluate('audioContexts')==0
  page.click('#audio-test',force=True);page.wait_for_function('FieldAudio.status.ready&&FieldAudio.status.enabled&&FieldAudio.status.samples===10')
  page.evaluate('''()=>{FieldAudio.stop();window.aud={units:[{id:'a'}],events:[],radio:[]};window.af={journey:{stage:'site',transport:{kind:'ground'}}};FieldAudio.sync('audio-test',aud,10,af,'site');window.initialStarts=audioStarts;aud.events.push({kind:'shot',actor:'a',t:11,from:[50,30],scene:'site',rounds:2});FieldAudio.sync('audio-test',aud,11,af,'site');if(audioStarts-initialStarts!==2)throw Error('shot burst not heard');FieldAudio.sync('audio-test',aud,11,af,'site');if(audioStarts-initialStarts!==2)throw Error('duplicate sound');aud.events.push({kind:'artillery',t:11,impactAt:14,x:50,y:30,scene:'site'});FieldAudio.sync('audio-test',aud,12,af,'site');if(audioStarts-initialStarts!==2)throw Error('early impact');FieldAudio.sync('audio-test',aud,14,af,'site');if(audioStarts-initialStarts!==5)throw Error('impact missing');aud.events.push({kind:'shot',actor:'a',t:15,from:[1,1],scene:'interior'});FieldAudio.sync('audio-test',aud,15,af,'site');if(audioStarts-initialStarts!==5)throw Error('wrong scene leaked');FieldAudio.sync('audio-test',aud,3,af,'site');if(audioStarts-initialStarts!==5||FieldAudio.status.voices)throw Error('seek backlog');FieldAudio.sync('audio-test',aud,4,{journey:{stage:'outbound',transport:{kind:'helicopter'}}},'regional');if(FieldAudio.status.ambient!=='helicopter')throw Error('rotor missing');FieldAudio.stop();if(FieldAudio.status.voices||FieldAudio.status.ambient)throw Error('stop leaked audio');fieldAudioVolume(20);if(FieldAudio.status.volume!==.2)throw Error('volume failed');}''')
  page.click('#audio-test',force=True);assert not page.evaluate('FieldAudio.status.enabled')
  assert not errors,errors
  print('PASS',width,height,'gesture unlock, actual audio nodes, bursts, no duplicate/backlog/scene leak, delayed impact, rotor, volume, mute cleanup')
  page.close()
 b.close()
