/* Zyklus – Service Worker: Die App liegt vollständig auf dem Gerät.

   Offline zuerst: Jeder Start kommt sofort aus dem Speicher des Handys – egal ob
   Netz da ist, schwach ist oder ganz fehlt. Das Netz wird nur für Updates
   gebraucht. (Die frühere Strategie „Netz zuerst" wartete bei schlechtem Empfang
   bis zu 3 s je Datei, bevor sie auf den Speicher auswich – im Gym stand die App
   dann weiß da.)

   Updates: Werkzeuge/stempeln.sh leitet VERSION aus dem Inhalt aller App-Dateien
   ab (der pre-commit-Hook in .githooks/ erledigt das beim Commit). Jede inhaltliche
   Änderung ergibt so eine neue sw.js. Der Browser installiert daraufhin den neuen
   Worker; der lädt ALLE Dateien in einen eigenen Cache und übernimmt erst, wenn
   jede Datei vollständig und echt angekommen ist. Bricht der Download ab
   (Funkloch, Anmeldeseite eines WLANs), bleibt die bisherige Fassung in Betrieb. */

var VERSION = "2026-09-15.3353f6f015";   // setzt Werkzeuge/stempeln.sh – nicht von Hand ändern
var PREFIX = "zyklus-";
var CACHE = PREFIX + VERSION;
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./animation.js",
  "./app.js",
  "./data.js",
  /* DATEN:ANFANG – erzeugt von scripts/split-uebungen.mjs */
  "./daten/equipment.json",
  "./daten/uebungen-index.json",
  "./daten/uebungen/burpee-grundform.json",
  "./daten/uebungen/graetschsitz-adduktoren-dehnung.json",
  "./daten/uebungen/grundschritt-vor-zurueck.json",
  "./daten/uebungen/jab-am-sack.json",
  "./daten/uebungen/kettlebell-swing-beidarmig.json",
  "./daten/uebungen/klimmzug-obergriff-power-tower.json",
  "./daten/uebungen/low-kick-am-sack.json",
  "./daten/uebungen/pallof-press-band-stehend.json",
  "./daten/uebungen/seilspringen-grundsprung.json",
  "./daten/uebungen/tennisball-wandwurf-reaktion.json",
  /* DATEN:ENDE */
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

var ASSET_URLS = ASSETS.map(function (u) { return new URL(u, self.location).href; });
var SHELL_URL = new URL("./index.html", self.location).href;

/* Eine App-Datei frisch vom Server holen. Nur echte, direkte Antworten dieser
   Seite zählen: Eine Umleitung (etwa auf die Anmeldeseite eines WLANs) oder ein
   Fehlerstatus darf nie als App-Datei im Speicher landen. */
function fetchAsset(url) {
  // cache:"reload" umgeht den HTTP-Cache, sonst landen womöglich alte Bytes im neuen Cache.
  return fetch(new Request(url, { cache: "reload" })).then(function (res) {
    if (!res.ok || res.redirected || res.type !== "basic") {
      throw new Error("App-Datei nicht sauber geladen: " + url + " (" + res.status + ")");
    }
    return res;
  });
}

/* Höchstens 6 Downloads gleichzeitig. Mit dem Übungskatalog stehen rund 90 Dateien
   in ASSETS. Alle auf einmal anzustoßen hielte auf schwachen Handys im Funkloch viele
   offene Antworten gleichzeitig im Speicher, und jede wartende Anfrage liefe schon
   gegen ihre Zeitgrenze. GitHub Pages spricht zwar HTTP/2 (mehr parallel wäre dort
   etwas schneller), aber ein Update darf lieber etwas länger dauern als abbrechen.
   Nach dem ersten Fehler startet die Warteschlange keine weiteren Downloads. */
var PRECACHE_PARALLEL = 6;

function fetchAllLimited(urls, limit) {
  return new Promise(function (resolve, reject) {
    var responses = new Array(urls.length);
    var next = 0;
    var done = 0;
    var failed = false;
    if (!urls.length) { resolve(responses); return; }

    function launch() {
      if (failed || next >= urls.length) return;
      var i = next++;
      // In ein Promise gehüllt: Auch ein sofort geworfener Fehler landet im reject unten.
      new Promise(function (r) { r(fetchAsset(urls[i])); }).then(function (res) {
        if (failed) return;
        responses[i] = res;
        done++;
        if (done === urls.length) resolve(responses);
        else launch();
      }, function (err) {
        if (failed) return;
        failed = true;
        reject(err);
      });
    }

    for (var k = 0; k < Math.min(limit, urls.length); k++) launch();
  });
}

/* Erst ALLE Dateien laden, dann schreiben – scheitert eine, bleibt der Cache unberührt. */
function precache() {
  return fetchAllLimited(ASSET_URLS, PRECACHE_PARALLEL).then(function (responses) {
    return caches.open(CACHE).then(function (c) {
      return Promise.all(responses.map(function (res, i) { return c.put(ASSET_URLS[i], res); }));
    });
  });
}

function missingCount() {
  return caches.open(CACHE)
    .then(function (c) {
      return Promise.all(ASSET_URLS.map(function (u) { return c.match(u, { ignoreVary: true }); }));
    })
    .then(function (hits) { return hits.filter(function (hit) { return !hit; }).length; });
}

function statusMessage(missing) {
  return { type: "status", version: VERSION, missing: missing, total: ASSET_URLS.length };
}

self.addEventListener("install", function (e) {
  e.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        /* Nur eigene Altstände räumen: Alle Apps unter w2nmh9s45b-bot.github.io
           teilen sich im Browser denselben Cache-Speicher. */
        return Promise.all(keys.map(function (k) {
          return k.indexOf(PREFIX) === 0 && k !== CACHE ? caches.delete(k) : null;
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Schlüssel ohne ?…/#…: Start-URLs mit Anhängseln treffen trotzdem die
     gespeicherte Datei. Alles, was keine App-Datei und kein Seitenaufruf ist,
     geht unverändert ans Netz. */
  var key = url.origin + url.pathname;
  var known = ASSET_URLS.indexOf(key) !== -1;
  var navigate = req.mode === "navigate";
  if (!known && !navigate) return;

  e.respondWith(
    caches.open(CACHE).then(function (c) {
      // ignoreVary: GitHub Pages sendet „Vary: Accept-Encoding" – der Treffer soll
      // nicht an Kopfzeilen der Anfrage hängen.
      return (known ? c.match(key, { ignoreVary: true }) : Promise.resolve(null))
        .then(function (hit) {
          if (hit) return hit;
          return fetch(req).catch(function (err) {
            if (!navigate) throw err;
            return c.match(SHELL_URL, { ignoreVary: true }).then(function (shell) {
              if (shell) return shell;
              throw err;
            });
          });
        });
    })
  );
});

/* Fehlende Dateien neu einlagern – aber nur, wenn auf dem Server noch genau diese
   Fassung liegt. Ist dort schon eine neuere, landeten deren Dateien sonst unter dem
   alten Versionsnamen; stattdessen regulär aktualisieren: Der neue Worker lädt
   alles in seinen eigenen Cache und meldet sich über controllerchange. */
function repair() {
  return fetch(new Request(self.location.href, { cache: "reload" }))
    .then(function (res) {
      if (!res.ok) throw new Error("sw.js nicht erreichbar (" + res.status + ")");
      return res.text();
    })
    .then(function (text) {
      if (text.indexOf('var VERSION = "' + VERSION + '"') === -1) return self.registration.update();
      return precache()
        .then(missingCount)
        .then(function (left) {
          return self.clients.matchAll().then(function (list) {
            list.forEach(function (client) { client.postMessage(statusMessage(left)); });
          });
        });
    });
}

/* Selbsttest für die Anzeige in der App: Welche Fassung läuft, liegt jede Datei
   im Speicher? Fehlt etwas (Speicher von außen geräumt), gleich reparieren. */
self.addEventListener("message", function (e) {
  var d = e.data;
  var port = e.ports && e.ports[0];
  if (!d || d.type !== "status" || !port) return;

  var job = missingCount().then(function (missing) {
    port.postMessage(statusMessage(missing));
    if (!missing) return;
    return repair().catch(function () { /* ohne Netz: beim nächsten Start erneut */ });
  });
  if (e.waitUntil) e.waitUntil(job);
});
