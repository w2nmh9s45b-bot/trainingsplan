/* Zyklus – Trainingsplan.
   Editierbarer Trainingsplan im N-Wochen-Zyklus. Der Plan selbst, die
   Übungsdatenbank und alle Haken liegen in localStorage; data.js liefert nur
   den Startplan beim allerersten Öffnen. Keine Netzwerkzugriffe zur Laufzeit. */
(function () {
  "use strict";

  var SEED = window.PLAN;
  var STORE_KEY = "zyklus.v2";
  var LEGACY_KEY = "zyklus.v1";
  var APP_VERSION = "2026-09-15.3353f6f015";   // setzt Werkzeuge/stempeln.sh – gleich VERSION in sw.js

  /* Montag, mit dem Woche 1 des Zyklus beginnt (Datum der Quell-Excel).
     Absolutes Ankerdatum statt KW-Parität: Jahre mit 53 ISO-Wochen würden
     die Parität sonst am Jahreswechsel kippen. */
  var ANCHOR = Date.UTC(2026, 5, 1);          // 2026-06-01, ein Montag
  var DAY_MS = 86400000;
  var DAY_ROLLOVER_H = 4;                     // Training nach Mitternacht zählt zum Vortag
  var KEEP_DAYS = 400;                        // gut ein Jahr Historie für den Kalender
  var MAX_WEEKS = 6;

  var LOCATIONS = ["Gym", "Homegym", "Home"];
  var LOC_LABEL = { Gym: "Gym", Homegym: "Homegym", Home: "Home" };
  var LOC_VAR = { Gym: "--gym", Homegym: "--homegym", Home: "--home" };
  var DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  var DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
                "Juli", "August", "September", "Oktober", "November", "Dezember"];

  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var el = {
    hdr: document.getElementById("hdr"),
    date: document.getElementById("hdr-date"),
    badge: document.getElementById("badge-week"),
    badgeText: document.getElementById("badge-week-text"),
    count: document.getElementById("hdr-count"),
    strip: document.getElementById("strip"),
    stripWrap: document.getElementById("strip-wrap"),
    pager: document.getElementById("pager"),
    dayprog: document.getElementById("dayprog"),
    main: document.getElementById("main"),
    jump: document.getElementById("jump-open"),
    btnBasics: document.getElementById("btn-basics"),
    sheetBasics: document.getElementById("sheet-basics"),
    basicsBody: document.getElementById("basics-body"),
    basicsZones: document.getElementById("basics-zones"),
    sheetCycle: document.getElementById("sheet-cycle"),
    cycLenVal: document.getElementById("cyc-len-val"),
    cycMinus: document.getElementById("cyc-minus"),
    cycPlus: document.getElementById("cyc-plus"),
    cycWeeks: document.getElementById("cyc-weeks"),
    cycHint: document.getElementById("cyc-hint"),
    cycReset: document.getElementById("cyc-reset"),
    sheetAdd: document.getElementById("sheet-add"),
    addTitle: document.getElementById("add-title"),
    addSearch: document.getElementById("add-search"),
    addNewToggle: document.getElementById("add-new-toggle"),
    addForm: document.getElementById("add-form"),
    addName: document.getElementById("add-name"),
    addQty: document.getElementById("add-qty"),
    addNote: document.getElementById("add-note"),
    addSave: document.getElementById("add-save"),
    addList: document.getElementById("add-list"),
    sheetDb: document.getElementById("sheet-db"),
    dbSearch: document.getElementById("db-search"),
    dbList: document.getElementById("db-list"),
    dbCount: document.getElementById("db-count"),
    sheetCal: document.getElementById("sheet-cal"),
    calTitle: document.getElementById("cal-title"),
    calPrev: document.getElementById("cal-prev"),
    calNext: document.getElementById("cal-next"),
    calDow: document.getElementById("cal-dow"),
    calGrid: document.getElementById("cal-grid"),
    calStats: document.getElementById("cal-stats"),
    calDetail: document.getElementById("cal-detail"),
    appStatus: document.getElementById("app-status"),
    appExport: document.getElementById("app-export"),
    appImport: document.getElementById("app-import"),
    appFile: document.getElementById("app-file"),
    appConfirm: document.getElementById("app-confirm"),
    appNote: document.getElementById("app-note"),
    archFilter: document.getElementById("arch-filter"),
    fKategorie: document.getElementById("f-kategorie"),
    fDisziplin: document.getElementById("f-disziplin"),
    fLevel: document.getElementById("f-level"),
    fGeraet: document.getElementById("f-geraet"),
    archReset: document.getElementById("arch-reset"),
    sheetDetail: document.getElementById("sheet-detail"),
    detName: document.getElementById("det-name"),
    detBody: document.getElementById("det-body")
  };

  var state = null;      // { v:2, shift, days:{key:{checks:{uid:ts}}}, plan:{weeks:[…]}, db:[…] }
  var view = null;       // { week:1…N, dayIndex:0-6 }
  var todayRef = null;   // { key, week, dayIndex, date }
  var editing = false;
  var addCtx = null;     // Kontext des Übung-hinzufügen-Sheets: { w, di, loc }
  var uidSeq = 0;

  /* ───────────────────────── Seed & Speicher ───────────────────────── */

  function hash4(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36).slice(-4);
  }

  /* Uid der Seed-Übungen = Id-Schema der alten App-Version. Dadurch passen
     alte Haken-Einträge (zyklus.v1) ohne Umrechnung auf den neuen Plan. */
  function legacyId(week, dayIndex, loc, idx, name) {
    return week + "|" + dayIndex + "|" + loc + "|" + idx + "|" + hash4(name);
  }

  function newUid() {
    uidSeq++;
    return "n" + Date.now().toString(36) + "-" + uidSeq + "-" + Math.floor(Math.random() * 1e6).toString(36);
  }

  /* „Woche 1 (Kraft/ Ausdauer/ …)" → „Kraft" */
  function shortOfLabel(label, wi) {
    var m = /\(([^/)]+)/.exec(label || "");
    return m ? m[1].trim() : "Woche " + (wi + 1);
  }

  function seedPlan() {
    return {
      weeks: SEED.weeks.map(function (w, wi) {
        return {
          label: w.label || ("Woche " + (wi + 1)),
          short: shortOfLabel(w.label, wi),
          days: w.days.map(function (d, di) {
            return {
              day: d.day,
              locations: (d.locations || []).map(function (L) {
                return {
                  location: L.location,
                  items: L.items.map(function (it, ii) {
                    return {
                      uid: legacyId(wi + 1, di, L.location, ii, it.name),
                      name: it.name, qty: it.qty || "", note: it.note || ""
                    };
                  })
                };
              }),
              off: (d.off || []).slice()
            };
          })
        };
      })
    };
  }

  function emptyWeek(n) {
    return {
      label: "Woche " + n,
      short: "Woche " + n,
      days: DAY_NAMES.map(function (name) { return { day: name, locations: [], off: [] }; })
    };
  }

  function dbKey(name) { return name.trim().toLowerCase(); }

  function seedDb(plan) {
    var seen = Object.create(null), db = [];
    plan.weeks.forEach(function (w) {
      w.days.forEach(function (d) {
        d.locations.forEach(function (L) {
          L.items.forEach(function (it) {
            var k = dbKey(it.name);
            if (!k || seen[k]) return;
            seen[k] = true;
            db.push({ id: "d" + hash4(k) + "-" + db.length, name: it.name, qty: it.qty, note: it.note });
          });
        });
      });
    });
    return db;
  }

  /* Übung in die Datenbank übernehmen. overwrite=true beim Entfernen aus dem
     Plan, damit die zuletzt gültige Menge/Anweisung erhalten bleibt. */
  function upsertDb(item, overwrite) {
    var k = dbKey(item.name);
    if (!k) return;
    for (var i = 0; i < state.db.length; i++) {
      if (dbKey(state.db[i].name) === k) {
        if (overwrite) {
          state.db[i].name = item.name;
          state.db[i].qty = item.qty || "";
          state.db[i].note = item.note || "";
        }
        if (item.katalog && !state.db[i].katalog) state.db[i].katalog = item.katalog;
        return;
      }
    }
    var neu = { id: "d" + hash4(k) + "-" + state.db.length + "-" + Date.now().toString(36),
                name: item.name, qty: item.qty || "", note: item.note || "" };
    /* Übungen aus dem Katalog: nur die Referenz (id) wandert in den Speicher, die
       Katalogdaten selbst nie (architektur-empfehlung.md §4). */
    if (item.katalog) neu.katalog = item.katalog;
    state.db.push(neu);
  }

  function validPlan(p) {
    return p && Array.isArray(p.weeks) && p.weeks.length >= 1 && p.weeks.length <= MAX_WEEKS &&
      p.weeks.every(function (w) {
        return w && Array.isArray(w.days) && w.days.length === 7 &&
          w.days.every(function (d) { return d && Array.isArray(d.locations); });
      });
  }

  function freshState() {
    var plan = seedPlan();
    return { v: 2, shift: 0, days: {}, plan: plan, db: seedDb(plan) };
  }

  /* Ersten Schadensstand sichern, bevor er überschrieben wird – ein späterer
     Blick in "zyklus.v2.corrupt" kann Handverlorenes noch retten. */
  function backupCorrupt(raw) {
    try {
      if (raw && !localStorage.getItem(STORE_KEY + ".corrupt")) {
        localStorage.setItem(STORE_KEY + ".corrupt", raw);
      }
    } catch (e) { /* Quota/privater Modus: Backup ist nur best effort */ }
  }

  /* Plan in-place reparieren statt wegwerfen: eine einzelne defekte Location
     darf nicht den ganzen editierten Plan (und damit alle Haken) kosten. */
  function sanitizePlan(plan) {
    plan.weeks.forEach(function (w, wi) {
      if (typeof w.label !== "string") w.label = "Woche " + (wi + 1);
      if (typeof w.short !== "string") w.short = "Woche " + (wi + 1);
      w.days.forEach(function (d, di) {
        if (typeof d.day !== "string") d.day = DAY_NAMES[di];
        if (!Array.isArray(d.off)) d.off = [];
        d.locations = d.locations.filter(function (L) {
          return L && typeof L === "object" && typeof L.location === "string";
        });
        d.locations.forEach(function (L) {
          if (!Array.isArray(L.items)) L.items = [];
          L.items = L.items.filter(function (it) {
            return it && typeof it === "object" && typeof it.name === "string" && it.name;
          });
          L.items.forEach(function (it) {
            if (typeof it.uid !== "string" || !it.uid) it.uid = newUid();
            if (typeof it.qty !== "string") it.qty = "";
            if (typeof it.note !== "string") it.note = "";
          });
        });
      });
    });
  }

  function sanitizeDb(s) {
    if (!Array.isArray(s.db)) { s.db = []; return; }
    s.db = s.db.filter(function (e) {
      return e && typeof e === "object" && typeof e.name === "string" && e.name;
    });
    s.db.forEach(function (e) {
      if (typeof e.id !== "string" || !e.id) e.id = newUid();
      if (typeof e.qty !== "string") e.qty = "";
      if (typeof e.note !== "string") e.note = "";
    });
  }

  function loadState() {
    var s = null, raw = null, parsed = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      if (!parsed || typeof parsed !== "object") {
        backupCorrupt(raw);
        parsed = null;
      }
    }

    if (parsed) {
      if (validPlan(parsed.plan)) {
        s = {
          v: 2,
          shift: typeof parsed.shift === "number" ? Math.floor(parsed.shift) : 0,
          days: (parsed.days && typeof parsed.days === "object") ? parsed.days : {},
          plan: parsed.plan,
          db: Array.isArray(parsed.db) ? parsed.db : []
        };
      } else {
        /* Plan defekt, aber Haken-Historie und Datenbank sind meist intakt:
           nur den Plan neu aufsetzen, den Rest übernehmen. */
        backupCorrupt(raw);
        s = freshState();
        if (parsed.days && typeof parsed.days === "object") s.days = parsed.days;
        if (Array.isArray(parsed.db) && parsed.db.length) s.db = parsed.db;
        if (typeof parsed.shift === "number") s.shift = Math.floor(parsed.shift);
      }
    }

    if (!s) s = migrateLegacy() || freshState();

    sanitizePlan(s.plan);
    sanitizeDb(s);
    var n = s.plan.weeks.length;
    s.shift = ((s.shift % n) + n) % n;
    Object.keys(s.days).forEach(function (k) {
      var d = s.days[k];
      if (!d || typeof d !== "object" || Array.isArray(d)) { delete s.days[k]; return; }
      if (!d.checks || typeof d.checks !== "object") d.checks = {};
    });
    pruneDays(s);
    return s;
  }

  /* Alte Version (fester 2-Wochen-Plan, Haken als Id-Arrays) übernehmen.
     Die Seed-Uids entsprechen den alten Ids, daher reicht ein Formatwechsel. */
  function migrateLegacy() {
    try {
      var raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || typeof p !== "object") return null;
      var s = freshState();
      s.shift = p.offset === 1 ? 1 : 0;
      if (p.days && typeof p.days === "object") {
        Object.keys(p.days).forEach(function (k) {
          var arr = p.days[k];
          if (!Array.isArray(arr) || !arr.length) return;
          var checks = {};
          arr.forEach(function (id) { checks[id] = 0; });   // ts 0 = Zeit unbekannt
          s.days[k] = { checks: checks };
        });
      }
      return s;
    } catch (e) { return null; }
  }

  function pruneDays(s) {
    var limit = dayKeyFromDate(new Date(Date.now() - KEEP_DAYS * DAY_MS));
    Object.keys(s.days).forEach(function (k) {
      var d = s.days[k];
      var empty = !d.checks || !Object.keys(d.checks).length;
      if (k < limit || empty) delete s.days[k];
    });
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { /* z.B. privater Modus – Änderungen halten dann nur bis zum Neuladen */ }
  }

  /* ───────────────────────── Datum & Zyklus ───────────────────────── */

  function weekCount() { return state.plan.weeks.length; }
  function cycleDays() { return weekCount() * 7; }

  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  /* Kalendertag mit 04:00-Grenze: vor 4 Uhr zählt noch der Vortag. */
  function dayKeyFromDate(d) {
    var x = new Date(d.getTime());
    if (x.getHours() < DAY_ROLLOVER_H) x.setDate(x.getDate() - 1);
    return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate());
  }

  /* Referenzdatum des laufenden Trainingstages (nicht des Uhrzeit-Tages). */
  function refDate() {
    var d = new Date();
    if (d.getHours() < DAY_ROLLOVER_H) d.setDate(d.getDate() - 1);
    d.setHours(12, 0, 0, 0);
    return d;
  }

  function mondayUTC(d) {
    var wd = (d.getDay() + 6) % 7;                      // Mo = 0
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() - wd);
  }

  function weeksSinceAnchor(d) {
    return Math.round((mondayUTC(d) - ANCHOR) / (7 * DAY_MS));
  }

  function weekOf(d) {
    var n = weekCount();
    var idx = (((weeksSinceAnchor(d) + state.shift) % n) + n) % n;
    return idx + 1;
  }

  function computeToday() {
    var d = refDate();
    todayRef = {
      key: dayKeyFromDate(new Date()),
      week: weekOf(d),
      dayIndex: (d.getDay() + 6) % 7,
      date: d
    };
  }

  /* Datum eines Zyklus-Tages, gerechnet vom heutigen Tag aus. Der Abstand wird
     auf das Fenster um heute normalisiert, damit jeder Zyklustag auf seine
     nächstgelegene Kalenderentsprechung fällt. */
  function dateOf(week, dayIndex) {
    var L = cycleDays();
    var half = Math.floor(L / 2);
    var absView = (week - 1) * 7 + dayIndex;
    var absToday = (todayRef.week - 1) * 7 + todayRef.dayIndex;
    var delta = ((((absView - absToday + half) % L) + L) % L) - half;
    var d = new Date(todayRef.date.getTime());
    d.setDate(d.getDate() + delta);
    return d;
  }

  function viewDate() { return dateOf(view.week, view.dayIndex); }
  function keyFor(week, dayIndex) { return dayKeyFromDate(dateOf(week, dayIndex)); }
  function viewKey() { return keyFor(view.week, view.dayIndex); }

  function isToday() {
    return view.week === todayRef.week && view.dayIndex === todayRef.dayIndex;
  }

  /* ───────────────────────── Plan-Zugriff ───────────────────────── */

  function getDay(week, dayIndex) { return state.plan.weeks[week - 1].days[dayIndex]; }

  /* Orte ohne Übungen erscheinen nur im Bearbeiten-Modus. */
  function visibleLocations(day) {
    return day.locations.filter(function (L) { return editing || L.items.length; });
  }

  function dayTotal(day) {
    return day.locations.reduce(function (n, L) { return n + L.items.length; }, 0);
  }

  /* ───────────────────────── Session (Haken) ───────────────────────── */

  /* Je Kalendertag nur die Haken: checks[uid] = Zeitpunkt des Abhakens (0 = nachgetragen).
     Der Zeitpunkt dient allein der Reihenfolge im Kalender – Zeiten werden nicht gemessen.
     Ältere Stände tragen noch start/end/pauses aus der früheren Workout-Uhr; die Felder
     bleiben unangetastet liegen und werden nicht mehr gelesen. Tage, die nur eine
     gestartete Uhr und keine Haken hatten, verwirft pruneDays als leer. */
  function sess(key) { return state.days[key] || null; }

  function sessWrite(key) {
    if (!state.days[key]) state.days[key] = { checks: {} };
    if (!state.days[key].checks) state.days[key].checks = {};
    return state.days[key];
  }

  function sessClean(key) {
    var d = state.days[key];
    if (d && !Object.keys(d.checks).length) delete state.days[key];
  }

  function isChecked(key, uid) {
    var d = sess(key);
    return !!(d && d.checks && (uid in d.checks));
  }

  function setCheck(key, uid, on) {
    var d = sessWrite(key);
    if (on) {
      d.checks[uid] = key === todayRef.key ? Date.now() : 0;
    } else {
      delete d.checks[uid];
    }
    sessClean(key);
    save();
  }

  function countDone(week, dayIndex) {
    var d = sess(keyFor(week, dayIndex));
    if (!d) return 0;
    var n = 0;
    getDay(week, dayIndex).locations.forEach(function (L) {
      L.items.forEach(function (it) { if (it.uid in d.checks) n++; });
    });
    return n;
  }

  /* Haken des Tages in Abhak-Reihenfolge (nur solche mit Zeitpunkt). */
  function checksSorted(key) {
    var d = sess(key);
    if (!d) return [];
    var arr = [];
    Object.keys(d.checks).forEach(function (uid) {
      if (d.checks[uid] > 0) arr.push({ uid: uid, ts: d.checks[uid] });
    });
    arr.sort(function (a, b) { return a.ts - b.ts; });
    return arr;
  }

  /* ───────────────────────── DOM-Helfer ───────────────────────── */

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function locColor(loc) { return "var(" + (LOC_VAR[loc] || "--fg2") + ")"; }
  function locGrad(loc) {
    var g = { Gym: "var(--gym-grad)", Homegym: "var(--homegym-grad)", Home: "var(--home-grad)" };
    return g[loc] || "var(--gym-grad)";
  }

  var NS = "http://www.w3.org/2000/svg";
  var RING_C = 2 * Math.PI * 8;

  function svgRing(pct, color) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("class", "ring");
    s.setAttribute("viewBox", "0 0 18 18");
    var bg = document.createElementNS(NS, "circle");
    bg.setAttribute("class", "bg");
    bg.setAttribute("cx", "9"); bg.setAttribute("cy", "9"); bg.setAttribute("r", "8");
    var fg = document.createElementNS(NS, "circle");
    fg.setAttribute("class", "fg");
    fg.setAttribute("cx", "9"); fg.setAttribute("cy", "9"); fg.setAttribute("r", "8");
    fg.setAttribute("stroke", pct >= 1 ? "var(--done)" : color);
    fg.setAttribute("stroke-dasharray", RING_C);
    fg.setAttribute("stroke-dashoffset", RING_C * (1 - pct));
    s.appendChild(bg); s.appendChild(fg);
    return s;
  }

  var HERO_R = 40;
  var HERO_C = 2 * Math.PI * HERO_R;

  function svgHeroRing(pct) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("class", "hero-svg");
    s.setAttribute("viewBox", "0 0 92 92");

    var defs = document.createElementNS(NS, "defs");
    var grad = document.createElementNS(NS, "linearGradient");
    grad.setAttribute("id", "heroGrad");
    grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
    grad.setAttribute("x2", "1"); grad.setAttribute("y2", "1");
    [["0%", "#22D3EE"], ["55%", "#3B82F6"], ["100%", "#A855F7"]].forEach(function (st) {
      var stop = document.createElementNS(NS, "stop");
      stop.setAttribute("offset", st[0]);
      stop.setAttribute("stop-color", st[1]);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
    s.appendChild(defs);

    var bg = document.createElementNS(NS, "circle");
    bg.setAttribute("class", "bg");
    bg.setAttribute("cx", "46"); bg.setAttribute("cy", "46"); bg.setAttribute("r", String(HERO_R));
    var fg = document.createElementNS(NS, "circle");
    fg.setAttribute("class", "fg");
    fg.setAttribute("cx", "46"); fg.setAttribute("cy", "46"); fg.setAttribute("r", String(HERO_R));
    fg.setAttribute("stroke", pct >= 1 ? "var(--done)" : "url(#heroGrad)");
    fg.setAttribute("stroke-dasharray", HERO_C);
    fg.setAttribute("stroke-dashoffset", HERO_C * (1 - pct));
    s.appendChild(bg); s.appendChild(fg);
    return s;
  }

  function svgCheck(cls, stroke) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("class", cls);
    s.setAttribute("viewBox", "0 0 16 16");
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", "M3.5 8.4l3 3 6-6.6");
    if (stroke) {
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", "2.2");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
    }
    s.appendChild(p);
    return s;
  }

  /* Zweistufige Bestätigung für destruktive Knöpfe. */
  function armButton(btn, label, confirmLabel, fn) {
    var armed = false, timer = null;
    btn.addEventListener("click", function () {
      if (!armed) {
        armed = true;
        btn.classList.add("armed");
        btn.textContent = confirmLabel;
        timer = setTimeout(function () {
          armed = false;
          btn.classList.remove("armed");
          btn.textContent = label;
        }, 3000);
        return;
      }
      clearTimeout(timer);
      armed = false;
      btn.classList.remove("armed");
      btn.textContent = label;
      fn();
    });
  }

  /* ───────────────────────── Scroll-Reveal ───────────────────────── */

  var revealIO = null;

  function initReveal() {
    if (REDUCED || !("IntersectionObserver" in window)) return;
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          revealIO.unobserve(en.target);
        }
      });
    }, { threshold: 0.05, rootMargin: "0px 0px -6% 0px" });
  }

  function reveal(node, i) {
    if (!revealIO) return node;
    node.classList.add("reveal");
    if (i) node.style.transitionDelay = Math.min(i, 8) * 45 + "ms";
    revealIO.observe(node);
    return node;
  }

  /* Sicherheitsnetz: Liefert der IntersectionObserver nicht (z.B. weil die
     Seite beim Rendern unsichtbar war), werden sichtbare Elemente nach kurzer
     Zeit von Hand eingeblendet – sonst bliebe die Liste leer. */
  var revealSafetyTimer = null;

  function revealSafety() {
    if (!revealIO) return;
    clearTimeout(revealSafetyTimer);
    revealSafetyTimer = setTimeout(function () {
      var nodes = el.main.querySelectorAll(".reveal:not(.in)");
      Array.prototype.forEach.call(nodes, function (n) {
        var r = n.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) n.classList.add("in");
      });
    }, 1200);
  }

  /* ───────────────────────── Partikel ───────────────────────── */

  function burst(host, color) {
    if (REDUCED || !host) return;
    var b = h("span", "burst");
    for (var i = 0; i < 10; i++) {
      var p = document.createElement("i");
      var a = (Math.PI * 2 * i) / 10 + Math.random() * 0.6;
      var r = 17 + Math.random() * 15;
      p.style.setProperty("--dx", (Math.cos(a) * r).toFixed(1) + "px");
      p.style.setProperty("--dy", (Math.sin(a) * r).toFixed(1) + "px");
      p.style.background = i % 3 === 0 ? "var(--done)" : color;
      p.style.animationDelay = Math.floor(Math.random() * 70) + "ms";
      b.appendChild(p);
    }
    host.appendChild(b);
    setTimeout(function () { b.remove(); }, 800);
  }

  function confetti(host) {
    if (REDUCED || !host) return;
    var colors = ["#22D3EE", "#3B82F6", "#A855F7", "#30D158", "#FFD60A", "#FF6BD5"];
    var b = h("span", "confetti");
    for (var i = 0; i < 26; i++) {
      var p = document.createElement("i");
      var a = Math.PI * (1 + Math.random());              // nach oben fächern
      var r = 40 + Math.random() * 90;
      p.style.setProperty("--dx", (Math.cos(a) * r).toFixed(1) + "px");
      p.style.setProperty("--dy", (Math.sin(a) * r - 30).toFixed(1) + "px");
      p.style.setProperty("--rot", Math.floor(Math.random() * 540 - 270) + "deg");
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.floor(Math.random() * 120) + "ms";
      b.appendChild(p);
    }
    host.appendChild(b);
    setTimeout(function () { b.remove(); }, 1400);
  }

  /* ───────────────────────── Kopf ───────────────────────── */

  function renderHeader() {
    var d = viewDate();
    el.date.textContent = "";
    if (!isToday()) el.date.appendChild(h("span", "away"));
    /* Text in eigenem Span: auf ein anonymes Flex-Item wirkt text-overflow
       nicht, das Datum würde bei Platznot hart abgeschnitten. */
    el.date.appendChild(h("span", "dtxt",
      DAY_SHORT[view.dayIndex].toUpperCase() + " · " + d.getDate() + ". " + MONTHS[d.getMonth()]
    ));

    var wk = state.plan.weeks[view.week - 1];
    el.badgeText.textContent = "W" + view.week + " · " + (wk.short || "Woche " + view.week);

    var total = dayTotal(getDay(view.week, view.dayIndex));
    el.count.textContent = total ? countDone(view.week, view.dayIndex) + "/" + total : "–";

    renderStrip();
    renderDayProgress();
  }

  function renderStrip() {
    var n = weekCount();
    el.strip.textContent = "";
    el.pager.textContent = "";
    for (var w = 1; w <= n; w++) {
      var page = h("div", "strip-page");
      for (var i = 0; i < 7; i++) page.appendChild(buildChip(w, i));
      el.strip.appendChild(page);
      var dot = h("i");
      if (w === view.week) dot.classList.add("on");
      el.pager.appendChild(dot);
    }
    el.pager.style.display = n > 1 ? "" : "none";

    var cur = el.strip.children[view.week - 1];
    if (cur) el.stripWrap.scrollLeft = cur.offsetLeft - el.strip.offsetLeft;
  }

  function buildChip(w, i) {
    var day = getDay(w, i);
    var total = dayTotal(day);
    var done = total ? countDone(w, i) : 0;

    var b = h("button", "chip");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", day.day + ", Woche " + w +
      (total ? ", " + done + " von " + total + " Übungen erledigt" : ", Ruhetag"));
    if (w === view.week && i === view.dayIndex) {
      b.classList.add("is-active");
      b.setAttribute("aria-selected", "true");
    }
    if (w === todayRef.week && i === todayRef.dayIndex) b.classList.add("is-today");

    b.appendChild(h("span", "chip-lbl", DAY_SHORT[i]));

    var mid = h("span", "chip-mid");
    if (!total) {
      mid.appendChild(h("i", "chip-rest"));
    } else if (done === total) {
      mid.appendChild(svgCheck("chip-check", "#30D158"));
    } else {
      day.locations.forEach(function (L) {
        if (!L.items.length) return;
        var dot = h("i");
        dot.style.background = locColor(L.location);
        mid.appendChild(dot);
      });
    }
    b.appendChild(mid);

    if (total && done > 0) {
      var bar = h("span", "chip-bar");
      var fill = h("i");
      fill.style.transform = "scaleX(" + (done / total) + ")";
      bar.appendChild(fill);
      b.appendChild(bar);
    }

    b.addEventListener("click", function () { goTo(w, i); });
    return b;
  }

  function renderDayProgress() {
    el.dayprog.textContent = "";
    var day = getDay(view.week, view.dayIndex);
    if (!dayTotal(day)) return;
    var key = viewKey();
    day.locations.forEach(function (L) {
      if (!L.items.length) return;
      var done = 0;
      L.items.forEach(function (it) { if (isChecked(key, it.uid)) done++; });
      var seg = h("span", "seg");
      seg.style.flexGrow = String(L.items.length);
      var fill = h("i");
      fill.style.background = locGrad(L.location);
      fill.style.transform = "scaleX(" + (done / L.items.length) + ")";
      seg.appendChild(fill);
      el.dayprog.appendChild(seg);
    });
  }

  /* ───────────────────────── Tagesansicht ───────────────────────── */

  function render() {
    renderHeader();
    el.main.textContent = "";
    document.body.classList.toggle("editing", editing);

    var day = getDay(view.week, view.dayIndex);
    var total = dayTotal(day);

    if (!isToday()) {
      var wrap = h("div", "today-pill");
      var btn = h("button", null, "↩ Heute");
      btn.type = "button";
      btn.addEventListener("click", function () { goTo(todayRef.week, todayRef.dayIndex); });
      wrap.appendChild(btn);
      el.main.appendChild(wrap);
    }

    if (installHintWanted()) el.main.appendChild(buildInstallCard());

    if (!total && !editing) {
      renderRest(day);
      el.main.appendChild(buildFooter(0));
      updateJump();
      return;
    }

    var key = viewKey();
    var ri = 0;

    if (total) el.main.appendChild(reveal(buildHero(day, key), 0));

    var locs = visibleLocations(day);
    locs.forEach(function (L) {
      var li = day.locations.indexOf(L);
      el.main.appendChild(buildSection(L, li, key, ri));
      ri += L.items.length + 1;
    });

    if (editing) {
      var missing = LOCATIONS.filter(function (loc) {
        return !day.locations.some(function (L) { return L.location === loc; });
      });
      if (missing.length) el.main.appendChild(buildAddLocation(missing));
    }

    el.main.appendChild(buildFooter(total));
    updateJump();
    revealSafety();
  }

  /* ── Hero: Fortschrittsring und Orte ── */

  function buildHero(day, key) {
    var total = dayTotal(day);
    var done = countDone(view.week, view.dayIndex);
    var pct = total ? done / total : 0;

    var card = h("section", "hero");

    var ringBox = h("div", "hero-ring");
    ringBox.appendChild(svgHeroRing(pct));
    var mid = h("div", "hero-mid");
    mid.appendChild(h("b", null, Math.round(pct * 100) + "%"));
    mid.appendChild(h("span", null, done + "/" + total));
    ringBox.appendChild(mid);
    card.appendChild(ringBox);

    var info = h("div", "hero-info");
    var wk = state.plan.weeks[view.week - 1];
    info.appendChild(h("div", "hero-kicker", "Woche " + view.week + " · " + (wk.short || "")));
    info.appendChild(h("div", "hero-title", day.day));

    var chips = h("div", "hero-locs");
    day.locations.forEach(function (L) {
      if (!L.items.length) return;
      var c = h("button", "hero-loc");
      c.type = "button";
      c.style.setProperty("--c", locColor(L.location));
      c.appendChild(h("i"));
      c.appendChild(document.createTextNode(LOC_LABEL[L.location]));
      c.appendChild(h("b", null, String(L.items.length)));
      c.addEventListener("click", function () {
        var sec = document.getElementById("sec-" + L.location);
        if (sec) sec.scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
      });
      chips.appendChild(c);
    });
    info.appendChild(chips);
    card.appendChild(info);
    return card;
  }

  /* ── Sektion je Trainingsort ── */

  function buildSection(L, li, key, ri) {
    var sec = h("section", "section");
    sec.id = "sec-" + L.location;
    sec.style.setProperty("--c", locColor(L.location));
    sec.style.setProperty("--cg", locGrad(L.location));

    var head = h("div", "sec-head");
    head.appendChild(h("span", "sec-bar"));
    head.appendChild(h("span", "sec-name", LOC_LABEL[L.location]));

    var done = 0;
    L.items.forEach(function (it) { if (isChecked(key, it.uid)) done++; });

    var right = h("span", "sec-right");
    if (L.items.length) {
      right.appendChild(svgRing(done / L.items.length, locColor(L.location)));
      right.appendChild(h("span", "sec-count", done + "/" + L.items.length));
    } else {
      right.appendChild(h("span", "sec-count", "leer"));
    }
    head.appendChild(right);
    sec.appendChild(head);

    var ul = h("ul", "list");
    L.items.forEach(function (it, i) {
      ul.appendChild(buildRow(it, i, L, li, key, ri + i + 1));
    });
    sec.appendChild(ul);

    if (editing) {
      var add = h("button", "add-ex");
      add.type = "button";
      add.appendChild(h("b", null, "+"));
      add.appendChild(document.createTextNode("Übung hinzufügen"));
      add.addEventListener("click", function () { openAdd(view.week, view.dayIndex, L.location); });
      sec.appendChild(add);
    }
    return sec;
  }

  function buildRow(it, i, L, li, key, ri) {
    var lItem = document.createElement("li");
    var row = h("div", "row");
    row.dataset.uid = it.uid;
    row.dataset.loc = L.location;
    /* Im Bearbeiten-Modus keine Checkbox-Semantik: role=checkbox legt Kinder
       flach ("children presentational") und würde den Entfernen-Knopf für
       VoiceOver unerreichbar machen. */
    if (!editing) {
      row.setAttribute("role", "checkbox");
      row.tabIndex = 0;
    }

    row.appendChild(h("span", "sweep"));

    var dot = h("span", "dot");
    dot.appendChild(h("span", "fill"));
    dot.appendChild(h("span", "num", String(i + 1)));
    dot.appendChild(svgCheck("check"));
    dot.appendChild(h("span", "ping"));
    if (!editing && katalogIdVon(it.name)) dot.appendChild(h("span", "dot-info", "i"));
    row.appendChild(dot);

    var mainBox = h("span", "rmain");
    mainBox.appendChild(h("span", "name", it.name));
    if (it.qty || it.note) {
      var meta = h("span", "meta");
      if (it.qty) meta.appendChild(h("b", "qty", it.qty));
      if (it.qty && it.note) meta.appendChild(h("i", "meta-sep"));
      if (it.note) meta.appendChild(h("span", "note", it.note));
      mainBox.appendChild(meta);
    }
    row.appendChild(mainBox);

    var side = h("span", "rside");
    if (editing) {
      [[-1, "mv mv-up", "nach oben"], [1, "mv mv-down", "nach unten"]].forEach(function (m) {
        var mv = h("button", m[1]);
        mv.type = "button";
        mv.setAttribute("aria-label", it.name + " " + m[2]);
        mv.disabled = m[0] < 0 ? i === 0 : i === L.items.length - 1;
        mv.addEventListener("click", function (e) {
          e.stopPropagation();
          itemVerschieben(li, it.uid, m[0]);
        });
        side.appendChild(mv);
      });
      var del = h("button", "rm");
      del.type = "button";
      del.setAttribute("aria-label", it.name + " aus dem Plan entfernen");
      del.appendChild(h("i"));
      var rmTimer = null;
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        /* Zweistufig wie alle destruktiven Aktionen: erster Tipp armiert. */
        if (!del.classList.contains("armed")) {
          del.classList.add("armed");
          rmTimer = setTimeout(function () { del.classList.remove("armed"); }, 2500);
          return;
        }
        clearTimeout(rmTimer);
        removeItem(row, li, it.uid);
      });
      side.appendChild(del);
    }
    row.appendChild(side);

    var checked = isChecked(key, it.uid);
    if (checked) row.classList.add("done");
    if (!editing) {
      row.setAttribute("aria-checked", checked ? "true" : "false");
      row.setAttribute("aria-label", it.name +
        (it.qty ? ", " + it.qty : "") + (it.note ? ", " + it.note : ""));
    }

    attachTap(row, function () { if (!editing) toggle(row, key); });
    lItem.appendChild(row);
    reveal(row, ri);

    /* Liegt eine Anleitung vor, öffnet der Kreis ganz links das Detailfenster; der Rest
       der Zeile hakt ab. Der Knopf liegt bewusst NEBEN der Zeile über dem Kreis, nicht
       darin: role=checkbox legt Kinder für VoiceOver flach, und attachTap würde
       Enter/Leertaste als Haken werten. */
    var katId = katalogIdVon(it.name);
    if (katId && !editing) {
      lItem.classList.add("mit-anleitung");
      var anleitung = h("button", "anleitung-tipp");
      anleitung.type = "button";
      anleitung.setAttribute("aria-label", it.name + ": Anleitung und Animation");
      anleitung.addEventListener("click", function () {
        openDetail(katId, { quelle: "plan", w: view.week, di: view.dayIndex, loc: L.location, uid: it.uid });
      });
      lItem.insertBefore(anleitung, row);         // vor der Zeile: Tab-Reihenfolge links → rechts
    }
    return lItem;
  }

  function buildAddLocation(missing) {
    var box = h("div", "add-loc");
    box.appendChild(h("p", null, "Trainingsort hinzufügen:"));
    var rowBox = h("div", "add-loc-btns");
    missing.forEach(function (loc) {
      var b = h("button", "add-loc-btn", "+ " + LOC_LABEL[loc]);
      b.type = "button";
      b.style.setProperty("--c", locColor(loc));
      b.addEventListener("click", function () {
        var day = getDay(view.week, view.dayIndex);
        day.locations.push({ location: loc, items: [] });
        day.locations.sort(function (a, b2) {
          return LOCATIONS.indexOf(a.location) - LOCATIONS.indexOf(b2.location);
        });
        save();
        render();
      });
      rowBox.appendChild(b);
    });
    box.appendChild(rowBox);
    return box;
  }

  function buildFooter(total) {
    var f = h("div", "dayfoot");
    if (total) {
      var done = countDone(view.week, view.dayIndex);
      var sum = h("p", "sum", summaryText(total, done));
      sum.id = "day-sum";
      f.appendChild(sum);
    }

    var acts = h("div", "acts");

    var b1 = h("button", null, "Basics");
    b1.type = "button";
    b1.addEventListener("click", openBasics);
    acts.appendChild(b1);

    var b2 = h("button", null, "Übungen");
    b2.type = "button";
    b2.addEventListener("click", openDb);
    acts.appendChild(b2);

    var b25 = h("button", null, "Kalender");
    b25.type = "button";
    b25.addEventListener("click", openCal);
    acts.appendChild(b25);

    var b3 = h("button", editing ? "primary" : null, editing ? "Fertig" : "Bearbeiten");
    b3.type = "button";
    b3.addEventListener("click", function () {
      editing = !editing;
      render();
    });
    acts.appendChild(b3);

    var b4 = h("button", "wide", "Tag zurücksetzen");
    b4.type = "button";
    armButton(b4, "Tag zurücksetzen", "Wirklich zurücksetzen?", function () {
      delete state.days[viewKey()];
      save();
      render();
    });
    acts.appendChild(b4);

    f.appendChild(acts);

    if (total) {
      var doneAll = countDone(view.week, view.dayIndex);
      if (doneAll === total) f.appendChild(buildComplete(total));
    }
    return f;
  }

  function buildComplete(total) {
    var card = h("div", "day-complete");
    card.appendChild(h("b", null, "Tag komplett"));
    card.appendChild(h("span", null, total + " Übungen"));
    return card;
  }

  function summaryText(total, done) {
    return total + " Übung" + (total === 1 ? "" : "en") + " · " + done + " erledigt";
  }

  function renderRest(day) {
    var box = h("div", "rest");
    box.appendChild(h("div", "rest-moon", "☾"));
    box.appendChild(h("h3", null, "Ruhetag"));
    if (day.off && day.off.length) {
      box.appendChild(h("p", null,
        day.off.map(function (o) { return LOC_LABEL[o]; }).join(" · ") + " — heute nicht"));
    } else {
      box.appendChild(h("p", null, "Im Plan steht für diesen Tag nichts."));
    }
    var nxt = nextTraining();
    if (nxt) {
      var b = h("button", "next", "Nächstes Training: " + nxt.label);
      b.type = "button";
      b.addEventListener("click", function () { goTo(nxt.week, nxt.dayIndex); });
      box.appendChild(b);
    }
    el.main.appendChild(box);
  }

  function nextTraining() {
    var L = cycleDays();
    for (var step = 1; step <= L; step++) {
      var abs = (view.dayIndex + (view.week - 1) * 7 + step) % L;
      var w = Math.floor(abs / 7) + 1;
      var i = abs % 7;
      var day = getDay(w, i);
      var total = dayTotal(day);
      if (total) {
        var locs = day.locations.filter(function (x) { return x.items.length; });
        return {
          week: w, dayIndex: i,
          label: day.day + " · " +
            locs.map(function (x) { return LOC_LABEL[x.location]; }).join(" + ") +
            ", " + total + " Übungen"
        };
      }
    }
    return null;
  }

  /* ───────────────────────── Abhaken ───────────────────────── */

  function attachTap(node, fn) {
    var sx = 0, sy = 0, t0 = 0, active = false, lastFire = 0;

    function fire() { lastFire = Date.now(); fn(); }
    function end() { active = false; node.classList.remove("press"); }

    node.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest("button")) return;
      active = true; sx = e.clientX; sy = e.clientY; t0 = Date.now();
      node.classList.add("press");
    });
    node.addEventListener("pointercancel", end);
    node.addEventListener("pointerup", function (e) {
      if (!active) return;
      var moved = Math.abs(e.clientX - sx) > 16 || Math.abs(e.clientY - sy) > 16;
      var slow = Date.now() - t0 > 600;
      /* Zeigerereignisse werden implizit auf das Startelement gefangen –
         e.target liegt daher immer in dieser Zeile, auch wenn der Finger
         leicht verrutscht. */
      var sameRow = node.contains(e.target);
      end();
      if (!moved && !slow && sameRow) fire();
      /* Verworfener Tipp: den nachfolgenden synthetischen click ebenfalls
         verschlucken, sonst hakt ein Halten >600ms doch noch ab. */
      else lastFire = Date.now();
    });

    /* VoiceOver, Sprach- und Schaltersteuerung lösen einen echten click aus,
       aber keine Zeigerereignisse. Der Zeitstempel verhindert, dass ein
       normaler Fingertipp dadurch doppelt zählt. */
    node.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("button")) return;
      if (Date.now() - lastFire > 500) fire();
    });
    node.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); fire(); }
    });
  }

  function toggle(row, key) {
    var on = !row.classList.contains("done");

    setCheck(key, row.dataset.uid, on);
    row.classList.toggle("done", on);
    row.setAttribute("aria-checked", on ? "true" : "false");

    if (on) {
      row.classList.remove("sweeping");
      void row.offsetWidth;                       // Animation neu anstoßen
      row.classList.add("sweeping");
      burst(row.querySelector(".dot"), locColor(row.dataset.loc));
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
    }

    refreshProgress(row.dataset.loc);
  }

  /* Fortschritt nachziehen, ohne die Liste neu zu bauen – abgehakte Zeilen
     müssen exakt an ihrer Position bleiben. */
  function refreshProgress(loc) {
    var day = getDay(view.week, view.dayIndex);
    var key = viewKey();
    var total = dayTotal(day);
    var doneAll = 0;

    day.locations.forEach(function (L) {
      if (!L.items.length) return;
      var done = 0;
      L.items.forEach(function (it) { if (isChecked(key, it.uid)) done++; });
      doneAll += done;

      var sec = document.getElementById("sec-" + L.location);
      if (!sec) return;
      var head = sec.querySelector(".sec-head");
      head.querySelector(".sec-count").textContent = done + "/" + L.items.length;
      var pct = done / L.items.length;
      var fg = head.querySelector(".ring .fg");
      if (fg) {
        fg.setAttribute("stroke-dashoffset", RING_C * (1 - pct));
        fg.setAttribute("stroke", pct >= 1 ? "var(--done)" : locColor(L.location));
      }
      if (pct >= 1 && L.location === loc) {
        head.classList.remove("pulse");
        void head.offsetWidth;
        head.classList.add("pulse");
      }
    });

    el.count.textContent = doneAll + "/" + total;
    var sum = document.getElementById("day-sum");
    if (sum) sum.textContent = summaryText(total, doneAll);

    /* Hero-Ring nachziehen */
    var heroFg = el.main.querySelector(".hero-svg .fg");
    if (heroFg) {
      var pctAll = total ? doneAll / total : 0;
      heroFg.setAttribute("stroke-dashoffset", HERO_C * (1 - pctAll));
      heroFg.setAttribute("stroke", pctAll >= 1 ? "var(--done)" : "url(#heroGrad)");
      var midB = el.main.querySelector(".hero-mid b");
      var midS = el.main.querySelector(".hero-mid span");
      if (midB) midB.textContent = Math.round(pctAll * 100) + "%";
      if (midS) midS.textContent = doneAll + "/" + total;
    }

    renderDayProgress();

    var foot = el.main.querySelector(".dayfoot");
    var card = foot ? foot.querySelector(".day-complete") : null;
    if (doneAll === total && total > 0) {
      if (!card && foot) {
        var complete = buildComplete(total);
        foot.appendChild(complete);
        confetti(complete);
      }
      el.dayprog.classList.remove("flash");
      void el.dayprog.offsetWidth;
      el.dayprog.classList.add("flash");
    } else if (card) {
      card.remove();
    }

    var page = el.strip.children[view.week - 1];
    var chip = page ? page.children[view.dayIndex] : null;
    if (chip) chip.replaceWith(buildChip(view.week, view.dayIndex));

    updateJump();
  }

  /* ───────────────────────── Plan bearbeiten ───────────────────────── */

  function removeItem(row, li, uid) {
    var day = getDay(view.week, view.dayIndex);
    var L = day.locations[li];
    if (!L) return;
    var idx = -1;
    L.items.forEach(function (it, i) { if (it.uid === uid) idx = i; });
    if (idx < 0) return;

    var removed = L.items[idx];
    L.items.splice(idx, 1);
    /* In die Übungsdatenbank sichern. Werte nur überschreiben, wenn der Name
       nirgendwo sonst im Plan steht – sonst würde das Entfernen einer Variante
       die Werte der verbleibenden Variante in der Datenbank verdrängen. */
    upsertDb(removed, !(planUsage()[dbKey(removed.name)] > 0));
    save();

    if (REDUCED) { render(); return; }
    row.classList.add("removing");
    setTimeout(render, 220);
  }

  /* Reihenfolge innerhalb eines Trainingsorts ändern. Haken hängen an der uid und
     wandern deshalb mit. */
  function itemVerschieben(li, uid, richtung) {
    var L = getDay(view.week, view.dayIndex).locations[li];
    if (!L) return;
    var idx = -1;
    L.items.forEach(function (it, i) { if (it.uid === uid) idx = i; });
    var ziel = idx + richtung;
    if (idx < 0 || ziel < 0 || ziel >= L.items.length) return;
    var tmp = L.items[idx];
    L.items[idx] = L.items[ziel];
    L.items[ziel] = tmp;
    save();
    render();
  }

  /* ── Sheet: Übung hinzufügen (aus Datenbank oder neu) ── */

  function openAdd(w, di, loc) {
    addCtx = { w: w, di: di, loc: loc };
    el.addTitle.textContent = "Übung → " + LOC_LABEL[loc];
    el.addSearch.value = "";
    el.addForm.hidden = true;
    el.addName.value = ""; el.addQty.value = ""; el.addNote.value = "";
    buildAddList("");
    openSheet(el.sheetAdd);
  }

  function ctxLocation() {
    if (!addCtx) return null;
    var day = getDay(addCtx.w, addCtx.di);
    for (var i = 0; i < day.locations.length; i++) {
      if (day.locations[i].location === addCtx.loc) return day.locations[i];
    }
    return null;
  }

  function buildAddList(query) {
    el.addList.textContent = "";
    var L = ctxLocation();
    if (!L) return;
    var present = Object.create(null);
    L.items.forEach(function (it) { present[dbKey(it.name)] = true; });

    var q = query.trim().toLowerCase();
    var shown = 0;
    archivEintraege().forEach(function (entry) {
      if (q && !archivSuchtreffer(entry, q)) return;
      shown++;
      var row = h("div", "db-row");
      var mainBox = h("div", "db-main");
      mainBox.appendChild(h("b", null, entry.name));
      var sub = archivUntertitel(entry);
      if (sub) mainBox.appendChild(h("span", null, sub));
      row.appendChild(mainBox);

      if (present[dbKey(entry.name)]) {
        row.classList.add("inplan");
        row.appendChild(h("span", "db-tag used", "im Plan ✓"));
      } else {
        var b = h("button", "db-add", "+");
        b.type = "button";
        b.setAttribute("aria-label", entry.name + " hinzufügen");
        b.addEventListener("click", function () {
          b.disabled = true;
          mengeFuer(entry).then(function (m) {
            addItemToCtx({ name: entry.name, qty: m.qty, note: m.note, katalog: entry.katalogId });
            buildAddList(el.addSearch.value);
          });
        });
        row.appendChild(b);
      }
      el.addList.appendChild(row);
    });

    if (!shown) {
      el.addList.appendChild(h("p", "db-empty",
        q ? "Keine Übung gefunden – unten neu anlegen." : "Die Datenbank ist leer."));
    }
  }

  function addItemToCtx(fields) {
    var L = ctxLocation();
    if (!L || !fields.name || !fields.name.trim()) return;
    var item = {
      uid: newUid(),
      name: fields.name.trim(),
      qty: (fields.qty || "").trim(),
      note: (fields.note || "").trim()
    };
    L.items.push(item);
    upsertDb({ name: item.name, qty: item.qty, note: item.note, katalog: fields.katalog }, false);
    save();
    render();                                    // Liste hinter dem Sheet aktualisieren
  }

  /* ───────────────────────── Übungskatalog ───────────────────────── */

  /* Der Katalog liegt NICHT im localStorage. Index und Geräte kommen beim Start aus
     daten/ (offline aus dem Service-Worker-Cache), der vollständige Datensatz einer
     Übung erst beim Öffnen des Detailfensters. Im Zustand steht nur die Referenz
     state.db[].katalog. Übungen und Plan sind über den Namen verknüpft (dbKey). */
  var KAT_LABEL = { technik: "Technik", footwork: "Footwork", koordination: "Koordination",
    kraft: "Kraft", explosivitaet: "Explosivität", kondition: "Kondition",
    rumpf_nacken: "Rumpf & Nacken", mobilitaet: "Mobilität" };
  var LEVEL_LABEL = { anfaenger: "Anfänger", fortgeschritten: "Fortgeschritten", experte: "Experte" };
  var DISZ_LABEL = { boxen: "Boxen", kickboxen: "Kickboxen", "muay-thai": "Muay Thai", kraftsport: "Kraftsport" };
  var PLATTFORM_LABEL = { web: "Web", wissenschaft: "Wissenschaft", verband: "Verband" };

  var katalog = { index: [], nachId: {}, nachName: {}, geraete: {}, trainingsort: null, details: {} };
  var archivFilter = { kategorie: "", disziplin: "", level: "", geraet: "" };
  var archivZielOffen = null;   // Name der Archivzeile mit offener Zielauswahl

  function labelVon(tabelle, wert) { return tabelle[wert] || wert; }

  /* „clinch-kraft" → „Clinch-Kraft" */
  function zielLabel(z) {
    return String(z).replace(/_/g, " ").replace(/(^|[\s-])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); });
  }

  function jsonHolen(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(url + " (" + res.status + ")");
      return res.json();
    });
  }

  function katalogLaden() {
    if (typeof fetch !== "function") return;
    Promise.all([jsonHolen("daten/uebungen-index.json"), jsonHolen("daten/equipment.json")])
      .then(function (r) {
        katalog.index = Array.isArray(r[0]) ? r[0] : [];
        katalog.nachId = {};
        katalog.nachName = {};
        katalog.index.forEach(function (e) {
          katalog.nachId[e.id] = e;
          katalog.nachName[dbKey(e.name)] = e.id;
        });
        ((r[1] && r[1].geraete) || []).forEach(function (g) { katalog.geraete[g.id] = g; });
        var ort = r[1] && r[1].meta && r[1].meta.trainingsort;
        katalog.trainingsort = LOCATIONS.indexOf(ort) >= 0 ? ort : null;
        archivFilterFuellen();
        if (planHatKatalog()) render();            // ⓘ an Planzeilen nachtragen
        if (!el.sheetDb.hidden) buildDbList(el.dbSearch.value);
        if (!el.sheetAdd.hidden) buildAddList(el.addSearch.value);
      })
      .catch(function () { /* ohne Katalog läuft die App wie bisher */ });
  }

  function katalogDetail(id) {
    if (katalog.details[id]) return Promise.resolve(katalog.details[id]);
    return jsonHolen("daten/uebungen/" + id + ".json").then(function (u) {
      katalog.details[id] = u;
      return u;
    });
  }

  /* Katalog-id zu einem Übungsnamen: erst über die gespeicherte Referenz, dann über den Namen. */
  function katalogIdVon(name) {
    var k = dbKey(name || "");
    for (var i = 0; i < state.db.length; i++) {
      var e = state.db[i];
      if (e.katalog && katalog.nachId[e.katalog] && dbKey(e.name) === k) return e.katalog;
    }
    return katalog.nachName[k] || null;
  }

  function planHatKatalog() {
    var gefunden = false;
    state.plan.weeks.forEach(function (w) {
      w.days.forEach(function (d) {
        d.locations.forEach(function (L) {
          L.items.forEach(function (it) { if (!gefunden && katalogIdVon(it.name)) gefunden = true; });
        });
      });
    });
    return gefunden;
  }

  /* Archiv = Katalogübungen plus alles, was je im Plan stand (state.db), ohne Doppel. */
  function archivEintraege() {
    var dbNachName = Object.create(null), dbNachKatalog = Object.create(null), liste = [];
    state.db.forEach(function (e) {
      dbNachName[dbKey(e.name)] = e;
      if (e.katalog) dbNachKatalog[e.katalog] = e;
    });
    var belegt = Object.create(null);
    katalog.index.forEach(function (k) {
      var db = dbNachKatalog[k.id] || dbNachName[dbKey(k.name)] || null;
      if (db) belegt[dbKey(db.name)] = true;
      liste.push({ name: db ? db.name : k.name, katalogId: k.id, index: k, db: db });
    });
    state.db.forEach(function (e) {
      if (!belegt[dbKey(e.name)]) liste.push({ name: e.name, katalogId: null, index: null, db: e });
    });
    /* Katalog zuerst (das ist der Vorrat aus dem Import), dann die eigenen Einträge. */
    return liste.sort(function (a, b) {
      if (!!a.katalogId !== !!b.katalogId) return a.katalogId ? -1 : 1;
      return a.name.localeCompare(b.name, "de");
    });
  }

  function archivSuchtreffer(entry, q) {
    if (entry.name.toLowerCase().indexOf(q) >= 0) return true;
    if (entry.index) {
      return (entry.index.ziel || []).some(function (z) {
        return String(z).toLowerCase().indexOf(q) >= 0 || zielLabel(z).toLowerCase().indexOf(q) >= 0;
      });
    }
    return !!entry.db && [entry.db.qty, entry.db.note].join(" ").toLowerCase().indexOf(q) >= 0;
  }

  function archivFilterAktiv() {
    return !!(archivFilter.kategorie || archivFilter.disziplin || archivFilter.level || archivFilter.geraet);
  }

  function archivPasst(entry, q) {
    if (archivFilterAktiv()) {
      var k = entry.index;
      if (!k) return false;                      // eigene Einträge haben keine Kategorien
      if (archivFilter.kategorie && k.kategorie !== archivFilter.kategorie) return false;
      if (archivFilter.level && k.level !== archivFilter.level) return false;
      if (archivFilter.disziplin && (k.disziplin || []).indexOf(archivFilter.disziplin) < 0) return false;
      if (archivFilter.geraet && (k.equipment || []).indexOf(archivFilter.geraet) < 0) return false;
    }
    return !q || archivSuchtreffer(entry, q);
  }

  function archivUntertitel(entry) {
    if (entry.index) {
      return [labelVon(KAT_LABEL, entry.index.kategorie), labelVon(LEVEL_LABEL, entry.index.level)]
        .concat(entry.db ? [entry.db.qty] : []).filter(Boolean).join(" · ");
    }
    return [entry.db.qty, entry.db.note].filter(Boolean).join(" · ");
  }

  function archivFilterFuellen() {
    if (!el.archFilter) return;
    function fuellen(select, werte, label, leer) {
      var aktuell = select.value;
      select.textContent = "";
      var o = h("option", null, leer);
      o.value = "";
      select.appendChild(o);
      werte.forEach(function (w) {
        var opt = h("option", null, label(w));
        opt.value = w;
        select.appendChild(opt);
      });
      select.value = werte.indexOf(aktuell) >= 0 ? aktuell : "";
    }
    function sammeln(feld) {
      var s = Object.create(null);
      katalog.index.forEach(function (k) { [].concat(k[feld] || []).forEach(function (w) { s[w] = true; }); });
      return Object.keys(s);
    }
    var nachLabel = function (tab) { return function (a, b) { return labelVon(tab, a).localeCompare(labelVon(tab, b), "de"); }; };
    fuellen(el.fKategorie, sammeln("kategorie").sort(nachLabel(KAT_LABEL)), function (w) { return labelVon(KAT_LABEL, w); }, "Alle Kategorien");
    fuellen(el.fDisziplin, sammeln("disziplin").sort(nachLabel(DISZ_LABEL)), function (w) { return labelVon(DISZ_LABEL, w); }, "Alle Disziplinen");
    fuellen(el.fLevel, ["anfaenger", "fortgeschritten", "experte"].filter(function (w) {
      return sammeln("level").indexOf(w) >= 0;
    }), function (w) { return labelVon(LEVEL_LABEL, w); }, "Alle Level");
    var geraeteName = function (id) { return katalog.geraete[id] ? katalog.geraete[id].name : id; };
    fuellen(el.fGeraet, sammeln("equipment").sort(function (a, b) {
      return geraeteName(a).localeCompare(geraeteName(b), "de");
    }), geraeteName, "Alle Geräte");
    el.archFilter.hidden = !katalog.index.length;
  }

  /* Menge und Anweisung für den Plan: gespeicherte Werte, sonst aus der Empfehlung. */
  function mengeFuer(entry) {
    if (entry.db && (entry.db.qty || entry.db.note)) {
      return Promise.resolve({ qty: entry.db.qty, note: entry.db.note });
    }
    if (!entry.katalogId) return Promise.resolve({ qty: "", note: "" });
    return katalogDetail(entry.katalogId).then(function (u) {
      var e = u.empfehlung || {};
      return {
        qty: [e.saetze ? e.saetze + " x" : "", e.umfang || ""].join(" ").trim(),
        note: e.pause ? "Pause " + e.pause : ""
      };
    }).catch(function () { return { qty: "", note: "" }; });
  }

  function zielText(w, di, loc) {
    return DAY_SHORT[di] + (weekCount() > 1 ? " · W" + w : "") + " · " + LOC_LABEL[loc];
  }

  /* Archiv → Plan: an einen Tag und Ort des Zyklus anhängen. Fehlt der Ort an dem
     Tag, wird er angelegt (wie „Trainingsort hinzufügen"). */
  function inPlanUebernehmen(entry, w, di, loc) {
    return mengeFuer(entry).then(function (m) {
      var day = getDay(w, di), L = null;
      day.locations.forEach(function (x) { if (x.location === loc) L = x; });
      if (!L) {
        L = { location: loc, items: [] };
        day.locations.push(L);
        day.locations.sort(function (a, b) { return LOCATIONS.indexOf(a.location) - LOCATIONS.indexOf(b.location); });
      }
      var item = { uid: newUid(), name: entry.name, qty: m.qty, note: m.note };
      L.items.push(item);
      upsertDb({ name: item.name, qty: item.qty, note: item.note, katalog: entry.katalogId }, false);
      save();
      render();
      showToast("info", entry.name + " → " + zielText(w, di, loc));
      return item;
    });
  }

  /* Plan → Archiv: die Übung verlässt den Plan und bleibt im Archiv (state.db). */
  function ausPlanEntfernen(w, di, loc, uid) {
    var day = getDay(w, di), entfernt = null;
    day.locations.forEach(function (L) {
      if (L.location !== loc) return;
      L.items = L.items.filter(function (it) {
        if (it.uid !== uid) return true;
        entfernt = it;
        return false;
      });
    });
    if (!entfernt) return null;
    upsertDb(entfernt, !(planUsage()[dbKey(entfernt.name)] > 0));
    save();
    render();
    showToast("info", entfernt.name + " → zurück im Archiv");
    return entfernt;
  }

  /* Zielauswahl Tag/Ort – dieselbe Bauweise im Archiv und im Detailfenster. */
  function planZielAuswahl(entry, fertig) {
    var wahl = { w: view.week, di: view.dayIndex, loc: null };
    var box = h("div", "plan-ziel");

    function ortVorschlag() {
      var day = getDay(wahl.w, wahl.di);
      if (katalog.trainingsort) return katalog.trainingsort;
      return day.locations.length ? day.locations[0].location : LOCATIONS[0];
    }
    wahl.loc = ortVorschlag();

    function chipReihe(titel, werte, aktiv, setzen) {
      var reihe = h("div", "pz-reihe");
      reihe.appendChild(h("span", "pz-titel", titel));
      var chips = h("div", "pz-chips");
      werte.forEach(function (v) {
        var b = h("button", "pz-chip" + (v.wert === aktiv ? " on" : ""), v.text);
        b.type = "button";
        b.setAttribute("aria-pressed", v.wert === aktiv ? "true" : "false");
        if (v.farbe) b.style.setProperty("--c", v.farbe);
        b.addEventListener("click", function () { setzen(v.wert); zeichnen(); });
        chips.appendChild(b);
      });
      reihe.appendChild(chips);
      return reihe;
    }

    function zeichnen() {
      box.textContent = "";
      if (weekCount() > 1) {
        box.appendChild(chipReihe("Woche", state.plan.weeks.map(function (wk, i) {
          return { wert: i + 1, text: "W" + (i + 1) };
        }), wahl.w, function (v) { wahl.w = v; }));
      }
      box.appendChild(chipReihe("Tag", DAY_SHORT.map(function (d, i) { return { wert: i, text: d }; }),
        wahl.di, function (v) { wahl.di = v; }));
      box.appendChild(chipReihe("Ort", LOCATIONS.map(function (l) {
        return { wert: l, text: LOC_LABEL[l], farbe: locColor(l) };
      }), wahl.loc, function (v) { wahl.loc = v; }));
      var ok = h("button", "save-btn pz-ok", "In den Plan → " + zielText(wahl.w, wahl.di, wahl.loc));
      ok.type = "button";
      ok.addEventListener("click", function () {
        ok.disabled = true;
        inPlanUebernehmen(entry, wahl.w, wahl.di, wahl.loc).then(function (item) {
          if (fertig) fertig(item, wahl);
        });
      });
      box.appendChild(ok);
    }
    zeichnen();
    return box;
  }

  /* ── Sheet: Archiv (bisher Übungsdatenbank) ── */

  function openDb() {
    el.dbSearch.value = "";
    archivZielOffen = null;
    buildDbList("");
    openSheet(el.sheetDb);
  }

  function planUsage() {
    var usage = Object.create(null);
    state.plan.weeks.forEach(function (w) {
      w.days.forEach(function (d) {
        d.locations.forEach(function (L) {
          L.items.forEach(function (it) {
            var k = dbKey(it.name);
            usage[k] = (usage[k] || 0) + 1;
          });
        });
      });
    });
    return usage;
  }

  /* Nur Text, keine Animationen in der Liste (Akku). */
  function buildDbList(query) {
    el.dbList.textContent = "";
    var q = query.trim().toLowerCase();
    var usage = planUsage();
    var alle = archivEintraege(), shown = 0, imPlan = 0, katalogZahl = 0, gruppe = null;

    alle.forEach(function (entry) {
      var n = usage[dbKey(entry.name)] || 0;
      if (n) imPlan++;
      if (entry.katalogId) katalogZahl++;
      if (!archivPasst(entry, q)) return;
      shown++;
      var neueGruppe = entry.katalogId ? "Übungskatalog" : "Eigene Übungen";
      if (neueGruppe !== gruppe) {
        gruppe = neueGruppe;
        el.dbList.appendChild(h("h3", "arch-gruppe", gruppe));
      }

      var wrap = h("div", "arch-eintrag");
      var row = h("div", "db-row" + (entry.katalogId ? " kat" : ""));
      var mainBox;
      if (entry.katalogId) {
        mainBox = h("button", "db-main db-open");
        mainBox.type = "button";
        mainBox.setAttribute("aria-label", entry.name + ": Anleitung und Animation öffnen");
        mainBox.addEventListener("click", function () { openDetail(entry.katalogId, { quelle: "archiv" }); });
      } else {
        mainBox = h("div", "db-main");
      }
      var titel = h("b", null, entry.name);
      if (entry.index && entry.index.hat_risikohinweis) {
        var r = h("i", "db-risiko", "!");
        r.setAttribute("title", "mit Risikohinweis");
        r.setAttribute("aria-label", "mit Risikohinweis");
        titel.appendChild(r);
      }
      mainBox.appendChild(titel);
      var sub = archivUntertitel(entry);
      if (sub) mainBox.appendChild(h("span", null, sub));
      row.appendChild(mainBox);

      row.appendChild(h("span", "db-tag" + (n ? " used" : ""), n ? (n === 1 ? "im Plan" : n + "× im Plan") : "nicht im Plan"));

      var add = h("button", "db-add" + (archivZielOffen === entry.name ? " open" : ""), "+");
      add.type = "button";
      add.setAttribute("aria-label", entry.name + " in den Plan übernehmen");
      add.setAttribute("aria-expanded", archivZielOffen === entry.name ? "true" : "false");
      add.addEventListener("click", function () {
        archivZielOffen = archivZielOffen === entry.name ? null : entry.name;
        buildDbList(el.dbSearch.value);
      });
      row.appendChild(add);

      if (!entry.katalogId) {
        var del = h("button", "db-del", "✕");
        del.type = "button";
        del.setAttribute("aria-label", entry.name + " endgültig löschen");
        armButton(del, "✕", "löschen?", function () {
          state.db = state.db.filter(function (e2) { return e2 !== entry.db; });
          save();
          buildDbList(el.dbSearch.value);
        });
        row.appendChild(del);
      }
      wrap.appendChild(row);

      if (archivZielOffen === entry.name) {
        wrap.appendChild(planZielAuswahl(entry, function () {
          archivZielOffen = null;
          buildDbList(el.dbSearch.value);
        }));
      }
      el.dbList.appendChild(wrap);
    });

    el.dbCount.textContent = katalogZahl + " Katalogübung" + (katalogZahl === 1 ? "" : "en") +
      " · " + (alle.length - katalogZahl) + " eigene · " + imPlan + " im Plan";
    if (el.archReset) el.archReset.hidden = !(archivFilterAktiv() || q);
    if (!shown) el.dbList.appendChild(h("p", "db-empty", "Keine Übung gefunden."));
  }

  /* ── Sheet: Detailfenster einer Übung ──
     Eine Komponente, ein Aufrufpfad – aus dem Archiv und aus dem Plan identisch.
     kontext: { quelle: "archiv" } oder { quelle: "plan", w, di, loc, uid } */

  var detail = { id: null, kontext: null, steuerung: null, token: 0, uebung: null };

  function detailSchliessen() {
    detail.token++;
    if (detail.steuerung) detail.steuerung.zerstoere();
    detail.steuerung = null;
    detail.id = null;
    detail.uebung = null;
    detail.kontext = null;
    el.detBody.textContent = "";
  }

  function openDetail(id, kontext) {
    if (!el.sheetDetail || !window.ZyklusAnimation) return;
    if (detail.steuerung) detail.steuerung.zerstoere();
    detail.steuerung = null;
    var token = ++detail.token;
    detail.id = id;
    detail.kontext = kontext || { quelle: "archiv" };
    var k = katalog.nachId[id];
    el.detName.textContent = k ? k.name : "Übung";
    el.detBody.textContent = "";
    el.detBody.appendChild(h("p", "det-laden", "Übung wird geladen …"));
    openSheet(el.sheetDetail);
    katalogDetail(id).then(function (u) {
      if (token !== detail.token) return;        // inzwischen geschlossen oder gewechselt
      detail.uebung = u;
      detailAufbauen(u);
    }).catch(function () {
      if (token !== detail.token) return;
      el.detBody.textContent = "";
      el.detBody.appendChild(h("p", "det-laden",
        "Diese Übung liegt noch nicht auf dem Gerät. Einmal mit Internet öffnen, dann ist sie offline da."));
    });
  }

  function detailAufbauen(u) {
    var body = el.detBody;
    body.textContent = "";
    el.detName.textContent = u.name;

    var kopf = h("div", "det-kopf");
    kopf.appendChild(h("p", "det-meta", [labelVon(KAT_LABEL, u.kategorie), labelVon(LEVEL_LABEL, u.level),
      (u.disziplin || []).map(function (d) { return labelVon(DISZ_LABEL, d); }).join(", ")].filter(Boolean).join(" · ")));
    if (u.ziel && u.ziel.length) {
      var ziele = h("div", "det-ziele");
      u.ziel.forEach(function (z) { ziele.appendChild(h("span", "det-ziel", zielLabel(z))); });
      kopf.appendChild(ziele);
    }
    kopf.appendChild(detailAktion(u));
    body.appendChild(kopf);

    var raster = h("div", "det-raster");

    /* Links: Animation, Steuerung, Phase */
    var links = h("div", "det-links");
    var buehne = h("div", "det-buehne");
    var canvas = h("canvas", "det-canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Animation: " + u.name);
    buehne.appendChild(canvas);
    links.appendChild(buehne);

    var steuer = h("div", "det-steuer");
    var zurueck = h("button", "det-btn", "‹");
    zurueck.type = "button";
    zurueck.setAttribute("aria-label", "Vorige Phase");
    var spiel = h("button", "det-btn det-play");
    spiel.type = "button";
    var vor = h("button", "det-btn", "›");
    vor.type = "button";
    vor.setAttribute("aria-label", "Nächste Phase");
    var leiste = h("input", "det-leiste");
    leiste.type = "range";
    leiste.min = "0";
    leiste.max = "1000";
    leiste.step = "1";
    leiste.value = "0";
    leiste.setAttribute("aria-label", "Fortschritt");
    steuer.appendChild(zurueck);
    steuer.appendChild(spiel);
    steuer.appendChild(vor);
    steuer.appendChild(leiste);
    links.appendChild(steuer);

    var seite = h("p", "det-seite");
    seite.hidden = !u.animation.seitenwechsel;
    links.appendChild(seite);
    var phase = h("div", "det-phase");
    var phaseName = h("b");
    var phaseHinweis = h("p");
    phase.appendChild(phaseName);
    phase.appendChild(phaseHinweis);
    links.appendChild(phase);
    raster.appendChild(links);

    /* Rechts: Risikohinweis zuerst, dann Anleitung, Achte auf, Fehler, Empfehlung, Geräte, Quellen */
    var rechts = h("div", "det-rechts");
    if (u.risikohinweis) {
      var risiko = h("div", "det-risiko");
      risiko.setAttribute("role", "note");
      risiko.appendChild(h("b", null, "Risikohinweis"));
      risiko.appendChild(h("p", null, u.risikohinweis));
      rechts.appendChild(risiko);
    }
    function abschnitt(titel, cls) {
      var sec = h("section", "det-abschnitt" + (cls ? " " + cls : ""));
      sec.appendChild(h("h3", null, titel));
      rechts.appendChild(sec);
      return sec;
    }
    function liste(sec, eintraege) {
      var ul = h("ul");
      (eintraege || []).forEach(function (t) { ul.appendChild(h("li", null, t)); });
      sec.appendChild(ul);
    }
    abschnitt("Anleitung").appendChild(h("p", null, u.anleitung || ""));
    liste(abschnitt("Achte auf"), u.achte_auf);
    liste(abschnitt("Häufige Fehler", "det-fehler"), u.haeufige_fehler);

    var em = u.empfehlung || {};
    var tab = h("table", "det-tabelle");
    [["Sätze", em.saetze], ["Umfang", em.umfang], ["Pause", em.pause], ["Intensität", em.intensitaet],
     ["Frequenz", em.frequenz_pro_woche != null ? em.frequenz_pro_woche + "× pro Woche" : ""]]
      .forEach(function (z) {
        if (z[1] == null || z[1] === "") return;
        var tr = h("tr");
        tr.appendChild(h("th", null, z[0]));
        tr.appendChild(h("td", null, String(z[1])));
        tab.appendChild(tr);
      });
    abschnitt("Empfehlung").appendChild(tab);

    var geraete = (u.equipment || []).map(function (id) { return katalog.geraete[id] ? katalog.geraete[id].name : id; });
    var gSec = abschnitt("Equipment");
    if (geraete.length) liste(gSec, geraete); else gSec.appendChild(h("p", "det-leer", "Ohne Equipment"));

    var qSec = abschnitt("Quellen", "det-quellen");
    var qUl = h("ul");
    (u.quellen || []).forEach(function (q) {
      var li = h("li");
      var a = h("a", null, q.titel || q.url);
      a.href = q.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      li.appendChild(a);
      if (q.plattform) li.appendChild(h("span", "det-plattform", labelVon(PLATTFORM_LABEL, q.plattform)));
      qUl.appendChild(li);
    });
    qSec.appendChild(qUl);
    raster.appendChild(rechts);
    body.appendChild(raster);

    /* Animation: rAF läuft nur, solange das Fenster offen und das Bild sichtbar ist
       (animation.js prüft IntersectionObserver und document.visibilityState). */
    var zieht = false, letzteAnzeige = "";
    function anzeigen(z) {
      var fertig = z.fertig && !z.laeuft;
      spiel.textContent = z.laeuft ? "❚❚" : (fertig ? "↻" : "▶");
      spiel.setAttribute("aria-label", z.laeuft ? "Pause" : (fertig ? "Wiederholen" : "Abspielen"));
      spiel.classList.toggle("wieder", fertig);
      if (!zieht) leiste.value = String(Math.round(z.fortschritt * 1000));
      var schluessel = z.phase + "|" + z.seite + "|" + z.phasen + "|" + z.phaseName;
      if (schluessel !== letzteAnzeige) {
        letzteAnzeige = schluessel;
        phaseName.textContent = "Phase " + (z.phase + 1) + " von " + z.phasen + " · " + z.phaseName;
        phaseHinweis.textContent = z.hinweis || "";
        seite.hidden = z.seiten < 2;
        if (z.seiten > 1) seite.textContent = "Seite " + z.seite + " / 2";
      }
    }
    var steuerung = window.ZyklusAnimation.erzeugen(canvas, u, null, {
      erscheinungsbild: "dunkel",
      beiAenderung: anzeigen
    });
    detail.steuerung = steuerung;

    spiel.addEventListener("click", function () {
      var z = steuerung.zustand();
      if (z.fertig && !z.laeuft) steuerung.wiederholen(); else steuerung.umschalten();
    });
    zurueck.addEventListener("click", function () { steuerung.schritt(-1); });
    vor.addEventListener("click", function () { steuerung.schritt(1); });
    leiste.addEventListener("input", function () {
      zieht = true;
      if (steuerung.laeuft()) steuerung.pause();
      steuerung.setzeFortschritt(Number(leiste.value) / 1000);
    });
    leiste.addEventListener("change", function () { zieht = false; });

    /* prefers-reduced-motion: nicht automatisch starten – Pose 0 als Standbild und Abspielknopf. */
    if (!REDUCED) steuerung.start();
    anzeigen(steuerung.zustand());
  }

  /* Knopf oben im Detailfenster: Archiv → Plan (Zielauswahl) bzw. Plan → Archiv. */
  function detailAktion(u) {
    var box = h("div", "det-aktion");
    var kontext = detail.kontext || { quelle: "archiv" };
    var entry = { name: u.name, katalogId: u.id, index: katalog.nachId[u.id] || null, db: null };
    /* Wie archivEintraege: zuerst die gespeicherte Referenz, dann der Name. */
    state.db.forEach(function (e) { if (!entry.db && e.katalog === u.id) entry.db = e; });
    state.db.forEach(function (e) { if (!entry.db && dbKey(e.name) === dbKey(u.name)) entry.db = e; });
    if (entry.db) entry.name = entry.db.name;
    var n = planUsage()[dbKey(entry.name)] || 0;

    function neu() {
      var ersatz = detailAktion(u);
      box.parentNode.replaceChild(ersatz, box);
    }

    if (kontext.quelle === "plan" && kontext.uid) {
      box.appendChild(h("span", "det-imPlan", "Im Plan: " + zielText(kontext.w, kontext.di, kontext.loc)));
      var raus = h("button", "det-aktion-btn", "Zurück ins Archiv");
      raus.type = "button";
      raus.addEventListener("click", function () {
        ausPlanEntfernen(kontext.w, kontext.di, kontext.loc, kontext.uid);
        detail.kontext = { quelle: "archiv" };
        neu();
      });
      box.appendChild(raus);
      return box;
    }

    box.appendChild(h("span", "det-imPlan", n ? (n === 1 ? "Im Plan" : n + "× im Plan") : "Nur im Archiv"));
    var rein = h("button", "det-aktion-btn primaer", "+ In den Plan");
    rein.type = "button";
    rein.setAttribute("aria-expanded", "false");
    var auswahl = null;
    rein.addEventListener("click", function () {
      if (auswahl) {
        box.removeChild(auswahl);
        auswahl = null;
        rein.setAttribute("aria-expanded", "false");
        return;
      }
      auswahl = planZielAuswahl(entry, function () {
        neu();
        if (!el.sheetDb.hidden) buildDbList(el.dbSearch.value);
      });
      box.appendChild(auswahl);
      rein.setAttribute("aria-expanded", "true");
    });
    box.appendChild(rein);
    return box;
  }

  /* Prüfzugang für die Abnahme (Playwright): laufende Steuerung und Detailfenster. */
  window.ZyklusKatalog = {
    detailSteuerung: function () { return detail.steuerung; },
    oeffnen: function (id) { openDetail(id, { quelle: "archiv" }); }
  };

  /* ───────────────────────── Kalender ───────────────────────── */

  var calMonth = null;    // Date: 1. des angezeigten Monats
  var calSel = null;      // ausgewählter Tag als "YYYY-MM-DD"

  function calKey(y, m, day) { return y + "-" + pad2(m + 1) + "-" + pad2(day); }

  function parseKey(key) {
    var p = key.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0, 0);
  }

  /* Zyklus-Tag zu einem Kalendertag (Rückrechnung über den Anker). Wurde der
     Zyklus zwischenzeitlich verschoben, ist das für alte Tage best effort. */
  function planDayFor(date) {
    var w = weekOf(date);
    var di = (date.getDay() + 6) % 7;
    return { week: w, dayIndex: di, day: getDay(w, di) };
  }

  /* Alle Plan-Übungen nach Uid, um Haken vergangener Tage Name und Ort
     zuzuordnen – auch wenn die Übung heute an anderer Stelle steht. */
  function uidIndex() {
    var map = Object.create(null);
    state.plan.weeks.forEach(function (w) {
      w.days.forEach(function (d) {
        d.locations.forEach(function (L) {
          L.items.forEach(function (it) {
            if (!map[it.uid]) map[it.uid] = { name: it.name, qty: it.qty, loc: L.location };
          });
        });
      });
    });
    return map;
  }

  /* Ort aus einer Alt-Uid („2|4|Homegym|3|ab12") lesen, falls die Übung
     nicht mehr im Plan steht. */
  function uidLoc(uid) {
    var p = String(uid).split("|");
    return p.length === 5 && LOC_LABEL[p[2]] ? p[2] : null;
  }

  /* Tages-Zusammenfassung: Haken, Plansoll, Status. null = kein Eintrag. */
  function daySummary(key) {
    var d = state.days[key];
    if (!d || !d.checks || !Object.keys(d.checks).length) return null;
    var pd = planDayFor(parseKey(key));
    var total = dayTotal(pd.day);
    var done = 0;
    pd.day.locations.forEach(function (L) {
      L.items.forEach(function (it) { if (it.uid in d.checks) done++; });
    });
    var complete = total > 0 && done === total;
    return {
      d: d, planDay: pd, total: total, done: done,
      checks: Object.keys(d.checks).length,
      complete: complete
    };
  }

  function openCal() {
    var ref = refDate();
    calMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
    calSel = todayRef.key;
    if (!el.calDow.childElementCount) {
      DAY_SHORT.forEach(function (s) { el.calDow.appendChild(h("span", null, s)); });
    }
    buildCalendar();
    openSheet(el.sheetCal);
  }

  function shiftCalMonth(delta) {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + delta, 1);
    buildCalendar();
  }

  function buildCalendar() {
    var y = calMonth.getFullYear(), m = calMonth.getMonth();
    el.calTitle.textContent = MONTHS[m] + " " + y;

    el.calGrid.textContent = "";
    var lead = (new Date(y, m, 1).getDay() + 6) % 7;
    var dim = new Date(y, m + 1, 0).getDate();
    var trainings = 0;

    for (var i = 0; i < lead; i++) el.calGrid.appendChild(h("span", "cal-pad"));

    for (var day = 1; day <= dim; day++) {
      (function (day) {
        var key = calKey(y, m, day);
        var s = daySummary(key);
        var cell = h("button", "cal-cell");
        cell.type = "button";
        if (key > todayRef.key) cell.classList.add("future");
        if (key === todayRef.key) cell.classList.add("is-today");
        if (key === calSel) cell.classList.add("is-sel");

        var aria = day + ". " + MONTHS[m];
        if (s) {
          cell.classList.add("trained");
          var pct = s.total ? Math.min(1, s.done / s.total) : 1;
          cell.appendChild(svgRing(pct, "var(--cal-acc)"));
          trainings++;
          aria += ", " + s.checks + " Übungen" + (s.complete ? ", komplett" : "");
        }
        cell.setAttribute("aria-label", aria);
        cell.appendChild(h("b", null, String(day)));
        cell.addEventListener("click", function () {
          calSel = key;
          var old = el.calGrid.querySelector(".is-sel");
          if (old) old.classList.remove("is-sel");
          cell.classList.add("is-sel");
          buildCalDetail();
        });
        el.calGrid.appendChild(cell);
      })(day);
    }

    el.calStats.textContent = "";
    if (trainings) {
      var st1 = h("span", "cal-stat");
      st1.appendChild(h("b", null, String(trainings)));
      st1.appendChild(document.createTextNode(" Training" + (trainings === 1 ? "" : "s")));
      el.calStats.appendChild(st1);
    } else {
      el.calStats.appendChild(h("span", "cal-stat dim", "Kein Training in diesem Monat"));
    }

    buildCalDetail();
  }

  function buildCalDetail() {
    var box = el.calDetail;
    box.textContent = "";
    if (!calSel) return;

    var date = parseKey(calSel);
    var head = h("div", "cal-d-head");
    head.appendChild(h("b", null,
      DAY_NAMES[(date.getDay() + 6) % 7] + ", " + date.getDate() + ". " +
      MONTHS[date.getMonth()] + " " + date.getFullYear()));

    var s = daySummary(calSel);
    if (!s) {
      box.appendChild(head);
      box.appendChild(h("p", "cal-empty",
        calSel > todayRef.key ? "Liegt noch in der Zukunft."
                              : "Kein Training aufgezeichnet."));
      return;
    }

    var tag = h("span", "cal-status" + (s.complete ? " ok" : ""), s.complete ? "Komplett" : "Teilweise");
    head.appendChild(tag);
    box.appendChild(head);

    var meta = h("p", "cal-d-meta",
      s.checks + " Übung" + (s.checks === 1 ? "" : "en") +
      (s.total ? " von " + s.total : ""));
    box.appendChild(meta);

    var idx = uidIndex();
    var list = h("div", "cal-d-list");

    /* Abgehakte Übungen in Abhak-Reihenfolge, danach die nachgetragenen. */
    var timed = checksSorted(calSel);
    var seen = Object.create(null);
    timed.forEach(function (c) { seen[c.uid] = true; });
    var untimed = Object.keys(s.d.checks).filter(function (uid) { return !seen[uid]; });

    function addRow(uid) {
      var info = idx[uid];
      var loc = info ? info.loc : uidLoc(uid);
      var row = h("div", "cal-d-row");
      var dot = h("i", "cdot");
      dot.style.background = loc ? locColor(loc) : "var(--fg3)";
      row.appendChild(dot);
      row.appendChild(h("span", "nm", info ? info.name : "Frühere Übung"));
      list.appendChild(row);
    }

    timed.forEach(function (c) { addRow(c.uid); });
    untimed.forEach(addRow);

    /* Nicht gemachte Übungen des Plan-Tags (nur bei Trainingstagen). */
    if (s.total) {
      s.planDay.day.locations.forEach(function (L) {
        L.items.forEach(function (it) {
          if (it.uid in s.d.checks) return;
          var row = h("div", "cal-d-row open");
          var dot = h("i", "cdot");
          dot.style.background = locColor(L.location);
          row.appendChild(dot);
          row.appendChild(h("span", "nm", it.name));
          row.appendChild(h("span", "tm", "offen"));
          list.appendChild(row);
        });
      });
    }

    box.appendChild(list);
  }

  /* ───────────────────────── „Nächste offene" ───────────────────────── */

  function updateJump() {
    var rows = el.main.querySelectorAll(".row:not(.done)");
    if (!rows.length || editing || anyOpenSheet()) { hideJump(); return; }

    var top = el.hdr.getBoundingClientRect().height;
    var bottom = window.innerHeight - 8;
    var below = null, above = null;

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      if (r.bottom > top + 8 && r.top < bottom) { hideJump(); return; }   // eine ist sichtbar
      if (r.top >= bottom) { if (!below) below = rows[i]; }
      else above = rows[i];                                              // letzte oberhalb
    }

    var target = below || above;
    if (!target) { hideJump(); return; }

    var label = below ? "↓ Nächste offene" : "↑ Nächste offene";
    if (el.jump.textContent !== label) el.jump.textContent = label;
    if (el.jump.hidden) el.jump.hidden = false;
    el.jump.onclick = function () {
      target.scrollIntoView({ block: "center", behavior: REDUCED ? "auto" : "smooth" });
    };
  }

  function hideJump() {
    if (!el.jump.hidden) el.jump.hidden = true;
    el.jump.onclick = null;
  }

  /* ───────────────────────── Navigation ───────────────────────── */

  function goTo(week, dayIndex) {
    view = { week: week, dayIndex: dayIndex };
    window.scrollTo(0, 0);
    render();
    onScroll();
  }

  function shiftDay(delta) {
    var L = cycleDays();
    var abs = ((view.dayIndex + (view.week - 1) * 7 + delta) % L + L) % L;
    goTo(Math.floor(abs / 7) + 1, abs % 7);
  }

  /* Horizontales Wischen über die Liste. Die linken 24 px bleiben der
     System-Zurück-Geste von Safari vorbehalten. */
  function attachSwipe() {
    var sx = 0, sy = 0, t0 = 0, live = false;
    el.main.addEventListener("pointerdown", function (e) {
      if (e.clientX < 24) { live = false; return; }
      live = true; sx = e.clientX; sy = e.clientY; t0 = Date.now();
    });
    el.main.addEventListener("pointerup", function (e) {
      if (!live) return;
      live = false;
      var dx = e.clientX - sx, dy = e.clientY - sy;
      if (Date.now() - t0 < 500 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
        shiftDay(dx < 0 ? 1 : -1);
      }
    });
  }

  /* ───────────────────────── Sheets ───────────────────────── */

  /* Hintergrund festhalten, solange ein Sheet offen ist. iOS-Safari ignoriert
     overflow:hidden am body, deshalb der position:fixed-Umweg. */
  var lockY = 0;

  function lockScroll() {
    lockY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = -lockY + "px";
    document.body.style.width = "100%";
  }

  function unlockScroll() {
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    window.scrollTo(0, lockY);
  }

  /* Offene Sheets von unten nach oben. Das Detailfenster einer Übung öffnet sich
     über dem Archiv; Scroll-Lock und Hintergrund-Sperre gelten einmal für den ganzen
     Stapel, der Fokus kehrt je Sheet zu seinem Auslöser zurück. */
  var sheetStapel = [];     // [{ node, opener }]

  function sheetSperren(node, an) {
    if (an) node.setAttribute("aria-hidden", "true"); else node.removeAttribute("aria-hidden");
    if ("inert" in node) node.inert = an;
  }

  function closeSheet(node) {
    var pos = -1;
    for (var i = 0; i < sheetStapel.length; i++) { if (sheetStapel[i].node === node) pos = i; }
    node.hidden = true;
    if (node === el.sheetDetail) detailSchliessen();
    if (pos < 0) return;
    var eintrag = sheetStapel.splice(pos, 1)[0];
    if (!sheetStapel.length) {
      unlockScroll();
      el.main.removeAttribute("aria-hidden");
      el.hdr.removeAttribute("aria-hidden");
      if ("inert" in el.main) { el.main.inert = false; el.hdr.inert = false; }
    } else {
      sheetSperren(sheetStapel[sheetStapel.length - 1].node, false);
    }
    if (eintrag.opener && eintrag.opener.focus && document.body.contains(eintrag.opener)) {
      try { eintrag.opener.focus(); } catch (e) {}
    }
  }

  function openSheet(node) {
    if (!node.hidden) return;
    if (!sheetStapel.length) {
      lockScroll();
      el.main.setAttribute("aria-hidden", "true");
      el.hdr.setAttribute("aria-hidden", "true");
      /* aria-hidden allein lässt den Hintergrund fokussierbar – inert nimmt
         ihn wirklich aus der Tab-Reihenfolge (iOS-Safari ≥ 15.5). */
      if ("inert" in el.main) { el.main.inert = true; el.hdr.inert = true; }
      hideJump();
    } else {
      sheetSperren(sheetStapel[sheetStapel.length - 1].node, true);
    }
    sheetStapel.push({ node: node, opener: document.activeElement });
    node.hidden = false;
    var x = node.querySelector(".sheet-x");
    if (x) { try { x.focus(); } catch (e) {} }
    Array.prototype.forEach.call(node.querySelectorAll("[data-close]"), function (n) {
      n.onclick = function () { closeSheet(node); };
    });
  }

  function anyOpenSheet() {
    return document.querySelector(".sheet:not([hidden])");
  }

  function openBasics() {
    if (!el.basicsBody.childElementCount) buildBasics();
    openSheet(el.sheetBasics);
  }

  function buildBasics() {
    var b = SEED.basics;
    if (!b) return;
    b.goals.forEach(function (goal, gi) {
      var box = h("div", "goal");
      box.appendChild(h("h3", null, goal));
      var grid = h("div", "grid");
      b.rows.forEach(function (r, ri) {
        if (ri) grid.appendChild(h("div", "hr"));
        grid.appendChild(h("div", "k", r.label));
        var v = r.values[gi];
        grid.appendChild(h("div", "v", v && v !== "x" ? v : "–"));
      });
      box.appendChild(grid);
      el.basicsBody.appendChild(box);
    });

    var zoneBg = { "Zone 1": "rgba(255,255,255,.18)", "Zone 2": "#FF9F0A", "Zone 3": "#FF453A" };
    b.zones.forEach(function (z) {
      var row = h("div", "zone");
      var tag = h("b", null, z.zone);
      tag.style.background = zoneBg[z.zone] || "rgba(255,255,255,.18)";
      tag.style.color = z.zone === "Zone 1" ? "var(--fg)" : "#0B0C0E";
      row.appendChild(tag);
      row.appendChild(h("span", null, z.desc));
      el.basicsZones.appendChild(row);
    });
  }

  /* ── Sheet: Zyklus (Länge + aktuelle Woche) ── */

  function openCycle() {
    buildCycleSheet();
    resetImportUi();
    renderAppStatus();
    openSheet(el.sheetCycle);
  }

  function buildCycleSheet() {
    var n = weekCount();
    el.cycLenVal.textContent = n + " Woche" + (n === 1 ? "" : "n");
    el.cycMinus.disabled = n <= 1;
    el.cycPlus.disabled = n >= MAX_WEEKS;

    el.cycWeeks.textContent = "";
    var cur = weekOf(refDate());
    for (var k = 1; k <= n; k++) {
      (function (k2) {
        var wk = state.plan.weeks[k2 - 1];
        var b = h("button", "cyc-btn" + (cur === k2 ? " on" : ""));
        b.type = "button";
        b.appendChild(document.createTextNode("Woche " + k2));
        b.appendChild(h("small", null, wk.short || ""));
        b.addEventListener("click", function () { setCurrentWeek(k2); });
        el.cycWeeks.appendChild(b);
      })(k);
    }

    el.cycHint.textContent =
      "Der Zyklus läuft ab Montag, 01.06.2026 (Woche 1) durch. Oben stellst du ein, wie " +
      "viele Wochen er hat; darunter, welche Woche gerade läuft. Neue Wochen starten leer " +
      "und lassen sich über „Bearbeiten“ füllen.";
  }

  function setCycleLen(n) {
    var cur = weekCount();
    if (n === cur || n < 1 || n > MAX_WEEKS) return;
    /* Laufende Woche VOR der Änderung merken – weekOf() hängt von der
       Wochenzahl ab und würde sonst beim Umstellen springen: bereits
       gesetzte Haken des Tages wären aus der Ansicht verschwunden. */
    var curWeek = weekOf(refDate());
    if (n > cur) {
      for (var k = cur + 1; k <= n; k++) state.plan.weeks.push(emptyWeek(k));
    } else {
      /* Übungen der entfallenden Wochen in die Datenbank sichern: Einträge
         können zuvor im DB-Sheet gelöscht worden sein. */
      state.plan.weeks.slice(n).forEach(function (w) {
        w.days.forEach(function (d) {
          d.locations.forEach(function (L) {
            L.items.forEach(function (it) { upsertDb(it, true); });
          });
        });
      });
      state.plan.weeks.length = n;
    }
    state.shift = ((Math.min(curWeek, n) - 1 - weeksSinceAnchor(refDate())) % n + n) % n;
    save();
    computeToday();
    if (view.week > n) view = { week: todayRef.week, dayIndex: todayRef.dayIndex };
    buildCycleSheet();
    render();
  }

  function setCurrentWeek(k) {
    var n = weekCount();
    var ws = weeksSinceAnchor(refDate());
    state.shift = ((k - 1 - ws) % n + n) % n;
    save();
    computeToday();
    closeSheet(el.sheetCycle);
    goTo(todayRef.week, todayRef.dayIndex);
  }

  function resetPlan() {
    var plan = seedPlan();
    state.plan = plan;
    /* Datenbank nicht ersetzen, nur fehlende Seed-Übungen ergänzen – selbst
       angelegte Übungen und angepasste Werte bleiben erhalten. */
    seedDb(plan).forEach(function (e) { upsertDb(e, false); });
    state.shift = 0;
    save();
    computeToday();
    editing = false;
    closeSheet(el.sheetCycle);
    goTo(todayRef.week, todayRef.dayIndex);
  }

  /* ───────────────────────── Kopf-Kollaps ───────────────────────── */

  /* Die Kopfhöhe ändert sich über eine 180-ms-Transition. Sie im Scroll-Handler
     zu lesen liefert den Wert VOR der Animation – die klebenden Sektionsköpfe
     stünden dann auf einem veralteten Offset. Der ResizeObserver zieht --hdr
     währenddessen laufend nach. */
  function syncHdrVar() {
    document.documentElement.style.setProperty("--hdr", el.hdr.getBoundingClientRect().height + "px");
  }

  function onScroll() {
    /* Während ein Sheet den Body fixiert, ist scrollY künstlich 0 –
       der Kopf würde sonst hinter dem Scrim auf- und zuklappen. */
    if (document.body.style.position === "fixed") return;
    document.body.classList.toggle("collapsed", window.scrollY > 24);
    syncHdrVar();
    updateJump();
  }

  function watchHdr() {
    if (!window.ResizeObserver) return;
    new ResizeObserver(function () { syncHdrVar(); updateJump(); }).observe(el.hdr);
  }

  /* ───────────────────────── Tageswechsel um 04:00 ───────────────────────── */

  var rolloverTimer = null;

  function rollover() {
    var prev = todayRef.key;
    computeToday();
    if (prev !== todayRef.key) {
      /* Tageswechsel unter einem offenen Sheet: erst schließen, sonst wird
         unter dem Scroll-Lock gerendert und die alte Scroll-Position später
         auf der neuen Ansicht wiederhergestellt. */
      while (sheetStapel.length) closeSheet(sheetStapel[sheetStapel.length - 1].node);
      goTo(todayRef.week, todayRef.dayIndex);
    } else {
      render();
    }
    scheduleRollover();
  }

  /* Ohne Timer bliebe bei durchgehend geöffneter App der alte Tag samt
     Speicherschlüssel aktiv – Haken nach 04:00 landeten im Vortag. */
  function scheduleRollover() {
    clearTimeout(rolloverTimer);
    var now = new Date();
    var next = new Date(now.getTime());
    next.setHours(DAY_ROLLOVER_H, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    var wait = Math.min(next - now + 1000, 6 * 3600000);   // spätestens alle 6 h nachsehen
    rolloverTimer = setTimeout(rollover, Math.max(1000, wait));
  }

  /* ───────────────────────── Offline & Updates ───────────────────────── */

  /* Die App läuft vollständig aus dem Speicher des Geräts (sw.js). Hier nur:
     den Worker anmelden, beim Öffnen nach einer neuen Fassung fragen, den Stand
     im Zyklus-Sheet zeigen und eine fertig geladene neue Fassung anbieten. */

  var UPDATE_CHECK_MS = 60000;               // höchstens einmal pro Minute beim Server nachfragen
  var APPLY_AFTER_HIDDEN_MS = 10 * 60000;    // nach so langer Pause ein Update still übernehmen
  var READY_KEY = STORE_KEY + ".offline-bereit";   // „Offline bereit" nur einmal melden

  var offline = {
    supported: "serviceWorker" in navigator,
    reg: null,
    info: null,          // letzte Meldung des Workers: { version, missing, total }
    updateReady: false,
    lastCheck: 0,
    hiddenAt: 0
  };

  /* Worker nach Fassung und Vollständigkeit fragen. Der Worker vor der
     Offline-Umstellung kennt die Frage nicht – dann nach 2 s null. */
  function askWorker(worker) {
    return new Promise(function (resolve) {
      if (!worker || typeof MessageChannel === "undefined") { resolve(null); return; }
      var ch = new MessageChannel();
      var timer = setTimeout(function () { resolve(null); }, 2000);
      ch.port1.onmessage = function (e) {
        clearTimeout(timer);
        resolve(e.data && e.data.type === "status" ? e.data : null);
      };
      try { worker.postMessage({ type: "status" }, [ch.port2]); }
      catch (err) { clearTimeout(timer); resolve(null); }
    });
  }

  /* Auswertung jeder Worker-Meldung. Verglichen wird mit der Fassung dieses
     app.js selbst – das hängt nicht davon ab, ob der neue Worker schon vor dem
     Start der Seite übernommen hat oder erst danach. */
  function onWorkerStatus(info) {
    if (!info) return;
    offline.info = info;
    if (info.version !== APP_VERSION) {
      /* Der Speicher hält eine andere, frisch geladene Fassung bereit. Anbieten
         erst, wenn sie vollständig ist – ein Neuladen ohne Netz scheiterte sonst
         an genau den fehlenden Dateien. */
      if (!info.missing && !offline.updateReady) {
        offline.updateReady = true;
        showToast("update");
      }
    } else {
      if (offline.updateReady) {
        // Seite und Speicher sind wieder gleichauf – der Hinweis ist überholt.
        offline.updateReady = false;
        if (toastNode && toastNode.classList.contains("toast--update")) hideToast();
      }
      if (!info.missing) {
        var shown = "1";
        try { shown = localStorage.getItem(READY_KEY); } catch (e) { /* ohne Speicher: nicht melden */ }
        if (!shown) {
          try { localStorage.setItem(READY_KEY, String(Date.now())); } catch (e) { /* egal */ }
          showToast("ready");
        }
      }
    }
    renderAppStatus();
  }

  function initOffline() {
    if (!offline.supported) return;
    var swc = navigator.serviceWorker;

    askWorker(swc.controller).then(onWorkerStatus);
    swc.addEventListener("controllerchange", function () {
      askWorker(swc.controller).then(onWorkerStatus);
    });
    // Meldung nach einer Reparatur des Speichers (siehe sw.js).
    swc.addEventListener("message", function (e) {
      if (e.data && e.data.type === "status") onWorkerStatus(e.data);
    });

    var register = function () {
      swc.register("sw.js")
        .then(function (reg) {
          offline.reg = reg;
          offline.lastCheck = Date.now();   // der Seitenaufruf hat eben schon nachgesehen
        })
        .catch(function () { /* etwa privater Modus: dann nur online */ });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") { offline.hiddenAt = Date.now(); return; }
      /* Nach längerer Pause eine fertig geladene neue Fassung still übernehmen –
         Plan und Haken liegen ohnehin im Speicher. */
      if (offline.updateReady && offline.hiddenAt &&
          Date.now() - offline.hiddenAt > APPLY_AFTER_HIDDEN_MS &&
          !anyOpenSheet() && !editing) {
        location.reload();
        return;
      }
      checkForUpdate(false);
    });
    window.addEventListener("online", function () { checkForUpdate(true); });
  }

  function checkForUpdate(force) {
    if (!offline.reg || offline.updateReady || navigator.onLine === false) return;
    var now = Date.now();
    if (!force && now - offline.lastCheck < UPDATE_CHECK_MS) return;
    offline.lastCheck = now;
    try { offline.reg.update().catch(function () {}); } catch (e) { /* ältere Browser */ }
  }

  function versionDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})\./.exec(v || "");
    return m ? m[3] + "." + m[2] + "." + m[1] : "";
  }

  function statusRow(kind, title, text) {
    var row = h("div", "app-row app-row--" + kind);
    row.appendChild(h("i", "app-dot"));
    var body = h("div", "app-row-body");
    body.appendChild(h("b", null, title));
    if (text) body.appendChild(h("span", null, text));
    row.appendChild(body);
    return row;
  }

  function renderAppStatus() {
    if (!el.appStatus) return;
    var box = el.appStatus;
    var info = offline.info;
    box.textContent = "";

    if (!offline.supported) {
      box.appendChild(statusRow("warn", "Offline nicht möglich",
        "Dieser Browser kann die App nicht auf dem Gerät speichern."));
    } else if (info && info.missing === 0) {
      box.appendChild(statusRow("ok", "Offline bereit",
        "Liegt vollständig auf diesem Gerät und startet ohne Internet · Stand " + versionDate(info.version)));
    } else if (info && info.missing > 0) {
      box.appendChild(statusRow("warn", "Offline unvollständig",
        info.missing + " von " + info.total + " Dateien fehlen – sie werden mit Internet automatisch nachgeladen."));
    } else {
      box.appendChild(statusRow("busy", "Wird eingerichtet …",
        "Einmal mit Internet öffnen – danach startet Zyklus auch ohne Netz."));
    }

    if (offline.updateReady) {
      var up = statusRow("up", "Neue Version geladen", "Wird beim nächsten Start aktiv.");
      var go = h("button", "app-row-btn", "Jetzt");
      go.type = "button";
      go.addEventListener("click", function () { location.reload(); });
      up.appendChild(go);
      box.appendChild(up);
    }

    box.appendChild(isStandalone()
      ? statusRow("ok", "Als App installiert", "Läuft vom Home-Bildschirm im Vollbild.")
      : statusRow("hint", "Im Browser geöffnet", installSteps()));
  }

  /* ───────────────────────── Installation ───────────────────────── */

  var INSTALL_KEY = STORE_KEY + ".installhinweis";   // eigener Schlüssel, gehört nicht in Sicherungen
  var installPrompt = null;                          // Android/Chrome: gemerktes beforeinstallprompt

  function isStandalone() {
    return window.navigator.standalone === true ||
      !!(window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  }

  function platform() {
    var ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) return "android";
    // iPadOS meldet sich als Mac – erkennbar nur am Touchscreen.
    if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
      return "ios";
    }
    return "desktop";
  }

  function installSteps() {
    var p = platform();
    if (p === "ios") return "Zum Installieren: Teilen-Symbol antippen → „Zum Home-Bildschirm“.";
    if (p === "android") {
      return installPrompt
        ? "Zum Installieren: „Installieren“ oben auf der Tagesseite antippen."
        : "Zum Installieren: Browsermenü ⋮ → „App installieren“ oder „Zum Startbildschirm hinzufügen“.";
    }
    return "Auf dem Handy öffnen und zum Home-Bildschirm hinzufügen.";
  }

  function installHintWanted() {
    if (isStandalone()) return false;
    if (platform() === "desktop" && !installPrompt) return false;
    try { if (localStorage.getItem(INSTALL_KEY)) return false; } catch (e) { /* ohne Speicher: zeigen */ }
    return true;
  }

  function svgLine(cls, d, stroke, width) {
    var s = document.createElementNS(NS, "svg");
    s.setAttribute("class", cls);
    s.setAttribute("viewBox", "0 0 16 16");
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", stroke);
    p.setAttribute("stroke-width", width);
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    s.appendChild(p);
    return s;
  }

  function buildInstallCard() {
    var card = h("section", "install");
    card.id = "install-card";
    card.setAttribute("aria-label", "Zyklus als App installieren");

    var x = h("button", "install-x", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Hinweis ausblenden");
    x.addEventListener("click", function () {
      try { localStorage.setItem(INSTALL_KEY, String(Date.now())); } catch (e) { /* dann nur für jetzt */ }
      card.classList.add("out");
      setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, REDUCED ? 0 : 280);
    });
    card.appendChild(x);

    var head = h("div", "install-head");
    var icon = h("img", "install-icon");
    icon.src = "icons/icon-192.png";
    icon.alt = "";
    head.appendChild(icon);
    var title = h("div", "install-tt");
    title.appendChild(h("b", null, "Zyklus als App"));
    title.appendChild(h("span", null, "Vom Home-Bildschirm startet Zyklus im Vollbild – ganz ohne Internet."));
    head.appendChild(title);
    card.appendChild(head);

    if (installPrompt) {
      var go = h("button", "install-go", "Installieren");
      go.type = "button";
      go.addEventListener("click", function () {
        var ev = installPrompt;
        installPrompt = null;
        if (!ev) return;
        ev.prompt();
        Promise.resolve(ev.userChoice).then(refreshInstallCard, refreshInstallCard);
      });
      card.appendChild(go);
    } else if (platform() === "ios") {
      var steps = h("div", "install-steps");
      var share = h("span", "install-step");
      share.appendChild(svgLine("share-ico",
        "M8 9.8V1.9M5.3 4.5 8 1.8l2.7 2.7M5.6 6.6H4.2A1.2 1.2 0 0 0 3 7.8v5.9a1.2 1.2 0 0 0 1.2 1.2h7.6" +
        "a1.2 1.2 0 0 0 1.2-1.2V7.8a1.2 1.2 0 0 0-1.2-1.2h-1.4", "currentColor", "1.5"));
      share.appendChild(h("b", null, "Teilen"));
      steps.appendChild(share);
      steps.appendChild(h("i", "install-arrow", "→"));
      var add = h("span", "install-step");
      add.appendChild(h("b", null, "„Zum Home-Bildschirm“"));
      steps.appendChild(add);
      card.appendChild(steps);
    } else {
      card.appendChild(h("p", "install-text", installSteps()));
    }

    /* Browser und installierte App haben getrennte Speicher – wer hier schon
       trainiert hat, soll seinen Stand mitnehmen können. */
    if (Object.keys(state.days).length) {
      var note = h("div", "install-note");
      note.appendChild(h("span", null,
        "Die installierte App hat einen eigenen Speicher. Plan und Haken von hier nimmst du mit: " +
        "erst sichern, dann in der App über das Wochen-Badge oben „Sicherung laden“."));
      var saveBtn = h("button", "install-save", "Sicherung speichern");
      saveBtn.type = "button";
      saveBtn.addEventListener("click", exportBackup);
      note.appendChild(saveBtn);
      card.appendChild(note);
    }
    return card;
  }

  function refreshInstallCard() {
    var old = document.getElementById("install-card");
    if (!installHintWanted()) {
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return;
    }
    var card = buildInstallCard();
    if (old && old.parentNode) { old.parentNode.replaceChild(card, old); return; }
    var pill = el.main.querySelector(".today-pill");
    el.main.insertBefore(card, pill ? pill.nextSibling : el.main.firstChild);
  }

  function initInstall() {
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();          // eigene Karte statt Chromes Mini-Leiste
      installPrompt = e;
      refreshInstallCard();
      renderAppStatus();
    });
    window.addEventListener("appinstalled", function () {
      installPrompt = null;
      try { localStorage.setItem(INSTALL_KEY, String(Date.now())); } catch (e) { /* egal */ }
      refreshInstallCard();
    });
  }

  /* ───────────────────────── Sicherung ───────────────────────── */

  /* Plan, Übungsdatenbank und Haken als Datei – zum Aufbewahren und für den
     Umzug zwischen Browser, installierter App und neuem Handy. */

  var pendingImport = null;

  function downloadFile(text, name) {
    var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    var a = h("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  function exportBackup() {
    var json = JSON.stringify({ app: "zyklus", format: 1, exported: new Date().toISOString(), data: state });
    var name = "Zyklus-Sicherung-" + dayKeyFromDate(new Date()) + ".json";
    var file = null;
    try { file = new File([json], name, { type: "application/json" }); } catch (e) { file = null; }

    // Teilen-Menü (iPhone: „In Dateien sichern", AirDrop, Mail …), sonst Download.
    var share = false;
    try { share = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); }
    catch (e) { share = false; }
    if (!share) { downloadFile(json, name); return; }
    navigator.share({ files: [file], title: "Zyklus-Sicherung" }).catch(function (err) {
      if (!err || err.name !== "AbortError") downloadFile(json, name);
    });
  }

  function setBackupNote(text, kind) {
    if (!el.appNote) return;
    el.appNote.textContent = text || "";
    el.appNote.className = "app-note" + (kind ? " app-note--" + kind : "");
    el.appNote.hidden = !text;
    if (text) el.appNote.scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
  }

  function resetImportUi() {
    pendingImport = null;
    if (!el.appConfirm) return;
    el.appConfirm.hidden = true;
    el.appConfirm.textContent = "";
    setBackupNote("");
  }

  function onImportFile() {
    var f = el.appFile.files && el.appFile.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () { prepareImport(String(reader.result || "")); };
    reader.onerror = function () { setBackupNote("Die Datei ließ sich nicht lesen.", "err"); };
    reader.readAsText(f);
  }

  function prepareImport(text) {
    resetImportUi();
    var p = null;
    try { p = JSON.parse(text); } catch (e) { p = null; }
    // Sicherungsdatei dieser App oder roher Speicherstand (zyklus.v2) – beides geht.
    var data = p && p.app === "zyklus" && p.data ? p.data : p;
    if (!data || typeof data !== "object" || !validPlan(data.plan)) {
      setBackupNote("Das ist keine Zyklus-Sicherung – es wurde nichts geändert.", "err");
      return;
    }
    pendingImport = data;

    var weeks = data.plan.weeks.length;
    /* Nur Tage mit Haken zählen – Tage aus der früheren Workout-Uhr ohne Haken verwirft pruneDays. */
    var days = data.days && typeof data.days === "object" ? Object.keys(data.days).filter(function (k) {
      var d = data.days[k];
      return d && typeof d === "object" && d.checks && typeof d.checks === "object" && Object.keys(d.checks).length > 0;
    }).length : 0;
    var when = p.exported ? new Date(p.exported) : null;
    var title = when && !isNaN(when.getTime())
      ? "Sicherung vom " + pad2(when.getDate()) + "." + pad2(when.getMonth() + 1) + "." +
        when.getFullYear() + ", " + pad2(when.getHours()) + ":" + pad2(when.getMinutes()) + " Uhr"
      : "Sicherung gefunden";

    var box = el.appConfirm;
    box.appendChild(h("b", null, title));
    box.appendChild(h("span", null, weeks + (weeks === 1 ? " Woche" : " Wochen") + " im Zyklus · " +
      days + (days === 1 ? " Trainingstag" : " Trainingstage") + " im Kalender"));
    box.appendChild(h("p", null, "Ersetzt Plan, Übungsdatenbank und Haken auf diesem Gerät."));
    var acts = h("div", "app-confirm-acts");
    var no = h("button", "app-btn", "Abbrechen");
    no.type = "button";
    no.addEventListener("click", resetImportUi);
    var yes = h("button", "app-btn app-btn--go", "Übernehmen");
    yes.type = "button";
    yes.addEventListener("click", applyImport);
    acts.appendChild(no);
    acts.appendChild(yes);
    box.appendChild(acts);
    box.hidden = false;
    // Nach der Dateiauswahl steht der Blick oben im Sheet – Rückfrage ins Bild holen.
    box.scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
  }

  function applyImport() {
    var data = pendingImport;
    if (!data) return;
    try {
      var cur = localStorage.getItem(STORE_KEY);
      if (cur) localStorage.setItem(STORE_KEY + ".vor-import", cur);   // Rückfall auf den Stand davor
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      setBackupNote("Speichern auf diesem Gerät ist fehlgeschlagen – es wurde nichts geändert.", "err");
      return;
    }
    pendingImport = null;
    state = loadState();   // dieselbe Prüfung und Reparatur wie beim App-Start
    save();
    computeToday();
    editing = false;
    closeSheet(el.sheetCycle);
    goTo(todayRef.week, todayRef.dayIndex);
    showToast("info", "Sicherung übernommen");
  }

  /* ───────────────────────── Hinweis-Pille ───────────────────────── */

  var toastNode = null;
  var toastTimer = null;

  function hideToast() {
    clearTimeout(toastTimer);
    var n = toastNode;
    toastNode = null;
    if (!n) return;
    n.classList.add("out");
    setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, REDUCED ? 0 : 240);
  }

  function showToast(kind, text) {
    hideToast();
    var t = h("div", "toast toast--" + kind);
    t.setAttribute("role", "status");

    var ico = h("span", "toast-ico");
    ico.appendChild(kind === "update"
      ? svgLine("toast-refresh", "M13.3 6.3A5.5 5.5 0 1 0 13.5 9.7M13.7 2.5v3.9H9.8", "#fff", "1.8")
      : svgLine("toast-check", "M3.5 8.4l3 3 6-6.6", "#30D158", "2.2"));
    t.appendChild(ico);

    var body = h("div", "toast-body");
    if (kind === "ready") {
      body.appendChild(h("b", null, "Offline bereit"));
      body.appendChild(h("span", null, "Zyklus liegt jetzt auf diesem Gerät und startet ohne Internet."));
    } else if (kind === "update") {
      body.appendChild(h("b", null, "Neue Version geladen"));
      body.appendChild(h("span", null, "Schon offline gespeichert – ein Tipp, und sie ist aktiv."));
    } else {
      body.appendChild(h("b", null, text || ""));
    }
    t.appendChild(body);

    if (kind === "update") {
      var go = h("button", "toast-go", "Aktualisieren");
      go.type = "button";
      go.addEventListener("click", function () { location.reload(); });
      t.appendChild(go);
      var x = h("button", "toast-x", "✕");
      x.type = "button";
      x.setAttribute("aria-label", "Später");
      x.addEventListener("click", hideToast);
      t.appendChild(x);
    } else {
      toastTimer = setTimeout(hideToast, kind === "ready" ? 6000 : 3500);
    }

    document.body.appendChild(t);
    toastNode = t;
  }

  /* ───────────────────────── Start ───────────────────────── */

  function init() {
    state = loadState();
    save();                                      // Migration/Seed sofort festschreiben
    initReveal();
    computeToday();
    view = { week: todayRef.week, dayIndex: todayRef.dayIndex };

    el.btnBasics.addEventListener("click", openBasics);
    el.badge.addEventListener("click", openCycle);

    el.cycMinus.addEventListener("click", function () { setCycleLen(weekCount() - 1); });
    el.cycPlus.addEventListener("click", function () { setCycleLen(weekCount() + 1); });
    armButton(el.cycReset, "Plan auf Startplan zurücksetzen", "Wirklich zurücksetzen?", resetPlan);

    el.addSearch.addEventListener("input", function () { buildAddList(el.addSearch.value); });
    el.addNewToggle.addEventListener("click", function () {
      el.addForm.hidden = !el.addForm.hidden;
      if (!el.addForm.hidden) el.addName.focus();
    });
    el.addSave.addEventListener("click", function () {
      if (!el.addName.value.trim()) { el.addName.focus(); return; }
      addItemToCtx({ name: el.addName.value, qty: el.addQty.value, note: el.addNote.value });
      el.addName.value = ""; el.addQty.value = ""; el.addNote.value = "";
      el.addForm.hidden = true;
      buildAddList(el.addSearch.value);
    });
    el.dbSearch.addEventListener("input", function () { buildDbList(el.dbSearch.value); });
    if (el.archFilter) {
      [["kategorie", el.fKategorie], ["disziplin", el.fDisziplin], ["level", el.fLevel], ["geraet", el.fGeraet]]
        .forEach(function (f) {
          f[1].addEventListener("change", function () {
            archivFilter[f[0]] = f[1].value;
            buildDbList(el.dbSearch.value);
          });
        });
      el.archReset.addEventListener("click", function () {
        archivFilter = { kategorie: "", disziplin: "", level: "", geraet: "" };
        el.fKategorie.value = ""; el.fDisziplin.value = ""; el.fLevel.value = ""; el.fGeraet.value = "";
        el.dbSearch.value = "";
        buildDbList("");
      });
    }

    el.calPrev.addEventListener("click", function () { shiftCalMonth(-1); });
    el.calNext.addEventListener("click", function () { shiftCalMonth(1); });

    /* Beim Umstieg vom alten Worker kann einmalig ein älteres index.html zu
       diesem app.js geliefert werden – dann fehlt der App-Block, und ohne diese
       Prüfung bräche init() vor dem ersten render() ab. */
    if (el.appStatus && el.appExport && el.appImport && el.appFile) {
      el.appExport.addEventListener("click", function () { resetImportUi(); exportBackup(); });
      el.appImport.addEventListener("click", function () {
        resetImportUi();
        el.appFile.value = "";         // dieselbe Datei auch ein zweites Mal wählen können
        el.appFile.click();
      });
      el.appFile.addEventListener("change", onImportFile);
    }

    attachSwipe();
    watchHdr();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    render();
    onScroll();
    katalogLaden();

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      rollover();
    });
    scheduleRollover();

    if ("wakeLock" in navigator) {
      var req = function () {
        if (document.visibilityState !== "visible") return;
        if (!dayTotal(getDay(view.week, view.dayIndex))) return;
        try { navigator.wakeLock.request("screen").catch(function () {}); } catch (e) {}
      };
      req();
      document.addEventListener("visibilitychange", req);
    }

    initOffline();
    initInstall();

    /* Da Plan und Historie nur in localStorage leben: den Browser bitten,
       den Speicher nicht bei Platzdruck zu räumen (best effort). */
    if (navigator.storage && navigator.storage.persist) {
      try { navigator.storage.persist().catch(function () {}); } catch (e) {}
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
