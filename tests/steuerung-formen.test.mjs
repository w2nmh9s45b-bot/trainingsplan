/* Regressionstests zu den Befunden der unabhängigen Prüfung vom 13.09.2026:
   (1) Einzelbild-Schritt kam auf Seite 2 durch einen Rundungsrest nicht voran,
   (2) guertel_mit_kette saß eine halbe Kettenlänge über dem Gelenk. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const A = require(process.env.ZYKLUS_ANIMATION_JS || path.join(hier, "..", "animation.js"));
const UEBUNGEN = require(path.join(hier, "..", "daten-import", "uebungen.json"));

/* Canvas-Ersatz ohne Browser: jede 2D-Methode ist ein No-op. */
function attrappe() {
  const ctx = new Proxy({}, { get: (_, k) => (typeof k === "string" ? () => {} : undefined), set: () => true });
  return { getContext: () => ctx, getBoundingClientRect: () => ({ width: 300, height: 300 }), width: 0, height: 0 };
}

test("30 Einzelbild-Schritt vorwärts durchläuft jede Phase beider Seiten genau einmal (alle 72)", () => {
  const fehler = [];
  for (const u of UEBUNGEN) {
    const st = A.erzeugen(attrappe(), u, null, {});
    const n = u.animation.phasen.length * (u.animation.seitenwechsel ? 2 : 1);
    const gesehen = [];
    for (let k = 0; k < n; k++) {
      st.schritt(1);
      const z = st.zustand();
      gesehen.push((z.seite - 1) * z.phasen + z.phase);
    }
    const soll = Array.from({ length: n }, (_, k) => (k + 1) % n);
    if (JSON.stringify(gesehen) !== JSON.stringify(soll) && fehler.length < 5) {
      fehler.push(`${u.id}: ${gesehen.join(",")} statt ${soll.join(",")}`);
    }
    st.zerstoere();
  }
  assert.deepEqual(fehler, []);
});

test("31 Einzelbild-Schritt rückwärts von Phase 0 landet auf der letzten Phase der letzten Seite", () => {
  const u = UEBUNGEN.find(x => x.animation.seitenwechsel);
  const st = A.erzeugen(attrappe(), u, null, {});
  st.schritt(-1);
  const z = st.zustand();
  assert.equal(z.seite, 2);
  assert.equal(z.phase, z.phasen - 1);
  st.zerstoere();
});

test("32 guertel_mit_kette: Kreis sitzt am gebundenen Gelenk, Kette hängt masse_m[1] senkrecht darunter", () => {
  const u = UEBUNGEN.find(x => x.animation.equipment_objekte.some(o => o.form === "guertel_mit_kette"));
  const ph = u.animation.phasen[0];
  const P = A.posen(ph.gelenke, ph.wurzel_position_m), R = A.rotationen(ph.gelenke);
  const o = { ...u.animation.equipment_objekte.find(x => x.form === "guertel_mit_kette"), position: [0, 0, 0] };
  const ob = A.objektLinien(o, P, R, null);
  const kreis = ob.linien[0].slice(0, -1);
  const mitte = [0, 1, 2].map(k => kreis.reduce((s, p) => s + p[k], 0) / kreis.length);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(mitte[k] - P[o.bindung][k]) < 1e-9, "Kreis nicht am Gelenk");
  const kette = ob.linien.find(l => l.length === 2);
  assert.ok(Math.abs(kette[0][1] - kette[1][1] - o.masse_m[1]) < 1e-9);
  assert.ok(Math.abs(kette[0][0] - kette[1][0]) < 1e-12 && Math.abs(kette[0][2] - kette[1][2]) < 1e-12, "Kette nicht senkrecht");
});
