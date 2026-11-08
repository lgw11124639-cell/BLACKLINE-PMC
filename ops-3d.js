/* Lightweight Three.js isometric spectator. No asset downloads, physics, or saved scene state. */
(function(){
let scene=null,camera=null,renderer=null,actors=[],vehicles=[],frame=0,host=null,missionId=null,observer=null,ready=false,failed=false,contextLost=false;
const enabled=()=>typeof window.THREE!=='undefined';
const opts={antialias:false,alpha:false,powerPreference:'low-power',preserveDrawingBuffer:false};
function material(hex){return new THREE.MeshLambertMaterial({color:hex})}
function cube(w,h,d,color,x,y,z){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material(color));mesh.position.set(x,y,z);scene.add(mesh);return mesh}
function cylinder(radius,height,color,x,y,z){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,6),material(color));mesh.position.set(x,y,z);scene.add(mesh);return mesh}
function clear(){
 if(observer){observer.disconnect();observer=null}
 if(renderer){renderer.domElement.removeEventListener('webglcontextlost',lost);renderer.dispose();renderer.domElement.remove();renderer=null}
 if(scene){scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose())}})}
 scene=null;camera=null;actors=[];vehicles=[];host=null;missionId=null;ready=false;frame=0;
}
function lost(e){e.preventDefault();contextLost=true;clear();const el=document.getElementById('ops-3d-fallback');if(el)el.hidden=false}
function init(){
 const el=document.getElementById('ops-3d');if(!el||!enabled()||contextLost)return;
 const id=el.dataset.mission;if(ready&&host===el&&missionId===id)return;
 clear();host=el;missionId=id;
 try{
  const w=Math.max(240,el.clientWidth),h=Math.max(180,el.clientHeight);
  scene=new THREE.Scene();scene.background=new THREE.Color(0x1a3035);
  camera=new THREE.OrthographicCamera(-15,15,10,-10,.1,100);camera.position.set(20,24,24);camera.lookAt(0,0,0);
  renderer=new THREE.WebGLRenderer(opts);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));renderer.setSize(w,h,false);renderer.setClearColor(0x1a3035);renderer.outputColorSpace=THREE.SRGBColorSpace||renderer.outputColorSpace;
  el.appendChild(renderer.domElement);
  const hemi=new THREE.HemisphereLight(0xc4e2dc,0x3c5045,2);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffffff,1.25);sun.position.set(10,18,5);scene.add(sun);
  cube(32,.2,22,0x344f49,0,-.2,0);
  cube(32,.03,3.3,0x53656a,0,.02,0);cube(2.8,.04,22,0x53656a,4,.03,0);
  for(let i=0;i<9;i++){const x=-12+(i%3)*9,z=-8+Math.floor(i/3)*8;if(Math.abs(x-4)<3||Math.abs(z)<2)continue;const height=2+(i%3)*1.25;cube(3.8,height,3.5,i%2?0x58716c:0x617b73,x,height/2,z);cube(4,.12,3.7,0x7b9186,x,height+.08,z)}
  for(let i=0;i<8;i++){const x=-13+i*3.6;cube(1.2,.025,.12,0xa2afa4,x,.065,0)}
  for(let i=0;i<4;i++){cylinder(.65,.2,0x47644c,-13+i*8,.04,-10);cylinder(.45,1.1,0x63846a,-13+i*8,.6,-10)}
  const count=Math.min(8,Math.max(1,Number(el.dataset.team)||4));
  for(let i=0;i<count;i++){const root=new THREE.Group();const body=new THREE.Mesh(new THREE.CylinderGeometry(.24,.29,.8,6),material(0x91c7a4));body.position.y=.52;root.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.22,6,4),material(0xc7c4a6));head.position.y=1.08;root.add(head);const mark=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.04,12),material(0x9fe4b6));mark.position.y=.04;root.add(mark);root.position.set(-11+i*1.1,0,2+(i%2)*1.2);scene.add(root);actors.push(root)}
  const car=cube(2.2,.7,1.15,0x829a87,-12,.45,-1.2);cube(1.1,.55,1,0x455e5b,-12,1.05,-1.2);vehicles.push(car);
  renderer.domElement.addEventListener('webglcontextlost',lost,{once:true});
  const fallback=document.getElementById('ops-3d-fallback');if(fallback)fallback.hidden=true;
  ready=true;resize();renderer.render(scene,camera);
  if('ResizeObserver'in window){observer=new ResizeObserver(()=>resize());observer.observe(el)}
 }catch(e){console.warn('3D fallback:',e);clear();const fallback=document.getElementById('ops-3d-fallback');if(fallback)fallback.hidden=false;failed=true}
}
function resize(){if(!ready||!renderer||!host)return;const w=Math.max(240,host.clientWidth),h=Math.max(180,host.clientHeight);renderer.setSize(w,h,false);const aspect=w/h;camera.left=-11*aspect;camera.right=11*aspect;camera.top=11;camera.bottom=-11;camera.updateProjectionMatrix();renderer.render(scene,camera)}
window.ops3dUpdate=function(seconds,max){
 if(document.hidden||!document.getElementById('ops-3d')){if(ready)clear();return}
 if(!ready){if(!failed)init();if(!ready)return}
 const progress=Math.max(0,Math.min(1,seconds/Math.max(1,max)));
 if(Math.abs(progress-frame)<.004)return;frame=progress;
 actors.forEach((a,i)=>{a.position.x=-11+i*.8+progress*17;a.position.z=2+(i%2)*1.2+Math.sin(progress*5+i)*.45;a.rotation.y=Math.sin(progress*4+i)*.3});
 vehicles[0].position.x=-12+progress*11;
 renderer.render(scene,camera);
};
window.ops3dDispose=clear;
document.addEventListener('visibilitychange',()=>{if(document.hidden)clear()});
window.addEventListener('pagehide',clear);
})();