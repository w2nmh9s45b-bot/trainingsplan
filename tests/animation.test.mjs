// Unit-Tests ohne Browser fuer die reinen Funktionen von animation.js (window.ZyklusAnimation).
//
// Geschrieben ausschliesslich aus daten-import/animations-spezifikation.md,
// daten-import/referenz-kinematik.py und dem API-Vertrag der Hauptsitzung - ohne die
// Implementierung zu kennen. Ausfuehren:  node --test tests/
//
// Quelle der Uebungsdaten: daten-import/uebungen.json (72 Uebungen, 343 Phasen).
// animation.js wird ueber createRequire geladen (module.exports = api am Dateiende).
// Fuer Gegenproben gegen eine andere Datei: ZYKLUS_ANIMATION_JS=/pfad/zu/animation.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, "..");
const ANIMATION_PFAD = process.env.ZYKLUS_ANIMATION_JS
  ? path.resolve(process.env.ZYKLUS_ANIMATION_JS)
  : path.join(ROOT, "animation.js");
const UEBUNGEN_PFAD = path.join(ROOT, "daten-import", "uebungen.json");
const DUMP_SKRIPT = path.join(HIER, "referenz-dump.py");

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------

let _api = null;
let _apiFehler = null;
function A() {
  if (_api) return _api;
  if (_apiFehler) throw _apiFehler;
  try {
    if (!existsSync(ANIMATION_PFAD)) {
      throw new Error("animation.js fehlt noch: " + ANIMATION_PFAD);
    }
    const mod = require(ANIMATION_PFAD);
    if (!mod || typeof mod !== "object") {
      throw new Error("animation.js setzt module.exports nicht auf das api-Objekt");
    }
    _api = mod;
    return _api;
  } catch (e) {
    _apiFehler = e;
    throw e;
  }
}

const UEBUNGEN = JSON.parse(readFileSync(UEBUNGEN_PFAD, "utf8"));
const NACH_ID = new Map(UEBUNGEN.map((u) => [u.id, u]));
function uebung(id) {
  const u = NACH_ID.get(id);
  assert.ok(u, "Uebung fehlt in uebungen.json: " + id);
  return u;
}

// ---------------------------------------------------------------------------
// Konstanten aus der Spezifikation
// ---------------------------------------------------------------------------

const TOL = 1e-9;
const VORGABE_WURZEL = [0, 0.98, 0];
const GELENKE_SPEC = [
  "kopf", "hals", "brust", "becken",
  "schulter_l", "schulter_r", "ellbogen_l", "ellbogen_r", "hand_l", "hand_r",
  "huefte_l", "huefte_r", "knie_l", "knie_r", "fuss_l", "fuss_r",
];
const ENDPUNKTE = ["hand_l_faust", "hand_r_faust", "fuss_l_zeh", "fuss_r_zeh"];
const PUNKTE = GELENKE_SPEC.concat(ENDPUNKTE);
const KAMERAS_SPEC = {
  frontal: { azimut: 0, elevation: 8 },
  seitlich: { azimut: 90, elevation: 8 },
  seitlich_45: { azimut: 45, elevation: 8 },
  halbhoch_45: { azimut: 45, elevation: 25 },
};
const FOV = 32;
const MIN_ABSTAND = 4.2;
const ZIEL_Y_MIN = 0.55;
const ZIEL_Y_MAX = 1.15;
const GRAD = Math.PI / 180;
// Ruhende Kanaele (11e/11f): duldet eine Epsilon-Absicherung gegen Knotenlaenge 0,
// erkennt aber jedes sichtbare Ueberschwingen.
const TOL_RUHE_WINKEL = 1e-2; // Grad
const TOL_RUHE_WEG = 1e-4; // Meter

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function f12(x) {
  return typeof x === "number" ? x.toFixed(12) : String(x);
}
function fmt(v) {
  return Array.isArray(v) ? "[" + v.map(f12).join(", ") + "]" : String(v);
}
function istVec3(v) {
  return Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));
}
function vecAbw(a, b) {
  if (!istVec3(a) || !istVec3(b)) return Infinity;
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
function assertVec(ist, soll, tol, label) {
  const d = vecAbw(ist, soll);
  assert.ok(d <= tol, `${label}: ist ${fmt(ist)}, soll ${fmt(soll)}, Abweichung ${d}`);
}
function assertZahl(ist, soll, tol, label) {
  assert.ok(
    typeof ist === "number" && Number.isFinite(ist) && Math.abs(ist - soll) <= tol,
    `${label}: ist ${f12(ist)}, soll ${f12(soll)}`,
  );
}

class Befunde {
  constructor() {
    this.anzahl = 0;
    this.erste = [];
  }
  add(text) {
    this.anzahl += 1;
    if (this.erste.length < 10) this.erste.push(text);
  }
  pruefen(titel) {
    if (this.anzahl === 0) return;
    assert.fail(`${titel}: ${this.anzahl} Abweichung(en), die ersten ${this.erste.length}:\n  - ${this.erste.join("\n  - ")}`);
  }
}

function nullPose() {
  const g = {};
  for (const n of GELENKE_SPEC) g[n] = [0, 0, 0];
  return g;
}
function poseMit(aenderungen) {
  return Object.assign(nullPose(), aenderungen);
}
function wurzelVon(phase) {
  return phase.wurzel_position_m || VORGABE_WURZEL;
}
// _l <-> _r, auch innerhalb von Punktnamen wie hand_l_faust / fuss_r_zeh
function tausch(name) {
  return name.replace(/_(l|r)(?=_|$)/, (_, s) => (s === "l" ? "_r" : "_l"));
}
function klemme(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}
// Pose-Startzeiten nach Spec 5: Pose i beginnt bei (Summe der zeitanteile davor) * dauer_sek.
function startzeiten(anim) {
  const t = [];
  let summe = 0;
  for (const p of anim.phasen) {
    t.push(summe * anim.dauer_sek);
    summe += p.zeitanteil;
  }
  return t;
}
function segmentDauer(anim, i) {
  return anim.phasen[i].zeitanteil * anim.dauer_sek;
}
function naechstePose(anim, i) {
  const n = anim.phasen.length;
  if (i < n - 1) return i + 1;
  return anim.loop ? 0 : n - 1;
}

// Vergleicht zwei Abtastergebnisse (gelenke, wurzel, objektPositionen, optional phase/fertig).
function zustandsAbweichung(ist, soll, tol, mitDiskret) {
  if (!ist || typeof ist !== "object") return "kein Objekt geliefert";
  for (const g of GELENKE_SPEC) {
    const d = vecAbw(ist.gelenke && ist.gelenke[g], soll.gelenke[g]);
    if (!(d <= tol)) return `gelenke.${g} ist ${fmt(ist.gelenke && ist.gelenke[g])}, soll ${fmt(soll.gelenke[g])}`;
  }
  if (!(vecAbw(ist.wurzel, soll.wurzel) <= tol)) return `wurzel ist ${fmt(ist.wurzel)}, soll ${fmt(soll.wurzel)}`;
  const oi = ist.objektPositionen;
  const os = soll.objektPositionen;
  if (!Array.isArray(oi) || oi.length !== os.length) return `objektPositionen Laenge ${oi && oi.length}, soll ${os.length}`;
  for (let k = 0; k < os.length; k++) {
    if (os[k] === null || oi[k] === null) {
      if (os[k] !== oi[k]) return `objektPositionen[${k}] ist ${fmt(oi[k])}, soll ${fmt(os[k])}`;
    } else if (!(vecAbw(oi[k], os[k]) <= tol)) {
      return `objektPositionen[${k}] ist ${fmt(oi[k])}, soll ${fmt(os[k])}`;
    }
  }
  if (mitDiskret) {
    if (ist.phase !== soll.phase) return `phase ist ${ist.phase}, soll ${soll.phase}`;
    if (ist.fertig !== soll.fertig) return `fertig ist ${ist.fertig}, soll ${soll.fertig}`;
  }
  return null;
}

// --- unabhaengige Rotationskette nach Spec 1 + 3 (nur fuer den rotationen-Test) ---
const GRUPPE_B = new Set(["becken", "brust", "hals", "kopf", "knie_l", "knie_r"]);
const ELTERN = {
  becken: null, brust: "becken", hals: "brust", kopf: "hals",
  schulter_l: "brust", schulter_r: "brust", ellbogen_l: "schulter_l", ellbogen_r: "schulter_r",
  hand_l: "ellbogen_l", hand_r: "ellbogen_r", huefte_l: "becken", huefte_r: "becken",
  knie_l: "huefte_l", knie_r: "huefte_r", fuss_l: "knie_l", fuss_r: "knie_r",
};
function mm(P, Q) {
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    R[i][j] = P[i][0] * Q[0][j] + P[i][1] * Q[1][j] + P[i][2] * Q[2][j];
  }
  return R;
}
function mv(M, v) {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}
function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function lokaleRotation(name, w) {
  let a = w[0] * GRAD;
  const b = w[1] * GRAD;
  const c = w[2] * GRAD;
  if (GRUPPE_B.has(name)) a = -a;
  const Rx = [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]];
  const Ry = [[Math.cos(b), 0, -Math.sin(b)], [0, 1, 0], [Math.sin(b), 0, Math.cos(b)]];
  const Rz = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]];
  return mm(mm(Rx, Ry), Rz);
}
function weltRotationenSpec(gelenke) {
  const R = {};
  const hole = (n) => {
    if (R[n]) return R[n];
    const lokal = lokaleRotation(n, gelenke[n]);
    R[n] = ELTERN[n] ? mm(hole(ELTERN[n]), lokal) : lokal;
    return R[n];
  };
  for (const n of GELENKE_SPEC) hole(n);
  return R;
}
function matAbw(M, N) {
  if (!Array.isArray(M) || M.length !== 3) return Infinity;
  let d = 0;
  for (let i = 0; i < 3; i++) {
    if (!Array.isArray(M[i]) || M[i].length !== 3) return Infinity;
    for (let j = 0; j < 3; j++) {
      if (typeof M[i][j] !== "number" || !Number.isFinite(M[i][j])) return Infinity;
      d = Math.max(d, Math.abs(M[i][j] - N[i][j]));
    }
  }
  return d;
}

// --- Kamera-Geometrie nach Spec 4.5 ---
function kameraPosition(ziel, abstand, azGrad, elGrad) {
  const az = azGrad * GRAD;
  const el = elGrad * GRAD;
  return [
    ziel[0] + abstand * Math.sin(az) * Math.cos(el),
    ziel[1] + abstand * Math.sin(el),
    ziel[2] + abstand * Math.cos(az) * Math.cos(el),
  ];
}
function normiere(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
function kreuz(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function skalar(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function pruefeRahmungsform(r, label) {
  assert.ok(r && typeof r === "object", `${label}: rahmung liefert kein Objekt`);
  assert.ok(istVec3(r.ziel), `${label}: ziel ist kein [x,y,z]: ${fmt(r.ziel)}`);
  assert.ok(istVec3(r.position), `${label}: position ist kein [x,y,z]: ${fmt(r.position)}`);
  assert.ok(typeof r.abstand === "number" && Number.isFinite(r.abstand), `${label}: abstand ist keine Zahl`);
  assert.ok(r.box && istVec3(r.box.min) && istVec3(r.box.max), `${label}: box.min/box.max fehlen`);
}

// ===========================================================================
// Grundkonstanten
// ===========================================================================

test("00a GELENKE: 16 Namen in Spec-Reihenfolge", () => {
  assert.deepStrictEqual(Array.from(A().GELENKE), GELENKE_SPEC);
});

test("00b KAMERAS: genau die vier Kameras aus Spec 4 (Grad)", () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(A().KAMERAS)), KAMERAS_SPEC);
});

test("00c Daten: 72 Uebungen, 343 Phasen, je Phase alle 16 Gelenke", () => {
  assert.equal(UEBUNGEN.length, 72);
  let phasen = 0;
  for (const u of UEBUNGEN) {
    for (const p of u.animation.phasen) {
      phasen += 1;
      assert.deepStrictEqual(Object.keys(p.gelenke).sort(), GELENKE_SPEC.slice().sort(), `${u.id}: Gelenkschluessel`);
    }
  }
  assert.equal(phasen, 343);
});

// ===========================================================================
// Pflichttests 1-7 (Bauauftrag, Schritt 2)
// ===========================================================================

test("01 Nullstellung: kopf 1.660, brust 1.280, Knoechel 0.080, schulter_l x -0.200", () => {
  const P = A().posen(nullPose());
  for (const k of PUNKTE) assert.ok(istVec3(P[k]), `posen liefert Punkt ${k} nicht als [x,y,z]`);
  assertZahl(P.kopf[1], 1.66, TOL, "kopf.y");
  assertZahl(P.brust[1], 1.28, TOL, "brust.y");
  assertZahl(P.fuss_l[1], 0.08, TOL, "fuss_l.y");
  assertZahl(P.fuss_r[1], 0.08, TOL, "fuss_r.y");
  assertZahl(P.schulter_l[0], -0.2, TOL, "schulter_l.x");
  // vollstaendige Vektoren der aufrechten Figur (Spec 2)
  assertVec(P.becken, [0, 0.98, 0], TOL, "becken");
  assertVec(P.kopf, [0, 1.66, 0], TOL, "kopf");
  assertVec(P.hals, [0, 1.5, 0], TOL, "hals");
  assertVec(P.schulter_r, [0.2, 1.28, 0], TOL, "schulter_r");
  assertVec(P.hand_l_faust, [-0.2, 0.59, 0], TOL, "hand_l_faust");
  assertVec(P.fuss_r_zeh, [0.1, 0.08, 0.18], TOL, "fuss_r_zeh");
  // fehlende wurzel == [0, 0.98, 0]
  const Q = A().posen(nullPose(), [0, 0.98, 0]);
  const U = A().posen(nullPose(), undefined);
  for (const k of PUNKTE) {
    assertVec(P[k], Q[k], TOL, `ohne wurzel vs [0,0.98,0]: ${k}`);
    assertVec(U[k], Q[k], TOL, `wurzel undefined vs [0,0.98,0]: ${k}`);
  }
});

test("02 schulter_l [90,0,0] -> hand_l (-0.200, 1.280, +0.600)", () => {
  const P = A().posen(poseMit({ schulter_l: [90, 0, 0] }));
  assertVec(P.hand_l, [-0.2, 1.28, 0.6], TOL, "hand_l");
});

test("03 Gruppe A/B getrennt: knie_l [90,0,0] -> fuss_l (-0.100, 0.530, -0.450); brust [60,0,0] -> kopf (0, 1.320, +0.589)", () => {
  const P = A().posen(poseMit({ knie_l: [90, 0, 0] }));
  assertVec(P.fuss_l, [-0.1, 0.53, -0.45], 1e-3, "knie_l[90] -> fuss_l");
  const Q = A().posen(poseMit({ brust: [60, 0, 0] }));
  assertVec(Q.kopf, [0, 1.32, 0.589], 1e-3, "brust[60] -> kopf");
});

test("04 Spiegelung: spiegeln(spiegeln(a)) tief gleich a fuer alle 28 Uebungen mit seitenwechsel, Eingabe unveraendert", () => {
  const mitWechsel = UEBUNGEN.filter((u) => u.animation.seitenwechsel === true);
  assert.equal(mitWechsel.length, 28, "Anzahl Uebungen mit seitenwechsel:true");
  for (const u of mitWechsel) {
    const vorher = structuredClone(u.animation);
    const einmal = A().spiegeln(u.animation);
    assert.deepStrictEqual(u.animation, vorher, `${u.id}: spiegeln veraendert die Eingabe`);
    assert.notStrictEqual(einmal, u.animation, `${u.id}: spiegeln liefert kein neues Objekt`);
    const zweimal = A().spiegeln(einmal);
    assert.deepStrictEqual(zweimal, u.animation, `${u.id}: spiegeln(spiegeln(a)) != a`);
    assert.deepStrictEqual(u.animation, vorher, `${u.id}: Eingabe nach doppelter Spiegelung veraendert`);
  }
});

test("05 zeitanteil aller 72 Uebungen summiert auf 1.0 +- 0.005", () => {
  const b = new Befunde();
  assert.equal(UEBUNGEN.length, 72);
  for (const u of UEBUNGEN) {
    const s = u.animation.phasen.reduce((acc, p) => acc + p.zeitanteil, 0);
    if (!(Math.abs(s - 1) <= 0.005)) b.add(`${u.id}: Summe ${s}`);
  }
  b.pruefen("zeitanteil-Summen");
});

test("06 Rahmung: graetschsitz-adduktoren-dehnung und klimmzug-obergriff-power-tower", () => {
  const ids = ["graetschsitz-adduktoren-dehnung", "klimmzug-obergriff-power-tower"];
  const r = {};
  for (const id of ids) {
    const anim = uebung(id).animation;
    const ra = A().rahmung(anim);
    pruefeRahmungsform(ra, id);
    assert.ok(ra.ziel[1] >= ZIEL_Y_MIN - TOL && ra.ziel[1] <= ZIEL_Y_MAX + TOL, `${id}: ziel.y ${ra.ziel[1]} ausserhalb [0.55, 1.15]`);
    assert.ok(ra.abstand >= MIN_ABSTAND - TOL, `${id}: abstand ${ra.abstand} < 4.2`);
    assert.equal(ra.fov, FOV, `${id}: fov`);
    const kam = KAMERAS_SPEC[anim.kamera];
    assertVec(ra.position, kameraPosition(ra.ziel, ra.abstand, kam.azimut, kam.elevation), TOL, `${id}: position nach Spec 4.5`);
    r[id] = ra;
  }
  assert.ok(Math.abs(r[ids[0]].ziel[1] - r[ids[1]].ziel[1]) > 1e-6, `Blickziel-Hoehen gleich: ${r[ids[0]].ziel[1]} / ${r[ids[1]].ziel[1]}`);
  // Bodenuebung liegt unten, haengende Uebung oben (Mittel der becken-Hoehe, geklemmt)
  assert.ok(r[ids[0]].ziel[1] < r[ids[1]].ziel[1], "Bodenuebung sollte tieferes Blickziel haben als die haengende");
});

test("07 Kein Gelenk, keine Faust, keine Zehe unter y = -0.02 (alle Phasen aller Uebungen)", () => {
  const b = new Befunde();
  for (const u of UEBUNGEN) {
    u.animation.phasen.forEach((p, i) => {
      const P = A().posen(p.gelenke, p.wurzel_position_m);
      for (const k of PUNKTE) {
        if (!istVec3(P[k])) b.add(`${u.id} P${i} ${k}: kein [x,y,z]`);
        else if (P[k][1] < -0.02) b.add(`${u.id} P${i} ${k}: y = ${P[k][1].toFixed(4)}`);
      }
    });
  }
  b.pruefen("Punkte unter dem Boden");
});

// ===========================================================================
// 8-9 Referenzabgleich mit referenz-kinematik.py
// ===========================================================================

let _dump = null;
function referenzDump() {
  if (_dump) return _dump;
  const roh = execFileSync("python3", [DUMP_SKRIPT, UEBUNGEN_PFAD], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: "1" }),
  });
  _dump = JSON.parse(roh);
  return _dump;
}

test("08a Referenz-Dump (python3 tests/referenz-dump.py) liefert 72 Uebungen, 343 Phasen, 20 Punkte", { timeout: 10000 }, () => {
  const d = referenzDump();
  assert.equal(d.meta.uebungen, 72);
  assert.equal(d.meta.phasen, 343);
  assert.deepStrictEqual(d.meta.punkte, PUNKTE);
  assert.deepStrictEqual(d.uebungen.map((x) => x.id), UEBUNGEN.map((u) => u.id));
});

test("08b posen == referenz-kinematik.py, Gelenk fuer Gelenk, alle Phasen aller 72 Uebungen (1e-9)", { timeout: 10000 }, () => {
  const start = performance.now();
  const d = referenzDump();
  const b = new Befunde();
  let verglichen = 0;
  d.uebungen.forEach((ref, ui) => {
    const u = UEBUNGEN[ui];
    ref.phasen.forEach((refPhase, pi) => {
      const p = u.animation.phasen[pi];
      const P = A().posen(p.gelenke, p.wurzel_position_m);
      for (const k of PUNKTE) {
        verglichen += 1;
        const abw = vecAbw(P[k], refPhase[k]);
        if (!(abw <= TOL)) {
          b.add(`${u.id} Phase ${pi} ('${p.name}') ${k}: JS ${fmt(P && P[k])} / Python ${fmt(refPhase[k])} (Abw. ${abw})`);
        }
      }
    });
  });
  assert.equal(verglichen, 343 * 20);
  b.pruefen("Abweichungen zur Referenz-Kinematik");
  assert.ok(performance.now() - start < 10000, "Referenzabgleich dauert laenger als 10 s");
});

test("09 Proben aus referenz-kinematik.py __main__", () => {
  const faelle = [
    ["schulter_l", [90, 0, 0], "hand_l", [-0.2, 1.28, 0.6]],
    ["knie_l", [90, 0, 0], "fuss_l", [-0.1, 0.53, -0.45]],
    ["ellbogen_l", [90, 0, 0], "hand_l", [-0.2, 0.96, 0.28]],
    ["schulter_r", [0, 0, 90], "ellbogen_r", [0.52, 1.28, 0]],
    ["becken", [0, 90, 0], "huefte_r", [0, 0.98, 0.1]],
  ];
  for (const [gelenk, winkel, punkt, soll] of faelle) {
    const P = A().posen(poseMit({ [gelenk]: winkel }));
    assertVec(P[punkt], soll, TOL, `${gelenk}${JSON.stringify(winkel)} -> ${punkt}`);
  }
});

// ===========================================================================
// 10 Zeitverzerrung
// ===========================================================================

test("10 zeitverzerrung: ease-out bis einschliesslich 0.15, darueber smoothstep", () => {
  const zv = A().zeitverzerrung;
  for (const anteil of [0, 0.05, 0.15, 0.16, 0.3, 1]) {
    assertZahl(zv(0, anteil), 0, 1e-12, `s=0, zeitanteil ${anteil}`);
    assertZahl(zv(1, anteil), 1, 1e-12, `s=1, zeitanteil ${anteil}`);
  }
  assertZahl(zv(0.5, 0.15), 0.75, 1e-12, "zeitanteil 0.15 (Grenze inklusiv) -> ease-out, s=0.5");
  assertZahl(zv(0.5, 0.16), 0.5, 1e-12, "zeitanteil 0.16 -> smoothstep, s=0.5");
  assertZahl(zv(0.25, 0.1), 1 - 0.75 * 0.75, 1e-12, "ease-out s=0.25");
  assertZahl(zv(0.25, 0.4), 0.25 * 0.25 * (3 - 0.5), 1e-12, "smoothstep s=0.25");
  // monoton in [0,1] fuer beide Zweige
  for (const anteil of [0.1, 0.5]) {
    let vorher = -Infinity;
    for (let k = 0; k <= 100; k++) {
      const w = zv(k / 100, anteil);
      assert.ok(w >= vorher - 1e-15 && w >= -1e-15 && w <= 1 + 1e-15, `nicht monoton / ausserhalb [0,1] bei s=${k / 100}, zeitanteil ${anteil}`);
      vorher = w;
    }
  }
});

// ===========================================================================
// 11 Abtasten
// ===========================================================================

test("11a abtasten trifft zu den Pose-Startzeiten exakt Winkel, wurzel und position_pro_phase (alle 72 Uebungen)", () => {
  const b = new Befunde();
  for (const u of UEBUNGEN) {
    const anim = u.animation;
    const vorher = structuredClone(anim);
    const t0 = startzeiten(anim);
    anim.phasen.forEach((p, i) => {
      const z = A().abtasten(anim, t0[i]);
      if (!z || !z.gelenke) {
        b.add(`${u.id} P${i}: kein Ergebnis`);
        return;
      }
      for (const g of GELENKE_SPEC) {
        if (!(vecAbw(z.gelenke[g], p.gelenke[g]) <= TOL)) {
          b.add(`${u.id} P${i} t=${t0[i]} ${g}: ist ${fmt(z.gelenke[g])}, soll ${fmt(p.gelenke[g])}`);
        }
      }
      if (!(vecAbw(z.wurzel, wurzelVon(p)) <= TOL)) b.add(`${u.id} P${i} wurzel: ist ${fmt(z.wurzel)}, soll ${fmt(wurzelVon(p))}`);
      const objekte = anim.equipment_objekte || [];
      if (!Array.isArray(z.objektPositionen) || z.objektPositionen.length !== objekte.length) {
        b.add(`${u.id} P${i}: objektPositionen hat nicht ${objekte.length} Eintraege`);
      } else {
        objekte.forEach((o, k) => {
          if (o.position_pro_phase && !(vecAbw(z.objektPositionen[k], o.position_pro_phase[i]) <= TOL)) {
            b.add(`${u.id} P${i} objekt ${k} (${o.typ}): ist ${fmt(z.objektPositionen[k])}, soll ${fmt(o.position_pro_phase[i])}`);
          }
        });
      }
    });
    assert.deepStrictEqual(anim, vorher, `${u.id}: abtasten veraendert die Animation`);
  }
  b.pruefen("Pose-Startzeiten");
});

test("11b abtasten.phase = Index der Pose, von der das laufende Segment startet (Segmentmitte)", () => {
  const b = new Befunde();
  for (const u of UEBUNGEN) {
    const anim = u.animation;
    const t0 = startzeiten(anim);
    anim.phasen.forEach((p, i) => {
      const t = t0[i] + 0.5 * segmentDauer(anim, i);
      const z = A().abtasten(anim, t);
      if (!z || z.phase !== i) b.add(`${u.id} t=${t}: phase ${z && z.phase}, soll ${i}`);
      if (z && z.fertig !== false) b.add(`${u.id} t=${t}: fertig ${z.fertig}, soll false`);
    });
  }
  b.pruefen("phase-Index");
});

test("11c loop:true: bei t = dauer_sek wieder Pose 0, periodisch in dauer_sek", () => {
  const b = new Befunde();
  for (const u of UEBUNGEN.filter((x) => x.animation.loop === true)) {
    const anim = u.animation;
    const z = A().abtasten(anim, anim.dauer_sek);
    const soll = anim.phasen[0];
    for (const g of GELENKE_SPEC) {
      if (!(vecAbw(z.gelenke[g], soll.gelenke[g]) <= TOL)) b.add(`${u.id} t=dauer ${g}: ist ${fmt(z.gelenke[g])}, soll ${fmt(soll.gelenke[g])}`);
    }
    if (!(vecAbw(z.wurzel, wurzelVon(soll)) <= TOL)) b.add(`${u.id} t=dauer wurzel: ist ${fmt(z.wurzel)}`);
    if (z.phase !== 0) b.add(`${u.id} t=dauer: phase ${z.phase}, soll 0`);
    if (z.fertig !== false) b.add(`${u.id} t=dauer: fertig ${z.fertig}, soll false (loop)`);
    for (let k = 0; k < 9; k++) {
      const t = ((k + 0.5) / 9) * anim.dauer_sek;
      const a1 = A().abtasten(anim, t);
      for (const n of [1, 3]) {
        const a2 = A().abtasten(anim, t + n * anim.dauer_sek);
        const abw = zustandsAbweichung(a2, a1, 1e-7, false);
        if (abw) b.add(`${u.id} t=${t} vs t+${n}*dauer: ${abw}`);
      }
    }
  }
  b.pruefen("loop:true");
});

test("11d loop:false: ab t >= dauer_sek fertig=true, letzte Pose gehalten, Zeit auf [0, dauer_sek] geklemmt", () => {
  const ohneLoop = UEBUNGEN.filter((x) => x.animation.loop === false);
  assert.equal(ohneLoop.length, 3, "Anzahl Uebungen mit loop:false");
  const b = new Befunde();
  for (const u of ohneLoop) {
    const anim = u.animation;
    const n = anim.phasen.length;
    const letzte = anim.phasen[n - 1];
    const erste = anim.phasen[0];
    const t0 = startzeiten(anim);
    const sollLetzte = { gelenke: letzte.gelenke, wurzel: wurzelVon(letzte) };
    const pruefeGelenke = (z, soll, label) => {
      for (const g of GELENKE_SPEC) {
        if (!(vecAbw(z.gelenke[g], soll.gelenke[g]) <= TOL)) b.add(`${u.id} ${label} ${g}: ist ${fmt(z.gelenke[g])}, soll ${fmt(soll.gelenke[g])}`);
      }
      if (!(vecAbw(z.wurzel, soll.wurzel) <= TOL)) b.add(`${u.id} ${label} wurzel: ist ${fmt(z.wurzel)}, soll ${fmt(soll.wurzel)}`);
    };
    for (const t of [anim.dauer_sek, anim.dauer_sek + 0.001, anim.dauer_sek * 3, 1e6]) {
      const z = A().abtasten(anim, t);
      if (z.fertig !== true) b.add(`${u.id} t=${t}: fertig ${z.fertig}, soll true`);
      if (z.phase !== n - 1) b.add(`${u.id} t=${t}: phase ${z.phase}, soll ${n - 1}`);
      pruefeGelenke(z, sollLetzte, `t=${t}`);
    }
    // Halte-Segment: zwischen Start der letzten Pose und dauer_sek steht die letzte Pose still
    for (const anteil of [0.01, 0.25, 0.5, 0.9, 0.999]) {
      const t = t0[n - 1] + anteil * (anim.dauer_sek - t0[n - 1]);
      const z = A().abtasten(anim, t);
      if (z.fertig !== false) b.add(`${u.id} t=${t} (vor Ende): fertig ${z.fertig}, soll false`);
      if (z.phase !== n - 1) b.add(`${u.id} t=${t}: phase ${z.phase}, soll ${n - 1}`);
      pruefeGelenke(z, sollLetzte, `Halten t=${t}`);
    }
    // negative Zeit wird auf 0 geklemmt
    const z = A().abtasten(anim, -5);
    if (z.fertig !== false) b.add(`${u.id} t=-5: fertig ${z.fertig}, soll false`);
    if (z.phase !== 0) b.add(`${u.id} t=-5: phase ${z.phase}, soll 0`);
    pruefeGelenke(z, { gelenke: erste.gelenke, wurzel: wurzelVon(erste) }, "t=-5");
  }
  b.pruefen("loop:false");
});

test("11e kein Ueberschwingen zwischen zwei gleichen Posen (Daten: letzte Pose == Pose 0 bei loop:true)", () => {
  const b = new Befunde();
  let segmente = 0;
  for (const u of UEBUNGEN) {
    const anim = u.animation;
    const t0 = startzeiten(anim);
    anim.phasen.forEach((p, i) => {
      const j = naechstePose(anim, i);
      if (j === i) return; // Halte-Segment bei loop:false, in 11d geprueft
      const q = anim.phasen[j];
      const gleich = JSON.stringify(p.gelenke) === JSON.stringify(q.gelenke) &&
        JSON.stringify(wurzelVon(p)) === JSON.stringify(wurzelVon(q));
      if (!gleich) return;
      segmente += 1;
      for (let k = 1; k < 40; k++) {
        const t = t0[i] + (k / 40) * segmentDauer(anim, i);
        const z = A().abtasten(anim, t);
        for (const g of GELENKE_SPEC) {
          if (!(vecAbw(z.gelenke[g], p.gelenke[g]) <= TOL_RUHE_WINKEL)) {
            b.add(`${u.id} Segment ${i}->${j} t=${t.toFixed(4)} ${g}: ist ${fmt(z.gelenke[g])}, soll ${fmt(p.gelenke[g])}`);
          }
        }
        if (!(vecAbw(z.wurzel, wurzelVon(p)) <= TOL_RUHE_WEG)) b.add(`${u.id} Segment ${i}->${j} t=${t.toFixed(4)} wurzel: ist ${fmt(z.wurzel)}`);
      }
    });
  }
  assert.ok(segmente > 0, "keine gleichen Posen in den Daten gefunden - Test waere wirkungslos");
  b.pruefen(`Ueberschwingen in ${segmente} Segmenten mit gleichen Posen`);
});

test("11f je Kanal: gleiche Stuetzwerte an beiden Segmentenden -> Kanal bleibt stehen (aus Spec 5: jeder Kanal unabhaengig, zentripetal)", () => {
  // Abgeleitet: Bei zentripetaler Catmull-Rom je Kanal hat ein Segment mit gleichen Endwerten
  // die Knotenlaenge 0, die Kurve ist dort konstant. Ein Ueberschwingen hier heisst: der Kanal
  // wird nicht unabhaengig bzw. nicht zentripetal parametrisiert (sichtbar als Zittern ruhender Glieder).
  const b = new Befunde();
  const TOL_WINKEL = TOL_RUHE_WINKEL;
  const TOL_WEG = TOL_RUHE_WEG;
  for (const u of UEBUNGEN) {
    const anim = u.animation;
    const t0 = startzeiten(anim);
    anim.phasen.forEach((p, i) => {
      const j = naechstePose(anim, i);
      if (j === i) return;
      const q = anim.phasen[j];
      const proben = [];
      for (let k = 1; k < 16; k++) proben.push(A().abtasten(anim, t0[i] + (k / 16) * segmentDauer(anim, i)));
      for (const g of GELENKE_SPEC) {
        for (let c = 0; c < 3; c++) {
          if (p.gelenke[g][c] !== q.gelenke[g][c]) continue;
          for (const z of proben) {
            const w = z.gelenke[g][c];
            if (!(Math.abs(w - p.gelenke[g][c]) <= TOL_WINKEL)) {
              b.add(`${u.id} Segment ${i}->${j} ${g}[${c}]: ${w} statt ${p.gelenke[g][c]}`);
              break;
            }
          }
        }
      }
      const wp = wurzelVon(p);
      const wq = wurzelVon(q);
      for (let c = 0; c < 3; c++) {
        if (wp[c] !== wq[c]) continue;
        for (const z of proben) {
          if (!(Math.abs(z.wurzel[c] - wp[c]) <= TOL_WEG)) {
            b.add(`${u.id} Segment ${i}->${j} wurzel[${c}]: ${z.wurzel[c]} statt ${wp[c]}`);
            break;
          }
        }
      }
    });
  }
  b.pruefen("Kanal-Ueberschwingen");
});

test("11g alle Werte endlich bei 200 Abtastschritten je Uebung (kein NaN)", () => {
  const b = new Befunde();
  for (const u of UEBUNGEN) {
    const anim = u.animation;
    const n = anim.phasen.length;
    const zeiten = [];
    for (let k = 0; k < 200; k++) zeiten.push((k / 200) * anim.dauer_sek);
    if (!anim.loop) zeiten.push(anim.dauer_sek);
    for (const t of zeiten) {
      const z = A().abtasten(anim, t);
      if (!z || typeof z !== "object") {
        b.add(`${u.id} t=${t}: kein Objekt`);
        continue;
      }
      const g = z.gelenke || {};
      if (Object.keys(g).length !== 16) b.add(`${u.id} t=${t}: gelenke hat ${Object.keys(g).length} Schluessel`);
      for (const name of GELENKE_SPEC) if (!istVec3(g[name])) b.add(`${u.id} t=${t} ${name}: ${fmt(g[name])}`);
      if (!istVec3(z.wurzel)) b.add(`${u.id} t=${t} wurzel: ${fmt(z.wurzel)}`);
      if (!Array.isArray(z.objektPositionen) || z.objektPositionen.length !== (anim.equipment_objekte || []).length) {
        b.add(`${u.id} t=${t}: objektPositionen Laenge`);
      } else {
        z.objektPositionen.forEach((o, k) => {
          if (o !== null && !istVec3(o)) b.add(`${u.id} t=${t} objektPositionen[${k}]: ${fmt(o)}`);
        });
      }
      if (!Number.isInteger(z.phase) || z.phase < 0 || z.phase >= n) b.add(`${u.id} t=${t}: phase ${z.phase}`);
      if (typeof z.fertig !== "boolean") b.add(`${u.id} t=${t}: fertig ${z.fertig}`);
    }
  }
  b.pruefen("nicht endliche Werte");
});

// ===========================================================================
// 12 Seitenwechsel ueber zustandBei
// ===========================================================================

test("12 zustandBei: Seite 1 in [0,dauer), Seite 2 in [dauer,2*dauer) = abtasten(spiegeln(a), t-dauer)", () => {
  const b = new Befunde();
  for (const u of UEBUNGEN) {
    const anim = u.animation;
    const d = anim.dauer_sek;
    const vorher = structuredClone(anim);
    const gespiegelt = anim.seitenwechsel ? A().spiegeln(anim) : null;
    for (let k = 0; k < 20; k++) {
      const x = ((k + 0.37) / 20) * d;
      const z1 = A().zustandBei(anim, x);
      if (!z1 || z1.seite !== 1) b.add(`${u.id} t=${x}: seite ${z1 && z1.seite}, soll 1`);
      const abw1 = zustandsAbweichung(z1, A().abtasten(anim, x), TOL, true);
      if (abw1) b.add(`${u.id} Seite 1 t=${x}: ${abw1}`);
      if (gespiegelt) {
        const t2 = d + x;
        const z2 = A().zustandBei(anim, t2);
        if (!z2 || z2.seite !== 2) b.add(`${u.id} t=${t2}: seite ${z2 && z2.seite}, soll 2`);
        const abw2 = zustandsAbweichung(z2, A().abtasten(gespiegelt, t2 - d), TOL, true);
        if (abw2) b.add(`${u.id} Seite 2 t=${t2}: ${abw2}`);
        if (anim.loop) {
          const z3 = A().zustandBei(anim, 2 * d + x);
          if (!z3 || z3.seite !== 1) b.add(`${u.id} t=2*dauer+${x}: seite ${z3 && z3.seite}, soll 1 (loop von vorn)`);
          const abw3 = zustandsAbweichung(z3, z1, 1e-7, false);
          if (abw3) b.add(`${u.id} t=2*dauer+${x} vs t=${x}: ${abw3}`);
        }
      }
    }
    if (gespiegelt) {
      const grenze = A().zustandBei(anim, d);
      if (grenze.seite !== 2) b.add(`${u.id} t=dauer: seite ${grenze.seite}, soll 2`);
      const soll = gespiegelt.phasen[0];
      for (const g of GELENKE_SPEC) {
        if (!(vecAbw(grenze.gelenke[g], soll.gelenke[g]) <= TOL)) b.add(`${u.id} t=dauer ${g}: ist ${fmt(grenze.gelenke[g])}, soll gespiegelte Pose 0 ${fmt(soll.gelenke[g])}`);
      }
      const vorGrenze = A().zustandBei(anim, d * 0.999);
      if (vorGrenze.seite !== 1) b.add(`${u.id} t=0.999*dauer: seite ${vorGrenze.seite}, soll 1`);
    }
    assert.deepStrictEqual(anim, vorher, `${u.id}: zustandBei veraendert die Animation`);
  }
  b.pruefen("zustandBei");
});

// ===========================================================================
// 13-14 Rahmung: Signatur, Determinismus, unbekannte Kamera
// ===========================================================================

test("13 rahmung(animation): ein Parameter, kein Zeitparameter, deterministisch, ohne Nebenwirkung", () => {
  assert.equal(typeof A().rahmung, "function");
  assert.equal(A().rahmung.length, 1, "rahmung soll genau einen Parameter (animation) haben");
  for (const id of ["jab-am-sack", "graetschsitz-adduktoren-dehnung", "kettlebell-swing-beidarmig"]) {
    const anim = uebung(id).animation;
    const vorher = structuredClone(anim);
    const r1 = A().rahmung(anim);
    A().abtasten(anim, anim.dauer_sek * 0.4);
    A().zustandBei(anim, anim.dauer_sek * 1.3);
    const r2 = A().rahmung(anim);
    assert.deepStrictEqual(r2, r1, `${id}: rahmung nicht deterministisch`);
    assert.deepStrictEqual(anim, vorher, `${id}: rahmung veraendert die Animation`);
  }
});

test("13b rahmung fuer alle 72 Uebungen: ziel, abstand, position, fov, box nach Spec 4", () => {
  const b = new Befunde();
  const tanHalb = Math.tan((FOV / 2) * GRAD);
  for (const u of UEBUNGEN) {
    const anim = u.animation;
    let r;
    try {
      r = A().rahmung(anim);
      pruefeRahmungsform(r, u.id);
    } catch (e) {
      b.add(e.message);
      continue;
    }
    const mittelY = anim.phasen.reduce((s, p) => s + wurzelVon(p)[1], 0) / anim.phasen.length;
    const sollY = klemme(mittelY, ZIEL_Y_MIN, ZIEL_Y_MAX);
    if (!(Math.abs(r.ziel[1] - sollY) <= TOL)) b.add(`${u.id}: ziel.y ${r.ziel[1]}, soll ${sollY} (Mittel becken-Hoehe geklemmt)`);
    if (!(Math.abs(r.ziel[0] - (r.box.min[0] + r.box.max[0]) / 2) <= TOL)) b.add(`${u.id}: ziel.x nicht Mitte der box`);
    if (!(Math.abs(r.ziel[2] - (r.box.min[2] + r.box.max[2]) / 2) <= TOL)) b.add(`${u.id}: ziel.z nicht Mitte der box`);
    if (!(r.abstand >= MIN_ABSTAND - TOL)) b.add(`${u.id}: abstand ${r.abstand} < 4.2`);
    if (r.fov !== FOV) b.add(`${u.id}: fov ${r.fov}`);
    const kam = KAMERAS_SPEC[anim.kamera];
    const sollPos = kameraPosition(r.ziel, r.abstand, kam.azimut, kam.elevation);
    if (!(vecAbw(r.position, sollPos) <= TOL)) b.add(`${u.id}: position ${fmt(r.position)}, soll ${fmt(sollPos)}`);
    // box enthaelt alle 16 Gelenke aller Phasen
    anim.phasen.forEach((p, i) => {
      const P = A().posen(p.gelenke, p.wurzel_position_m);
      for (const g of GELENKE_SPEC) {
        for (let c = 0; c < 3; c++) {
          if (P[g][c] < r.box.min[c] - TOL || P[g][c] > r.box.max[c] + TOL) {
            b.add(`${u.id} P${i} ${g}[${c}]=${P[g][c].toFixed(4)} ausserhalb box [${r.box.min[c].toFixed(4)}, ${r.box.max[c].toFixed(4)}]`);
          }
        }
      }
    });
    // die box passt ins quadratische Bild (32 Grad Oeffnung; der 12-%-Rand macht es nur enger)
    const vor = normiere([r.ziel[0] - r.position[0], r.ziel[1] - r.position[1], r.ziel[2] - r.position[2]]);
    const rechts = normiere(kreuz(vor, [0, 1, 0]));
    const oben = kreuz(rechts, vor);
    for (const ex of [r.box.min[0], r.box.max[0]]) for (const ey of [r.box.min[1], r.box.max[1]]) for (const ez of [r.box.min[2], r.box.max[2]]) {
      const dvec = [ex - r.position[0], ey - r.position[1], ez - r.position[2]];
      const tiefe = skalar(dvec, vor);
      const nx = skalar(dvec, rechts) / tiefe / tanHalb;
      const ny = skalar(dvec, oben) / tiefe / tanHalb;
      if (!(tiefe > 0 && Math.abs(nx) <= 1 + 1e-9 && Math.abs(ny) <= 1 + 1e-9)) {
        b.add(`${u.id}: box-Ecke ${fmt([ex, ey, ez])} liegt nicht im Bild (nx ${nx.toFixed(3)}, ny ${ny.toFixed(3)})`);
      }
    }
  }
  b.pruefen("Rahmung");
});

test("14 unbekannte Kamera -> frontal plus console.warn", () => {
  const anim = structuredClone(uebung("jab-am-sack").animation);
  const warnungen = [];
  const altWarn = console.warn;
  let rFrontal;
  let rUnbekannt;
  try {
    console.warn = (...args) => warnungen.push(args);
    rFrontal = A().rahmung(Object.assign(structuredClone(anim), { kamera: "frontal" }));
    assert.equal(warnungen.length, 0, "rahmung warnt bei gueltiger Kamera 'frontal'");
    rUnbekannt = A().rahmung(Object.assign(structuredClone(anim), { kamera: "vogelperspektive_test_" + Date.now() }));
  } finally {
    console.warn = altWarn;
  }
  assert.ok(warnungen.length >= 1, "keine console.warn bei unbekannter Kamera");
  pruefeRahmungsform(rUnbekannt, "unbekannte Kamera");
  assertVec(rUnbekannt.ziel, rFrontal.ziel, TOL, "ziel wie frontal");
  assertZahl(rUnbekannt.abstand, rFrontal.abstand, TOL, "abstand wie frontal");
  assertVec(rUnbekannt.position, rFrontal.position, TOL, "position wie frontal");
  assertVec(rUnbekannt.position, kameraPosition(rUnbekannt.ziel, rUnbekannt.abstand, 0, 8), TOL, "position mit Azimut 0 / Elevation 8");
  assert.equal(rUnbekannt.fov, FOV);
});

// ===========================================================================
// Zusatz: Spiegelung inhaltlich, Rotationen
// ===========================================================================

test("15 spiegeln inhaltlich (alle 72): Winkel [x,-y,-z] mit _l/_r-Tausch, X-Positionen negiert, Rest unveraendert", () => {
  const b = new Befunde();
  for (const u of UEBUNGEN) {
    const a = u.animation;
    const m = A().spiegeln(a);
    for (const feld of ["kamera", "dauer_sek", "loop", "seitenwechsel"]) {
      if (m[feld] !== a[feld]) b.add(`${u.id}: ${feld} veraendert (${m[feld]} statt ${a[feld]})`);
    }
    if (!Array.isArray(m.phasen) || m.phasen.length !== a.phasen.length) {
      b.add(`${u.id}: Phasenzahl`);
      continue;
    }
    a.phasen.forEach((p, i) => {
      const q = m.phasen[i];
      for (const feld of ["name", "hinweis", "zeitanteil"]) if (q[feld] !== p[feld]) b.add(`${u.id} P${i}: ${feld} veraendert`);
      if (Object.keys(q.gelenke).length !== 16) b.add(`${u.id} P${i}: gespiegelte gelenke hat ${Object.keys(q.gelenke).length} Schluessel`);
      for (const g of GELENKE_SPEC) {
        const w = p.gelenke[g];
        if (!(vecAbw(q.gelenke[tausch(g)], [w[0], -w[1], -w[2]]) <= 0)) {
          b.add(`${u.id} P${i} ${g} -> ${tausch(g)}: ist ${fmt(q.gelenke[tausch(g)])}, soll ${fmt([w[0], -w[1], -w[2]])}`);
        }
      }
      if (p.wurzel_position_m) {
        const w = p.wurzel_position_m;
        if (!(vecAbw(q.wurzel_position_m, [-w[0], w[1], w[2]]) <= 0)) b.add(`${u.id} P${i} wurzel_position_m: ${fmt(q.wurzel_position_m)}`);
      } else if (q.wurzel_position_m !== undefined && !(vecAbw(q.wurzel_position_m, VORGABE_WURZEL) <= 0)) {
        b.add(`${u.id} P${i}: fehlende wurzel_position_m wurde zu ${fmt(q.wurzel_position_m)}`);
      }
      // geometrisch: Spiegelbild an der YZ-Ebene mit _l/_r-Tausch, fuer alle 20 Punkte
      const P = A().posen(p.gelenke, p.wurzel_position_m);
      const Q = A().posen(q.gelenke, q.wurzel_position_m);
      for (const k of PUNKTE) {
        const soll = [-P[k][0], P[k][1], P[k][2]];
        if (!(vecAbw(Q[tausch(k)], soll) <= TOL)) b.add(`${u.id} P${i} Punkt ${tausch(k)}: ist ${fmt(Q[tausch(k)])}, soll Spiegelbild ${fmt(soll)}`);
      }
    });
    const oa = a.equipment_objekte || [];
    const om = m.equipment_objekte || [];
    if (oa.length !== om.length) {
      b.add(`${u.id}: equipment_objekte Laenge ${om.length} statt ${oa.length}`);
      continue;
    }
    oa.forEach((o, k) => {
      const n = om[k];
      if (n.typ !== o.typ || n.form !== o.form) b.add(`${u.id} objekt ${k}: typ/form veraendert`);
      if (JSON.stringify(n.masse_m) !== JSON.stringify(o.masse_m)) b.add(`${u.id} objekt ${k}: masse_m veraendert`);
      if (n.bindung !== tausch(o.bindung)) b.add(`${u.id} objekt ${k}: bindung ${n.bindung}, soll ${tausch(o.bindung)}`);
      if (!(vecAbw(n.position, [-o.position[0], o.position[1], o.position[2]]) <= 0)) b.add(`${u.id} objekt ${k}: position ${fmt(n.position)}`);
      if (o.position_pro_phase) {
        if (!Array.isArray(n.position_pro_phase) || n.position_pro_phase.length !== o.position_pro_phase.length) {
          b.add(`${u.id} objekt ${k}: position_pro_phase Laenge`);
        } else {
          o.position_pro_phase.forEach((pp, i) => {
            if (!(vecAbw(n.position_pro_phase[i], [-pp[0], pp[1], pp[2]]) <= 0)) b.add(`${u.id} objekt ${k} position_pro_phase[${i}]: ${fmt(n.position_pro_phase[i])}`);
          });
        }
      }
    });
  }
  b.pruefen("spiegeln");
});

test("16 rotationen: Weltrotation je Gelenk nach Spec 3 (Rx*Ry*Rz, Gruppe B mit -x), orthonormal, passend zu posen", () => {
  const b = new Befunde();
  const kanten = [
    // [Kind, Eltern-Punkt, Rotation, Ruhevektor]
    ["brust", "becken", "brust", [0, 0.3, 0]],
    ["hals", "brust", "hals", [0, 0.22, 0]],
    ["kopf", "hals", "kopf", [0, 0.16, 0]],
    ["schulter_l", "brust", "brust", [-0.2, 0, 0]],
    ["schulter_r", "brust", "brust", [0.2, 0, 0]],
    ["ellbogen_l", "schulter_l", "schulter_l", [0, -0.32, 0]],
    ["ellbogen_r", "schulter_r", "schulter_r", [0, -0.32, 0]],
    ["hand_l", "ellbogen_l", "ellbogen_l", [0, -0.28, 0]],
    ["hand_r", "ellbogen_r", "ellbogen_r", [0, -0.28, 0]],
    ["hand_l_faust", "hand_l", "hand_l", [0, -0.09, 0]],
    ["hand_r_faust", "hand_r", "hand_r", [0, -0.09, 0]],
    ["huefte_l", "becken", "becken", [-0.1, 0, 0]],
    ["huefte_r", "becken", "becken", [0.1, 0, 0]],
    ["knie_l", "huefte_l", "huefte_l", [0, -0.45, 0]],
    ["knie_r", "huefte_r", "huefte_r", [0, -0.45, 0]],
    ["fuss_l", "knie_l", "knie_l", [0, -0.45, 0]],
    ["fuss_r", "knie_r", "knie_r", [0, -0.45, 0]],
    ["fuss_l_zeh", "fuss_l", "fuss_l", [0, 0, 0.18]],
    ["fuss_r_zeh", "fuss_r", "fuss_r", [0, 0, 0.18]],
  ];
  // Nullstellung: Einheitsmatrix
  const R0 = A().rotationen(nullPose());
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const g of GELENKE_SPEC) assert.ok(matAbw(R0[g], I) <= TOL, `Nullstellung ${g}: keine Einheitsmatrix`);
  for (const u of UEBUNGEN) {
    u.animation.phasen.forEach((p, i) => {
      const R = A().rotationen(p.gelenke);
      const soll = weltRotationenSpec(p.gelenke);
      for (const g of GELENKE_SPEC) {
        const d = matAbw(R[g], soll[g]);
        if (!(d <= TOL)) {
          b.add(`${u.id} P${i} ${g}: Abweichung ${d} zu Rx*Ry*Rz-Kette`);
          continue;
        }
        const RRt = mm(R[g], [[R[g][0][0], R[g][1][0], R[g][2][0]], [R[g][0][1], R[g][1][1], R[g][2][1]], [R[g][0][2], R[g][1][2], R[g][2][2]]]);
        if (!(matAbw(RRt, I) <= TOL)) b.add(`${u.id} P${i} ${g}: nicht orthonormal`);
      }
      const P = A().posen(p.gelenke, p.wurzel_position_m);
      for (const [kind, eltern, rot, ruhe] of kanten) {
        if (!R[rot]) continue;
        const sollPunkt = add3(P[eltern], mv(R[rot], ruhe));
        if (!(vecAbw(P[kind], sollPunkt) <= TOL)) b.add(`${u.id} P${i} ${kind}: posen ${fmt(P[kind])} passt nicht zu rotationen.${rot} (${fmt(sollPunkt)})`);
      }
    });
  }
  b.pruefen("rotationen");
});
