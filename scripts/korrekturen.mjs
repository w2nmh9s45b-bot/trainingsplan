// Zyklus – Datenkorrekturen auf die gelieferte Übungsquelle anwenden.
//
// daten-import/uebungen.json bleibt wie geliefert. daten-import/korrekturen.json listet je
// Korrektur die Übung, den Index des equipment_objekts, den erwarteten Altwert ("vorher")
// und die neuen Felder ("aenderung") mit Begründung. Stimmt der Altwert nicht mehr (Quelle
// wurde inzwischen geändert), ist das ein Fehler – die Korrektur wird nicht blind angewendet.
//
// Genutzt von scripts/split-uebungen.mjs (erzeugt daten/) und scripts/validate-daten.mjs.
import fs from "node:fs";

function gleich(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function korrekturenLesen(datei) {
  if (!fs.existsSync(datei)) return { korrekturen: [], offen: [] };
  const inhalt = JSON.parse(fs.readFileSync(datei, "utf8"));
  if (!inhalt || inhalt.format !== 1 || !Array.isArray(inhalt.korrekturen)) {
    throw new Error("korrekturen.json: erwartet { format: 1, korrekturen: [...] }");
  }
  return inhalt;
}

/* Liefert eine korrigierte Tiefenkopie der Übungsliste. Die Eingabe bleibt unverändert. */
export function korrekturenAnwenden(uebungen, korrekturen) {
  const daten = JSON.parse(JSON.stringify(uebungen));
  const nachId = new Map(daten.map((u) => [u.id, u]));
  const fehler = [];
  const betroffen = new Set();
  const gesehen = new Set();

  korrekturen.forEach((k, nr) => {
    const ort = "korrekturen.json #" + nr + " (" + k.uebung + " Objekt " + k.objekt + ")";
    const u = nachId.get(k.uebung);
    if (!u) { fehler.push(ort + ": Übung unbekannt"); return; }
    const o = u.animation && u.animation.equipment_objekte && u.animation.equipment_objekte[k.objekt];
    if (!o) { fehler.push(ort + ": equipment_objekt fehlt"); return; }
    if (o.typ !== k.typ) { fehler.push(ort + ": typ ist " + o.typ + ", Korrektur erwartet " + k.typ); return; }
    const schluessel = k.uebung + "#" + k.objekt;
    if (gesehen.has(schluessel)) { fehler.push(ort + ": doppelt"); return; }
    gesehen.add(schluessel);
    if (typeof k.grund !== "string" || !k.grund.trim()) fehler.push(ort + ": grund fehlt");
    for (const [feld, alt] of Object.entries(k.vorher || {})) {
      if (!gleich(o[feld], alt)) {
        fehler.push(ort + ": " + feld + " ist " + JSON.stringify(o[feld]) + ", erwartet vorher " +
          JSON.stringify(alt) + " – Quelle hat sich geändert, Korrektur prüfen");
        return;
      }
    }
    if (!k.vorher || !Object.keys(k.vorher).length) { fehler.push(ort + ": vorher fehlt (Altwert-Wächter)"); return; }
    /* typ und form bestimmen das Gerät und seine Zeichnung (Spec §10: ein Gerät, eine Form) –
       sie werden nie per Korrektur verändert. */
    const verboten = Object.keys(k.aenderung || {}).filter((f) => f === "typ" || f === "form");
    if (verboten.length) { fehler.push(ort + ": " + verboten.join("/") + " darf nicht korrigiert werden"); return; }
    for (const [feld, neu] of Object.entries(k.aenderung || {})) o[feld] = JSON.parse(JSON.stringify(neu));
    betroffen.add(k.uebung);
  });

  return { daten, fehler, angewendet: gesehen.size, betroffen };
}
