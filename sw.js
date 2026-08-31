/* Zapheria service worker -- IMAGE CACHE ONLY.
 *
 * WHY THIS EXISTS
 *   GitHub Pages serves every file with `cache-control: max-age=300`. Five
 *   minutes. After that the browser re-fetches. The Weekly Points view alone
 *   pulls 700,169 bytes across 10 photos, so on any visit more than five
 *   minutes after the last one the view fills in progressively as the network
 *   delivers -- which is exactly the reported "scroll, blank, wait, it loads"
 *   symptom. Before the images were extracted out of the HTML they were
 *   base64 data: URLs and cost zero requests, which is why this never
 *   happened before.
 *
 * WHY CACHE-FIRST IS SAFE HERE
 *   Every file under assets/img/ is named <sha256(bytes)[:16]>.<ext>. The URL
 *   is a function of the content. A changed image is a different URL by
 *   construction, so a cached response can never be stale. This is verified
 *   at generation time -- sw.js is not written unless all 75 filenames match
 *   their own hash.
 *
 *   (p117) THE MANIFEST IS DERIVED FROM THE SHIPPED index.html, NOT HAND-KEPT.
 *   It had drifted a full build: 30 of the 65 photos this HTML actually uses
 *   were absent from the list while 30 photos nothing references were fetched
 *   on every install. For 70% of the photo bytes the worker was not doing the
 *   one job it exists for. tools/gen-sw.mjs regenerates it and fails loudly if
 *   a referenced file is missing from assets/img/.
 *
 * WHAT THIS DELIBERATELY DOES *NOT* DO
 *   It never intercepts index.html, and it never intercepts anything outside
 *   assets/img/. HTML always comes from the network exactly as it does today,
 *   so this cannot strand anyone on a stale build -- the classic service
 *   worker failure mode is structurally excluded rather than merely avoided.
 */
var SW_VERSION = 'zapheria-img-v3';
/* (p122) F-3. The worker cached images and never the HTML, on a document that
   advertises itself as an installable home-screen app - so with the network down a
   runner tapping the icon got "No internet", not the menu, while 4.4 MB of photos sat
   cached and unreachable. A restaurant floor has dead zones: walk-ins, cellars, back
   corridors, an AP that drops mid-service.
   The shell is cached in its OWN version-keyed cache and served NETWORK-FIRST, so the
   classic service-worker failure - stranding a device on a stale build - stays
   structurally excluded: the network wins whenever there is one, and the cache is only
   reached when there is not. */
var SHELL_VERSION = 'zapheria-shell-2026-08-21-p143';
var SHELL = ['./', 'index.html'];
var ASSETS = ["assets/img/008a9b8ee039fad2.jpg","assets/img/01f46475eb4cf92d.jpg","assets/img/06f7b27659c830dd.jpg","assets/img/0f0ef83c5d4603df.jpg","assets/img/10c4f8b653449acc.jpg","assets/img/1567593716fcabf1.jpg","assets/img/194ea9fa862725fe.jpg","assets/img/1afc0533cf9b3469.jpg","assets/img/26ebad8a904c1925.jpg","assets/img/364a7aed3dc9579f.jpg","assets/img/38ab928223cff428.jpg","assets/img/3ffdb12d3c7a71bd.jpg","assets/img/40ffd89efa3d50b4.jpg","assets/img/43181face4e2af9c.jpg","assets/img/472cc1821ed71ce5.jpg","assets/img/47835f4dc47e7f6d.jpg","assets/img/4c33b89364f48b0a.jpg","assets/img/4c831bb522c91cbd.jpg","assets/img/4ea610df68d7a6d2.jpg","assets/img/5a6bec5e77e1087c.jpg","assets/img/5c2f80acfad847aa.jpg","assets/img/5e5bfe0fbc203ab8.jpg","assets/img/61e76497cb1df467.jpg","assets/img/6802ebbedbf4bd27.jpg","assets/img/6ca9510afbe8bc70.jpg","assets/img/6f2d3a2e32d13352.jpg","assets/img/721f47950d29e2fa.jpg","assets/img/7c9e814ba2bcee49.jpg","assets/img/82094743cc15ef28.jpg","assets/img/8cca95239ae99451.jpg","assets/img/8cfd0b19fe3cfe43.png","assets/img/8ec5e8c214b22ad9.jpg","assets/img/9301593f53eddda5.jpg","assets/img/9711d32d23b5f011.webp","assets/img/9972ff6218bb6d47.jpg","assets/img/9df04c1e9d8b09a5.jpg","assets/img/9f477648b2ba31fe.jpg","assets/img/a7538382d6790777.jpg","assets/img/aa5c0bb57982c919.jpg","assets/img/ab5a3ea85ab4e6ba.jpg","assets/img/b0ee8a7e51e14aec.jpg","assets/img/b2403cfa0ea0a094.jpg","assets/img/b581269409894738.jpg","assets/img/baa637479ad56bc2.jpg","assets/img/c07f90960fd90daf.jpg","assets/img/c44b221d413dddd6.jpg","assets/img/c52e873e95cb0af5.jpg","assets/img/c58158fdd5cde6db.jpg","assets/img/c8cf79fe737a8ad5.jpg","assets/img/d130efb30c2db61b.jpg","assets/img/d24e8dae937901c9.jpg","assets/img/da2b623a6939aba1.jpg","assets/img/dbd82d30fb51b002.jpg","assets/img/e7ef32fed3dcd848.png","assets/img/e8f5da57a943ddf2.webp","assets/img/eb698396c601c2e9.jpg","assets/img/f2091d8c26fd74c4.jpg","assets/img/f43fcc184c927448.jpg","assets/img/f811b0d6bb44aa46.jpg","assets/img/f847628bbf8cdb9d.webp","assets/img/fb4dafe2b0ff4f8a.jpg","assets/img/fc5fc269e9f7ff4f.jpg","assets/img/ffa09c2b1b14d386.jpg","assets/img/ffc23fda93b34bc6.jpg"];

function isImg(url) {
  return url.origin === self.location.origin && url.pathname.indexOf('/assets/img/') !== -1;
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL_VERSION).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return fetch(u, { cache: 'no-cache' })
          .then(function (r) { if (r && r.status === 200) return c.put(u, r); })
          .catch(function () { /* offline at install time: the fetch handler refreshes it */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return (k === SW_VERSION || k === SHELL_VERSION) ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;              /* never touch writes        */
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  /* (p122) F-3: navigations are NETWORK-FIRST. A live network always wins, so a new
     build reaches the device the moment it is published; the cached shell is only ever
     reached when the network is not there at all. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(SHELL_VERSION).then(function (c) { c.put('index.html', copy); });
        }
        return res;
      }).catch(function () {
        return caches.open(SHELL_VERSION).then(function (c) {
          return c.match('index.html').then(function (hit) {
            return hit || new Response('<!doctype html><meta charset=utf-8><title>Offline</title>'
              + '<style>body{font:16px/1.5 -apple-system,sans-serif;padding:32px;color:#111;background:#faf9f7}</style>'
              + '<h1>No connection</h1><p>Open the app once with a connection and it will work offline from then on.</p>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
          });
        });
      })
    );
    return;
  }
  if (!isImg(url)) return;                       /* other assets: untouched   */

  e.respondWith(
    caches.open(SW_VERSION).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;                     /* immutable: no revalidate  */
        return fetch(req).then(function (res) {
          if (res && res.status === 200) { c.put(req, res.clone()); }
          return res;
        });
      });
    })
  );
});

/* Deferred full precache. The page asks for this only once it is idle, so it
   never competes with first paint. Sequential with a small concurrency so a
   phone on a weak connection is not hammered. Already-cached entries are
   skipped, so repeat calls are nearly free. */
var precaching = false;
function precache() {
  if (precaching) return Promise.resolve();
  precaching = true;
  return caches.open(SW_VERSION).then(function (c) {
    var i = 0, CONC = 3;
    function worker() {
      if (i >= ASSETS.length) return Promise.resolve();
      var u = ASSETS[i++];
      return c.match(u).then(function (hit) {
        if (hit) return null;
        return fetch(u, { cache: 'no-cache' }).then(function (res) {
          if (res && res.status === 200) return c.put(u, res);
        }).catch(function () { /* one bad asset must not abort the rest */ });
      }).then(worker);
    }
    var lanes = [];
    for (var k = 0; k < CONC; k++) lanes.push(worker());
    return Promise.all(lanes);
  }).then(function () { precaching = false; });
}

self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'precache') { e.waitUntil(precache()); }
  if (d.type === 'stat') {
    e.waitUntil(caches.open(SW_VERSION).then(function (c) {
      return c.keys().then(function (ks) {
        if (e.source) e.source.postMessage({
          type: 'stat', version: SW_VERSION, cached: ks.length, total: ASSETS.length
        });
      });
    }));
  }
});
