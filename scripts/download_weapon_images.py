#!/usr/bin/env python3
"""Download freely licensed firearm photographs into the repository.
Sources: Wikimedia Commons. Keep attribution in images/ATTRIBUTION.md.
"""
import json, pathlib, urllib.parse, urllib.request, time
BASE=pathlib.Path(__file__).resolve().parents[1]
DEST=BASE/"images"/"weapons"; DEST.mkdir(parents=True,exist_ok=True)
FILES=[
 ("hk416","HK416N noBG.png","HK416N noBG.png"),
 ("m4a1","M4A1-flattop.png","M4A1-flattop.png"),
 ("sig-mcx","SIG MCX","SIG-MCX-Rifle-removebg-preview.png"),
 ("mp7","HK MP7 Bundeswehr noBG.png","HK MP7 Bundeswehr noBG.png"),
 ("scar-l","FN SCAR-L noBG.png","FN SCAR-L noBG.png"),
 ("g36","Gewehr G36 noBG.png","Gewehr G36 noBG.png"),
]
API="https://commons.wikimedia.org/w/api.php"
def request(params):
 url=API+"?"+urllib.parse.urlencode(params)
 req=urllib.request.Request(url,headers={"User-Agent":"BLACKLINE-PMC/0.3 (open-source game image catalog; github.com/lgw11124639-cell/BLACKLINE-PMC)"})
 with urllib.request.urlopen(req,timeout=45) as r:return json.load(r)
def getinfo(title):
 data=request({"action":"query","titles":"File:"+title,"prop":"imageinfo","iiprop":"url|extmetadata","format":"json"})
 page=next(iter(data["query"]["pages"].values()))
 return page.get("imageinfo",[None])[0]
def search(query):
 data=request({"action":"query","generator":"search","gsrsearch":"filetype:bitmap "+query,"gsrnamespace":6,"gsrlimit":15,"prop":"imageinfo","iiprop":"url|extmetadata","format":"json"})
 for p in data.get("query",{}).get("pages",{}).values():
  title=p.get("title","").removeprefix("File:")
  if title.lower().endswith((".jpg",".jpeg",".png",".webp")) and p.get("imageinfo"):
   return title,p["imageinfo"][0]
 return None,None
attributions=["# Local weapon image attributions","Images are copied from Wikimedia Commons. Consult each source for its specific license and conditions.",""]
manifest={}
for key,query,preferred in FILES:
 title=preferred;info=getinfo(title)
 if not info:
  title,info=search(query)
 if not info:
  print("MISSING",key);continue
 url=info["url"];ext=pathlib.Path(urllib.parse.urlparse(url).path).suffix.lower()
 if ext not in (".png",".jpg",".jpeg",".webp"):
  print("UNSUPPORTED",key,url);continue
 out=DEST/(key+ext)
 req=urllib.request.Request(url,headers={"User-Agent":"BLACKLINE-PMC/0.3 (open-source game image catalog; github.com/lgw11124639-cell/BLACKLINE-PMC)"})
 try:
  data=None
  for attempt in range(4):
   try:
    with urllib.request.urlopen(req,timeout=90) as response: data=response.read(8_000_001)
    break
   except Exception as e:
    if attempt==3: raise
    print("RETRY",key,str(e),flush=True)
    time.sleep(12*(attempt+1))
  if len(data)>8_000_000:print("TOO LARGE",key);continue
  out.write_bytes(data)
 except Exception as e:print("DOWNLOAD FAILED",key,str(e));continue
 meta=info.get("extmetadata",{})
 def val(k):return meta.get(k,{}).get("value","unknown")
 manifest[key]={"file":str(out.relative_to(BASE)),"source":"https://commons.wikimedia.org/wiki/File:"+urllib.parse.quote(title.replace(" ","_")),"author":val("Artist"),"license":val("LicenseShortName")}
 attributions+=["## "+key,"Source: "+manifest[key]["source"],"Author: "+val("Artist"),"License: "+val("LicenseShortName"),""]
 print("SAVED",key,out,len(data));time.sleep(8)
(DEST/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
(DEST/"ATTRIBUTION.md").write_text("\n".join(attributions))
if not manifest:raise SystemExit("No images downloaded")
