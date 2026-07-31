/* Zyklus – Service Worker: App offline verfügbar halten.

   Strategie: Netz zuerst, Cache als Rückfall. Nur so bekommt das iPhone einen
   geänderten Trainingsplan überhaupt zu sehen – bei reinem cache-first bliebe
   der alte Plan hängen, bis man die Website-Daten löscht. Icons ändern sich nie
   und werden weiter aus dem Cache bedient. */
var CACHE = "zyklus-v2";
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

  // Alles andere: frische Fassung holen und den Cache mitziehen; offline der Cache.
  e.respondWith(
    fetch(e.request)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      })
      .catch(function () {
        return caches.match(e.request).then(function (hit) {
          return hit || caches.match("./index.html");
        });
      })
  );
});
