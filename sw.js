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
   (Funkloch, Anmeldeseite eines WLANs), bleibt die bisherige Fassung in Betrieb.

   Geprüft: Jede Datei muss Byte für Byte zu ihrer SHA-256-Summe in PRUEFSUMMEN
   passen (setzt ebenfalls stempeln.sh), sonst gilt der Download als gescheitert.
   Das fängt eine alte Kopie aus einem Zwischenspeicher unterwegs ab – etwa beim
   CDN von GitHub Pages direkt nach dem Hochladen – ebenso wie eine abgeschnittene
   Antwort. Mit denselben Summen prüft der Offline-Check der App den Speicher auf
   fehlende oder beschädigte Dateien; mit Netz repariert er sich dann selbst. */

var VERSION = "2026-09-15.178258fdc1";   // setzt Werkzeuge/stempeln.sh – nicht von Hand ändern
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

/* PRUEFSUMMEN:ANFANG – setzt Werkzeuge/stempeln.sh aus dem Dateiinhalt, nicht von Hand ändern */
var PRUEFSUMMEN = {
  "animation.js": "f0252f92a898406f8a7c28d18796a5a1b2135efb228de9af5d4abb2fb8904eda",
  "app.js": "b11cf0bf7a24d1fde36af5c72507c97a9073a8b60e6402fa2c90683d34fb4526",
  "data.js": "03e573bb869095691dab4fce238f82ff78a5076d437d3e035fef9b20963a7f7c",
  "daten/equipment.json": "40107b9036ec8a571e4462d0925b37618825ad38326f46387640b69ae473dc8b",
  "daten/uebungen-index.json": "c2779e6c0a30d5a5eecfd5a7a65dd1238bc42052b1352c03a618358b4b304ff7",
  "daten/uebungen/burpee-grundform.json": "38e717cafcfaf697bb070b3732d63262057c65d32f977ecbe4e88bfe7d3474eb",
  "daten/uebungen/graetschsitz-adduktoren-dehnung.json": "bcca2bd3017cdbad4f51f853e54a14af0db6321c434523d9c170ac3c9b9ade9f",
  "daten/uebungen/grundschritt-vor-zurueck.json": "600c3e15a30b31aed9691cb865e0b84828286761acc712bf38017964a1b0303e",
  "daten/uebungen/jab-am-sack.json": "3cfe82ce5f3ef5aa8205024591951a43403f19da2b526d0f7e5325944e25a056",
  "daten/uebungen/kettlebell-swing-beidarmig.json": "c11bb15570dffeb9f72ab822ea3214851ca233860ea42a51de5773003eae0320",
  "daten/uebungen/klimmzug-obergriff-power-tower.json": "c0cb8efcb6949f5cdd833aa97426f812bf83d66965078b050f1489bfe06fb644",
  "daten/uebungen/low-kick-am-sack.json": "0134e2bfaaabb946dc2f6c4e0f61524b033b117699de717ab6a2f4ce7a93fcad",
  "daten/uebungen/pallof-press-band-stehend.json": "ed6fa6fc3e81a1d9e0c1ff751b60b21622e29d677b92b8173a4328671a1d0f67",
  "daten/uebungen/seilspringen-grundsprung.json": "627c8b6a59797e4faa1a44bea243b522d47b69dd25137a8fa59d08ef3f237e48",
  "daten/uebungen/tennisball-wandwurf-reaktion.json": "8054e7f18f62d93ce44aaeabbebfe44d501b1f60e93b68863ad412a2419e61a9",
  "icons/apple-touch-icon.png": "a985047d4cb79466a661547912713f267a2ae21333776a1a5631bd1dd394db20",
  "icons/icon-192.png": "88156ee76031e7f8620e8b84c4ac9bb9d060810a490b76fd0601d3526c0e1a45",
  "icons/icon-512.png": "9fee9a440be5ad5b2d572fe1bc425c33bcc4fb0a0bec9af952f3c424a791f910",
  "icons/icon-maskable-512.png": "43d207fe336d1f35da1e6cb9ccba19a20d03058c61b4924bc6016dd05c085189",
  "icons/icon.svg": "7664dc89028ec6d116fd34cc6776ed5643f6f6f6ac5e7f95ff65158585a55776",
  "index.html": "ba01d0155b702306b66cfb5901a7be52ffaab8bfa712110fe2afaa152cb83af5",
  "manifest.webmanifest": "7315e7d16d8b5007d23aa27892a8e759721ef130adbecf58785e8a53c5a64db9",
  "styles.css": "8c860dc8a03529f03743855dee743f4ea215b99705e5741e1aaf4b8e7a312fc8"
};
/* PRUEFSUMMEN:ENDE */

var BASE = new URL("./", self.location).href;
var ASSET_URLS = ASSETS.map(function (u) { return new URL(u, self.location).href; });
var SHELL_URL = new URL("./index.html", self.location).href;

/* Schlüssel in PRUEFSUMMEN ist der Pfad im App-Ordner. Die Startadresse „./"
   liefert dieselben Bytes wie index.html. */
function sollSumme(url) {
  var pfad = url.indexOf(BASE) === 0 ? url.slice(BASE.length) : url;
  return PRUEFSUMMEN[pfad || "index.html"] || null;
}

function hexOf(buffer) {
  var bytes = new Uint8Array(buffer);
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
  return s;
}

/* Passt der Inhalt zur Prüfsumme? Ohne WebCrypto (nur sehr alte Browser) wird nicht
   geprüft – dort lieber offline bereitstellen als nie. Eine Datei ohne Summe gilt
   als falsch: Dann wurde nicht gestempelt, und das soll auffallen. */
function passt(url, buffer) {
  var soll = sollSumme(url);
  if (!soll) return Promise.resolve(false);
  if (!self.crypto || !self.crypto.subtle) return Promise.resolve(true);
  return self.crypto.subtle.digest("SHA-256", buffer).then(function (d) { return hexOf(d) === soll; });
}

/* Eine App-Datei frisch vom Server holen und prüfen. Nur echte, direkte Antworten
   dieser Seite zählen: Eine Umleitung (etwa auf die Anmeldeseite eines WLANs), ein
   Fehlerstatus oder ein Inhalt, der nicht zur Prüfsumme passt, darf nie als
   App-Datei im Speicher landen. „?v=VERSION" geht an Zwischenspeichern unterwegs
   vorbei, cache:"reload" am HTTP-Cache des Browsers. Gespeichert wird unter der
   Adresse ohne Anhängsel. */
function fetchAsset(url) {
  var frisch = url + (url.indexOf("?") === -1 ? "?" : "&") + "v=" + encodeURIComponent(VERSION);
  return fetch(new Request(frisch, { cache: "reload" })).then(function (res) {
    if (!res.ok || res.redirected || res.type !== "basic") {
      throw new Error("App-Datei nicht sauber geladen: " + url + " (" + res.status + ")");
    }
    var typ = res.headers.get("Content-Type");
    return res.arrayBuffer().then(function (buf) {
      return passt(url, buf).then(function (ok) {
        if (!ok) throw new Error("App-Datei passt nicht zur Prüfsumme: " + url);
        /* Nur den Inhaltstyp übernehmen: Längen- und Kodierungsangaben der Leitung
           gehören zu den übertragenen, nicht zu den gespeicherten Bytes. */
        var kopf = {};
        if (typ) kopf["Content-Type"] = typ;
        return new Response(buf, { status: 200, statusText: "OK", headers: kopf });
      });
    });
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

/* Erst ALLE Dateien laden und prüfen, dann schreiben – scheitert eine, bleibt der
   Cache unberührt. */
function precache() {
  return fetchAllLimited(ASSET_URLS, PRECACHE_PARALLEL).then(function (responses) {
    return caches.open(CACHE).then(function (c) {
      return Promise.all(responses.map(function (res, i) { return c.put(ASSET_URLS[i], res); }));
    });
  });
}

/* Offline-Check. Schnell: Liegt jede Datei im Speicher? Gründlich (tief): Passt ihr
   Inhalt noch zur Prüfsumme? Dafür wird jede Datei gelesen – auf dem Handy eine
   Sache von Zehntelsekunden. */
function pruefen(tief) {
  return caches.open(CACHE)
    .then(function (c) {
      return Promise.all(ASSET_URLS.map(function (u) {
        return c.match(u, { ignoreVary: true }).then(function (hit) {
          if (!hit) return "fehlt";
          if (!tief) return "da";
          return hit.arrayBuffer()
            .then(function (buf) { return passt(u, buf); })
            .then(function (ok) { return ok ? "da" : "defekt"; }, function () { return "defekt"; });
        });
      }));
    })
    .then(function (liste) {
      var erg = { fehlt: 0, defekt: 0, tief: !!tief };
      liste.forEach(function (z) {
        if (z === "fehlt") erg.fehlt++;
        else if (z === "defekt") erg.defekt++;
      });
      return erg;
    });
}

/* missing = fehlt + defekt: Unter diesem Namen kennt die App (auch eine ältere
   Fassung von app.js) die Zahl der Dateien, die offline nicht bereitstehen. */
function statusMessage(erg) {
  return {
    type: "status", version: VERSION, total: ASSET_URLS.length,
    missing: erg.fehlt + erg.defekt, fehlt: erg.fehlt, defekt: erg.defekt,
    tief: erg.tief, geprueft: Date.now()
  };
}

function melden(erg) {
  return self.clients.matchAll().then(function (list) {
    list.forEach(function (client) { client.postMessage(statusMessage(erg)); });
  });
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
      // ignoreVary: Einträge älterer Fassungen tragen noch „Vary: Accept-Encoding"
      // von GitHub Pages – der Treffer soll nicht an Kopfzeilen der Anfrage hängen.
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

/* Fehlende oder beschädigte Dateien neu einlagern – aber nur, wenn auf dem Server
   noch genau diese Fassung liegt. Ist dort schon eine neuere, landeten deren Dateien
   sonst unter dem alten Versionsnamen (und fielen ohnehin durch die Prüfsummen);
   stattdessen regulär aktualisieren: Der neue Worker lädt alles in seinen eigenen
   Cache und meldet sich über controllerchange. */
function repair() {
  var adresse = self.location.href + (self.location.href.indexOf("?") === -1 ? "?" : "&") +
    "stand=" + Date.now();
  return fetch(new Request(adresse, { cache: "reload" }))
    .then(function (res) {
      if (!res.ok) throw new Error("sw.js nicht erreichbar (" + res.status + ")");
      return res.text();
    })
    .then(function (text) {
      if (text.indexOf('var VERSION = "' + VERSION + '"') === -1) return self.registration.update();
      return precache()
        .then(function () { return pruefen(true); })
        .then(melden);
    });
}

var reparatur = null;   // höchstens eine Reparatur zur Zeit

function reparieren() {
  if (!reparatur) {
    reparatur = repair()
      .catch(function () { /* ohne Netz: beim nächsten Start erneut */ })
      .then(function () { reparatur = null; });
  }
  return reparatur;
}

/* Den gründlichen Check stößt schon der schnelle Status beim App-Start an, dann aber
   höchstens alle 10 Minuten (der Worker wird zwischendurch ohnehin oft beendet). */
var TIEF_ABSTAND_MS = 10 * 60000;
var letzteTiefe = 0;

/* Selbsttest für die Anzeige in der App.
   { type:"status" }            → sofort der schnelle Stand auf dem Port, danach bei
                                  Bedarf der gründliche als Nachricht an alle Fenster
   { type:"status", tief:true } → der gründliche Stand auf dem Port („Prüfen" in der App)
   Fehlt etwas oder ist etwas beschädigt, repariert der Worker gleich (mit Netz). */
self.addEventListener("message", function (e) {
  var d = e.data;
  var port = e.ports && e.ports[0];
  if (!d || d.type !== "status" || !port) return;

  var job;
  if (d.tief) {
    letzteTiefe = Date.now();
    job = pruefen(true).then(function (erg) {
      port.postMessage(statusMessage(erg));
      if (erg.fehlt || erg.defekt) return reparieren();
    });
  } else {
    job = pruefen(false).then(function (erg) {
      port.postMessage(statusMessage(erg));
      if (erg.fehlt) return reparieren();
      if (Date.now() - letzteTiefe < TIEF_ABSTAND_MS) return;
      letzteTiefe = Date.now();
      return pruefen(true).then(function (tief) {
        return melden(tief).then(function () {
          if (tief.defekt) return reparieren();
        });
      });
    });
  }
  if (e.waitUntil) e.waitUntil(job);
});
