/* Only the operation map enters landscape focus; company pages remain unchanged. */
(function(){
 const landscape=matchMedia('(orientation:landscape)'),touch=matchMedia('(pointer:coarse)');
 let previousCanvas=null,previousLandscape=false;
 function sync(){
  const canvas=typeof tab!=='undefined'&&tab==='observation'?document.querySelector('#app #field-canvas'):null;
  const wide=touch.matches&&landscape.matches;
  if(canvas&&wide&&(canvas!==previousCanvas||!previousLandscape)&&!canvas.closest('.field-focus'))window.fieldExpand?.();
  previousCanvas=canvas;previousLandscape=wide;
 }
 const refresh=window.blacklineRefreshObservation;window.blacklineRefreshObservation=function(){refresh?.();sync()};
 landscape.addEventListener('change',sync);touch.addEventListener('change',sync);window.addEventListener('resize',sync);sync();
})();
