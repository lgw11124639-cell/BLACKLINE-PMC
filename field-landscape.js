/* Focus rotates only the map UI on a portrait phone. Company screens never rotate. */
(function(){
 const touch=matchMedia('(pointer:coarse)'),portrait=matchMedia('(orientation:portrait)');
 window.fieldSyncOrientation=function(){for(const root of document.querySelectorAll('.field-console')){const rotated=root.classList.contains('field-focus')&&touch.matches&&portrait.matches;root.classList.toggle('field-phone-landscape',rotated);}};
 window.fieldPointerPosition=function(canvas,event){const b=canvas.getBoundingClientRect();return canvas.closest('.field-phone-landscape')?{x:(event.clientY-b.top)*canvas.clientWidth/b.height,y:(b.right-event.clientX)*canvas.clientHeight/b.width}:{x:(event.clientX-b.left)*canvas.clientWidth/b.width,y:(event.clientY-b.top)*canvas.clientHeight/b.height};};
 const refresh=window.blacklineRefreshObservation;window.blacklineRefreshObservation=function(){refresh?.();window.fieldSyncOrientation()};
 portrait.addEventListener('change',window.fieldSyncOrientation);touch.addEventListener('change',window.fieldSyncOrientation);window.addEventListener('resize',window.fieldSyncOrientation);window.fieldSyncOrientation();
})();
