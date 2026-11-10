from playwright.sync_api import sync_playwright
import os
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('BLACKLINE_TEST_URL','http://127.0.0.1:8010'),wait_until='networkidle');page.locator('#blackline-continue').click()
 page.evaluate('window.blacklineROKArt=false')
 page.evaluate("['role-directions','pmc-directions','pmc-casualties'].forEach(n=>FieldArt.image('images/operators/'+n+'.webp'))")
 page.wait_for_function("['role-directions','pmc-directions','pmc-casualties'].every(n=>FieldArt.image('images/operators/'+n+'.webp').naturalWidth)")
 page.evaluate('''()=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');let draws=[];ctx.drawImage=(im,...a)=>draws.push({src:im.src,sx:a[0],sy:a[1]});
 for(const role of ['저격수','정밀사수','지정사수','의무','메딕','소총수'])for(let d=0;d<8;d++)for(const treated of [false,true]){draws=[];const h={w:treated?[['leftArm',1,1,'총상']]:[],f:true,d:false};FieldArt.unit(ctx,{faction:'blackline',role,name:role},[0,0,100,60,'guarding',d*Math.PI/4,0,h],50,50,35,0);const specialist=role!=='소총수';if(draws.length!==1||!draws[0].src.includes(specialist?'role-directions':'pmc-directions'))throw Error('wrong role sprite '+role);if(specialist){const im=FieldArt.image('images/operators/role-directions.webp'),row=Math.floor(d/4)+(/의무|메딕/.test(role)?2:0);if(Math.abs(draws[0].sy-row*im.naturalHeight/4)>.01)throw Error('wrong atlas row '+role)}}
 }''')
 page.evaluate("""()=>{const c=document.createElement('canvas').getContext('2d');let draws=[];c.drawImage=(im,...a)=>draws.push({src:im.src,sx:a[0],sy:a[1]});const u={faction:'blackline',role:'의무',name:'검증'};function render(status,h,extra={}){draws=[];FieldArt.unit(c,{...u,...extra},[0,0,100,30,status,0,0,{w:[],f:true,d:false,...h}],50,50,30,0,false,false);return draws;}let d=render('treating',{care:'self'});if(d.length!==1||!d[0].src.includes('pmc-casualties')||d[0].sx!==0)throw Error('self aid spawned companion');d=render('treating',{care:'buddy',patient:'real-patient'});if(d.length!==1||!d[0].src.includes('role-directions'))throw Error('medic replaced with composite');d=render('carrying',{});if(d.length!==1)throw Error('phantom patient');d=render('carrying',{carry:'real-patient'});if(d.length!==2||!d[1].src.includes('pmc-casualties'))throw Error('actual carried patient missing');}""")
 page.evaluate("window.blacklineROKArt=true;FieldArt.image('images/operators/rok-special-operations.png')")
 page.wait_for_function("FieldArt.image('images/operators/rok-special-operations.png').naturalWidth>0")
 page.evaluate("""()=>{const c=document.createElement('canvas').getContext('2d'),im=FieldArt.image('images/operators/rok-special-operations.png');let draws=[];c.drawImage=(image,...v)=>draws.push({src:image.src,x:v[0],y:v[1]});for(const [role,offset]of [['소총수',0],['저격수',8],['의무부사관',16]])for(let d=0;d<8;d++){draws=[];FieldArt.unit(c,{faction:'blackline',role,name:role},[0,0,100,30,'guarding',d*Math.PI/4,0,{w:[],f:true,d:false}],50,50,30,0,false,false);if(draws.length!==1||!draws[0].src.includes('rok-special-operations'))throw Error('ROK atlas missing');const cell=d+offset;if(Math.abs(draws[0].x-cell%4*im.naturalWidth/4)>.01||Math.abs(draws[0].y-Math.floor(cell/4)*im.naturalHeight/8)>.01)throw Error('ROK atlas cell mismatch');}}""")
 assert not errors,errors
 print('PASS 6 roles x 8 headings x normal/treated select the correct atlas and preserve specialist appearance')
 b.close()
