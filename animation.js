/* Zyklus – Übungsanimationen (Strichfiguren auf Canvas 2D).
   Umsetzung von daten-import/animations-spezifikation.md. Die Datei kennt keine
   einzelne Übung: Sie bekommt ein Objekt nach dem Schema und zeichnet es. Jede
   Sonderbehandlung einer Übungs-id wäre ein Fehler (Spec §12).

   Abschnitte: SKELETT · POSE · SPIEGELUNG · INTERPOLATION · FORMEN · KAMERA ·
   ZEICHNEN · STEUERUNG. Die reinen Funktionen laufen auch in Node (Tests). */
(function (root) {
  "use strict";

  /* ───────────────────────── SKELETT (Spec §1, §2) ───────────────────────── */

  var GELENKE = ["kopf", "hals", "brust", "becken",
                 "schulter_l", "schulter_r", "ellbogen_l", "ellbogen_r", "hand_l", "hand_r",
                 "huefte_l", "huefte_r", "knie_l", "knie_r", "fuss_l", "fuss_r"];
  var IST_GELENK = {};
  GELENKE.forEach(function (g) { IST_GELENK[g] = true; });

  var LAENGE = {
    becken_brust: 0.30, brust_hals: 0.22, hals_kopf: 0.16, kopfradius: 0.11,
    oberarm: 0.32, unterarm: 0.28, hand: 0.09,
    oberschenkel: 0.45, unterschenkel: 0.45, fusslaenge: 0.18
  };
  var WURZEL_VORGABE = [0, 0.98, 0];
  var SCHULTER_VERSATZ = { schulter_l: [-0.20, 0, 0], schulter_r: [0.20, 0, 0] };
  var HUEFT_VERSATZ = { huefte_l: [-0.10, 0, 0], huefte_r: [0.10, 0, 0] };
  var HOCH = [0, 1, 0], RUNTER = [0, -1, 0], VOR = [0, 0, 1];

  /* Gruppe B aus Spec §3: Segmente mit Ruhelage nach oben und das Knie beugen
     mit negiertem X-Winkel. Das ist die Regel „X positiv = Beugung", kein Sonderfall. */
  var X_GEGENLAEUFIG = { becken: true, brust: true, hals: true, kopf: true, knie_l: true, knie_r: true };

  /* Zeichenliste (Spec §1): [von, bis, Strichgruppe]. Schulter- und Hüftverbindung
     zählen zu den Gliedmaßen (3,5 px), der Rumpf ist becken–brust–hals (5 px). */
  var LINIEN = [
    ["becken", "brust", "rumpf"], ["brust", "hals", "rumpf"],
    ["hals", "kopf", "glied"],
    ["brust", "schulter_l", "glied"], ["brust", "schulter_r", "glied"],
    ["schulter_l", "ellbogen_l", "glied"], ["schulter_r", "ellbogen_r", "glied"],
    ["ellbogen_l", "hand_l", "glied"], ["ellbogen_r", "hand_r", "glied"],
    ["becken", "huefte_l", "glied"], ["becken", "huefte_r", "glied"],
    ["huefte_l", "knie_l", "glied"], ["huefte_r", "knie_r", "glied"],
    ["knie_l", "fuss_l", "glied"], ["knie_r", "fuss_r", "glied"],
    ["fuss_l", "fuss_l_zeh", "fuss"], ["fuss_r", "fuss_r_zeh", "fuss"],
    ["hand_l", "hand_l_faust", "hand"], ["hand_r", "hand_r_faust", "hand"]
  ];

  /* Spec §8, Bildschirmpixel (werden mit devicePixelRatio multipliziert). */
  var STRICH = { rumpf: 5.0, glied: 3.5, fuss: 3.0, hand: 3.0, kopf: 3.5, geraet: 2.5, raster: 1.0 };
  var PUNKT_RADIUS = 3.5;

  /* Spec §7: nur diese Werte. Im dunklen Erscheinungsbild werden genau drei getauscht. */
  var FARBEN = {
    hell: { figur: "#1E5AA8", geraet: "#C62828", boden: "#9E9E9E" },
    dunkel: { figur: "#6FA8E8", geraet: "#F26A6A", boden: "#6B6B6B" }
  };
  var DECKKRAFT_RASTER = 0.35, DECKKRAFT_EBENE = 0.08;

  /* ───────────────────────── Vektor- und Matrixhelfer ───────────────────────── */

  var EINHEIT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

  function rad(g) { return g * Math.PI / 180; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function skal(v, f) { return [v[0] * f, v[1] * f, v[2] * f]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function kreuz(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm(v) {
    var l = Math.sqrt(dot(v, v));
    return l > 0 ? skal(v, 1 / l) : [0, 0, 0];
  }
  function mm(A, B) {
    var C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], i, j, k, s;
    for (i = 0; i < 3; i++) {
      for (j = 0; j < 3; j++) {
        s = 0;
        for (k = 0; k < 3; k++) s += A[i][k] * B[k][j];
        C[i][j] = s;
      }
    }
    return C;
  }
  function mv(A, v) {
    return [A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
            A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
            A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]];
  }

  /* ───────────────────────── POSE (Spec §3) ───────────────────────── */

  /* Matrizen exakt wie in Spec §3 ausgeschrieben (= referenz-kinematik.py). */
  function rx(a) { var c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; }
  function ry(a) { var c = Math.cos(a), s = Math.sin(a); return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; }
  function rz(a) { var c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; }

  /* Intrinsisch X, dann Y, dann Z: R = Rx(x) · Ry(y) · Rz(z). */
  function lokaleRotation(name, w) {
    var x = rad(w[0]);
    if (X_GEGENLAEUFIG[name]) x = -x;
    return mm(mm(rx(x), ry(rad(w[1]))), rz(rad(w[2])));
  }

  /* Vorwärtskinematik über die Kette aus Spec §1. Liefert Weltpositionen (P)
     und Weltrotationen (R). Reihenfolge der Rechnung wie in der Referenz. */
  function kette(gelenke, wurzel) {
    var P = {}, R = {};
    var w = wurzel || WURZEL_VORGABE;

    R.becken = lokaleRotation("becken", gelenke.becken);
    P.becken = [w[0], w[1], w[2]];
    R.brust = mm(R.becken, lokaleRotation("brust", gelenke.brust));
    P.brust = add(P.becken, mv(R.brust, skal(HOCH, LAENGE.becken_brust)));
    R.hals = mm(R.brust, lokaleRotation("hals", gelenke.hals));
    P.hals = add(P.brust, mv(R.hals, skal(HOCH, LAENGE.brust_hals)));
    R.kopf = mm(R.hals, lokaleRotation("kopf", gelenke.kopf));
    P.kopf = add(P.hals, mv(R.kopf, skal(HOCH, LAENGE.hals_kopf)));

    [["schulter_l", "ellbogen_l", "hand_l"], ["schulter_r", "ellbogen_r", "hand_r"]].forEach(function (arm) {
      var s = arm[0], e = arm[1], h = arm[2];
      P[s] = add(P.brust, mv(R.brust, SCHULTER_VERSATZ[s]));
      R[s] = mm(R.brust, lokaleRotation(s, gelenke[s]));
      R[e] = mm(R[s], lokaleRotation(e, gelenke[e]));
      P[e] = add(P[s], mv(R[s], skal(RUNTER, LAENGE.oberarm)));
      R[h] = mm(R[e], lokaleRotation(h, gelenke[h]));
      P[h] = add(P[e], mv(R[e], skal(RUNTER, LAENGE.unterarm)));
      P[h + "_faust"] = add(P[h], mv(R[h], skal(RUNTER, LAENGE.hand)));
    });

    [["huefte_l", "knie_l", "fuss_l"], ["huefte_r", "knie_r", "fuss_r"]].forEach(function (bein) {
      var hu = bein[0], kn = bein[1], fu = bein[2];
      P[hu] = add(P.becken, mv(R.becken, HUEFT_VERSATZ[hu]));
      R[hu] = mm(R.becken, lokaleRotation(hu, gelenke[hu]));
      R[kn] = mm(R[hu], lokaleRotation(kn, gelenke[kn]));
      P[kn] = add(P[hu], mv(R[hu], skal(RUNTER, LAENGE.oberschenkel)));
      R[fu] = mm(R[kn], lokaleRotation(fu, gelenke[fu]));
      P[fu] = add(P[kn], mv(R[kn], skal(RUNTER, LAENGE.unterschenkel)));
      P[fu + "_zeh"] = add(P[fu], mv(R[fu], skal(VOR, LAENGE.fusslaenge)));
    });

    return { P: P, R: R };
  }

  function posen(gelenke, wurzel) { return kette(gelenke, wurzel).P; }
  function rotationen(gelenke) { return kette(gelenke, WURZEL_VORGABE).R; }

  /* ───────────────────────── SPIEGELUNG (Spec §6) ───────────────────────── */

  function seitenTausch(name) {
    if (typeof name !== "string") return name;
    if (/_l$/.test(name)) return name.slice(0, -2) + "_r";
    if (/_r$/.test(name)) return name.slice(0, -2) + "_l";
    return name;
  }

  /* 0 − v statt −v: ergibt nie −0, damit spiegeln(spiegeln(a)) tief gleich a bleibt
     (die JSON-Kopie macht aus −0 eine 0). */
  function negiert(v) { return 0 - v; }
  function spiegelPunkt(p) { return [negiert(p[0]), p[1], p[2]]; }

  /* Reine Datentransformation: Winkel x bleibt, y → −y, z → −z; _l ↔ _r;
     Positionen X → −X. Die Eingabe bleibt unverändert. */
  function spiegeln(animation) {
    var a = JSON.parse(JSON.stringify(animation));
    a.phasen.forEach(function (ph) {
      var neu = {};
      Object.keys(ph.gelenke).forEach(function (name) {
        var w = ph.gelenke[name];
        neu[seitenTausch(name)] = [w[0], negiert(w[1]), negiert(w[2])];
      });
      ph.gelenke = neu;
      if (ph.wurzel_position_m) ph.wurzel_position_m = spiegelPunkt(ph.wurzel_position_m);
    });
    (a.equipment_objekte || []).forEach(function (o) {
      if (o.position) o.position = spiegelPunkt(o.position);
      if (o.position_pro_phase) o.position_pro_phase = o.position_pro_phase.map(spiegelPunkt);
      o.bindung = seitenTausch(o.bindung);
    });
    return a;
  }

  /* ───────────────────────── INTERPOLATION (Spec §5) ───────────────────────── */

  var ZEIT_TOLERANZ = 1e-9;

  function zeitverzerrung(s, zeitanteil) {
    if (zeitanteil <= 0.15) return 1 - (1 - s) * (1 - s);
    return s * s * (3 - 2 * s);
  }

  /* Lineare Interpolation zwischen zwei Knoten. Fallen die Knoten zusammen, sind
     die Werte gleich (Knotenabstand = √|Δ|) – dann einfach den Wert liefern. */
  function knotenLerp(a, b, ta, tb, t) {
    if (tb === ta) return a;
    return a + (b - a) * (t - ta) / (tb - ta);
  }

  /* Zentripetale Catmull-Rom-Spline (α = 0,5) für EINEN Kanal, Segment p1 → p2,
     u ∈ [0,1]. Formulierung nach Barry-Goldman. */
  function catmullRom(p0, p1, p2, p3, u) {
    if (u <= 0) return p1;
    if (u >= 1) return p2;
    var t0 = 0;
    var t1 = t0 + Math.sqrt(Math.abs(p1 - p0));
    var t2 = t1 + Math.sqrt(Math.abs(p2 - p1));
    var t3 = t2 + Math.sqrt(Math.abs(p3 - p2));
    if (t2 === t1) return p1;                           // gleiche Posen: kein Überschwingen
    var t = t1 + u * (t2 - t1);
    var A1 = knotenLerp(p0, p1, t0, t1, t);
    var A2 = knotenLerp(p1, p2, t1, t2, t);
    var A3 = knotenLerp(p2, p3, t2, t3, t);
    var B1 = knotenLerp(A1, A2, t0, t2, t);
    var B2 = knotenLerp(A2, A3, t1, t3, t);
    return knotenLerp(B1, B2, t1, t2, t);
  }

  /* Jede Phase als flacher Werte-Vektor: 48 Winkel, 3 Wurzel, dann je Objekt mit
     position_pro_phase drei Werte. Einmal je Animation berechnet. */
  function vorbereiten(animation) {
    var phasen = animation.phasen, n = phasen.length;
    var objekte = animation.equipment_objekte || [];
    var objektKanal = objekte.map(function () { return -1; });
    var werte = [], starts = [], anteile = [], summe = 0, i;
    for (i = 0; i < n; i++) {
      var ph = phasen[i], v = [];
      GELENKE.forEach(function (g) { var w = ph.gelenke[g]; v.push(w[0], w[1], w[2]); });
      var wu = ph.wurzel_position_m || WURZEL_VORGABE;
      v.push(wu[0], wu[1], wu[2]);
      for (var oi = 0; oi < objekte.length; oi++) {
        if (!objekte[oi].position_pro_phase) continue;
        if (i === 0) objektKanal[oi] = v.length;
        var p = objekte[oi].position_pro_phase[i];
        v.push(p[0], p[1], p[2]);
      }
      werte.push(v);
      anteile.push(ph.zeitanteil);
      starts.push(summe * animation.dauer_sek);
      summe += ph.zeitanteil;
    }
    return {
      animation: animation, n: n, dauer: animation.dauer_sek, loop: animation.loop !== false,
      werte: werte, starts: starts, anteile: anteile, objektKanal: objektKanal
    };
  }

  /* t modulo Periode, ohne ((t % p) + p) % p: das doppelte Modulo rundet an der
     Periodengrenze (1,3 % 2,6 + 2,6) % 2,6 = 1,2999… und landet auf der falschen Seite. */
  function zyklisch(t, periode) {
    if (!(periode > 0)) return 0;
    var r = t % periode;
    return r < 0 ? r + periode : r;
  }

  function auswerten(vb, tSek) {
    var n = vb.n, dauer = vb.dauer, fertig = false, tt;
    if (vb.loop) {
      tt = zyklisch(tSek, dauer);
    } else {
      if (tSek >= dauer) fertig = true;
      tt = Math.max(0, Math.min(tSek, dauer));
    }

    /* Toleranz: Auf Seite 2 entsteht tt als (dauer + start) − dauer und liegt durch
       Rundung oft knapp unter start – ohne Toleranz landete die Suche eine Phase zu früh
       und der Einzelbild-Schritt käme nicht mehr voran. */
    var i = n - 1;
    while (i > 0 && vb.starts[i] > tt + ZEIT_TOLERANZ) i--;

    var vek;
    if (!vb.loop && i === n - 1) {
      vek = vb.werte[n - 1].slice();                    // letzte Phase hält ihre Pose
    } else {
      var laenge = vb.anteile[i] * dauer;
      var s = laenge > 0 ? Math.min(1, Math.max(0, (tt - vb.starts[i]) / laenge)) : 1;
      var u = zeitverzerrung(s, vb.anteile[i]);
      var i0, i2, i3;
      if (vb.loop) {
        i0 = (i - 1 + n) % n; i2 = (i + 1) % n; i3 = (i + 2) % n;
      } else {                                          // erste und letzte Pose verdoppelt
        i0 = Math.max(0, i - 1); i2 = Math.min(n - 1, i + 1); i3 = Math.min(n - 1, i + 2);
      }
      var w0 = vb.werte[i0], w1 = vb.werte[i], w2 = vb.werte[i2], w3 = vb.werte[i3];
      vek = new Array(w1.length);
      for (var k = 0; k < w1.length; k++) vek[k] = catmullRom(w0[k], w1[k], w2[k], w3[k], u);
    }

    var gelenke = {};
    for (var g = 0; g < GELENKE.length; g++) {
      gelenke[GELENKE[g]] = [vek[g * 3], vek[g * 3 + 1], vek[g * 3 + 2]];
    }
    return {
      gelenke: gelenke,
      wurzel: [vek[48], vek[49], vek[50]],
      objektPositionen: vb.objektKanal.map(function (c) {
        return c < 0 ? null : [vek[c], vek[c + 1], vek[c + 2]];
      }),
      phase: i,
      fertig: fertig
    };
  }

  function abtasten(animation, tSek) { return auswerten(vorbereiten(animation), tSek); }

  /* Seitenwechsel: ein Zyklus Originaldaten (Seite 1), ein Zyklus gespiegelt (Seite 2). */
  function gesamtDauer(animation) {
    return animation.dauer_sek * (animation.seitenwechsel ? 2 : 1);
  }

  function zustandAus(vbSeite1, vbSeite2, tGesamt) {
    var dauer = vbSeite1.dauer;
    if (!vbSeite2) {
      var z1 = auswerten(vbSeite1, tGesamt);
      z1.seite = 1;
      return z1;
    }
    var gesamt = dauer * 2, tt, fertig = false;
    if (vbSeite1.loop) {
      tt = zyklisch(tGesamt, gesamt);
    } else {
      if (tGesamt >= gesamt) fertig = true;
      tt = Math.max(0, Math.min(tGesamt, gesamt));
    }
    var seite = tt < dauer ? 1 : 2;
    var z = auswerten(seite === 1 ? vbSeite1 : vbSeite2, seite === 1 ? tt : tt - dauer);
    z.seite = seite;
    z.fertig = fertig;
    return z;
  }

  function zustandBei(animation, tGesamt) {
    return zustandAus(vorbereiten(animation),
                      animation.seitenwechsel ? vorbereiten(spiegeln(animation)) : null, tGesamt);
  }

  /* ───────────────────────── FORMEN (Spec §10) ───────────────────────── */

  var FORMEN = ["quader", "platte", "zylinder", "kugel", "stange", "seil", "kegel", "scheibe",
                "kugel_mit_buegel", "stange_mit_gurt", "guertel_mit_kette", "weste",
                "gelenkhuelse", "buegel", "doppelrad", "verbund"];

  var SEIL_PUNKTE = 16, RING_GRENZE = 0.05;             // X-Ausdehnung ≤ 5 cm = Enden fallen zusammen
  var BOHRUNG = 0.03, KAPPE = 0.05, HUELSE = 0.30;
  var ANHANG_SCHEIBE = 0.06;                            // kleine Scheibe am Ende von Gurt bzw. Kette

  /* Ellipse um m in der Ebene der Vektoren a und b (Radien stecken in a und b).
     voll = true: geschlossener Kreis (Endpunkt = Anfang), sonst Halbkreis. */
  function ellipse(m, a, b, segmente, voll) {
    var pts = [], bogen = voll ? 2 * Math.PI : Math.PI;
    for (var i = 0; i <= segmente; i++) {
      var w = bogen * i / segmente;
      pts.push(add(m, add(skal(a, Math.cos(w)), skal(b, Math.sin(w)))));
    }
    return pts;
  }

  function quaderLinien(x0, x1, y0, y1, z0, z1) {
    return [
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0]],
      [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [x0, y1, z0]],
      [[x0, y0, z0], [x0, y1, z0]], [[x1, y0, z0], [x1, y1, z0]],
      [[x1, y0, z1], [x1, y1, z1]], [[x0, y0, z1], [x0, y1, z1]]
    ];
  }

  function kugelLinien(m, rX, rY, rZ) {
    return [
      ellipse(m, [rX, 0, 0], [0, rY, 0], 24, true),
      ellipse(m, [rX, 0, 0], [0, 0, rZ], 24, true),
      ellipse(m, [0, rY, 0], [0, 0, rZ], 24, true)
    ];
  }

  function scheibeLinien(m, a, b) {
    return [ellipse(m, a, b, 24, true),
            ellipse(m, skal(norm(a), BOHRUNG), skal(norm(b), BOHRUNG), 24, true)];
  }

  /* Achsen-Indizes nach Größe absteigend (bei Gleichstand X vor Y vor Z). */
  function achsenNachGroesse(masse) {
    return [0, 1, 2].sort(function (i, j) { return masse[j] - masse[i] || i - j; });
  }
  function einheitsAchse(i) { var v = [0, 0, 0]; v[i] = 1; return v; }

  function stangeLinien(mitte, achse, halbeLaenge, quer) {
    var a = add(mitte, skal(achse, -halbeLaenge)), b = add(mitte, skal(achse, halbeLaenge));
    var k = skal(quer, KAPPE / 2);
    return [[a, b], [sub(a, k), add(a, k)], [sub(b, k), add(b, k)]];
  }

  /* Kettenlinie zwischen (−h,0,0) und (+h,0,0) mit Bogenlänge L, hängt nach −Y. */
  function kettenlinie(h, L) {
    var pts = [], i;
    if (L <= 2 * h + 1e-9) {
      for (i = 0; i < SEIL_PUNKTE; i++) pts.push([-h + 2 * h * i / (SEIL_PUNKTE - 1), 0, 0]);
      return pts;
    }
    /* a so bestimmen, dass 2a·sinh(h/a) = L (Bisektion; die Länge fällt mit wachsendem a). */
    var lo = 1e-4, hi = 1e4, a = 1, j;
    for (j = 0; j < 80; j++) {
      a = Math.sqrt(lo * hi);
      var len = 2 * a * Math.sinh(h / a);
      if (!isFinite(len) || len > L) lo = a; else hi = a;
    }
    var yEnde = a * Math.cosh(h / a);
    for (i = 0; i < SEIL_PUNKTE; i++) {
      var x = -h + 2 * h * i / (SEIL_PUNKTE - 1);
      pts.push([x, a * Math.cosh(x / a) - yEnde, 0]);
    }
    return pts;
  }

  /* „verbund": feste Zerlegung je Geräte-id, abgeleitet aus geometrie.beschreibung
     in equipment.json (Spec §10). Lokales System, Ursprung = position des Objekts
     (Standfläche Mitte bzw. Umlenkrolle). Wird nicht pro Übung variiert. */
  var RUECKEN_WINKEL = 40;                              // Rückenlehne, fest (klappbar 0–80°)
  function linie(a, b) { return [a, b]; }
  function kreisYZ(m, r) { return ellipse(m, [0, r, 0], [0, 0, r], 24, true); }

  var VERBUND = {
    /* Sitz-/Liegefläche 1,25 × 0,30 m in 0,45 m Höhe; Lehne 0,60 m, Drehpunkt am
       Sitzende; Hantelständer seitlich 1,05 m hoch, Abstand 0,65 m; Rollen Ø 0,10 m. */
    hantelbank: function () {
      var l = [], drehZ = -0.10, oben = 0.45, dicke = 0.05;
      quaderLinien(-0.15, 0.15, oben - dicke, oben, drehZ, 0.55).forEach(function (p) { l.push(p); });
      var w = rad(RUECKEN_WINKEL);
      var richtung = [0, Math.sin(w), -Math.cos(w)], unten = [0, -Math.cos(w) * dicke, -Math.sin(w) * dicke];
      var fuss = [0, oben, drehZ], ende = add(fuss, skal(richtung, 0.60));
      var e = [];                                       // je Seite: Fuß oben, Fuß unten, Ende oben, Ende unten
      [-0.15, 0.15].forEach(function (x) {
        e.push([x, fuss[1], fuss[2]], add([x, fuss[1], fuss[2]], unten),
               [x, ende[1], ende[2]], add([x, ende[1], ende[2]], unten));
      });
      [[0, 2], [1, 3], [0, 1], [2, 3], [4, 6], [5, 7], [4, 5], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]]
        .forEach(function (k) { l.push(linie(e[k[0]], e[k[1]])); });
      [0.45, -0.05].forEach(function (z) {                          // Beine mit Fußquerstrebe
        l.push(linie([0, 0, z], [0, oben - dicke, z]));
        l.push(linie([-0.30, 0, z], [0.30, 0, z]));
      });
      [-0.325, 0.325].forEach(function (x) {                        // Hantelständer mit Ablage
        l.push([[x, 0, -0.50], [x, 1.05, -0.50], [x, 1.05, -0.42]]);
      });
      l.push(linie([0, oben - dicke, 0.55], [0, 0.30, 0.62]));      // Beincurl-Rollen
      l.push(linie([-0.12, 0.30, 0.62], [0.12, 0.30, 0.62]));
      l.push(kreisYZ([-0.12, 0.30, 0.62], 0.05));
      l.push(kreisYZ([0.12, 0.30, 0.62], 0.05));
      return l;
    },

    /* Klimmzugstange 2,10 m, Breite 1,10 m; Dip-Griffe 1,15 m, lichter Abstand
       0,60 m, Länge 0,45 m; Rückenpolster 1,05–1,40 m; Liegestützgriffe 0,20 m. */
    "power-tower": function () {
      var l = [], hx = 0.55, zRahmen = -0.10, zHinten = -0.85;
      [-hx, hx].forEach(function (x) {
        l.push(linie([x, 0, zRahmen], [x, 2.15, zRahmen]));         // Pfosten
        l.push(linie([x, 0, zHinten], [x, 0, 0.10]));               // Standfuß
        l.push(linie([x, 0, zHinten], [x, 1.40, zRahmen]));         // Strebe
        l.push(linie([x, 2.10, zRahmen], [x, 2.10, 0.05]));         // Stangenhalter
        var d = x < 0 ? -0.30 : 0.30;
        l.push([[x, 1.15, zRahmen], [d, 1.15, zRahmen], [d, 1.15, 0.20]]); // Dip-Griff
        l.push(linie([x, 0.20, zRahmen], [x, 0.20, 0.08]));         // Liegestützgriff
      });
      l.push(linie([-hx, 2.10, 0.05], [hx, 2.10, 0.05]));           // Klimmzugstange
      l.push(linie([-hx, 0, zHinten], [hx, 0, zHinten]));
      l.push(linie([-hx, 1.22, zRahmen], [hx, 1.22, zRahmen]));
      quaderLinien(-0.15, 0.15, 1.05, 1.40, -0.16, -0.12).forEach(function (p) { l.push(p); });
      return l;
    },

    /* Umlenkrolle auf 2,10 m; vorn Seil zum Trizepsseil (zwei Stränge je 0,35 m mit
       Endkugeln), hinten Seil zur Scheibenaufnahme. */
    latzug: function () {
      var l = [];
      l.push(kreisYZ([0, 0, 0], 0.05));
      l.push(linie([0, 0.05, 0], [0, 0.10, 0]));                    // Aufhängung
      l.push(linie([0, 0, -0.05], [0, -1.45, -0.05]));              // Strang zur Scheibenaufnahme
      l.push(linie([0, 0, 0.05], [0, -0.60, 0.05]));                // Strang zum Griff
      [-1, 1].forEach(function (s) {
        var ende = [s * 0.12, -0.92, 0.05];
        l.push(linie([0, -0.60, 0.05], ende));
        l.push(ellipse(ende, [0.03, 0, 0], [0, 0.03, 0], 12, true));
      });
      return l;
    }
  };

  /* Bezugssystem eines Objekts: Ursprung und Rotation (Spec §10). Gelenkbindung:
     position ist Versatz im lokalen System des Gelenks. position_pro_phase ist immer
     Weltkoordinate und überschreibt Bindung und position. */
  function objektRahmen(o, P, R, positionUeberschrieben) {
    if (positionUeberschrieben) return { ursprung: positionUeberschrieben, rotation: EINHEIT };
    if (IST_GELENK[o.bindung] && P[o.bindung]) {
      return { ursprung: add(P[o.bindung], mv(R[o.bindung], o.position)), rotation: R[o.bindung] };
    }
    return { ursprung: o.position, rotation: EINHEIT };
  }

  var warnungen = {};
  function warneEinmal(text) {
    if (warnungen[text]) return;
    warnungen[text] = true;
    if (typeof console !== "undefined" && console.warn) console.warn("ZyklusAnimation: " + text);
  }

  /* Polylinien eines Objekts in Weltkoordinaten. Rückgabe null = nicht zeichnen. */
  function objektLinien(o, P, R, positionUeberschrieben) {
    if (o.typ === "boden") return null;                 // Spec §10: nur Lagemarkierung
    var rahmen = objektRahmen(o, P, R, positionUeberschrieben);
    var m = o.masse_m, hx = m[0] / 2, hy = m[1] / 2, hz = m[2] / 2;
    var lok = [];                                       // Polylinien im Objektsystem
    var haengend = [];                                  // [Anker lokal, Länge]: hängt senkrecht in der Welt
    var form = o.form, ach;

    if (FORMEN.indexOf(form) === -1) {
      warneEinmal("unbekannte Form '" + form + "' – als quader gezeichnet");
      form = "quader";
    } else if (form === "verbund" && !VERBUND[o.typ]) {
      warneEinmal("verbund ohne Zerlegung für '" + o.typ + "' – als quader gezeichnet");
      form = "quader";
    }

    switch (form) {
      case "quader":
        lok = quaderLinien(-hx, hx, -hy, hy, -hz, hz);
        break;
      case "platte":
        lok = quaderLinien(-hx, hx, -hy, hy, -hz, hz);
        if (o.bindung === "boden") {                    // eine Diagonale je Fläche
          lok.push([[-hx, -hy, -hz], [hx, -hy, hz]], [[-hx, hy, -hz], [hx, hy, hz]],
                   [[-hx, -hy, -hz], [-hx, hy, hz]], [[hx, -hy, -hz], [hx, hy, hz]],
                   [[-hx, -hy, -hz], [hx, hy, -hz]], [[-hx, -hy, hz], [hx, hy, hz]]);
        }
        break;
      case "zylinder":
        lok.push(ellipse([0, hy, 0], [hx, 0, 0], [0, 0, hz], 16, true));
        lok.push(ellipse([0, -hy, 0], [hx, 0, 0], [0, 0, hz], 16, true));
        lok.push([[hx, -hy, 0], [hx, hy, 0]], [[-hx, -hy, 0], [-hx, hy, 0]],
                 [[0, -hy, hz], [0, hy, hz]], [[0, -hy, -hz], [0, hy, -hz]]);
        break;
      case "kugel":
        lok = kugelLinien([0, 0, 0], hx, hy, hz);
        break;
      case "stange":
        ach = achsenNachGroesse(m);
        lok = stangeLinien([0, 0, 0], einheitsAchse(ach[0]), m[ach[0]] / 2, einheitsAchse(ach[1]));
        break;
      case "seil":
        /* Entschieden am 13.09.2026: Enden längs X (±X/2), Seillänge = Y-Ausdehnung,
           Kettenlinie hängt nach −Y. X ≤ 5 cm: geschlossener Ring in der XZ-Ebene. */
        if (m[0] <= RING_GRENZE) {
          var rr = m[1] / (2 * Math.PI);
          lok.push(ellipse([0, 0, 0], [rr, 0, 0], [0, 0, rr], SEIL_PUNKTE, true));
        } else {
          lok.push(kettenlinie(hx, m[1]));
        }
        break;
      case "kegel":
        lok.push(ellipse([0, -hy, 0], [hx, 0, 0], [0, 0, hz], 16, true));
        lok.push([[hx, -hy, 0], [0, hy, 0]], [[-hx, -hy, 0], [0, hy, 0]],
                 [[0, -hy, hz], [0, hy, 0]], [[0, -hy, -hz], [0, hy, 0]]);
        break;
      case "scheibe":
        ach = achsenNachGroesse(m);                     // dünnste Achse = Normale
        lok = scheibeLinien([0, 0, 0], skal(einheitsAchse(ach[0]), m[ach[0]] / 2),
                                       skal(einheitsAchse(ach[1]), m[ach[1]] / 2));
        break;
      case "kugel_mit_buegel": {
        var r = Math.min(hx, hz), kugelOben = -hy + 2 * r;
        lok = kugelLinien([0, -hy + r, 0], r, r, r);
        var br = Math.max(0.01, hy - kugelOben);        // Bügel füllt die Höhe über der Kugel
        lok.push(ellipse([0, kugelOben, 0], [br, 0, 0], [0, br, 0], 12, false));
        break;
      }
      case "stange_mit_gurt": {
        /* Stange am Bezugspunkt (in den Händen), Gurt vom Mittelpunkt senkrecht nach unten. */
        var quer = m[0] >= m[2] ? 0 : 2;                // Stange längs der längeren waagerechten Achse
        lok = stangeLinien([0, 0, 0], einheitsAchse(quer), m[quer] / 2, [0, 1, 0]);
        haengend.push([[0, 0, 0], m[1]]);
        break;
      }
      case "guertel_mit_kette":
        /* Spec §10: Kreis AM gebundenen Gelenk, Kette m[1] senkrecht darunter. */
        lok.push(ellipse([0, 0, 0], [hx, 0, 0], [0, 0, hz], 24, true));
        haengend.push([[0, 0, 0], m[1]]);
        break;
      case "weste":
        lok = quaderLinien(-hx, hx, -hy, hy, -hz, hz);
        lok.push([[0, -hy, hz], [0, hy, hz]]);          // Mittellinie vorn
        break;
      case "gelenkhuelse":
        lok = stangeLinien([0, -hy + HUELSE / 2, 0], [0, 1, 0], HUELSE / 2, [1, 0, 0]);
        scheibeLinien([0, -hy, 0], [hx, 0, 0], [0, 0, hz]).forEach(function (p) { lok.push(p); });
        break;
      case "buegel":
        lok.push([[-hx, -hy, 0], [-hx, hy, 0], [hx, hy, 0], [hx, -hy, 0]]);
        break;
      case "doppelrad":
        lok.push(ellipse([-hx, 0, 0], [0, hy, 0], [0, 0, hz], 24, true));
        lok.push(ellipse([hx, 0, 0], [0, hy, 0], [0, 0, hz], 24, true));
        lok.push([[-hx, 0, 0], [hx, 0, 0]]);
        break;
      case "verbund":
        lok = VERBUND[o.typ]();
        break;
    }

    var welt = lok.map(function (pl) {
      return pl.map(function (p) { return add(rahmen.ursprung, mv(rahmen.rotation, p)); });
    });
    /* Gurt und Kette hängen „senkrecht" – also in der Welt nach unten – mit kleiner Scheibe am Ende. */
    haengend.forEach(function (h) {
      var anker = add(rahmen.ursprung, mv(rahmen.rotation, h[0]));
      var ende = add(anker, [0, -h[1], 0]);
      welt.push([anker, ende]);
      scheibeLinien(ende, [ANHANG_SCHEIBE, 0, 0], [0, ANHANG_SCHEIBE, 0]).forEach(function (p) { welt.push(p); });
    });
    return { linien: welt, umgebung: o.typ === "wand" || o.typ === "decke" };
  }

  /* ───────────────────────── KAMERA (Spec §4) ───────────────────────── */

  var KAMERAS = {
    frontal: { azimut: 0, elevation: 8 },
    seitlich: { azimut: 90, elevation: 8 },
    seitlich_45: { azimut: 45, elevation: 8 },
    halbhoch_45: { azimut: 45, elevation: 25 }
  };
  var FOV = 32, RAND = 0.12, MIN_ABSTAND = 4.2;
  var ZIEL_Y_MIN = 0.55, ZIEL_Y_MAX = 1.15;
  var RASTER_TEILUNG = 0.25, RASTER_HALB = 3;

  function kameraVon(animation) {
    var k = KAMERAS[animation.kamera];
    if (!k) {
      warneEinmal("unbekannte Kamera '" + animation.kamera + "' – frontal verwendet");
      k = KAMERAS.frontal;
    }
    return k;
  }

  /* Blickrichtung f, rechts r, oben u. r = oben × f: Die rechte Körperseite (+X)
     erscheint von vorn gesehen links im Bild wie bei einem echten Gegenüber; von
     der Seite (+X) gesehen zeigt vorn (+Z) nach rechts. Kein gespiegeltes Bild. */
  function kameraBasis(position, ziel) {
    var f = norm(sub(ziel, position));
    var r = norm(kreuz([0, 1, 0], f));
    return { f: f, r: r, u: kreuz(f, r) };
  }

  /* Alle Punkte einer Pose, die in die Rahmung eingehen: Gelenke, Faust, Zehe,
     Kopfumriss oben/unten und alle gezeichneten Objekte. */
  function rahmungsPunkte(animation, sammeln) {
    var objekte = animation.equipment_objekte || [];
    animation.phasen.forEach(function (ph, i) {
      var k = kette(ph.gelenke, ph.wurzel_position_m || WURZEL_VORGABE);
      Object.keys(k.P).forEach(function (name) { sammeln(k.P[name]); });
      sammeln(add(k.P.kopf, [0, LAENGE.kopfradius, 0]));
      sammeln(add(k.P.kopf, [0, -LAENGE.kopfradius, 0]));
      objekte.forEach(function (o) {
        var ob = objektLinien(o, k.P, k.R, o.position_pro_phase ? o.position_pro_phase[i] : null);
        if (ob) ob.linien.forEach(function (pl) { pl.forEach(sammeln); });
      });
    });
  }

  /* Automatische Rahmung: einmal vor dem ersten Bild über alle Phasen (bei
     Seitenwechsel auch die gespiegelten), nie pro Bild – sonst atmet das Bild. */
  function rahmung(animation) {
    var kam = kameraVon(animation);
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    function sammeln(p) {
      for (var i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i];
        if (p[i] > max[i]) max[i] = p[i];
      }
    }
    rahmungsPunkte(animation, sammeln);
    if (animation.seitenwechsel) rahmungsPunkte(spiegeln(animation), sammeln);

    var beckenSumme = 0;
    animation.phasen.forEach(function (ph) { beckenSumme += (ph.wurzel_position_m || WURZEL_VORGABE)[1]; });
    var zielY = Math.max(ZIEL_Y_MIN, Math.min(ZIEL_Y_MAX, beckenSumme / animation.phasen.length));
    var ziel = [(min[0] + max[0]) / 2, zielY, (min[2] + max[2]) / 2];

    var az = rad(kam.azimut), el = rad(kam.elevation);
    var richtung = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    var tanHalb = Math.tan(rad(FOV / 2)), grenze = 1 - 2 * RAND;
    var ecken = [];
    [min[0], max[0]].forEach(function (x) {
      [min[1], max[1]].forEach(function (y) {
        [min[2], max[2]].forEach(function (z) { ecken.push([x, y, z]); });
      });
    });

    /* passt(D): alle acht Ecken der Box liegen mit 12 % Bildbreite Rand je Seite im
       Bild. |x/z| sinkt streng mit wachsendem D, deshalb genügt eine Bisektion. */
    function passt(D) {
      var pos = add(ziel, skal(richtung, D)), b = kameraBasis(pos, ziel);
      for (var i = 0; i < ecken.length; i++) {
        var v = sub(ecken[i], pos), z = dot(v, b.f);
        if (z <= 0) return false;
        if (Math.abs(dot(v, b.r) / z) / tanHalb > grenze) return false;
        if (Math.abs(dot(v, b.u) / z) / tanHalb > grenze) return false;
      }
      return true;
    }
    var abstand = MIN_ABSTAND;
    if (!passt(abstand)) {
      var lo = MIN_ABSTAND, hi = MIN_ABSTAND * 2;
      while (!passt(hi) && hi < 1000) hi *= 2;
      for (var j = 0; j < 60; j++) {
        var mitte = (lo + hi) / 2;
        if (passt(mitte)) hi = mitte; else lo = mitte;
      }
      abstand = hi;
    }
    return {
      ziel: ziel, abstand: abstand, position: add(ziel, skal(richtung, abstand)),
      azimut: kam.azimut, elevation: kam.elevation, fov: FOV,
      box: { min: min, max: max }
    };
  }

  /* Projektion Welt → Bildpunkt [x, y, Tiefe, Brennweite] für ein quadratisches
     Bild der Kantenlänge px. Punkte hinter der Kamera liefern null. */
  function projektion(rahm, px) {
    var b = kameraBasis(rahm.position, rahm.ziel);
    var F = (px / 2) / Math.tan(rad(rahm.fov / 2));
    var c = rahm.position;
    return function (p) {
      var v0 = p[0] - c[0], v1 = p[1] - c[1], v2 = p[2] - c[2];
      var z = v0 * b.f[0] + v1 * b.f[1] + v2 * b.f[2];
      if (z < 0.05) return null;
      return [px / 2 + (v0 * b.r[0] + v1 * b.r[1] + v2 * b.r[2]) / z * F,
              px / 2 - (v0 * b.u[0] + v1 * b.u[1] + v2 * b.u[2]) / z * F,
              z, F];
    };
  }

  /* ───────────────────────── ZEICHNEN (Spec §7–§9) ───────────────────────── */

  /* Szene eines Zeitpunkts in Bildkoordinaten, getrennt nach Farbe und Strichstärke.
     Interpoliert wurden vorher Winkel (Spec §11), hier wird nur noch projiziert. */
  function szene(zustand, animation, proj) {
    var k = kette(zustand.gelenke, zustand.wurzel);
    var gruppen = { rumpf: [], glied: [], fuss: [], hand: [], geraet: [], umgebung: [] };
    var punkte = [], kopf = null;

    function polylinie(ziel, pl) {
      var aktuell = [];
      for (var i = 0; i < pl.length; i++) {
        var q = proj(pl[i]);
        if (!q) {
          if (aktuell.length > 1) ziel.push(aktuell);
          aktuell = [];
        } else {
          aktuell.push(q);
        }
      }
      if (aktuell.length > 1) ziel.push(aktuell);
    }

    (animation.equipment_objekte || []).forEach(function (o, i) {
      var ob = objektLinien(o, k.P, k.R, zustand.objektPositionen[i]);
      if (!ob) return;
      var ziel = ob.umgebung ? gruppen.umgebung : gruppen.geraet;
      ob.linien.forEach(function (pl) { polylinie(ziel, pl); });
    });

    LINIEN.forEach(function (l) { polylinie(gruppen[l[2]], [k.P[l[0]], k.P[l[1]]]); });
    GELENKE.forEach(function (g) { var q = proj(k.P[g]); if (q) punkte.push(q); });
    var qk = proj(k.P.kopf);
    if (qk) kopf = { x: qk[0], y: qk[1], r: LAENGE.kopfradius * qk[3] / qk[2] };

    return { gruppen: gruppen, punkte: punkte, kopf: kopf };
  }

  /* Boden (Spec §9): Ebene 6 × 6 m bei y = 0 und Raster mit 0,25 m Teilung, zentriert
     unter dem Blickziel. Hängt nur von der Rahmung ab – einmal je Bildgröße berechnet. */
  function bodenSzene(rahm, proj) {
    var cx = rahm.ziel[0], cz = rahm.ziel[2], h = RASTER_HALB;
    var ebene = [[cx - h, 0, cz - h], [cx + h, 0, cz - h], [cx + h, 0, cz + h], [cx - h, 0, cz + h]].map(proj);
    var raster = [], n = Math.round(2 * h / RASTER_TEILUNG);
    for (var i = 0; i <= n; i++) {
      var d = -h + i * RASTER_TEILUNG;
      var a = proj([cx + d, 0, cz - h]), b = proj([cx + d, 0, cz + h]);
      if (a && b) raster.push([a, b]);
      a = proj([cx - h, 0, cz + d]); b = proj([cx + h, 0, cz + d]);
      if (a && b) raster.push([a, b]);
    }
    return { ebene: ebene.every(Boolean) ? ebene : null, raster: raster };
  }

  /* Ausgabe auf Canvas 2D: je Farbe und Strichstärke genau ein Pfad und ein
     stroke() bzw. fill(). Reihenfolge fest: Boden, Umgebung, Gerät, Figur (Spec §7).
     Keine Tiefensortierung. */
  function zeichneCanvas(ctx, px, dpr, farben, boden, sz) {
    ctx.clearRect(0, 0, px, px);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    function pfad(linien) {
      ctx.beginPath();
      linien.forEach(function (l) {
        ctx.moveTo(l[0][0], l[0][1]);
        for (var i = 1; i < l.length; i++) ctx.lineTo(l[i][0], l[i][1]);
      });
    }
    function strich(linien, farbe, breite, alpha) {
      if (!linien.length) return;
      pfad(linien);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = farbe;
      ctx.lineWidth = breite * dpr;
      ctx.stroke();
    }

    if (boden.ebene) {
      ctx.beginPath();
      ctx.moveTo(boden.ebene[0][0], boden.ebene[0][1]);
      for (var i = 1; i < 4; i++) ctx.lineTo(boden.ebene[i][0], boden.ebene[i][1]);
      ctx.closePath();
      ctx.globalAlpha = DECKKRAFT_EBENE;
      ctx.fillStyle = farben.boden;
      ctx.fill();
    }
    strich(boden.raster, farben.boden, STRICH.raster, DECKKRAFT_RASTER);
    strich(sz.gruppen.umgebung, farben.boden, STRICH.geraet, 1);
    strich(sz.gruppen.geraet, farben.geraet, STRICH.geraet, 1);

    strich(sz.gruppen.rumpf, farben.figur, STRICH.rumpf, 1);
    /* Kopfkreis und Gliedmaßen haben dieselbe Stärke (3,5 px) und teilen sich einen Pfad. */
    pfad(sz.gruppen.glied);
    if (sz.kopf) {
      ctx.moveTo(sz.kopf.x + sz.kopf.r, sz.kopf.y);
      ctx.arc(sz.kopf.x, sz.kopf.y, sz.kopf.r, 0, 2 * Math.PI);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = farben.figur;
    ctx.lineWidth = STRICH.glied * dpr;
    ctx.stroke();
    strich(sz.gruppen.fuss.concat(sz.gruppen.hand), farben.figur, STRICH.fuss, 1);

    ctx.beginPath();
    sz.punkte.forEach(function (q) {
      ctx.moveTo(q[0] + PUNKT_RADIUS * dpr, q[1]);
      ctx.arc(q[0], q[1], PUNKT_RADIUS * dpr, 0, 2 * Math.PI);
    });
    ctx.fillStyle = farben.figur;
    ctx.fill();
  }

  /* Rückfall ohne Canvas: derselbe Projektionscode als SVG, Pose 0 als Standbild. */
  function svgStandbild(px, dpr, farben, boden, sz) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + px + " " + px);
    svg.setAttribute("class", "anim-svg");
    function poly(linien, farbe, breite, alpha) {
      linien.forEach(function (l) {
        var e = document.createElementNS(ns, "polyline");
        e.setAttribute("points", l.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" "));
        e.setAttribute("fill", "none");
        e.setAttribute("stroke", farbe);
        e.setAttribute("stroke-width", breite);
        e.setAttribute("stroke-opacity", alpha);
        e.setAttribute("stroke-linecap", "round");
        e.setAttribute("stroke-linejoin", "round");
        svg.appendChild(e);
      });
    }
    if (boden.ebene) {
      var eb = document.createElementNS(ns, "polygon");
      eb.setAttribute("points", boden.ebene.map(function (q) { return q[0].toFixed(1) + "," + q[1].toFixed(1); }).join(" "));
      eb.setAttribute("fill", farben.boden);
      eb.setAttribute("fill-opacity", DECKKRAFT_EBENE);
      svg.appendChild(eb);
    }
    poly(boden.raster, farben.boden, STRICH.raster * dpr, DECKKRAFT_RASTER);
    poly(sz.gruppen.umgebung, farben.boden, STRICH.geraet * dpr, 1);
    poly(sz.gruppen.geraet, farben.geraet, STRICH.geraet * dpr, 1);
    poly(sz.gruppen.rumpf, farben.figur, STRICH.rumpf * dpr, 1);
    poly(sz.gruppen.glied, farben.figur, STRICH.glied * dpr, 1);
    poly(sz.gruppen.fuss.concat(sz.gruppen.hand), farben.figur, STRICH.fuss * dpr, 1);
    function kreis(x, y, r, gefuellt, breite) {
      var c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", r);
      c.setAttribute("fill", gefuellt ? farben.figur : "none");
      if (!gefuellt) { c.setAttribute("stroke", farben.figur); c.setAttribute("stroke-width", breite); }
      svg.appendChild(c);
    }
    if (sz.kopf) kreis(sz.kopf.x, sz.kopf.y, sz.kopf.r, false, STRICH.kopf * dpr);
    sz.punkte.forEach(function (q) { kreis(q[0], q[1], PUNKT_RADIUS * dpr, true); });
    return svg;
  }

  /* ───────────────────────── STEUERUNG ───────────────────────── */

  var MAX_DPR = 2;

  /* Steuerung für ein Canvas. requestAnimationFrame läuft nur, solange gestartet
     UND sichtbar (Canvas im Viewport, Tab sichtbar). Fortschritt immer aus der
     echten verstrichenen Zeit; nach Verdecken geht es an derselben Stelle weiter.
     optionen: { erscheinungsbild: "hell"|"dunkel", beiAenderung: function (zustand) }.
     Der Parameter geraete ist für die Zeichnung nicht nötig (die Formen stehen am
     Objekt) und bleibt für die Schnittstelle aus der Architektur-Empfehlung erhalten. */
  function erzeugen(canvas, uebung, geraete, optionen) {
    optionen = optionen || {};
    var farben = FARBEN[optionen.erscheinungsbild] || FARBEN.hell;
    var ctx = canvas.getContext ? canvas.getContext("2d") : null;
    var daten = null;
    var t = 0, laeuft = false, imBild = true, rafId = 0, letzterTick = null;
    var px = 0, dpr = 1, boden = null, proj = null, svgKnoten = null, zerstoert = false;
    var io = null, ro = null;

    function laden(u) {
      var a = u.animation;
      daten = {
        animation: a,
        vb1: vorbereiten(a),
        vb2: a.seitenwechsel ? vorbereiten(spiegeln(a)) : null,
        rahmung: rahmung(a),
        gesamt: gesamtDauer(a)
      };
      boden = null;
      proj = null;
    }

    function groesseAnpassen() {
      var rect = canvas.getBoundingClientRect();
      var css = Math.min(rect.width, rect.height || rect.width);
      dpr = Math.min(root.devicePixelRatio || 1, MAX_DPR);
      var neu = Math.max(0, Math.round(css * dpr));
      if (neu !== px) {
        px = neu;
        canvas.width = px;
        canvas.height = px;
        boden = null;
      }
      if (!boden && px > 0) {
        proj = projektion(daten.rahmung, px);
        boden = bodenSzene(daten.rahmung, proj);
      }
    }

    function aktuellerZustand() { return zustandAus(daten.vb1, daten.vb2, t); }

    function zustand() {
      var z = aktuellerZustand(), ph = daten.animation.phasen[z.phase];
      var g = daten.gesamt, loop = daten.vb1.loop;
      return {
        t: t, gesamt: g,
        fortschritt: g > 0 ? (loop ? zyklisch(t, g) / g : Math.min(1, t / g)) : 0,
        phase: z.phase, phasen: daten.vb1.n, phaseName: ph.name, hinweis: ph.hinweis,
        seite: z.seite, seiten: daten.vb2 ? 2 : 1,
        laeuft: laeuft, fertig: !loop && t >= g, loop: loop
      };
    }

    function melden() {
      if (typeof optionen.beiAenderung === "function") optionen.beiAenderung(zustand());
    }

    function zeichnen() {
      if (zerstoert || !daten) return;
      groesseAnpassen();
      if (!px || !proj) return;
      var z = aktuellerZustand();
      var sz = szene(z, z.seite === 2 ? daten.vb2.animation : daten.animation, proj);
      if (ctx) {
        zeichneCanvas(ctx, px, dpr, farben, boden, sz);
      } else if (!svgKnoten && canvas.parentNode) {
        svgKnoten = svgStandbild(px, dpr, farben, boden, sz);
        canvas.parentNode.insertBefore(svgKnoten, canvas);
        canvas.style.display = "none";
      }
    }

    function darfLaufen() {
      var tabSichtbar = typeof document === "undefined" || document.visibilityState !== "hidden";
      return laeuft && imBild && tabSichtbar && !zerstoert && !!ctx;
    }

    function planen() {
      if (rafId || !darfLaufen()) return;
      rafId = root.requestAnimationFrame(tick);
    }

    function anhalten() {
      if (rafId) root.cancelAnimationFrame(rafId);
      rafId = 0;
      letzterTick = null;
    }

    function tick(jetzt) {
      rafId = 0;
      if (!darfLaufen()) { letzterTick = null; return; }
      if (letzterTick !== null) t += (jetzt - letzterTick) / 1000;
      letzterTick = jetzt;
      if (!daten.vb1.loop && t >= daten.gesamt) {       // loop:false – Endpose halten, nicht neu starten
        t = daten.gesamt;
        laeuft = false;
        letzterTick = null;
      }
      zeichnen();
      melden();
      planen();
    }

    function sichtbarkeitGeaendert() {
      if (darfLaufen()) planen(); else anhalten();
    }

    function phasenStart(globalerIndex) {
      var n = daten.vb1.n;
      return Math.floor(globalerIndex / n) * daten.vb1.dauer + daten.vb1.starts[globalerIndex % n];
    }

    var steuerung = {
      start: function () {
        if (!daten.vb1.loop && t >= daten.gesamt) t = 0;
        laeuft = true;
        letzterTick = null;
        planen();
        melden();
      },
      pause: function () {
        laeuft = false;
        anhalten();
        zeichnen();
        melden();
      },
      umschalten: function () { if (laeuft) steuerung.pause(); else steuerung.start(); },
      laeuft: function () { return laeuft; },
      wiederholen: function () { t = 0; steuerung.start(); },
      /* Fortschritt 0…1 über den Gesamtzyklus (bei Seitenwechsel beide Seiten). */
      setzeFortschritt: function (f) {
        t = Math.max(0, Math.min(1, f)) * daten.gesamt;
        letzterTick = null;
        zeichnen();
        melden();
      },
      zeichneBei: function (tSek) { t = tSek; letzterTick = null; zeichnen(); melden(); },
      /* Einzelbild über die Phasen: auf den Beginn der nächsten bzw. vorigen Pose. */
      schritt: function (richtung) {
        var z = aktuellerZustand(), n = daten.vb1.n, anzahl = n * (daten.vb2 ? 2 : 1);
        var g = (z.seite - 1) * n + z.phase;
        var ziel = richtung > 0 ? g + 1 : (t - phasenStart(g) > 0.05 ? g : g - 1);
        ziel = ((ziel % anzahl) + anzahl) % anzahl;
        laeuft = false;
        anhalten();
        t = phasenStart(ziel);
        zeichnen();
        melden();
      },
      zustand: zustand,
      /* Keyframe-Daten tauschen, ohne den Renderer anzufassen (Abnahme Spec §12.2). */
      tauscheUebung: function (neueUebung) {
        laden(neueUebung);
        t = 0;
        zeichnen();
        melden();
        planen();
      },
      rahmung: function () { return daten.rahmung; },
      zerstoere: function () {
        zerstoert = true;
        laeuft = false;
        anhalten();
        if (io) io.disconnect();
        if (ro) ro.disconnect();
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", sichtbarkeitGeaendert);
        if (svgKnoten && svgKnoten.parentNode) svgKnoten.parentNode.removeChild(svgKnoten);
        optionen = {};
      }
    };

    laden(uebung);
    if (typeof root.IntersectionObserver === "function") {
      io = new root.IntersectionObserver(function (eintraege) {
        imBild = eintraege[eintraege.length - 1].isIntersecting;
        sichtbarkeitGeaendert();
      });
      io.observe(canvas);
    }
    if (typeof root.ResizeObserver === "function") {
      ro = new root.ResizeObserver(function () { zeichnen(); });
      ro.observe(canvas);
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", sichtbarkeitGeaendert);
    zeichnen();
    melden();
    return steuerung;
  }

  /* ───────────────────────── Öffentliche Schnittstelle ───────────────────────── */

  var api = {
    GELENKE: GELENKE.slice(),
    KAMERAS: KAMERAS,
    FORMEN: FORMEN.slice(),
    posen: posen,
    rotationen: rotationen,
    spiegeln: spiegeln,
    zeitverzerrung: zeitverzerrung,
    abtasten: abtasten,
    zustandBei: zustandBei,
    gesamtDauer: gesamtDauer,
    rahmung: rahmung,
    projektion: projektion,
    objektLinien: objektLinien,
    erzeugen: erzeugen
  };

  root.ZyklusAnimation = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : this);
