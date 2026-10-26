self.addEventListener('message',e=>{if(e.data?.type==='activate-notifications')self.skipWaiting();});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{const client=windows.find(c=>new URL(c.url).origin===self.location.origin);if(client){await client.focus();client.postMessage({type:'open-proposals',account:e.notification.data?.account});}else await self.clients.openWindow('/?usulan=1');}));});
const CACHE='silsilah-web-ae99113abaf36741';
const ASSETS=["/","/assets/DejaVuSans-uCh15Ap1.ttf","/assets/index-DDfCNqgj.js","/assets/index-DeeW2Ok0.css","/assets/pdf-BHaQK1BZ.js","/assets/web-E3eY_rpm.js","/assets/web-YEKSk0Bg.js"];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('silsilah-web-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||u.pathname.startsWith('/api/'))return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).then(r=>r.ok?r:caches.match('/').then(c=>c||r)).catch(()=>caches.match('/')));return;}
 if(ASSETS.includes(u.pathname))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});