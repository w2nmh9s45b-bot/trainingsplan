// Zyklus – Datenprüfung für den Übungskatalog.
//
// Prüft die QUELLE (daten-import/uebungen.json + equipment.json) gegen das Schema aus
// animations-spezifikation.md und den ERZEUGTEN Stand (daten/, ASSETS-Liste in sw.js).
// Meldet alle Fehler auf einmal und endet dann mit Exitcode 1. Warnungen lassen den
// Exitcode bei 0, stehen aber deutlich in der Ausgabe.
//
//   node scripts/validate-daten.mjs                     Quelle daten-import/ + erzeugter Stand
//   node scripts/validate-daten.mjs <ordner>            andere Quelle (enthält uebungen.json, equipment.json)
//   node scripts/validate-daten.mjs <ordner> --nur-quelle   nur die Quelle, daten/ und sw.js bleiben außen vor
//
// Korrekturen: daten-import/korrekturen.json wird auf die Quelle angewendet. Jeder Altwert muss
// noch stimmen. Der erzeugte Stand wird gegen die KORRIGIERTEN Datensätze verglichen. Ein
// gelenkgebundenes Objekt mit lokalem Versatz > 0,5 m ist für erzeugte Übungen ein FEHLER
// (sie würden sichtbar neben der Figur schweben), für die übrigen eine Warnung.
import fs from "node:fs";
import path from "node:path";
import { korrekturenLesen, korrekturenAnwenden } from "./korrekturen.mjs";

const WURZEL = path.resolve(import.meta.dirname, "..");
const argumente = process.argv.slice(2);
const NUR_QUELLE = argumente.includes("--nur-quelle");
const ordnerArg = argumente.find((a) => !a.startsWith("--"));
const QUELLE = path.resolve(ordnerArg || path.join(WURZEL, "daten-import"));
const DATEN = path.join(WURZEL, "daten");
const SW = path.join(WURZEL, "sw.js");
const SCHNITT = path.join(WURZEL, "scripts", "vertikalschnitt.json");

// ---------------------------------------------------------------- Vokabular (Spezifikation)
const GELENKE = [
  "kopf", "hals", "brust", "becken",
  "schulter_l", "schulter_r", "ellbogen_l", "ellbogen_r", "hand_l", "hand_r",
  "huefte_l", "huefte_r", "knie_l", "knie_r", "fuss_l", "fuss_r"
];
const KAMERAS = ["frontal", "seitlich", "seitlich_45", "halbhoch_45"];            // Spec §4
const UMGEBUNG = ["boden", "wand", "decke"];                                       // Spec §10
const BINDUNGEN = GELENKE.concat(UMGEBUNG, ["frei"]);
const FORMEN = [                                                                   // Spec §10, abschließend
  "quader", "platte", "zylinder", "kugel", "stange", "seil", "kegel", "scheibe",
  "kugel_mit_buegel", "stange_mit_gurt", "guertel_mit_kette", "weste", "gelenkhuelse",
  "buegel", "doppelrad", "verbund"
];
const VERBUND_TYPEN = ["hantelbank", "power-tower", "latzug"];
const ID_MUSTER = /^[a-z0-9-]+$/;
const TOLERANZ_ZEIT = 0.005;
const WARN_ABSTAND = 0.5;
const INDEX_FELDER = ["id", "name", "kategorie", "disziplin", "equipment", "level", "ziel", "hat_risikohinweis"];

// „Zahlen, mit denen du rechnen kannst" aus dem Bauauftrag – nur zum Abgleich, kein Fehler.
const BAUAUFTRAG = {
  "Übungen": 72,
  "Phasen": 343,
  "Kategorien": { technik: 12, footwork: 8, koordination: 9, kraft: 10, explosivitaet: 8, kondition: 8, rumpf_nacken: 9, mobilitaet: 8 },
  "Kameras": { seitlich: 22, halbhoch_45: 20, seitlich_45: 16, frontal: 14 },
  "Level": { anfaenger: 28, fortgeschritten: 38, experte: 6 },
  "seitenwechsel: true": 28,
  "loop: false": 3,
  "mit risikohinweis": 55,
  "Phasen mit wurzel_position_m": 284,
  "Equipment-Objekte": 170,
  "Objekte mit position_pro_phase": 6,
  "Objekte typ boden (Spec §10)": 39,
  "verschiedene Formen": 16,
  "form verbund": 9,
  "Quellenangaben": 166,
  "verschiedene Quellen-URLs": 130,
  "Geräte in equipment.json": 38,
  "von Übungen genutzte Geräte": 29
};

// ---------------------------------------------------------------- Hilfen
const fehler = [];
const warnungen = [];
const F = (ort, text) => fehler.push(ort + ": " + text);
const W = (ort, text) => warnungen.push(ort + ": " + text);
const rel = (p) => { const r = path.relative(WURZEL, p); return r.startsWith("..") ? p : r || "."; };

const istZahl = (v) => typeof v === "number" && Number.isFinite(v);
const istVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(istZahl);
const istObjekt = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const zeige = (v) => { const s = JSON.stringify(v); return s === undefined ? "undefined" : s.length > 60 ? s.slice(0, 57) + "…" : s; };

function gleich(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => gleich(x, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && gleich(a[k], b[k]));
}

function jsonLesen(datei, ort) {
  let text;
  try {
    text = fs.readFileSync(datei, "utf8");
  } catch (err) {
    F(ort, "nicht lesbar (" + err.code + ")");
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    F(ort, "kein gültiges JSON (" + err.message + ")");
    return undefined;
  }
}

function zaehle(zaehler, schluessel) { zaehler[schluessel] = (zaehler[schluessel] || 0) + 1; }

// ================================================================ QUELLE
const uebungenDatei = path.join(QUELLE, "uebungen.json");
const equipmentDatei = path.join(QUELLE, "equipment.json");
const uebungen = jsonLesen(uebungenDatei, rel(uebungenDatei));
const equipment = jsonLesen(equipmentDatei, rel(equipmentDatei));

const geraeteIds = new Set();
if (equipment !== undefined) {
  if (!istObjekt(equipment) || !Array.isArray(equipment.geraete)) {
    F(rel(equipmentDatei), "erwartet { meta, geraete: [...] }");
  } else {
    equipment.geraete.forEach((g, i) => {
      if (!istObjekt(g) || typeof g.id !== "string" || !g.id) F("equipment.json geraete[" + i + "]", "ohne id");
      else if (geraeteIds.has(g.id)) F("equipment.json", "doppelte Geräte-id " + g.id);
      else geraeteIds.add(g.id);
    });
  }
}

const stat = {
  uebungen: 0, phasen: 0, kategorien: {}, kameras: {}, level: {}, seitenwechsel: 0, loopFalse: 0,
  risiko: 0, wurzel: 0, objekte: 0, ppp: 0, objBoden: 0, formen: {}, verbund: 0,
  quellen: 0, urls: new Set(), genutzt: new Set()
};
const formJeTyp = new Map();   // Gerät → Set der Formen (Spec §10: ein Gerät, eine Form)
const quellIds = new Map();    // id → Datensatz

if (uebungen !== undefined && !Array.isArray(uebungen)) {
  F(rel(uebungenDatei), "ist keine Liste");
} else if (uebungen !== undefined) {
  uebungen.forEach((u, nr) => {
    const ort = (istObjekt(u) && typeof u.id === "string" ? u.id : "Übung #" + nr);
    if (!istObjekt(u)) { F(ort, "ist kein Objekt"); return; }
    stat.uebungen++;

    // g) ids eindeutig und schleifenfest für stempeln.sh
    if (typeof u.id !== "string" || !ID_MUSTER.test(u.id)) F(ort, "id " + zeige(u.id) + " passt nicht auf " + ID_MUSTER);
    else if (quellIds.has(u.id)) F(ort, "id doppelt vergeben");
    else quellIds.set(u.id, u);

    zaehle(stat.kategorien, String(u.kategorie));
    zaehle(stat.level, String(u.level));
    if (u.risikohinweis) stat.risiko++;

    // h) Quellen
    if (!Array.isArray(u.quellen)) {
      F(ort, "quellen fehlt oder ist keine Liste");
    } else {
      stat.quellen += u.quellen.length;
      u.quellen.forEach((q) => { if (istObjekt(q) && typeof q.url === "string") stat.urls.add(q.url); });
      if (!u.quellen.some((q) => istObjekt(q) && typeof q.url === "string" && q.url.startsWith("http"))) {
        F(ort, "keine Quelle mit url, die mit http beginnt");
      }
    }

    // d) equipment-ids
    if (!Array.isArray(u.equipment)) {
      F(ort, "equipment fehlt oder ist keine Liste");
    } else {
      u.equipment.forEach((id) => {
        stat.genutzt.add(id);
        if (!geraeteIds.has(id)) F(ort, "equipment-id " + zeige(id) + " fehlt in equipment.json");
      });
    }

    const a = u.animation;
    if (!istObjekt(a)) { F(ort, "animation fehlt"); return; }

    // c) Kamera
    zaehle(stat.kameras, String(a.kamera));
    if (!KAMERAS.includes(a.kamera)) F(ort, "kamera " + zeige(a.kamera) + " nicht in {" + KAMERAS.join(", ") + "}");

    // j) Grundfelder
    if (!istZahl(a.dauer_sek) || a.dauer_sek <= 0) F(ort, "dauer_sek " + zeige(a.dauer_sek) + " ist keine Zahl > 0");
    if (typeof a.loop !== "boolean") F(ort, "loop " + zeige(a.loop) + " ist nicht boolean");
    if (typeof a.seitenwechsel !== "boolean") F(ort, "seitenwechsel " + zeige(a.seitenwechsel) + " ist nicht boolean");
    if (a.seitenwechsel === true) stat.seitenwechsel++;
    if (a.loop === false) stat.loopFalse++;

    const phasen = Array.isArray(a.phasen) ? a.phasen : null;
    if (!phasen) {
      F(ort, "animation.phasen fehlt oder ist keine Liste");
    } else {
      if (phasen.length < 3 || phasen.length > 6) F(ort, phasen.length + " Phasen (erlaubt 3 bis 6)");
      let summe = 0;
      let summeGueltig = true;
      phasen.forEach((p, k) => {
        const pOrt = ort + " P" + k;
        stat.phasen++;
        if (!istObjekt(p)) { F(pOrt, "Phase ist kein Objekt"); summeGueltig = false; return; }
        if (typeof p.name !== "string") F(pOrt, "name fehlt oder ist kein String");
        if (typeof p.hinweis !== "string") F(pOrt, "hinweis fehlt oder ist kein String");

        // b) zeitanteil
        if (!istZahl(p.zeitanteil) || p.zeitanteil <= 0) {
          F(pOrt, "zeitanteil " + zeige(p.zeitanteil) + " ist keine Zahl > 0");
          summeGueltig = false;
        } else {
          summe += p.zeitanteil;
        }

        // a) 16 Gelenke, je 3 endliche Zahlen
        if (!istObjekt(p.gelenke)) {
          F(pOrt, "gelenke fehlt oder ist kein Objekt");
        } else {
          const fehlend = GELENKE.filter((g) => !Object.hasOwn(p.gelenke, g));
          const fremd = Object.keys(p.gelenke).filter((g) => !GELENKE.includes(g));
          if (fehlend.length) F(pOrt, "Gelenk(e) fehlen: " + fehlend.join(", "));
          if (fremd.length) F(pOrt, "unbekannte Gelenkschlüssel: " + fremd.join(", "));
          GELENKE.forEach((g) => {
            if (Object.hasOwn(p.gelenke, g) && !istVec3(p.gelenke[g])) {
              F(pOrt, "Gelenk " + g + " = " + zeige(p.gelenke[g]) + " ist kein Array aus 3 endlichen Zahlen");
            }
          });
        }

        if (p.wurzel_position_m !== undefined) {
          stat.wurzel++;
          if (!istVec3(p.wurzel_position_m)) F(pOrt, "wurzel_position_m " + zeige(p.wurzel_position_m) + " ist kein Array aus 3 Zahlen");
        }
      });
      if (summeGueltig && Math.abs(summe - 1) > TOLERANZ_ZEIT) {
        F(ort, "zeitanteil summiert auf " + summe.toFixed(4) + " statt 1.0 (Toleranz " + TOLERANZ_ZEIT + ")");
      }
    }

    // e/f/i) Equipment-Objekte
    if (a.equipment_objekte !== undefined && !Array.isArray(a.equipment_objekte)) {
      F(ort, "equipment_objekte ist keine Liste");
      return;
    }
    (a.equipment_objekte || []).forEach((o, k) => {
      const oOrt = ort + " Objekt " + k + (istObjekt(o) && typeof o.typ === "string" ? " (" + o.typ + ")" : "");
      stat.objekte++;
      if (!istObjekt(o)) { F(oOrt, "ist kein Objekt"); return; }

      if (!geraeteIds.has(o.typ) && !UMGEBUNG.includes(o.typ)) {
        F(oOrt, "typ " + zeige(o.typ) + " ist weder Geräte-id noch boden/wand/decke");
      }
      if (o.typ === "boden") stat.objBoden++;

      zaehle(stat.formen, String(o.form));
      if (!FORMEN.includes(o.form)) F(oOrt, "form " + zeige(o.form) + " nicht im Formvokabular (Spec §10)");
      if (o.form === "verbund") {
        stat.verbund++;
        if (!VERBUND_TYPEN.includes(o.typ)) F(oOrt, "form verbund ist nur bei " + VERBUND_TYPEN.join("/") + " erlaubt");
      }
      if (geraeteIds.has(o.typ) && typeof o.form === "string") {
        if (!formJeTyp.has(o.typ)) formJeTyp.set(o.typ, new Map());
        const m = formJeTyp.get(o.typ);
        if (!m.has(o.form)) m.set(o.form, []);
        m.get(o.form).push(ort);
      }

      if (!BINDUNGEN.includes(o.bindung)) F(oOrt, "bindung " + zeige(o.bindung) + " ist weder Gelenk noch boden/wand/decke/frei");
      if (!istVec3(o.masse_m) || !o.masse_m.every((x) => x > 0)) F(oOrt, "masse_m " + zeige(o.masse_m) + " sind nicht 3 positive Zahlen");

      const hatPpp = o.position_pro_phase !== undefined;
      if (o.position !== undefined ? !istVec3(o.position) : !hatPpp) {
        F(oOrt, "position " + zeige(o.position) + " ist kein Array aus 3 Zahlen");
      }

      if (hatPpp) {
        stat.ppp++;
        const ppp = o.position_pro_phase;
        if (!Array.isArray(ppp)) {
          F(oOrt, "position_pro_phase ist keine Liste");
        } else {
          if (phasen && ppp.length !== phasen.length) {
            F(oOrt, "position_pro_phase hat " + ppp.length + " Einträge, die Übung " + phasen.length + " Phasen");
          }
          ppp.forEach((pos, i) => { if (!istVec3(pos)) F(oOrt, "position_pro_phase[" + i + "] " + zeige(pos) + " ist kein Array aus 3 Zahlen"); });
        }
      }
      // Versatz bei Gelenkbindung wird nach den Korrekturen geprüft (siehe KORREKTUREN).
    });
  });

  for (const [typ, formen] of formJeTyp) {
    if (formen.size > 1) {
      const teile = [...formen].map(([form, ids]) => form + " (" + [...new Set(ids)].join(", ") + ")");
      W("Gerät " + typ, "wechselnde Formen über die Übungen: " + teile.join(" · "));
    }
  }
}

// ================================================================ KORREKTUREN
const korrekturDatei = path.join(QUELLE, "korrekturen.json");
let korrigiert = new Map(quellIds);   // id → Datensatz nach Korrektur
let korrekturInfo = "keine Korrekturdatei";
if (Array.isArray(uebungen)) {
  try {
    const k = korrekturenLesen(korrekturDatei);
    const erg = korrekturenAnwenden(uebungen.filter((u) => istObjekt(u) && quellIds.get(u.id) === u), k.korrekturen);
    erg.fehler.forEach((t) => F(rel(korrekturDatei), t));
    korrigiert = new Map(erg.daten.map((u) => [u.id, u]));
    korrekturInfo = erg.angewendet + " Korrektur(en) in " + erg.betroffen.size + " Übungen · " + (k.offen || []).length + " offen";
    // Geänderte Objekte erneut gegen das Schema prüfen.
    for (const id of erg.betroffen) {
      const u = korrigiert.get(id);
      const n = u.animation.phasen.length;
      u.animation.equipment_objekte.forEach((o, i) => {
        const ort = id + " Objekt " + i + " (" + o.typ + ", korrigiert)";
        if (!geraeteIds.has(o.typ) && !UMGEBUNG.includes(o.typ)) F(ort, "typ " + zeige(o.typ) + " ungültig");
        if (!FORMEN.includes(o.form)) F(ort, "form " + zeige(o.form) + " nicht im Formvokabular");
        if (o.form === "verbund" && !VERBUND_TYPEN.includes(o.typ)) F(ort, "form verbund nur bei " + VERBUND_TYPEN.join("/"));
        if (!BINDUNGEN.includes(o.bindung)) F(ort, "bindung " + zeige(o.bindung) + " ungültig");
        if (!istVec3(o.masse_m) || !o.masse_m.every((x) => x > 0)) F(ort, "masse_m " + zeige(o.masse_m) + " ungültig");
        if (!istVec3(o.position)) F(ort, "position " + zeige(o.position) + " ungültig");
        if (o.position_pro_phase !== undefined) {
          if (!Array.isArray(o.position_pro_phase) || o.position_pro_phase.length !== n || !o.position_pro_phase.every(istVec3)) {
            F(ort, "position_pro_phase passt nicht zu " + n + " Phasen");
          }
        }
      });
    }
  } catch (err) {
    F(rel(korrekturDatei), err.message);
  }
}

/* Spec §10: bei Gelenkbindung ist position ein lokaler Versatz zu diesem Gelenk. */
function versatzPruefen(streng) {
  for (const [id, u] of korrigiert) {
    ((u.animation && u.animation.equipment_objekte) || []).forEach((o, i) => {
      if (o.position_pro_phase !== undefined || !GELENKE.includes(o.bindung) || !istVec3(o.position)) return;
      const abstand = Math.hypot(o.position[0], o.position[1], o.position[2]);
      if (abstand <= WARN_ABSTAND) return;
      const text = "Objekt " + i + " (" + o.typ + ", bindung " + o.bindung + "): lokaler Versatz |position| = " +
        abstand.toFixed(3) + " m > " + WARN_ABSTAND + " m – schwebt neben dem Gelenk, Korrektur in daten-import/korrekturen.json nötig";
      if (streng.has(id)) F(id, text); else W(id, text);
    });
  }
}
let erzeugteIds = new Set();

// ================================================================ ERZEUGTER STAND
let modusText = "übersprungen (--nur-quelle)";
let erzeugtInfo = "";

function assetsLesen() {
  let text;
  try { text = fs.readFileSync(SW, "utf8"); } catch (err) { F("sw.js", "nicht lesbar (" + err.code + ")"); return null; }
  const zeilen = text.split("\n");
  const start = zeilen.findIndex((z) => /^var ASSETS = \[/.test(z));
  const ende = start < 0 ? -1 : zeilen.findIndex((z, i) => i > start && /^\];/.test(z));
  if (start < 0 || ende < 0) { F("sw.js", "ASSETS-Block (var ASSETS = [ … ];) nicht gefunden"); return null; }
  const block = zeilen.slice(start, ende + 1);

  // Genau wie Werkzeuge/stempeln.sh: "./…" in Anführungszeichen, "./" allein zählt nicht.
  const eintraege = [];
  block.forEach((z) => { for (const m of z.matchAll(/"\.\/[^"]+"/g)) eintraege.push(m[0].slice(1, -1)); });

  // Gegenprobe: Der Block muss gültiges JavaScript sein und dieselbe Liste ergeben.
  try {
    const liste = new Function(block.join("\n") + "\nreturn ASSETS;")();
    const ausgewertet = liste.filter((u) => u !== "./");
    if (!gleich(ausgewertet, eintraege)) {
      F("sw.js", "ASSETS als JavaScript ausgewertet weicht von der Zeilenlesart (stempeln.sh) ab");
    }
  } catch (err) {
    F("sw.js", "ASSETS-Block ist kein gültiges JavaScript (" + err.message + ")");
  }

  const doppelt = eintraege.filter((u, i) => eintraege.indexOf(u) !== i);
  if (doppelt.length) F("sw.js", "doppelte ASSETS-Einträge: " + [...new Set(doppelt)].join(", "));

  // Marker: genau ein Paar, Daten-Einträge nur dazwischen.
  const anf = block.map((z, i) => (z.includes("DATEN:ANFANG") ? i : -1)).filter((i) => i >= 0);
  const end = block.map((z, i) => (z.includes("DATEN:ENDE") ? i : -1)).filter((i) => i >= 0);
  if (anf.length !== 1 || end.length !== 1 || end[0] < anf[0]) {
    F("sw.js", "Markerpaar DATEN:ANFANG/DATEN:ENDE fehlt oder ist unvollständig (" + anf.length + "/" + end.length + ")");
  } else {
    block.forEach((z, i) => {
      const drin = i > anf[0] && i < end[0];
      const istDaten = /"\.\/daten\//.test(z);
      if (istDaten && !drin) F("sw.js", "Daten-Eintrag außerhalb der Marker: " + z.trim());
      if (drin && !istDaten && z.trim()) F("sw.js", "fremde Zeile zwischen den Markern: " + z.trim());
    });
  }
  return eintraege;
}

function dateienUnter(ordner, basis) {
  const aus = [];
  if (!fs.existsSync(ordner)) return aus;
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;   // .DS_Store u. Ä.
    const voll = path.join(ordner, e.name);
    const r = basis ? basis + "/" + e.name : e.name;
    if (e.isDirectory()) aus.push(...dateienUnter(voll, r));
    else aus.push(r);
  }
  return aus;
}

if (!NUR_QUELLE) {
  // Erwartete Auswahl je nach Modus
  let erwartet = uebungen && Array.isArray(uebungen) ? uebungen.filter(istObjekt) : [];
  modusText = "ALLE Übungen";
  if (fs.existsSync(SCHNITT)) {
    const ids = jsonLesen(SCHNITT, "scripts/vertikalschnitt.json");
    if (Array.isArray(ids)) {
      ids.filter((id) => !quellIds.has(id)).forEach((id) => F("scripts/vertikalschnitt.json", "unbekannte id " + zeige(id)));
      const wahl = new Set(ids);
      erwartet = erwartet.filter((u) => wahl.has(u.id));
      modusText = "VERTIKALSCHNITT (" + erwartet.length + " ids aus scripts/vertikalschnitt.json)";
    } else if (ids !== undefined) {
      F("scripts/vertikalschnitt.json", "ist keine Liste von ids");
    }
  }

  const indexDatei = path.join(DATEN, "uebungen-index.json");
  const index = jsonLesen(indexDatei, "daten/uebungen-index.json");
  const indexIds = [];
  if (index !== undefined && !Array.isArray(index)) {
    F("daten/uebungen-index.json", "ist keine Liste");
  } else if (index !== undefined) {
    index.forEach((e, i) => {
      const ort = "daten/uebungen-index.json [" + i + "]" + (istObjekt(e) && e.id ? " " + e.id : "");
      if (!istObjekt(e)) { F(ort, "ist kein Objekt"); return; }
      indexIds.push(e.id);
      const felder = Object.keys(e);
      if (!gleich([...felder].sort(), [...INDEX_FELDER].sort())) {
        F(ort, "Felder " + felder.join(",") + " statt genau " + INDEX_FELDER.join(","));
      }
      const q = quellIds.get(e.id);
      if (!q) { F(ort, "id fehlt in der Quelle"); return; }
      const soll = {};
      INDEX_FELDER.forEach((f) => { soll[f] = f === "hat_risikohinweis" ? Boolean(q.risikohinweis) : q[f]; });
      if (!gleich(e, soll)) F(ort, "weicht von der Quelle ab → npm run daten");
      if (typeof e.hat_risikohinweis !== "boolean") F(ort, "hat_risikohinweis ist nicht boolean");
    });
    const sollIds = erwartet.map((u) => u.id);
    erzeugteIds = new Set(sollIds);
    if (!gleich(indexIds, sollIds)) {
      F("daten/uebungen-index.json", "ids passen nicht zum Modus " + modusText + " (Index " + indexIds.length +
        ", erwartet " + sollIds.length + ", Reihenfolge wie Quelle) → npm run daten");
    }
    const dopp = indexIds.filter((id, i) => indexIds.indexOf(id) !== i);
    if (dopp.length) F("daten/uebungen-index.json", "doppelte ids: " + [...new Set(dopp)].join(", "));
  }

  // Einzeldateien
  const einzelOrdner = path.join(DATEN, "uebungen");
  const einzel = fs.existsSync(einzelOrdner)
    ? fs.readdirSync(einzelOrdner).filter((n) => !n.startsWith("."))
    : [];
  if (!fs.existsSync(einzelOrdner)) F("daten/uebungen/", "Ordner fehlt → npm run daten");
  const indexSet = new Set(indexIds);
  indexIds.forEach((id) => {
    const datei = path.join(einzelOrdner, id + ".json");
    const ort = "daten/uebungen/" + id + ".json";
    if (!fs.existsSync(datei)) { F(ort, "fehlt, obwohl die id im Index steht"); return; }
    const inhalt = jsonLesen(datei, ort);
    const q = korrigiert.get(id);
    if (inhalt !== undefined && q && !gleich(inhalt, q)) F(ort, "inhaltlich nicht gleich der korrigierten Quelle → npm run daten");
  });
  einzel.forEach((n) => {
    if (!n.endsWith(".json") || !indexSet.has(n.slice(0, -5))) F("daten/uebungen/" + n, "Einzeldatei ohne Index-Eintrag");
  });

  // equipment.json byte-gleich
  try {
    if (!fs.readFileSync(path.join(DATEN, "equipment.json")).equals(fs.readFileSync(equipmentDatei))) {
      F("daten/equipment.json", "nicht byte-gleich mit " + rel(equipmentDatei) + " → npm run daten");
    }
  } catch (err) {
    F("daten/equipment.json", "Vergleich nicht möglich (" + err.code + ")");
  }

  // ASSETS ↔ daten/
  const assets = assetsLesen();
  if (assets) {
    const assetSet = new Set(assets);
    const vorhanden = dateienUnter(DATEN, "").map((r) => "./daten/" + r);
    vorhanden.forEach((u) => { if (!assetSet.has(u)) F("sw.js", u + " liegt in daten/, fehlt aber in ASSETS (offline nicht verfügbar)"); });
    const vorhandenSet = new Set(vorhanden);
    assets.filter((u) => u.startsWith("./daten/")).forEach((u) => {
      if (!vorhandenSet.has(u)) F("sw.js", u + " steht in ASSETS, die Datei fehlt (Installation der neuen Fassung scheitert)");
    });
    if (!assetSet.has("./animation.js")) F("sw.js", '"./animation.js" fehlt in ASSETS');
    assets.filter((u) => !u.startsWith("./daten/")).forEach((u) => {
      if (!fs.existsSync(path.join(WURZEL, u.slice(2)))) {
        W("sw.js", u + " steht in ASSETS, die Datei fehlt noch (stempeln.sh und die SW-Installation brechen ab, solange das so ist)");
      }
    });
    erzeugtInfo = indexIds.length + " Index-Einträge · " + einzel.length + " Einzeldateien · " +
      assets.length + " ASSETS-Einträge (davon " + assets.filter((u) => u.startsWith("./daten/")).length + " Daten)";
  }
}

versatzPruefen(erzeugteIds);

// ================================================================ AUSGABE
const genutzt = [...stat.genutzt].filter((id) => geraeteIds.has(id));
const zahlen = {
  "Übungen": stat.uebungen,
  "Phasen": stat.phasen,
  "Kategorien": stat.kategorien,
  "Kameras": stat.kameras,
  "Level": stat.level,
  "seitenwechsel: true": stat.seitenwechsel,
  "loop: false": stat.loopFalse,
  "mit risikohinweis": stat.risiko,
  "Phasen mit wurzel_position_m": stat.wurzel,
  "Equipment-Objekte": stat.objekte,
  "Objekte mit position_pro_phase": stat.ppp,
  "Objekte typ boden (Spec §10)": stat.objBoden,
  "verschiedene Formen": Object.keys(stat.formen).length,
  "form verbund": stat.verbund,
  "Quellenangaben": stat.quellen,
  "verschiedene Quellen-URLs": stat.urls.size,
  "Geräte in equipment.json": geraeteIds.size,
  "von Übungen genutzte Geräte": genutzt.length
};
const text = (v) => (istObjekt(v) ? Object.entries(v).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + " " + n).join(" · ") : String(v));

console.log("validate-daten: Quelle " + rel(QUELLE) + "/");
console.log("\nZUSAMMENFASSUNG");
let abweichungen = 0;
for (const [name, wert] of Object.entries(zahlen)) {
  const soll = BAUAUFTRAG[name];
  const passt = gleich(wert, soll) || (istObjekt(wert) && istObjekt(soll) && gleich(
    Object.fromEntries(Object.entries(wert).sort()), Object.fromEntries(Object.entries(soll).sort())));
  if (!passt) abweichungen++;
  console.log("  " + (passt ? "✓" : "≠") + " " + name + ": " + text(wert) + (passt ? "" : "   ← Bauauftrag: " + text(soll)));
}
console.log(abweichungen
  ? "  → " + abweichungen + " ABWEICHUNG(EN) zum Bauauftrag (informativ, kein Fehler)"
  : "  → alle Zahlen wie im Bauauftrag");
if (zahlen["von Übungen genutzte Geräte"] !== BAUAUFTRAG["von Übungen genutzte Geräte"]) {
  console.log("    genutzte Geräte: " + genutzt.sort().join(", "));
}
console.log("\nKORREKTUREN: " + korrekturInfo);
console.log("\nERZEUGTER STAND: " + modusText + (erzeugtInfo ? "\n  " + erzeugtInfo : ""));

if (warnungen.length) {
  console.log("\n!!! " + warnungen.length + " WARNUNG(EN) – Exitcode bleibt 0, bitte ansehen:");
  warnungen.forEach((w) => console.log("  ⚠ " + w));
}

if (fehler.length) {
  console.error("\n✖ " + fehler.length + " FEHLER:");
  fehler.forEach((f) => console.error("  ✖ " + f));
  console.error("\nvalidate-daten: FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("\nvalidate-daten: OK (0 Fehler, " + warnungen.length + " Warnungen)");
