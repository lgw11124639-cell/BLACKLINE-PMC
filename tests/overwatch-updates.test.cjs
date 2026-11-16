const test = require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),U=require('../overwatch/updates');
test('update discovery orders numeric releases and never offers equal, older or malformed versions',()=>{
 assert.ok(U.newer('2026.11.16.14','2026.11.16.9'));
 assert.ok(U.newer('2026.11.17.1','2026.11.16.99'));
 for(const candidate of ['2026.11.16.14','2026.11.16.05','development','https://example.com',''])assert.equal(U.newer(candidate,'2026.11.16.14'),false);
});
test('the deployed release manifest, application version and every entry asset share one release',()=>{
 const release=JSON.parse(fs.readFileSync('version.json','utf8')).version,app=fs.readFileSync('overwatch/app.js','utf8'),html=fs.readFileSync('index.html','utf8');
 assert.ok(app.includes('const VERSION = "'+release+'"'));
 const assets=[...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)\?v=([^"]+))"/g)];
 assert.ok(assets.length>20);assert.ok(assets.every(a=>a[2]===release.replaceAll('.','')));
 assert.ok(html.indexOf('overwatch/updates.js')<html.indexOf('overwatch/app.js'));
});
