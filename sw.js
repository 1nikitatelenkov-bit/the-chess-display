/* The Chess Display — offline shell.
   Network-first so a fresh build always wins when online; the cache
   only steps in when the network is gone, which is what lets the
   glasses open the app offline after it has been loaded once. */
var CACHE = 'chess-display-v1';
var ASSETS = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icon-mono.png',
  './manifest.webmanifest'
];
self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function(e){
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function(e){
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function(res){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      return res;
    }).catch(function(){
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
