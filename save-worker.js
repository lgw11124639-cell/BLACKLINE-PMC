/* Main-thread rendering never runs the normal autosave compressor. */
importScripts('save-codec.js?v=2026110957');
self.onmessage=event=>{const {sequence,state}=event.data;try{const json=JSON.stringify(state),packed=self.blacklineSaveCodec.pack(json);self.postMessage({sequence,value:packed.length<json.length?packed:json});}catch(error){self.postMessage({sequence,error:String(error)})}};
