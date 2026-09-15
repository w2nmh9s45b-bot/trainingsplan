// Zyklus – Offline-Probe: prüft im echten Browser, dass die App nach einmaligem Laden
// ganz ohne Server und ohne Netz läuft – mit allen Funktionen – und dass die Absicherung
// greift (Prüfsummen, Offline-Check, Selbstreparatur, Speicherfehler, Sicherungs-Erinnerung).
//
//   node Werkzeuge/offlineprobe.mjs
//
// Braucht Google Chrome und das npm-Paket playwright-core (ohne eigenen Browser-Download).
// Gesucht wird es neben ~/Repos/orgahub-desktop/package.json, sonst:
//   ZYKLUS_PLAYWRIGHT=/pfad/zu/einer/package.json   (deren node_modules enthält playwright-core)
//   ZYKLUS_PROBE_AUS=/ordner                         Bildschirmfotos und Sicherungsdatei dorthin
//   ZYKLUS_PROBE_VORFASSUNG=<git-Rev>                Vorfassung fürs Update (Vorgabe origin/main)
//
// Ablauf: eigener kleiner Webserver → App mit Netz einrichten → Server AUS und Browser
// offline → Start, Abhaken, Neustart, Anleitung, Kalender, Bearbeiten, Sicherung speichern
// und laden → Speicher beschädigen → Netz wieder da: Selbstreparatur → eine veraltete
// Datei vom Server darf nie in den Offline-Speicher → Speicher voll → Erinnerung →
// Update von der zuletzt veröffentlichten Fassung samt Haken und Start ohne Netz.
// Chrome ist nicht Safari: Das iPhone selbst prüft der Flugmodus-Test in der README.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUS = process.env.ZYKLUS_PROBE_AUS || fs.mkdtempSync(path.join(os.tmpdir(), "zyklus-offlineprobe-"));
const PW_PAKET = process.env.ZYKLUS_PLAYWRIGHT || path.join(os.homedir(), "Repos/orgahub-desktop/package.json");
fs.mkdirSync(AUS, { recursive: true });

let chromium;
try {
  chromium = createRequire(PW_PAKET)("playwright-core").chromium;
} catch (e) {
  console.error("offlineprobe: playwright-core nicht gefunden (gesucht neben " + PW_PAKET + ").");
  console.error("→ ZYKLUS_PLAYWRIGHT=/pfad/zu/package.json setzen, deren node_modules playwright-core enthält.");
  process.exit(2);
}

// Die Probe prüft die Dateien, wie sie veröffentlicht würden – also gestempelt.
const stempel = spawnSync("bash", ["Werkzeuge/stempeln.sh", "--pruefen"], { cwd: WURZEL, encoding: "utf8" });
if (stempel.status !== 0) {
  console.error("offlineprobe: " + (stempel.stderr || stempel.stdout).trim());
  console.error("→ erst bash Werkzeuge/stempeln.sh");
  process.exit(2);
}

const SW_TEXT = fs.readFileSync(path.join(WURZEL, "sw.js"), "utf8");
const VERSION = /^var VERSION = "([^"]+)"/m.exec(SW_TEXT)[1];
const CACHE = "zyklus-" + VERSION;
const ASSETS = (() => {
  const a = SW_TEXT.indexOf("var ASSETS = [");
  return new Function(SW_TEXT.slice(a, SW_TEXT.indexOf("];", a) + 2) + "\nreturn ASSETS;")();
})();
const TAG = 86400000;

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const dateiVon = (asset) => path.join(WURZEL, asset === "./" ? "index.html" : asset.replace(/^\.\//, ""));
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Ergebnisse ── */

const ergebnisse = [];
function pruefe(name, ok, detail) {
  ergebnisse.push({ name, ok: !!ok, detail });
  const d = detail === undefined ? "" : " – " + (typeof detail === "string" ? detail : JSON.stringify(detail));
  console.log((ok ? "  ✓ " : "  ✗ ") + name + (ok ? "" : d));
}

/* ── Kleiner Webserver: abschaltbar (Offline) und mit untergeschobenen Dateien (alte Kopie) ── */

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png"
};

function webserver(wurzel) {
  // wurzel ist umstellbar: Szenario 7 liefert erst die Vorfassung aus, dann die neue.
  const s = { wurzel, port: 0, untergeschoben: new Map(), server: null };
  function antwort(req, res) {
    let pfad = decodeURIComponent(new URL(req.url, "http://probe").pathname);
    if (pfad.endsWith("/")) pfad += "index.html";
    const rel = pfad.replace(/^\/+/, "");
    const datei = path.join(s.wurzel, rel);
    if (!datei.startsWith(s.wurzel + path.sep)) { res.writeHead(403); res.end(); return; }
    let inhalt = s.untergeschoben.get(rel);
    if (!inhalt) {
      try { inhalt = fs.readFileSync(datei); } catch (e) { res.writeHead(404); res.end("nicht gefunden"); return; }
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(datei)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(inhalt);
  }
  s.start = () => new Promise((r) => {
    s.server = http.createServer(antwort);
    s.server.listen(s.port, "127.0.0.1", () => { s.port = s.server.address().port; r(); });
  });
  // closeAllConnections: sonst liefert eine offene Keep-alive-Verbindung weiter aus.
  s.stop = () => new Promise((r) => { s.server.closeAllConnections(); s.server.close(() => r()); });
  return s;
}

/* ── Browser-Helfer ── */

const browser = await chromium.launch({ channel: "chrome", headless: true });
const kontexte = [];

async function kontext() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const page = await ctx.newPage();
  const fehler = [];
  const gescheitert = [];
  page.on("pageerror", (e) => fehler.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") fehler.push("console: " + m.text()); });
  page.on("requestfailed", (r) => gescheitert.push(r.url()));
  kontexte.push(ctx);
  return { ctx, page, fehler, gescheitert };
}

async function bis(page, fn, arg, ms = 15000) {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 200 }); return true; } catch (e) { return false; }
}

/* Wie bis(), aber für Bedingungen, die ein Promise liefern (Cache-Namen, Registrierung). */
async function bisAsync(page, fn, arg, ms = 20000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    try { if (await page.evaluate(fn, arg)) return true; } catch (e) { /* Seite lädt gerade neu */ }
    await warte(250);
  }
  return false;
}

/* Eine frühere Fassung aus git in einen Temp-Ordner legen (für das Update-Szenario). */
function vorfassungAuspacken(rev) {
  const ziel = fs.mkdtempSync(path.join(os.tmpdir(), "zyklus-vorfassung-"));
  const r = spawnSync("bash", ["-c", 'git -C "$1" archive --format=tar "$2" | tar -x -C "$3"', "_", WURZEL, rev, ziel],
    { encoding: "utf8" });
  return r.status === 0 && fs.existsSync(path.join(ziel, "sw.js")) ? ziel : null;
}

const gestartet = (page) => bis(page, () => document.querySelectorAll(".dayfoot .acts button").length > 0);
const zustand = (page) => page.evaluate(() => window.ZyklusOffline && window.ZyklusOffline.zustand());

function hakenZahl(page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("zyklus.v2") || "{}");
    return Object.values(s.days || {}).reduce((n, d) => n + Object.keys((d && d.checks) || {}).length, 0);
  });
}

/* Heute kann Ruhetag sein – dann den ersten Tag mit Übungen im Wochenstreifen wählen. */
function tagMitUebungen(page) {
  return page.evaluate(async () => {
    if (document.querySelector("#main .row")) return true;
    for (const chip of document.querySelectorAll("#strip .chip")) {
      chip.click();
      await new Promise((r) => setTimeout(r, 200));
      if (document.querySelector("#main .row")) return true;
    }
    return false;
  });
}

function knopf(page, text) {
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll(".dayfoot .acts button")].find((x) => x.textContent.trim() === t);
    if (b) b.click();
    return !!b;
  }, text);
}

async function speicherSummen(page, base) {
  return page.evaluate(async ({ name, base, assets }) => {
    const c = await caches.open(name);
    const aus = {};
    for (const a of assets) {
      const r = await c.match(new URL(a, base).href, { ignoreVary: true });
      if (!r) { aus[a] = null; continue; }
      const d = await crypto.subtle.digest("SHA-256", await r.arrayBuffer());
      aus[a] = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    return aus;
  }, { name: CACHE, base, assets: ASSETS });
}

async function statusFoto(page, name) {
  await page.evaluate(() => { if (document.getElementById("sheet-cycle").hidden) document.getElementById("badge-week").click(); });
  await warte(700);
  await page.evaluate(() => document.querySelector(".app-box").scrollIntoView({ block: "start" }));
  await warte(300);
  await (await page.$(".app-box")).screenshot({ path: path.join(AUS, name) });
}

async function sheetZu(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".sheet:not([hidden]) .sheet-x").forEach((x) => x.click());
  });
  await warte(300);
}

/* ═════════════════════════════════════════════════════════════════════════════ */

const server = webserver(WURZEL);
await server.start();
const BASE = `http://127.0.0.1:${server.port}/`;
console.log("Zyklus-Offlineprobe · Version " + VERSION + " · " + ASSETS.length + " Offline-Dateien");

try {
  /* 1 · Einrichtung mit Netz */
  console.log("\n1 · Einrichtung mit Netz");
  const A = await kontext();
  await A.page.goto(BASE);
  pruefe("App startet mit Netz", await gestartet(A.page));
  pruefe("Service Worker übernimmt", await bis(A.page, () => !!navigator.serviceWorker.controller, null, 20000));
  pruefe("Worker meldet alle Dateien im Speicher",
    await bis(A.page, () => { const z = window.ZyklusOffline.zustand(); return !!(z.info && z.info.missing === 0); }, null, 20000),
    await zustand(A.page));
  const namen = await A.page.evaluate(() => caches.keys());
  pruefe("Offline-Speicher " + CACHE + " angelegt", namen.includes(CACHE), namen);
  let summen = await speicherSummen(A.page, BASE);
  let abweichend = ASSETS.filter((a) => summen[a] !== sha256(fs.readFileSync(dateiVon(a))));
  pruefe("Jede der " + ASSETS.length + " gespeicherten Dateien gleicht Byte für Byte der Datei im Ordner", !abweichend.length, abweichend);
  const tief = await A.page.evaluate(() => window.ZyklusOffline.pruefen());
  pruefe("Offline-Check (gründlich): alles unversehrt", tief && tief.tief && tief.missing === 0, tief);

  /* 2 · Ohne Server und ohne Netz */
  console.log("\n2 · Ohne Server und ohne Netz");
  await server.stop();
  await A.ctx.setOffline(true);
  A.gescheitert.length = 0;
  await A.page.reload();
  pruefe("App startet ohne Netz", await gestartet(A.page));
  pruefe("Keine App-Datei musste ans Netz", !A.gescheitert.some((u) => u.startsWith(BASE)), A.gescheitert);

  const tab = await A.ctx.newPage();
  await tab.goto(BASE + "index.html?quelle=homescreen").catch(() => null);
  pruefe("Neues Fenster mit Start-Adresse öffnet ohne Netz", await gestartet(tab));
  await tab.close();

  pruefe("Ein Tag mit Übungen ist erreichbar", await tagMitUebungen(A.page));
  const h0 = await hakenZahl(A.page);
  await A.page.evaluate(() => [...document.querySelectorAll("#main .row")].find((r) => !r.classList.contains("done")).click());
  await warte(700);
  const h1 = await hakenZahl(A.page);
  pruefe("Übung abhaken ohne Netz", h1 === h0 + 1, { vorher: h0, nachher: h1 });
  await A.page.reload();
  await gestartet(A.page);
  pruefe("Haken übersteht den Neustart ohne Netz", (await hakenZahl(A.page)) === h1);

  const katalog = await A.page.evaluate(async () => {
    window.ZyklusKatalog.oeffnen("jab-am-sack");
    for (let i = 0; i < 60 && !document.querySelector(".det-canvas"); i++) await new Promise((r) => setTimeout(r, 100));
    const offen = !!document.querySelector(".det-canvas") && !!window.ZyklusKatalog.detailSteuerung();
    const daten = await fetch("daten/uebungen/burpee-grundform.json").then((r) => r.json()).then((j) => !!j.animation, () => false);
    return { offen, daten };
  });
  await warte(600);
  await (await A.page.$(".sheet--detail .sheet-panel")).screenshot({ path: path.join(AUS, "anleitung-ohne-netz.png") });
  await sheetZu(A.page);
  pruefe("Anleitung mit Animation öffnet ohne Netz", katalog.offen);
  pruefe("Katalogdaten kommen ohne Netz aus dem Speicher", katalog.daten);

  await knopf(A.page, "Kalender");
  pruefe("Kalender öffnet ohne Netz", await bis(A.page, () =>
    !document.getElementById("sheet-cal").hidden && document.querySelectorAll("#cal-grid > *").length > 0, null, 5000));
  await sheetZu(A.page);

  await knopf(A.page, "Bearbeiten");
  const bearbeiten = await bis(A.page, () => document.body.classList.contains("editing"), null, 5000);
  await knopf(A.page, "Fertig");
  pruefe("Plan bearbeiten ohne Netz", bearbeiten && await bis(A.page, () => !document.body.classList.contains("editing"), null, 5000));

  await A.page.evaluate(() => document.getElementById("badge-week").click());
  await warte(500);
  const [download] = await Promise.all([
    A.page.waitForEvent("download", { timeout: 10000 }),
    A.page.evaluate(() => document.getElementById("app-export").click())
  ]);
  const sicherungsDatei = path.join(AUS, "sicherung.json");
  await download.saveAs(sicherungsDatei);
  const sicherung = JSON.parse(fs.readFileSync(sicherungsDatei, "utf8"));
  pruefe("Sicherung speichern ohne Netz", sicherung.app === "zyklus" && !!(sicherung.data && sicherung.data.plan),
    download.suggestedFilename());
  const st = (await zustand(A.page)).sicherung;
  pruefe("Sicherung wird vermerkt (Erinnerung beginnt neu)", st.zuletzt > 0 && !st.neues && !st.faellig, st);

  await A.page.setInputFiles("#app-file", sicherungsDatei);
  pruefe("Sicherung laden: Rückfrage erscheint", await bis(A.page, () => !document.getElementById("app-confirm").hidden, null, 5000));
  await A.page.evaluate(() => [...document.querySelectorAll("#app-confirm button")].find((b) => b.textContent.trim() === "Übernehmen").click());
  pruefe("Sicherung laden ohne Netz", await bis(A.page, () =>
    [...document.querySelectorAll(".toast")].some((t) => /Sicherung übernommen/.test(t.textContent)), null, 5000));
  pruefe("Nach dem Laden stimmen die Haken", (await hakenZahl(A.page)) === h1);

  /* Chromium-Eigenheit: Nach einem Neuladen, das der Service Worker beantwortet, meldet
     navigator.onLine trotz nachgebildetem Offline wieder true (im Flugmodus auf dem
     iPhone nicht). Einmal neu setzen – das löst auch das offline-Ereignis aus. */
  await A.ctx.setOffline(false);
  await A.ctx.setOffline(true);
  pruefe("Browser meldet: kein Netz", (await A.page.evaluate(() => navigator.onLine)) === false);
  await A.page.evaluate(() => window.ZyklusOffline.pruefen());
  await statusFoto(A.page, "status-ohne-netz.png");
  const zOffline = await zustand(A.page);
  pruefe("Offline-Check ohne Netz: alles unversehrt", zOffline.info && zOffline.info.tief && zOffline.info.missing === 0, zOffline.info);
  const zeile = await A.page.evaluate(() => document.querySelector("#app-status .app-row").textContent);
  pruefe("Anzeige nennt geprüfte Dateien und fehlendes Netz", /geprüft und unversehrt/.test(zeile) && /gerade ohne Internet/.test(zeile), zeile);
  await sheetZu(A.page);

  const schaden = await A.page.evaluate(async ({ name, base }) => {
    const c = await caches.open(name);
    await c.put(base + "styles.css", new Response("/* kaputt */", { headers: { "Content-Type": "text/css" } }));
    await c.delete(base + "data.js");
    return window.ZyklusOffline.pruefen();
  }, { name: CACHE, base: BASE });
  pruefe("Offline-Check erkennt beschädigte und fehlende Datei", schaden && schaden.defekt === 1 && schaden.fehlt === 1, schaden);
  pruefe("Wochen-Badge zeigt den Hinweis", /badge--hinweis/.test(await A.page.evaluate(() => document.getElementById("badge-week").className)));
  await statusFoto(A.page, "status-beschaedigt.png");
  await sheetZu(A.page);

  /* 3 · Netz wieder da */
  console.log("\n3 · Netz wieder da: Selbstreparatur");
  await server.start();
  await A.ctx.setOffline(false);
  await A.page.evaluate(() => window.ZyklusOffline.pruefen());
  pruefe("Speicher repariert sich mit Netz selbst", await bis(A.page, () => {
    const i = window.ZyklusOffline.zustand().info;
    return !!(i && i.tief && i.missing === 0);
  }, null, 30000), await zustand(A.page));
  summen = await speicherSummen(A.page, BASE);
  abweichend = ASSETS.filter((a) => summen[a] !== sha256(fs.readFileSync(dateiVon(a))));
  pruefe("Nach der Reparatur wieder alle Dateien Byte für Byte richtig", !abweichend.length, abweichend);
  pruefe("Wochen-Badge ohne Hinweis", !/badge--/.test(await A.page.evaluate(() => document.getElementById("badge-week").className)));

  /* 4 · Veraltete Datei vom Server */
  console.log("\n4 · Veraltete Datei vom Server (Zwischenspeicher direkt nach dem Hochladen)");
  const B = await kontext();
  server.untergeschoben.set("app.js", Buffer.concat([
    fs.readFileSync(path.join(WURZEL, "app.js")), Buffer.from("\n// alte Kopie aus einem Zwischenspeicher\n")
  ]));
  await B.page.goto(BASE);
  await gestartet(B.page);
  await warte(4000);
  const cdn = await B.page.evaluate(async (name) => {
    const reg = await navigator.serviceWorker.getRegistration();
    return { aktiv: !!(reg && reg.active), kontrolliert: !!navigator.serviceWorker.controller, speicher: (await caches.keys()).includes(name) };
  }, CACHE);
  pruefe("Worker nimmt die falsche Datei nicht in den Offline-Speicher", !cdn.aktiv && !cdn.kontrolliert && !cdn.speicher, cdn);
  server.untergeschoben.clear();
  await B.page.reload();
  pruefe("Mit den richtigen Dateien klappt die Einrichtung danach", await bis(B.page, () => !!navigator.serviceWorker.controller, null, 20000));

  /* 5 · Speicher voll */
  console.log("\n5 · Speicher voll");
  await tagMitUebungen(A.page);
  await A.page.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "zyklus.v2") throw new DOMException("Speicher voll", "QuotaExceededError");
      return window.__setItem.call(this, k, v);
    };
    document.querySelector("#main .row").click();
  });
  await warte(700);
  const voll = await A.page.evaluate(() => ({
    pille: !!document.querySelector(".toast--warn"),
    badge: document.getElementById("badge-week").className,
    fehler: window.ZyklusOffline.zustand().speicherFehler
  }));
  pruefe("Warnung erscheint sofort (Pille, roter Punkt)", voll.pille && /badge--fehler/.test(voll.badge) && voll.fehler, voll);
  await A.page.screenshot({ path: path.join(AUS, "warnung-speicher-voll.png") });
  await A.page.evaluate(() => {
    Storage.prototype.setItem = window.__setItem;
    document.querySelector("#main .row").click();
  });
  await warte(900);
  const wieder = await A.page.evaluate(() => ({
    pille: !!document.querySelector(".toast--warn:not(.out)"),
    badge: document.getElementById("badge-week").className,
    fehler: window.ZyklusOffline.zustand().speicherFehler
  }));
  pruefe("Warnung verschwindet, sobald Speichern wieder klappt", !wieder.pille && !/badge--fehler/.test(wieder.badge) && !wieder.fehler, wieder);

  /* 6 · Sicherungs-Erinnerung */
  console.log("\n6 · Sicherungs-Erinnerung");
  await A.ctx.setOffline(true);   // die Erinnerung braucht kein Netz
  await A.page.evaluate((tag) => {
    localStorage.setItem("zyklus.v2.seit", String(Date.now() - 10 * tag));
    localStorage.setItem("zyklus.v2.geaendert", String(Date.now() - 60000));
    localStorage.removeItem("zyklus.v2.sicherung");
    localStorage.removeItem("zyklus.v2.sicherung-spaeter");
  }, TAG);
  await A.page.reload();
  await gestartet(A.page);
  const karte = await bis(A.page, () => !!document.getElementById("merk-karte"), null, 5000);
  pruefe("Erinnerung erscheint, wenn eine Sicherung fällig ist",
    karte && /badge--hinweis/.test(await A.page.evaluate(() => document.getElementById("badge-week").className)));
  await A.page.evaluate(() => window.scrollTo(0, 0));   // Neuladen stellt die alte Scrollposition wieder her
  await warte(1300);
  await A.page.screenshot({ path: path.join(AUS, "erinnerung.png") });
  await A.page.evaluate(() => [...document.querySelectorAll("#merk-karte button")].find((b) => b.textContent.trim() === "Später").click());
  await warte(600);
  const spaeter = await A.page.evaluate(() => ({
    karte: !!document.getElementById("merk-karte"),
    ruhtTage: (Number(localStorage.getItem("zyklus.v2.sicherung-spaeter")) - Date.now()) / 86400000,
    badge: document.getElementById("badge-week").className
  }));
  pruefe("„Später“ lässt sie drei Tage ruhen", !spaeter.karte && spaeter.ruhtTage > 2.9 && spaeter.ruhtTage <= 3 && !/badge--/.test(spaeter.badge), spaeter);

  await A.page.evaluate(() => localStorage.setItem("zyklus.v2.sicherung-spaeter", String(Date.now() - 1000)));
  await A.page.reload();
  await gestartet(A.page);
  await bis(A.page, () => !!document.getElementById("merk-karte"), null, 5000);
  const [download2] = await Promise.all([
    A.page.waitForEvent("download", { timeout: 10000 }),
    A.page.evaluate(() => [...document.querySelectorAll("#merk-karte button")].find((b) => /Jetzt sichern/.test(b.textContent)).click())
  ]);
  await warte(700);
  const danach = await A.page.evaluate(() => ({
    karte: !!document.getElementById("merk-karte"),
    sicherung: window.ZyklusOffline.zustand().sicherung
  }));
  pruefe("„Jetzt sichern“ legt die Datei an und nimmt die Erinnerung weg",
    !!download2 && !danach.karte && danach.sicherung.zuletzt > 0 && !danach.sicherung.faellig, danach);

  /* Skriptfehler: Netzfehler bei Update-Versuchen ohne Netz sind erwartbar, alles andere nicht. */
  const unerwartet = A.fehler.filter((f) => !/net::ERR_|Failed to fetch|fetching the script|Failed to load resource/i.test(f));
  pruefe("Keine unerwarteten Skriptfehler", !unerwartet.length, unerwartet);

  /* 7 · Update von der Vorfassung – genau der Weg, den ein Handy mit installierter App geht:
     alte Fassung eingerichtet und benutzt, dann liegt die neue auf dem Server. Vorfassung
     ist, was zuletzt online war (origin/main); nach dem Veröffentlichen entfällt der Schritt. */
  const vorRev = process.env.ZYKLUS_PROBE_VORFASSUNG || "origin/main";
  const altOrdner = vorfassungAuspacken(vorRev);
  const altSw = altOrdner ? fs.readFileSync(path.join(altOrdner, "sw.js"), "utf8") : "";
  const altVersion = /^var VERSION = "([^"]+)"/m.exec(altSw);
  const altCacheName = /^var CACHE = "([^"]+)"/m.exec(altSw);   // Fassungen vor dem Versionsstempel
  const altCache = altVersion ? "zyklus-" + altVersion[1] : altCacheName ? altCacheName[1] : null;
  if (!altCache || altCache === CACHE) {
    console.log("\n7 · Update von der Vorfassung – übersprungen (" + vorRev + ": keine andere Fassung)");
  } else {
    console.log("\n7 · Update von der Vorfassung " + vorRev + " (" + altCache + ")");
    server.wurzel = altOrdner;
    const C = await kontext();
    await C.page.goto(BASE);
    await gestartet(C.page);
    pruefe("Vorfassung eingerichtet (alter Worker, alter Offline-Speicher)", await bisAsync(C.page,
      (alt) => !!navigator.serviceWorker.controller && caches.keys().then((k) => k.includes(alt)), altCache, 20000));
    await tagMitUebungen(C.page);
    await C.page.evaluate(() => document.querySelector("#main .row").click());
    await warte(700);
    const hAlt = await hakenZahl(C.page);
    pruefe("In der Vorfassung abgehakt", hAlt > 0, hAlt);

    server.wurzel = WURZEL;
    await C.page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
    pruefe("Update übernimmt: neuer Offline-Speicher da, alter geräumt", await bisAsync(C.page,
      ({ neu, alt }) => caches.keys().then((k) => k.includes(neu) && !k.includes(alt)), { neu: CACHE, alt: altCache }, 30000),
      await C.page.evaluate(() => caches.keys()));
    await C.page.reload();
    await gestartet(C.page);
    pruefe("Nach dem Neustart läuft die neue Fassung", await bisAsync(C.page,
      (v) => !!(window.ZyklusOffline && window.ZyklusOffline.zustand().version === v), VERSION, 10000));
    pruefe("Haken aus der Vorfassung sind erhalten", (await hakenZahl(C.page)) === hAlt);

    await server.stop();
    await C.ctx.setOffline(true);
    await C.page.reload();
    pruefe("Nach dem Update startet die App ohne Netz", await gestartet(C.page));
    const tiefC = await C.page.evaluate(() => window.ZyklusOffline.pruefen());
    pruefe("Offline-Check nach dem Update: alles unversehrt", tiefC && tiefC.tief && tiefC.missing === 0, tiefC);
    fs.rmSync(altOrdner, { recursive: true, force: true });
  }
} catch (e) {
  pruefe("Probe lief ohne Absturz durch", false, String((e && e.stack) || e).split("\n").slice(0, 4).join(" | "));
} finally {
  for (const ctx of kontexte) await ctx.close().catch(() => {});
  await browser.close().catch(() => {});
  await server.stop().catch(() => {});
}

const fehlgeschlagen = ergebnisse.filter((e) => !e.ok);
fs.writeFileSync(path.join(AUS, "bericht.json"), JSON.stringify({ version: VERSION, ergebnisse }, null, 2));
console.log("\n" + (fehlgeschlagen.length ? "✗ " + fehlgeschlagen.length + " von " : "✓ alle ") +
  ergebnisse.length + " Prüfungen" + (fehlgeschlagen.length ? " fehlgeschlagen" : " bestanden") + " · Fotos und Bericht: " + AUS);
process.exit(fehlgeschlagen.length ? 1 : 0);
