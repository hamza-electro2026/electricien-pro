const V="ep-v8",F=["./","index.html","manifest.webmanifest","icon.svg","icon-192.png","icon-512.png","about.html","guide.html","calculs-pratiques.html","guide-installation.html","privacy.html","contact.html","sitemap.xml","robots.txt"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(F)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!=V).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
