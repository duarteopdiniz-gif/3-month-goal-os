/* Service worker — offline cache. Same-origin only (never cache the GitHub API
 * or any cross-origin response — that would break sync and could cache tokens). */
const CACHE = "goal-os-v6";
const ASSETS = [
  "./", "./index.html", "./styles.css",
  "./seed.js", "./engine.js", "./sync.js", "./app.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-180.png"
];
self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch", e=>{
  const req=e.request;
  if(req.method!=="GET") return;
  const url=new URL(req.url);
  // IGNORE cross-origin requests entirely (GitHub API, etc.) — let them hit the network,
  // never cache them (prevents stale API responses and token leakage into the cache).
  if(url.origin!==self.location.origin) return;
  e.respondWith(
    // ignoreSearch so ?tab=today / ?tab=week resolve to the cached index offline
    caches.match(req, {ignoreSearch:true}).then(cached=> cached || fetch(req).then(res=>{
      const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req,copy)); return res;
    }).catch(()=>cached))
  );
});
