/* Lossless storage encoding. Existing JSON saves and JSON exports remain readable. */
(function(root){
 const prefix='BLZ1:';
 function pack(text){const input=new TextEncoder().encode(text),head=new Int32Array(65536).fill(-1),previous=new Int32Array(input.length).fill(-1),out=[];let pos=0;
  const hash=i=>((input[i]*251+input[i+1])*251+input[i+2])&65535;
  while(pos<input.length){const flagIndex=out.length;out.push(0);let flags=0;
   for(let bit=0;bit<8&&pos<input.length;bit++){let length=0,distance=0;if(pos+2<input.length){let candidate=head[hash(pos)],checks=0;while(candidate>=0&&pos-candidate<=4096&&checks++<32){let n=0;while(n<18&&pos+n<input.length&&input[candidate+n]===input[pos+n])n++;if(n>=3&&n>length){length=n;distance=pos-candidate;if(n===18)break}candidate=previous[candidate]}}
    const consumed=length||1;if(length){flags|=1<<bit;const token=((distance-1)<<4)|(length-3);out.push(token>>8,token&255)}else out.push(input[pos]);for(let n=0;n<consumed;n++){if(pos+2<input.length){const key=hash(pos);previous[pos]=head[key];head[key]=pos}pos++}
   }out[flagIndex]=flags;
  }let binary='';for(let i=0;i<out.length;i+=16384)binary+=String.fromCharCode(...out.slice(i,i+16384));return prefix+btoa(binary);
 }
 function unpack(text){if(!text?.startsWith(prefix))return text;const input=atob(text.slice(prefix.length)),out=[];let at=0;while(at<input.length){const flags=input.charCodeAt(at++);for(let bit=0;bit<8&&at<input.length;bit++){if(flags&(1<<bit)){if(at+1>=input.length)throw Error('Incomplete save token');const token=(input.charCodeAt(at++)<<8)|input.charCodeAt(at++),distance=(token>>4)+1,length=(token&15)+3;if(distance>out.length)throw Error('Invalid save reference');for(let n=0;n<length;n++)out.push(out[out.length-distance]);}else out.push(input.charCodeAt(at++));if(out.length>33554432)throw Error('Save exceeds supported size');}}return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(out));}
 const codec={pack,unpack,prefix};root.blacklineSaveCodec=codec;if(typeof module!=='undefined'&&module.exports)module.exports=codec;
 if(typeof Storage==='undefined')return;const get=Storage.prototype.getItem,set=Storage.prototype.setItem,keys=new Set(['blackline_pmc_v1','blackline_pmc_v1_backup']);let lastText=null,lastPacked=null;
 codec.rawGet=key=>get.call(localStorage,key);
 Storage.prototype.getItem=function(key){const value=get.call(this,key);if(!keys.has(String(key)))return value;try{return unpack(value)}catch(error){return '{"__blackline_corrupt_codec__":'}};
 Storage.prototype.setItem=function(key,value){let text=String(value);if(keys.has(String(key))&&text.length>4096&&!text.startsWith(prefix)){if(text===lastText)text=lastPacked;else{const encoded=pack(text);lastText=text;lastPacked=encoded.length<text.length?encoded:text;text=lastPacked}}return set.call(this,key,text)};
})(typeof window==='undefined'?globalThis:window);
