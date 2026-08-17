/* Zyklus – Service Worker: App offline verfügbar halten.

   Strategie: Netz zuerst, Cache als Rückfall. Nur so bekommt das iPhone einen
   geänderten Trainingsplan überhaupt zu sehen – bei reinem cache-first bliebe
   der alte Plan hängen, bis man die Website-Daten löscht. Icons ändern sich nie
   und werden weiter aus dem Cache bedient. */
var CACHE = "zyklus-v4";
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      // cache:"reload" umgeht den HTTP-Cache, sonst landen beim Neuaufbau
      // womöglich wieder die alten Bytes im neuen Cache.
      .then(function (c) {
        return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: "reload" }); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;

  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // Icons: unveränderlich, direkt aus dem Cache.
  if (url.pathname.indexOf("/icons/") !== -1) {
    e.respondWith(
      caches.match(e.request).then(function (hit) { return hit || fetch(e.request); })
    );
    return;
  }

  // Alles andere: frische Fassung holen, aber nach 3 s auf den Cache ausweichen.
  // Bei sehr langsamem Netz ("Lie-Fi") hängt fetch, statt zu scheitern – ohne
  // Timeout stünde die App trotz vollem Cache minutenlang weiß da. Die späte
  // Netzantwort zieht den Cache auch dann noch mit, wenn er schon geliefert hat.
  e.respondWith(new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () {
      caches.match(e.request).then(function (hit) {
        if (!settled && hit) { settled = true; resolve(hit); }
        // kein Cache-Treffer: weiter auf das Netz warten
      });
    }, 3000);

    fetch(e.request)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          var put = caches.open(CACHE).then(function (c) { return c.put(e.request, copy); });
          // Worker am Leben halten, bis der Cache geschrieben ist – iOS beendet
          // ihn sonst direkt nach respondWith, und der Cache behielte alte Bytes.
          try { e.waitUntil(put); } catch (err) { /* Event ggf. schon abgeschlossen */ }
        }
        if (!settled) { settled = true; clearTimeout(timer); resolve(res); }
      })
      .catch(function () {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        caches.match(e.request).then(function (hit) {
          resolve(hit || caches.match("./index.html"));
        });
      });
  }));
});
