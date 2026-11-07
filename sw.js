/* The Chess Display — offline shell.
   The app is one self-contained file, so the cache IS the app. A page
   open races the network against a short timeout: online, the fresh
   build wins; offline — or on a connection that hangs instead of
   failing — the cached shell answers at once. (The previous worker
   was pure network-first: it waited for a dead connection to give up
   in its own time, which on the glasses reads as "offline doesn't
   work", and it cached any response at all, so one error page could
   poison the shell.) Only OK responses are ever cached. The cache
   name carries the build number, and activating a new worker deletes
   every older cache, so a new build always starts from a clean shell. */
var CACHE = 'chess-display-v33';
var ASSETS = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icon-mono.png',
  './manifest.webmanifest'
];
var NAV_TIMEOUT_MS = 2500;

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(names){
      return Promise.all(names.map(function(n){ return n === CACHE ? null : caches.delete(n); }));
    }).then(function(){ return self.clients.claim(); })
  );
});
function cachedShell(){
  return caches.match('./index.html', { ignoreSearch: true });
}
self.addEventListener('fetch', function(e){
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate'){
    var network = fetch(e.request).then(function(res){
      if (res && res.ok){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
        return res;
      }
      return cachedShell();
    }).catch(function(){ return cachedShell(); });
    var deadline = new Promise(function(resolve){
      setTimeout(function(){ cachedShell().then(resolve); }, NAV_TIMEOUT_MS);
    });
    e.respondWith(Promise.race([network, deadline]).then(function(r){ return r || cachedShell(); }));
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function(hit){
      if (hit) return hit;
      return fetch(e.request).then(function(res){
        if (res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        return res;
      });
    })
  );
});
