/* Ergänzung nach der unabhängigen Prüfung vom 13.09.2026: Die Grundtests prüften weder
   Werte ZWISCHEN zwei Posen noch, ob die Rahmung Geräte und den kleinsten Abstand nimmt.
   Die Erwartungswerte hier sind unabhängig von animation.js gerechnet (eigene
   Catmull-Rom über Tangenten, eigene Projektion). */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const A = require(process.env.ZYKLUS_ANIMATION_JS || path.join(hier, "..", "animation.js"));
const UEBUNGEN = require(path.join(hier, "..", "daten-import", "uebungen.json"));
const GELENKE = A.GELENKE;

/* Zentripetale Catmull-Rom über die Tangentenform (Hermite mit nicht-uniformen Knoten)
   – eine andere Herleitung als Barry-Goldman in animation.js. */
function crTangente(p0, p1, p2, p3, u) {
  const d = (a, b) => Math.sqrt(Math.abs(b - a));
  const t01 = d(p0, p1), t12 = d(p1, p2), t23 = d(p2, p3);
  if (t12 === 0) return p1;
  /* Fällt ein Nachbar mit dem Stützwert zusammen, geht die Tangente dort gegen 0:
     (p1−p0)/√|p1−p0| → 0 und die beiden übrigen Terme heben sich auf. */
  const m1 = t01 === 0 ? 0 : (p1 - p0) / t01 - (p2 - p0) / (t01 + t12) + (p2 - p1) / t12;
  const m2 = t23 === 0 ? 0 : (p2 - p1) / t12 - (p3 - p1) / (t12 + t23) + (p3 - p2) / t23;
  const a = m1 * t12, b = m2 * t12;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  return h00 * p1 + h10 * a + h01 * p2 + h11 * b;
}
const verzerrt = (s, anteil) => (anteil <= 0.15 ? 1 - (1 - s) ** 2 : s * s * (3 - 2 * s));

function erwartung(anim, t) {
  const ph = anim.phasen, n = ph.length, loop = anim.loop !== false;
  const starts = []; let summe = 0;
  for (const p of ph) { starts.push(summe * anim.dauer_sek); summe += p.zeitanteil; }
  let i = n - 1; while (i > 0 && starts[i] > t) i--;
  if (!loop && i === n - 1) return ph[n - 1].gelenke;
  const s = (t - starts[i]) / (ph[i].zeitanteil * anim.dauer_sek), u = verzerrt(s, ph[i].zeitanteil);
  const idx = loop ? [(i - 1 + n) % n, i, (i + 1) % n, (i + 2) % n]
                   : [Math.max(0, i - 1), i, Math.min(n - 1, i + 1), Math.min(n - 1, i + 2)];
  const g = {};
  for (const name of GELENKE) g[name] = [0, 1, 2].map(k => crTangente(...idx.map(j => ph[j].gelenke[name][k]), u));
  return g;
}

test("20 Werte zwischen den Posen: zentripetale Catmull-Rom mit Zeitverzerrung (alle 72, je Segment 3 Stellen)", () => {
  const fehler = [];
  for (const u of UEBUNGEN) {
    const a = u.animation; let start = 0;
    a.phasen.forEach((p, i) => {
      for (const f of [0.23, 0.5, 0.81]) {
        const t = start + f * p.zeitanteil * a.dauer_sek;
        if (!(a.loop === false && i === a.phasen.length - 1)) {
          const ist = A.abtasten(a, t).gelenke, soll = erwartung(a, t);
          for (const name of GELENKE) for (let k = 0; k < 3; k++) {
            if (!(Math.abs(ist[name][k] - soll[name][k]) <= 1e-6) && fehler.length < 8) {
              fehler.push(`${u.id} Segment ${i} f=${f} ${name}[${k}]: ist ${ist[name][k]}, soll ${soll[name][k]}`);
            }
          }
        }
      }
      start += p.zeitanteil * a.dauer_sek;
    });
  }
  assert.deepEqual(fehler, []);
});

test("21 Zwischenwerte weichen wirklich von beiden Nachbarposen ab (keine Treppe)", () => {
  const u = UEBUNGEN.find(x => x.id === "kettlebell-swing-beidarmig").animation;
  const t = u.phasen[0].zeitanteil * u.dauer_sek * 0.5;
  const mitte = A.abtasten(u, t).gelenke.schulter_l[0];
  const a = u.phasen[0].gelenke.schulter_l[0], b = u.phasen[1].gelenke.schulter_l[0];
  assert.notEqual(mitte, a);
  assert.notEqual(mitte, b);
});

test("22 zeitanteil 0 führt nicht zu NaN (synthetisch)", () => {
  const basis = JSON.parse(JSON.stringify(UEBUNGEN.find(x => x.id === "jab-am-sack").animation));
  basis.phasen[1].zeitanteil = 0;
  basis.phasen[0].zeitanteil += UEBUNGEN.find(x => x.id === "jab-am-sack").animation.phasen[1].zeitanteil;
  for (let k = 0; k <= 50; k++) {
    const z = A.abtasten(basis, k / 50 * basis.dauer_sek);
    for (const name of GELENKE) for (const v of z.gelenke[name]) assert.ok(Number.isFinite(v), `NaN bei k=${k} ${name}`);
  }
});

test("23 loop:false mit Seitenwechsel: ab 2·dauer fertig und Endpose der gespiegelten Seite", () => {
  const a = UEBUNGEN.find(x => x.animation.loop === false && x.animation.seitenwechsel).animation;
  const z = A.zustandBei(a, 2 * a.dauer_sek + 5);
  assert.equal(z.fertig, true);
  assert.equal(z.seite, 2);
  const letzte = A.spiegeln(a).phasen.at(-1).gelenke;
  for (const name of GELENKE) assert.deepEqual(z.gelenke[name], letzte[name]);
  assert.equal(A.zustandBei(a, 1.99 * a.dauer_sek).fertig, false);
});

/* Eigene Projektion für die Rahmungsprüfung. */
function ndcMax(rahm, punkte) {
  const f = rahm.ziel.map((v, i) => v - rahm.position[i]); const lf = Math.hypot(...f); const F = f.map(v => v / lf);
  const up = [0, 1, 0];
  const r0 = [up[1] * F[2] - up[2] * F[1], up[2] * F[0] - up[0] * F[2], up[0] * F[1] - up[1] * F[0]];
  const lr = Math.hypot(...r0); const R = r0.map(v => v / lr);
  const U = [F[1] * R[2] - F[2] * R[1], F[2] * R[0] - F[0] * R[2], F[0] * R[1] - F[1] * R[0]];
  const tan = Math.tan(rahm.fov / 2 * Math.PI / 180);
  let m = 0;
  for (const p of punkte) {
    const v = p.map((x, i) => x - rahm.position[i]);
    const z = v[0] * F[0] + v[1] * F[1] + v[2] * F[2];
    m = Math.max(m, Math.abs((v[0] * R[0] + v[1] * R[1] + v[2] * R[2]) / z) / tan, Math.abs((v[0] * U[0] + v[1] * U[1] + v[2] * U[2]) / z) / tan);
  }
  return m;
}
const ecken = b => [b.min[0], b.max[0]].flatMap(x => [b.min[1], b.max[1]].flatMap(y => [b.min[2], b.max[2]].map(z => [x, y, z])));

test("24 Rahmung umfasst alle gezeichneten Geräte (Spec §4.1)", () => {
  const fehler = [];
  for (const u of UEBUNGEN) {
    const a = u.animation, rahm = A.rahmung(a), b = rahm.box;
    a.phasen.forEach((ph, i) => {
      const P = A.posen(ph.gelenke, ph.wurzel_position_m), R = A.rotationen(ph.gelenke);
      a.equipment_objekte.forEach(o => {
        const ob = A.objektLinien(o, P, R, o.position_pro_phase ? o.position_pro_phase[i] : null);
        if (!ob) return;
        for (const linie of ob.linien) for (const p of linie) for (let k = 0; k < 3; k++) {
          if ((p[k] < b.min[k] - 1e-9 || p[k] > b.max[k] + 1e-9) && fehler.length < 5) fehler.push(`${u.id} ${o.typ} Achse ${k}`);
        }
      });
    });
  }
  assert.deepEqual(fehler, []);
});

test("25 Rahmung wählt den kleinsten passenden Abstand (12 % Rand je Seite, mindestens 4,2 m)", () => {
  for (const u of UEBUNGEN) {
    const rahm = A.rahmung(u.animation), e = ecken(rahm.box);
    const grenze = 1 - 2 * 0.12;
    assert.ok(ndcMax(rahm, e) <= grenze + 1e-6, `${u.id}: Box ragt aus dem Bild`);
    if (rahm.abstand > 4.2 + 1e-6) {
      const naeher = { ...rahm, abstand: rahm.abstand * 0.98 };
      const dir = rahm.position.map((v, i) => (v - rahm.ziel[i]) / rahm.abstand);
      naeher.position = rahm.ziel.map((v, i) => v + dir[i] * naeher.abstand);
      assert.ok(ndcMax(naeher, e) > grenze, `${u.id}: 2 % näher passt auch – Abstand nicht minimal`);
    }
  }
});

test("26 Rahmung hängt nur von den Daten ab, nicht vom Aufruf (zweimal identisch)", () => {
  const a = UEBUNGEN.find(x => x.id === "tennisball-wandwurf-reaktion").animation;
  assert.deepEqual(A.rahmung(a), A.rahmung(a));
});
