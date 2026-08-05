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
 * WHAT THIS DELIBERATELY DOES *NOT* DO
 *   It never intercepts index.html, and it never intercepts anything outside
 *   assets/img/. HTML always comes from the network exactly as it does today,
 *   so this cannot strand anyone on a stale build -- the classic service
 *   worker failure mode is structurally excluded rather than merely avoided.
 */
var SW_VERSION = 'zapheria-img-v1';
var ASSETS = ["assets/img/01f46475eb4cf92d.jpg","assets/img/0549a0a88d02abea.jpg","assets/img/059aa675346baffa.jpg","assets/img/06f7b27659c830dd.jpg","assets/img/0f0ef83c5d4603df.jpg","assets/img/1067dba2bd247ea2.jpg","assets/img/10c4f8b653449acc.jpg","assets/img/11fa231e1946404f.jpg","assets/img/1567593716fcabf1.jpg","assets/img/16bbe3c31f437479.jpg","assets/img/1a89a7705b3ef199.jpg","assets/img/1cc212abb3b5a1ff.jpg","assets/img/29227415ff6d35ba.jpg","assets/img/2c2cc6fbf1965da1.jpg","assets/img/2c2f5babea69f457.jpg","assets/img/39ea4ef54034bf88.jpg","assets/img/3a09df8da15a1fd2.jpg","assets/img/4321c8c8c306568b.jpg","assets/img/472cc1821ed71ce5.jpg","assets/img/47835f4dc47e7f6d.jpg","assets/img/4ea610df68d7a6d2.jpg","assets/img/5d7bad91675cac51.jpg","assets/img/5e5bfe0fbc203ab8.jpg","assets/img/6610925331265989.jpg","assets/img/6802ebbedbf4bd27.jpg","assets/img/6baa6c7160b6821d.jpg","assets/img/6ca9510afbe8bc70.jpg","assets/img/6e1dc90e3e6440f1.jpg","assets/img/6f2d3a2e32d13352.jpg","assets/img/721f47950d29e2fa.jpg","assets/img/7775a9da9ab44ffe.jpg","assets/img/8477599cda3c8046.jpg","assets/img/85b36971fe785844.jpg","assets/img/86e9e32e7c6d7b52.jpg","assets/img/886cef95868c7198.jpg","assets/img/89520881b3339440.jpg","assets/img/8cca95239ae99451.jpg","assets/img/8cfd0b19fe3cfe43.png","assets/img/9711d32d23b5f011.webp","assets/img/9905ede5ee936013.jpg","assets/img/99186d267b726f1f.jpg","assets/img/9d4d8c391bb214f1.jpg","assets/img/9f040f5b1309a724.jpg","assets/img/9f477648b2ba31fe.jpg","assets/img/a6c2711412c4127b.jpg","assets/img/af34248e0dee79bf.jpg","assets/img/b581269409894738.jpg","assets/img/c07f90960fd90daf.jpg","assets/img/c0a41eeabc4c1789.jpg","assets/img/c44b221d413dddd6.jpg","assets/img/c52e873e95cb0af5.jpg","assets/img/c58158fdd5cde6db.jpg","assets/img/cd6638dc352c8868.jpg","assets/img/d04816601ea4fdc6.jpg","assets/img/d2fbfee46d2c64f6.jpg","assets/img/d44ebfb6144b877f.jpg","assets/img/d93f1cb6aef1d1d0.jpg","assets/img/da2b623a6939aba1.jpg","assets/img/dbd82d30fb51b002.jpg","assets/img/dc21afcc4d289272.jpg","assets/img/dc6ea2f4810fcbb3.jpg","assets/img/df6f39e5349cb2af.jpg","assets/img/e7ef32fed3dcd848.png","assets/img/e8f5da57a943ddf2.webp","assets/img/ec11010a04dbf78c.jpg","assets/img/f2091d8c26fd74c4.jpg","assets/img/f43fcc184c927448.jpg","assets/img/f7a426bf0ff0d517.jpg","assets/img/f811b0d6bb44aa46.jpg","assets/img/f847628bbf8cdb9d.webp","assets/img/fb4dafe2b0ff4f8a.jpg","assets/img/fc5fc269e9f7ff4f.jpg","assets/img/fe2323c2902a3281.jpg","assets/img/ffa09c2b1b14d386.jpg","assets/img/ffc23fda93b34bc6.jpg"];

function isImg(url) {
  return url.origin === self.location.origin && url.pathname.indexOf('/assets/img/') !== -1;
}

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === SW_VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;              /* never touch writes        */
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (!isImg(url)) return;                       /* HTML/JS/CSS: untouched    */

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
