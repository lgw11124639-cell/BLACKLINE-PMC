/* Geometry accompanies each rendered terrain. Coordinates are stored with the operation. */
(function(){
 const api=window.fieldSimulation;
 const factory={...api.MAP,id:'factory',name:'공장 구역',label:'INDUSTRIAL / 시설 방호 구역',grid:2,transit:false,
  approach:[[34,58],[36,36]],positions:{highGrounds:[{id:'F-H1',x:64,y:29,r:6,height:5,entry:[62,30]},{id:'F-H2',x:72,y:40,r:5,height:4,entry:[70,40]}],sniper:[{id:'F-S1',x:64,y:29,entry:[62,30],height:5},{id:'F-S2',x:72,y:40,entry:[70,40],height:4}],medical:[61,44],flanks:[[72,38],[80,36]],cover:[[61,36],[70,40]]},spawnPoints:[[48,29],[57,31],[60,34],[71,37],[84,28],[90,30],[92,39],[76,41],[39,33],[62,28]]};
 const urban={id:'urban',name:'시가지',label:'URBAN / 시가지 수색',width:100,height:66.667,image:'images/maps/urban.webp',grid:1,base:[10,60],transit:false,
  buildings:[[1,1,18,13,6],[22,1,46,13,7],[52,1,59,13,6],[62,1,78,13,8],[82,1,98,13,6],[1,18,18,31,6],[22,18,46,31,8],[52,18,59,30,6],[62,18,71,29,10],[73,18,78,31,7],[82,18,98,31,8],[1,36,18,49,7],[22,36,28,49,6],[30,36,41,49,10],[43,41,47,49,6],[62,36,78,49,7],[82,36,98,49,8],[22,54,46,65,6],[52,54,78,65,7],[82,54,98,65,7]],
  goals:{'시설 보안':[80,34],'호송':[80,34],'구조':[50,34],'정밀 지원':[50,34],'무장세력 대응':[50,34]},approach:[[20,52],[50,52]],
  positions:{highGrounds:[{id:'U-R1',x:35,y:42,r:2,height:14,entry:[35,51],roof:true},{id:'U-R2',x:66,y:24,r:2,height:16,entry:[66,33],roof:true}],sniper:[{id:'U-S1',x:35,y:42,entry:[35,51],height:14,roof:true},{id:'U-S2',x:66,y:24,entry:[66,33],height:16,roof:true}],medical:[46,52],flanks:[[60,34],[50,50]],cover:[[45,34],[60,32]]},spawnPoints:[[50,20],[79,33],[80,45],[60,33],[50,29],[50,45],[20,32],[80,52]]};
 const mountain={id:'mountain',name:'산악지대',label:'MOUNTAIN / 능선·고지 통제',width:160,height:106.667,image:'images/maps/mountain.webp',grid:2,base:[20,94],transit:true,
  buildings:[[118,21,124,27,4],[130,21,138,29,5],[29,8,42,15,5],[135,72,149,83,5]],obstacles:[[54,52,62,68],[83,34,92,43],[105,66,113,76]],
  goals:{'시설 보안':[127,32],'호송':[132,34],'구조':[130,76],'정밀 지원':[127,32],'무장세력 대응':[127,32]},approach:[[50,88],[84,72]],
  positions:{highGrounds:[{id:'M-H1',x:103,y:44,r:13,height:24,entry:[99,47]},{id:'M-H2',x:64,y:50,r:12,height:17,entry:[64,56]},{id:'M-H3',x:116,y:63,r:10,height:18,entry:[118,62]}],sniper:[{id:'M-S1',x:103,y:44,entry:[99,47],height:24},{id:'M-S2',x:116,y:63,entry:[118,62],height:18}],medical:[92,63],flanks:[[117,40],[119,65]],cover:[[98,49],[120,60]]},spawnPoints:[[123,35],[134,35],[119,48],[130,65],[144,69],[95,61],[73,48],[116,79]]};
 const regional={id:'regional',name:'광역 작전지역',label:'REGIONAL / 광역 기동·정찰',width:320,height:213.333,image:'images/maps/regional.webp',grid:2,base:[46,178],transit:true,
  buildings:[[9,158,37,180,7],[206,85,226,99,8],[245,48,282,66,8],[111,41,125,52,9]],obstacles:[[15,0,32,25],[32,25,47,58],[49,80,67,125],[64,125,77,151],[76,173,95,213]],
  goals:{'시설 보안':[232,105],'호송':[246,80],'구조':[246,80],'정밀 지원':[232,105],'무장세력 대응':[232,105]},approach:[[72,163],[115,150]],
  positions:{highGrounds:[{id:'R-H1',x:204,y:78,r:16,height:16,entry:[198,84]},{id:'R-H2',x:226,y:118,r:14,height:10,entry:[220,120]}],sniper:[{id:'R-S1',x:204,y:78,entry:[198,84],height:16},{id:'R-S2',x:226,y:118,entry:[220,120],height:10}],medical:[205,124],flanks:[[220,111],[240,116]],cover:[[212,105],[220,120]]},spawnPoints:[[229,107],[241,112],[236,84],[216,112],[242,72],[254,85],[228,124],[197,111]]};
 urban.approachFinal=[60,34];api.maps={factory,urban,mountain,regional};
 api.projectToGround=function(map,point){const valid=(x,y)=>x>=1&&x<map.width-1&&y>=1&&y<map.height-1&&[...(map.buildings||[]),...(map.obstacles||[])].every(b=>!(x>b[0]-.7&&x<b[2]+.7&&y>b[1]-.7&&y<b[3]+.7));if(valid(...point))return point;for(let r=1;r<20;r++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const p=[point[0]+dx*r,point[1]+dy*r];if(valid(...p))return p}return map.base};
 api.selectMap=function(m){if(api.maps[m.mapId])return api.maps[m.mapId];if(/산악|조난|실종|관측/.test(m.title||''))return mountain;if(/민간인|인질|외교관|기자|마을|항만/.test(m.title||''))return urban;if(/수송|대피|보급 거점|반군/.test(m.title||''))return regional;return factory};
 api.elevationAt=function(map,p){let height=0;for(const h of map.positions?.highGrounds||[]){if(h.roof)continue;const d=Math.hypot(p.x-h.x,p.y-h.y);if(d<h.r)height=Math.max(height,h.height*(1-d/h.r))}return height};
})();
