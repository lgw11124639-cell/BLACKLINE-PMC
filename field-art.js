/* Shared lightweight 2D rendering of 3D sprite assets and actual combat events. */
(function(){
 const images=new Map(),image=path=>{if(!images.has(path)){const im=new Image();im.src=path;images.set(path,im)}return images.get(path)};
 const palette={blackline:'#376bda',insurgent:'#ce6246',pmc:'#b58932',civilian:'#7a8e86',unknown:'#9a947c'};
 function sprite(c,path,cell,columns,rows,x,y,w,h){const im=image(path);if(!im.complete||!im.naturalWidth)return false;const sw=im.naturalWidth/columns,sh=im.naturalHeight/rows;c.drawImage(im,cell%columns*sw,Math.floor(cell/columns)*sh,sw,sh,x-w/2,y-h*.77,w,h);return true}
 function pill(c,text,x,y,color){c.font='500 10px -apple-system,sans-serif';const w=c.measureText(text).width+16;c.shadowColor='#223a4b18';c.shadowBlur=6;c.fillStyle='#fffffff0';c.strokeStyle='#dbe4e9b8';c.lineWidth=.7;c.beginPath();c.roundRect(x-7,y-12,w,20,6);c.fill();c.stroke();c.shadowBlur=0;c.fillStyle=color;c.fillText(text,x+1,y+1)}
 function label(c,text,x,y,color='#4f6486'){smartLabel(c,text,x,y,color)}
 function marker(c,x,y,title,progress,color='#3f6ccc',symbol='◆'){
  c.save();c.translate(x,y);c.shadowColor='#20374d25';c.shadowBlur=5;c.fillStyle='#fffffff0';c.strokeStyle=color;c.lineWidth=1.2;c.beginPath();c.roundRect(-9,-9,18,18,5);c.fill();c.stroke();c.shadowBlur=0;c.fillStyle=color;c.font='600 10px -apple-system,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(progress>=100?'✓':symbol,0,0);c.restore();
  if(progress!=null&&progress<100){c.save();c.strokeStyle='#ffffffb8';c.lineWidth=2;c.beginPath();c.arc(x,y,13,-Math.PI/2,Math.PI*1.5);c.stroke();c.strokeStyle=color;c.beginPath();c.arc(x,y,13,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(0,progress)/100);c.stroke();c.restore()}
  if(progress==null||progress<100)smartLabel(c,title+(progress!=null?' · '+Math.round(progress)+'%':''),x+19,y,color,1);
 }
 function vehicle(c,x,y,heading,size=62,jet=false){c.save();c.translate(x,y);c.rotate(heading);const ok=sprite(c,'images/operators/vehicles.webp',jet?2:0,2,2,0,size*.12,size,size*2/3);if(!ok){c.fillStyle=jet?'#4d6477':'#4e7093';c.beginPath();c.moveTo(size*.4,0);c.lineTo(-size*.3,-size*.16);c.lineTo(-size*.3,size*.16);c.closePath();c.fill()}c.restore()}
 function unit(c,u,v,x,y,size,t,selected=false,labels=true){const color=palette[u.faction]||palette.blackline,heading=v[5]||0,down=v[7]?v[7].d||v[7].f===false:v[2]<=0||['dead','wounded','evacuated'].includes(v[4]),wounded=v[7]?v[7].w.length>0||down:v[2]<=55||down,treated=!!(v[7]?.w.length&&v[7].w.every(w=>w[2])&&!v[7].d),care=v[4]==='treating',carry=v[4]==='carrying';
  if(v[4]==='boarded'||v[7]?.by||v[7]?.aboard)return;
  c.save();c.translate(x,y);c.fillStyle='#24394a20';c.beginPath();c.ellipse(0,4,size*.28,size*.09,0,0,Math.PI*2);c.fill();
  if(selected){c.strokeStyle=color;c.lineWidth=1.5;const d=size*.43;for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]){c.beginPath();c.moveTo(sx*d,sy*d*.7-sy*5);c.lineTo(sx*d,sy*d*.7);c.lineTo(sx*d-sx*6,sy*d*.7);c.stroke()}}
  let rendered=false;
  const selfAid=care&&v[7]?.care==='self';if(u.faction==='blackline'&&(down||wounded&&!treated||selfAid)){const vertical=Math.abs(Math.sin(heading))>.7,cell=down?(vertical?3:2):(vertical?1:0);rendered=sprite(c,'images/operators/pmc-casualties.webp',cell,4,2,0,0,size*1.35,size*1.05)}
  if(!rendered&&['civilian','unknown'].includes(u.faction)){const direction=(Math.round(heading/(Math.PI/2))+4)%4;rendered=sprite(c,'images/operators/civilians.webp',direction,4,2,0,0,size,size*4/3)}
  if(!rendered){c.save();if(down&&!treated&&u.faction!=='blackline'){c.rotate(Math.PI*.45);c.globalAlpha=.6}const direction=(Math.round(heading/(Math.PI/4))+8)%8;const specialist=u.faction==='blackline'?(/저격|정밀사수|지정사수/.test(u.role)||u.tacticalRole==='sniper'?'sniper':/메딕|의무|의료|구급/.test(u.role)||u.tacticalRole==='medic'?'medic':null):null;
   /* The generated ROK atlas has misaligned cells (legs overlap heads). Use the verified directional atlas until its source tiles are rebuilt. */
   if(u.faction==='blackline')rendered=sprite(c,'images/operators/pmc-directions.webp',direction,4,2,0,0,size,size*4/3);
   if(!rendered&&specialist)rendered=sprite(c,'images/operators/role-directions.webp',direction+(specialist==='medic'?8:0),4,4,0,0,size,size*4/3);
   if(!rendered)rendered=sprite(c,u.faction==='insurgent'?'images/operators/hostile-directions.webp':'images/operators/pmc-directions.webp',direction,4,2,0,0,size,size*4/3);c.restore()}
  if(!rendered){c.fillStyle=color;c.fillRect(-3,-9,6,12)}
  if(carry&&(v[7]?.carry||u.renderPatientId))(sprite(c,'images/operators/pmc-casualties.webp',2,4,2,size*.5,size*.22,size*.85,size*.65));if(care&&(selfAid||v[7]?.patient)){c.strokeStyle='#4f9e88';c.lineWidth=1.5;c.globalAlpha=.55+.35*Math.sin(t*5);c.beginPath();c.arc(0,0,size*.44,-Math.PI/2,-Math.PI/2+Math.PI*1.6);c.stroke();c.globalAlpha=1;}
  c.fillStyle=color;c.strokeStyle='#ffffffd9';c.lineWidth=1;c.beginPath();c.arc(0,8,2.5,0,Math.PI*2);c.fill();c.stroke();
  if(labels||selected)smartLabel(c,u.name+(wounded?' · '+(v[4]==='dead'?'사망':treated?(down?'후송 대기':'처치 완료'):down?'후송 필요':'부상'):''),size*.32,-size*.35,wounded?'#b36d4b':color,selected?3:0);
  if(wounded){c.fillStyle='#c77555';c.font='bold 10px sans-serif';c.fillText('+',-3,20)}c.restore();
 }
 function aim(c,aims,toScreen,t){for(const a of aims||[]){const from=toScreen(...a.from),to=toScreen(...a.to),color=a.friendly?'42,205,174':'235,91,60';c.save();c.strokeStyle='rgba('+color+','+(.28+Math.sin(t*3)*.07)+')';c.lineWidth=4;c.beginPath();c.moveTo(...from);c.lineTo(...to);c.stroke();c.shadowColor='rgba('+color+',.8)';c.shadowBlur=5;c.strokeStyle='rgba('+color+',.95)';c.lineWidth=1.1;c.setLineDash([6,4]);c.lineDashOffset=-t*9;c.beginPath();c.moveTo(...from);c.lineTo(...to);c.stroke();c.setLineDash([]);c.shadowBlur=0;c.fillStyle='rgba('+color+',1)';const pulse=(t*.6)%1;c.beginPath();c.arc(from[0]+(to[0]-from[0])*pulse,from[1]+(to[1]-from[1])*pulse,1.8,0,Math.PI*2);c.fill();c.lineWidth=1.3;for(const [dx,dy]of [[-1,-1],[1,-1],[-1,1],[1,1]]){c.beginPath();c.moveTo(to[0]+dx*8,to[1]+dy*4);c.lineTo(to[0]+dx*8,to[1]+dy*8);c.lineTo(to[0]+dx*4,to[1]+dy*8);c.stroke()}c.restore()}}
 function effects(c,s,t,toScreen,scene,w,h,scale=1){
  for(const e of window.fieldSimulation.eventsAround?.(s,t,90)||s.events){if(e.visible===false||(e.scene||'site')!==scene)continue;const age=t-e.t;if(age<0||age>35)continue;
   if(e.kind==='shot'&&age<1.8){const from=toScreen(...e.from),to=toScreen(...e.to),alpha=Math.max(.15,1-age/1.8),phase=(age*Math.max(1,e.rounds)/1.8)%1,dx=to[0]-from[0],dy=to[1]-from[1],length=Math.max(1,Math.hypot(dx,dy)),angle=Math.atan2(dy,dx);c.save();c.globalAlpha=alpha;
    const beam=c.createLinearGradient(...from,...to);beam.addColorStop(0,'#f8bd5133');beam.addColorStop(.75,'#ffe5a07a');beam.addColorStop(1,'#fff6ce');c.strokeStyle=beam;c.lineWidth=1.5;c.beginPath();c.moveTo(from[0]+dx*Math.max(0,phase-.2),from[1]+dy*Math.max(0,phase-.2));c.lineTo(from[0]+dx*phase,from[1]+dy*phase);c.stroke();
    c.save();c.translate(from[0]+dx/length*7,from[1]+dy/length*7);c.rotate(angle);c.fillStyle='#fff5b2';c.shadowColor='#ffc852';c.shadowBlur=12;c.beginPath();c.moveTo(0,-2);c.lineTo(11+Math.sin(age*70)*3,0);c.lineTo(0,2);c.lineTo(3,6);c.lineTo(-3,0);c.lineTo(3,-6);c.closePath();c.fill();c.restore();
    if(age>.12){for(let n=0;n<6;n++){const a=n*2.4+e.t,q=age/1.8,r=3+q*12;c.globalAlpha=alpha*.6;c.fillStyle=e.hit?'#c9b18a':'#e9d6ae';c.beginPath();c.arc(to[0]+Math.cos(a)*r,to[1]+Math.sin(a)*r*.5-q*6,1+q*2,0,Math.PI*2);c.fill()}if(e.hit){c.strokeStyle='#fff3bf';c.lineWidth=1;c.beginPath();c.moveTo(to[0]-4,to[1]-4);c.lineTo(to[0]+4,to[1]+4);c.moveTo(to[0]+4,to[1]-4);c.lineTo(to[0]-4,to[1]+4);c.stroke()}}c.restore();
   }
   if(!['airstrike','artillery'].includes(e.kind)||e.cancelledAt!=null&&t>=e.cancelledAt)continue;
   const impact=e.impactAt??e.t,impactAge=t-impact,[x,y]=toScreen(e.x,e.y),radius=Math.max(30,(e.radius||6)*scale),flight=impact-e.t;
   c.save();
   if(e.kind==='airstrike'&&age<Math.max(8,flight+3)){const q=age/Math.max(8,flight+3),px=x-w*.65+q*w*1.3,py=y-h*.18+q*h*.36;vehicle(c,px,py,Math.atan2(h*.36,w*1.3),Math.min(150,w*.24),true);if(impactAge<0&&age>flight*.55){c.strokeStyle='#ece7cfcc';c.lineWidth=2;c.beginPath();c.moveTo(px-12,py+8);c.lineTo(x,y);c.setLineDash([4,7]);c.stroke();c.setLineDash([])}}
   if(e.kind==='artillery'&&impactAge<0){const q=age/Math.max(1,flight),start=[x-w*.35,y-h*.45];c.strokeStyle='#e4ab52a6';c.lineWidth=2;c.setLineDash([3,5]);c.beginPath();c.moveTo(...start);c.quadraticCurveTo(x-w*.15,y-h*.6,x,y);c.stroke();c.setLineDash([]);const px=start[0]+(x-start[0])*q,py=start[1]+(y-start[1])*q-Math.sin(q*Math.PI)*h*.2;c.strokeStyle='#fff1bd';c.lineWidth=3;c.shadowColor='#ffb73e';c.shadowBlur=10;c.beginPath();c.moveTo(px-6,py-14);c.lineTo(px,py);c.stroke()}
   if(impactAge>=0){const salvo=e.kind==='artillery'?3:2;for(let n=0;n<salvo;n++){const a=impactAge-n*.55;if(a<0||a>25)continue;const px=x+Math.sin(n*4.8)*radius*.5,py=y+Math.cos(n*4.8)*radius*.24,q=Math.min(1,a/3),fade=Math.max(0,1-a/18);
     if(a<2.5){c.globalAlpha=(1-a/2.5)*.8;c.strokeStyle='#fff0bd';c.lineWidth=2;c.beginPath();c.ellipse(px,py,radius*(.25+q),radius*(.15+q*.55),0,0,Math.PI*2);c.stroke();const g=c.createRadialGradient(px,py,0,px,py,radius*(.3+q*.7));g.addColorStop(0,'#fffbe4');g.addColorStop(.17,'#ffdf80');g.addColorStop(.45,'#f29b42');g.addColorStop(1,'#be794300');c.fillStyle=g;c.fillRect(px-radius,py-radius,radius*2,radius*2)}
     c.globalAlpha=fade*.5;c.fillStyle='#a9a69c';for(let k=0;k<5;k++){c.beginPath();c.ellipse(px+Math.sin(k*5+n)*radius*.32,py-a*1.8+Math.cos(k*3)*radius*.12,radius*(.18+Math.min(a,8)*.04),radius*(.13+Math.min(a,8)*.05),0,0,Math.PI*2);c.fill()}
     c.globalAlpha=Math.max(0,1-a/35)*.22;c.fillStyle='#5b584c';c.beginPath();c.ellipse(px,py,radius*.32,radius*.15,0,0,Math.PI*2);c.fill();
    }}
   c.globalAlpha=1;c.font='700 11px -apple-system,sans-serif';const text=e.kind==='airstrike'?'AIR STRIKE / 공습':'ARTILLERY / 포격';const tw=c.measureText(text).width;c.fillStyle='#ffffffed';c.fillRect(Math.max(8,Math.min(w-tw-25,x-tw/2))-8,Math.max(20,y-radius-24)-16,tw+16,24);c.fillStyle=e.kind==='airstrike'?'#657c9b':'#b5853e';c.fillText(text,Math.max(8,Math.min(w-tw-25,x-tw/2)),Math.max(20,y-radius-24));c.restore();
  }
 }
 let annotations=null,frameWidth=0,frameHeight=0,frameObstacles=[];
 function beginFrame(c,w,h){annotations=[];frameWidth=w||0;frameHeight=h||0;frameObstacles=[];const canvas=c?.canvas,root=canvas?.closest('.field-console');if(root&&window.fieldPointerPosition)for(const el of root.querySelectorAll('.field-map-toolbar>div,.field-mobile-panels,.field-operation-switcher')){const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const a=window.fieldPointerPosition(canvas,{clientX:r.left,clientY:r.top}),b=window.fieldPointerPosition(canvas,{clientX:r.right,clientY:r.bottom});frameObstacles.push({x:Math.min(a.x,b.x)-5,y:Math.min(a.y,b.y)-5,w:Math.abs(b.x-a.x)+10,h:Math.abs(b.y-a.y)+10})}}
 function smartLabel(c,text,x,y,color='#4f6486',priority=0){if(!annotations){c.save();pill(c,text,x,y,color);c.restore();return}const m=c.getTransform(),d=c.canvas.width/c.canvas.clientWidth||1;annotations.push({text:String(text),x:(m.a*x+m.c*y+m.e)/d,y:(m.b*x+m.d*y+m.f)/d,color,priority})}
 function endFrame(c){if(!annotations)return;const labels=annotations;annotations=null;const used=frameObstacles.slice(),d=c.canvas.width/c.canvas.clientWidth||1;c.save();c.setTransform(d,0,0,d,0,0);c.textAlign='left';c.textBaseline='alphabetic';c.font='500 10px -apple-system,sans-serif';for(const a of labels.sort((a,b)=>b.priority-a.priority)){let text=a.text;while(c.measureText(text).width>135&&text.length>5)text=text.slice(0,-2)+'…';const w=c.measureText(text).width+16;for(const [dx,dy]of [[0,0],[0,-24],[0,24],[-w-28,0],[-w-28,-24]]){const x=a.x+dx-7,y=a.y+dy-12,box={x,y,w,h:20};if(x<5||y<5||x+w>frameWidth-5||y+20>frameHeight-5||used.some(b=>x<b.x+b.w+4&&x+w+4>b.x&&y<b.y+b.h+3&&y+23>b.y))continue;used.push(box);if(dx||dy){c.strokeStyle='#ffffffa0';c.lineWidth=.8;c.beginPath();c.moveTo(a.x-4,a.y+4);c.lineTo(x+(dx<0?w:0),y+10);c.stroke()}pill(c,text,x+7,y+12,a.color);break}}c.restore()}
 function helicopter(c,x,y,heading,size,t,altitude=30){
  c.save();c.translate(x,y);c.fillStyle='#253c4a28';c.beginPath();c.ellipse(altitude*.15,altitude*.2,size*.4,size*.18,heading,0,Math.PI*2);c.fill();
  if(altitude<10){c.strokeStyle='#baa98a44';c.lineWidth=2;c.beginPath();c.ellipse(0,5,size*(.5+(t%1)*.15),size*.27,0,0,Math.PI*2);c.stroke();}
  c.translate(0,-altitude*.12);c.rotate(heading);
  if(!sprite(c,'images/operators/helicopters.webp',0,2,2,0,0,size,size*2/3)){c.fillStyle='#647986';c.beginPath();c.ellipse(0,-size*.18,size*.25,size*.1,0,0,Math.PI*2);c.fill();}
  // Rotor hub in atlas cell 0 is (472,211) in a 768x512 cell. Both share the aircraft transform.
  c.translate(size*(472/768-.5),size*(2/3)*(211/512-.77));c.fillStyle='#dce7ed18';c.beginPath();c.ellipse(0,0,size*.34,size*.23,0,0,Math.PI*2);c.fill();c.strokeStyle='#ebf2f6a0';c.lineWidth=1.5;c.beginPath();
  for(let i=0;i<4;i++){const a=t*28+i*Math.PI/2;c.moveTo(0,0);c.lineTo(Math.cos(a)*size*.34,Math.sin(a)*size*.23);}c.stroke();c.restore();
 }
 window.FieldArt={image,label,marker,vehicle,helicopter,unit,aim,effects,palette,beginFrame,endFrame,smartLabel};
})();
