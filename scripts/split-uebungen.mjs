// Zyklus – Übungskatalog aufteilen.
//
// Liest daten-import/uebungen.json (871 KB, Quelle) und daten-import/equipment.json und erzeugt:
//   daten/uebungen-index.json     je Übung nur die Felder für Archiv, Suche und Filter
//   daten/uebungen/<id>.json      vollständiger Datensatz, wird erst im Detail-Sheet geladen
//   daten/equipment.json          unverändert (byte-gleich) kopiert
// und trägt alle Datendateien zwischen den Markern DATEN:ANFANG/DATEN:ENDE in die
// ASSETS-Liste von sw.js ein – sonst fehlen sie offline.
//
// Korrekturen: daten-import/korrekturen.json wird vorher angewendet (siehe scripts/korrekturen.mjs);
// uebungen.json selbst bleibt wie geliefert.
//
// Vertikalschnitt: Existiert scripts/vertikalschnitt.json, entstehen Index und Einzeldateien
// NUR für die dort genannten ids (bis zur Abnahme). Fehlt die Datei, alle Übungen.
//
//   node scripts/split-uebungen.mjs        (üblich: npm run daten)
//
// Bewusst nur node:fs und node:path, keine Abhängigkeiten.
import fs from "node:fs";
import path from "node:path";
import { korrekturenLesen, korrekturenAnwenden } from "./korrekturen.mjs";

const WURZEL = path.resolve(import.meta.dirname, "..");
const QUELLE = path.join(WURZEL, "daten-import");
const ZIEL = path.join(WURZEL, "daten");
const ZIEL_UEBUNGEN = path.join(ZIEL, "uebungen");
const SCHNITT = path.join(WURZEL, "scripts", "vertikalschnitt.json");
const SW = path.join(WURZEL, "sw.js");

const INDEX_FELDER = ["id", "name", "kategorie", "disziplin", "equipment", "level", "ziel"];
const ID_MUSTER = /^[a-z0-9-]+$/;
const MARKE_ANFANG = "  /* DATEN:ANFANG – erzeugt von scripts/split-uebungen.mjs */";
const MARKE_ENDE = "  /* DATEN:ENDE */";

function abbruch(text) {
  console.error("split-uebungen: " + text);
  process.exit(1);
}

function jsonLesen(datei) {
  try {
    return JSON.parse(fs.readFileSync(datei, "utf8"));
  } catch (err) {
    abbruch(path.relative(WURZEL, datei) + " nicht lesbar: " + err.message);
  }
}

/* Schreibt nur bei geändertem Inhalt – spart iCloud-Abgleich und lässt Zeitstempel stehen. */
function schreibenWennNeu(datei, inhalt) {
  if (fs.existsSync(datei) && fs.readFileSync(datei, "utf8") === inhalt) return false;
  fs.writeFileSync(datei, inhalt);
  return true;
}

// ---------------------------------------------------------------- Quelle lesen
const uebungen = jsonLesen(path.join(QUELLE, "uebungen.json"));
if (!Array.isArray(uebungen)) abbruch("daten-import/uebungen.json ist keine Liste");

const gesehen = new Set();
for (const u of uebungen) {
  if (!u || typeof u.id !== "string" || !ID_MUSTER.test(u.id)) {
    abbruch("Übung mit ungültiger id: " + JSON.stringify(u && u.id) + " (erlaubt: " + ID_MUSTER + ")");
  }
  if (gesehen.has(u.id)) abbruch("doppelte Übungs-id: " + u.id);
  gesehen.add(u.id);
}

// ---------------------------------------------------------------- Korrekturen (daten-import/korrekturen.json)
let korrekturText = "keine Korrekturdatei";
{
  let k;
  try {
    k = korrekturenLesen(path.join(QUELLE, "korrekturen.json"));
  } catch (err) {
    abbruch(err.message);
  }
  const erg = korrekturenAnwenden(uebungen, k.korrekturen);
  if (erg.fehler.length) abbruch("Korrekturen passen nicht zur Quelle:\n  " + erg.fehler.join("\n  "));
  uebungen.splice(0, uebungen.length, ...erg.daten);
  korrekturText = erg.angewendet + " Korrektur(en) angewendet (" + erg.betroffen.size + " Übungen), " +
    (k.offen || []).length + " offen";
}
console.log("split-uebungen: " + korrekturText);

// ---------------------------------------------------------------- Modus
let auswahl = uebungen;
let modus = "ALLE Übungen (" + uebungen.length + ")";
if (fs.existsSync(SCHNITT)) {
  const ids = jsonLesen(SCHNITT);
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    abbruch("scripts/vertikalschnitt.json muss eine Liste von ids sein");
  }
  const fehlend = ids.filter((id) => !gesehen.has(id));
  if (fehlend.length) abbruch("scripts/vertikalschnitt.json nennt unbekannte ids: " + fehlend.join(", "));
  const wahl = new Set(ids);
  auswahl = uebungen.filter((u) => wahl.has(u.id));   // Reihenfolge wie Quelle
  modus = "VERTIKALSCHNITT (" + auswahl.length + " von " + uebungen.length +
    " Übungen laut scripts/vertikalschnitt.json – Datei löschen für alle)";
}
console.log("split-uebungen: Modus " + modus);

// ---------------------------------------------------------------- Dateien erzeugen
fs.mkdirSync(ZIEL_UEBUNGEN, { recursive: true });

const index = auswahl.map((u) => {
  const eintrag = {};
  for (const feld of INDEX_FELDER) eintrag[feld] = u[feld];
  eintrag.hat_risikohinweis = Boolean(u.risikohinweis);
  return eintrag;
});

let geschrieben = 0;
if (schreibenWennNeu(path.join(ZIEL, "uebungen-index.json"), JSON.stringify(index) + "\n")) geschrieben++;

const erzeugt = new Set();
for (const u of auswahl) {
  const name = u.id + ".json";
  erzeugt.add(name);
  if (schreibenWennNeu(path.join(ZIEL_UEBUNGEN, name), JSON.stringify(u) + "\n")) geschrieben++;
}

const equipQuelle = fs.readFileSync(path.join(QUELLE, "equipment.json"));
const equipZiel = path.join(ZIEL, "equipment.json");
if (!fs.existsSync(equipZiel) || !fs.readFileSync(equipZiel).equals(equipQuelle)) {
  fs.copyFileSync(path.join(QUELLE, "equipment.json"), equipZiel);
  geschrieben++;
}
// copyFileSync übernimmt die Rechte der Quelle (aus Downloads oft 600) – für den Server lesbar machen.
if ((fs.statSync(equipZiel).mode & 0o777) !== 0o644) fs.chmodSync(equipZiel, 0o644);

let entfernt = 0;
for (const name of fs.readdirSync(ZIEL_UEBUNGEN)) {
  if (name.endsWith(".json") && !erzeugt.has(name)) {
    fs.unlinkSync(path.join(ZIEL_UEBUNGEN, name));
    console.log("split-uebungen: veraltet, entfernt: daten/uebungen/" + name);
    entfernt++;
  }
}

// ---------------------------------------------------------------- sw.js: ASSETS
const assetZeilen = [
  "./daten/equipment.json",
  "./daten/uebungen-index.json",
  ...[...erzeugt].map((name) => "./daten/uebungen/" + name)
].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))   // Codepunkt-Reihenfolge wie LC_ALL=C
  .map((u) => '  "' + u + '",');

const swText = fs.readFileSync(SW, "utf8");
const zeilen = swText.split("\n");
const start = zeilen.findIndex((z) => /^var ASSETS = \[/.test(z));
const ende = start < 0 ? -1 : zeilen.findIndex((z, i) => i > start && /^\];/.test(z));
if (start < 0 || ende < 0) abbruch("ASSETS-Block in sw.js nicht gefunden (var ASSETS = [ … ];)");

let block = zeilen.slice(start + 1, ende);
const anfangAlt = block.findIndex((z) => z.includes("DATEN:ANFANG"));
const endeAlt = block.findIndex((z) => z.includes("DATEN:ENDE"));
if ((anfangAlt < 0) !== (endeAlt < 0) || endeAlt < anfangAlt) {
  abbruch("Marker DATEN:ANFANG/DATEN:ENDE in sw.js unvollständig – bitte von Hand bereinigen");
}

let einfuegen;
if (anfangAlt >= 0) {
  block.splice(anfangAlt, endeAlt - anfangAlt + 1);
  einfuegen = anfangAlt;
}
// Verirrte Daten-Einträge außerhalb der Marker entfernen (sie gehören nur in den erzeugten Teil).
const vorher = block.length;
const grenze = einfuegen;
block = block.filter((z, i) => {
  const weg = /^\s*"\.\/daten\/[^"]*",?\s*$/.test(z);
  if (weg && grenze !== undefined && i < grenze) einfuegen--;
  return !weg;
});
if (block.length !== vorher) console.log("split-uebungen: Daten-Einträge außerhalb der Marker entfernt");

// animation.js ist ein fester Eintrag vor app.js (entsteht in der Hauptsitzung).
if (!block.some((z) => z.includes('"./animation.js"'))) {
  const app = block.findIndex((z) => z.includes('"./app.js"'));
  if (app < 0) abbruch('"./app.js" fehlt in ASSETS – kann "./animation.js" nicht einordnen');
  block.splice(app, 0, '  "./animation.js",');
  if (einfuegen !== undefined && app < einfuegen) einfuegen++;
}

if (einfuegen === undefined) {
  // Erstlauf: hinter "./data.js", damit jede erzeugte Zeile ein festes Element hinter sich hat.
  const daten = block.findIndex((z) => z.includes('"./data.js"'));
  if (daten >= 0) {
    einfuegen = daten + 1;
    if (!/,\s*$/.test(block[daten])) block[daten] = block[daten].replace(/\s*$/, ",");
  } else {
    einfuegen = block.length;
    for (let i = block.length - 1; i >= 0; i--) {
      if (/"[^"]*"/.test(block[i])) {
        if (!/,\s*$/.test(block[i])) block[i] = block[i].replace(/\s*$/, ",");
        break;
      }
    }
  }
}
block.splice(einfuegen, 0, MARKE_ANFANG, ...assetZeilen, MARKE_ENDE);

const swNeu = [...zeilen.slice(0, start + 1), ...block, ...zeilen.slice(ende)].join("\n");
const swGeaendert = schreibenWennNeu(SW, swNeu);

console.log(
  "split-uebungen: " + index.length + " Index-Einträge, " + erzeugt.size + " Einzeldateien, " +
  assetZeilen.length + " Daten-Einträge in ASSETS · " + geschrieben + " Datei(en) neu geschrieben, " +
  entfernt + " entfernt, sw.js " + (swGeaendert ? "aktualisiert" : "unverändert")
);
