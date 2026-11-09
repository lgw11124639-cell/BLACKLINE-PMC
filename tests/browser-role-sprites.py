from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8010',wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate("['role-directions','pmc-directions','pmc-casualties'].forEach(n=>FieldArt.image('images/operators/'+n+'.webp'))")
 page.wait_for_function("['role-directions','pmc-directions','pmc-casualties'].every(n=>FieldArt.image('images/operators/'+n+'.webp').naturalWidth)")
 page.evaluate('''()=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');let draws=[];ctx.drawImage=(im,...a)=>draws.push({src:im.src,sx:a[0],sy:a[1]});
 for(const role of ['저격수','정밀사수','지정사수','의무','메딕','소총수'])for(let d=0;d<8;d++)for(const treated of [false,true]){draws=[];const h={w:treated?[['leftArm',1,1,'총상']]:[],f:true,d:false};FieldArt.unit(ctx,{faction:'blackline',role,name:role},[0,0,100,60,'guarding',d*Math.PI/4,0,h],50,50,35,0);const specialist=role!=='소총수';if(draws.length!==1||!draws[0].src.includes(specialist?'role-directions':'pmc-directions'))throw Error('wrong role sprite '+role);if(specialist){const im=FieldArt.image('images/operators/role-directions.webp'),row=Math.floor(d/4)+(/의무|메딕/.test(role)?2:0);if(Math.abs(draws[0].sy-row*im.naturalHeight/4)>.01)throw Error('wrong atlas row '+role)}}
 }''')
 assert not errors,errors
 print('PASS 6 roles x 8 headings x normal/treated select the correct atlas and preserve specialist appearance')
 b.close()
