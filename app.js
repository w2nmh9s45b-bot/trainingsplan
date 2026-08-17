/* Zyklus – Trainingsplan.
   Editierbarer Trainingsplan im N-Wochen-Zyklus. Der Plan selbst, die
   Übungsdatenbank und alle Haken liegen in localStorage; data.js liefert nur
   den Startplan beim allerersten Öffnen. Keine Netzwerkzugriffe zur Laufzeit. */
(function () {
  "use strict";

  var SEED = window.PLAN;
  var STORE_KEY = "zyklus.v2";
  var LEGACY_KEY = "zyklus.v1";

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
    hdrTimer: document.getElementById("hdr-timer"),
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
    calDetail: document.getElementById("cal-detail")
  };

  var state = null;      // { v:2, shift, days:{key:{start,end,checks:{uid:ts}}}, plan:{weeks:[…]}, db:[…] }
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
        return;
      }
    }
    state.db.push({ id: "d" + hash4(k) + "-" + state.db.length + "-" + Date.now().toString(36),
                    name: item.name, qty: item.qty || "", note: item.note || "" });
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
      if (!Array.isArray(d.pauses)) d.pauses = [];
      d.pauses = d.pauses.filter(function (p) {
        return Array.isArray(p) && typeof p[0] === "number" && p[0] > 0 &&
               typeof p[1] === "number";
      });
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
          s.days[k] = { start: 0, end: 0, checks: checks };
        });
      }
      return s;
    } catch (e) { return null; }
  }

  function pruneDays(s) {
    var limit = dayKeyFromDate(new Date(Date.now() - KEEP_DAYS * DAY_MS));
    Object.keys(s.days).forEach(function (k) {
      var d = s.days[k];
      var empty = !d.start && (!d.checks || !Object.keys(d.checks).length);
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

  /* ───────────────────────── Session (Haken + Zeiten) ───────────────────────── */

  function sess(key) { return state.days[key] || null; }

  function sessWrite(key) {
    if (!state.days[key]) state.days[key] = { start: 0, end: 0, checks: {}, pauses: [] };
    if (!state.days[key].checks) state.days[key].checks = {};
    if (!Array.isArray(state.days[key].pauses)) state.days[key].pauses = [];
    return state.days[key];
  }

  /* ── Pausen: [[Beginn, Ende], …]; Ende 0 = Pause läuft noch ── */

  function pausesOf(d) {
    if (!Array.isArray(d.pauses)) d.pauses = [];
    return d.pauses;
  }

  function isPaused(d) {
    if (!d || !d.start || d.end) return false;
    var p = d.pauses;
    return !!(p && p.length && p[p.length - 1][1] === 0);
  }

  /* Pausenzeit, die in das Fenster [a, b] fällt. Eine noch offene Pause
     zählt bis b – so steht die Uhr während der Pause still. */
  function pausedBetween(d, a, b) {
    var p = d && d.pauses;
    if (!p || !p.length || b <= a) return 0;
    var sum = 0;
    for (var i = 0; i < p.length; i++) {
      var lo = Math.max(a, p[i][0]);
      var hi = Math.min(b, p[i][1] || b);
      if (hi > lo) sum += hi - lo;
    }
    return sum;
  }

  /* Uhr zurück in den Lauf-Zustand: offene Pause schließen und ein gesetztes
     Ende aufheben. Die Zeit zwischen „Beenden" und dem Weitermachen zählt als
     Pause, damit die Workout-Dauer ehrlich bleibt. */
  function reopenClock(d, now) {
    var p = pausesOf(d);
    if (p.length && p[p.length - 1][1] === 0) p[p.length - 1][1] = now;
    if (d.end) {
      if (now > d.end) p.push([d.end, now]);
      d.end = 0;
    }
  }

  function pauseWorkout(key) {
    var d = sessWrite(key);
    if (!d.start || d.end || isPaused(d)) return;
    pausesOf(d).push([Date.now(), 0]);
    save();
  }

  function resumeWorkout(key) {
    var d = sessWrite(key);
    if (!d.start) return;
    reopenClock(d, Date.now());
    save();
  }

  /* Workout vorzeitig beenden: Zeit steht, der Tag bleibt wie er ist.
     Läuft gerade eine Pause, endet das Workout an deren Beginn. */
  function finishWorkout(key) {
    var d = sessWrite(key);
    if (!d.start || d.end) return;
    if (isPaused(d)) {
      d.end = d.pauses[d.pauses.length - 1][0];
      d.pauses.pop();
    } else {
      d.end = Date.now();
    }
    save();
  }

  function sessClean(key) {
    var d = state.days[key];
    if (d && !d.start && !Object.keys(d.checks).length) delete state.days[key];
  }

  function isChecked(key, uid) {
    var d = sess(key);
    return !!(d && d.checks && (uid in d.checks));
  }

  function setCheck(key, uid, on) {
    var d = sessWrite(key);
    if (on) {
      var ts = Date.now();
      /* Erster Haken startet die Workout-Uhr automatisch. Nur für den
         laufenden Trainingstag – nachgetragene alte Tage bleiben ohne Zeit. */
      if (!d.start && key === todayRef.key) d.start = ts;
      d.checks[uid] = key === todayRef.key ? ts : 0;
      /* Nur heute: weiter trainiert → Uhr läuft wieder (Pause schließen,
         „Beenden" aufheben). Beim Nachtragen an vergangenen Tagen bleibt
         deren gespeicherte Stoppzeit unangetastet. */
      if (key === todayRef.key) reopenClock(d, ts);
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

  /* Haken des Tages in Abhak-Reihenfolge (nur solche mit echter Zeit). */
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

  /* Zeit pro Übung = Abstand zum vorherigen Haken (bzw. zum Start),
     abzüglich der Pausen, die dazwischen lagen. */
  function splitMap(key) {
    var d = sess(key);
    var map = Object.create(null);
    if (!d) return map;
    var arr = checksSorted(key);
    var prev = d.start > 0 ? d.start : 0;
    arr.forEach(function (c) {
      if (prev > 0 && c.ts >= prev) {
        map[c.uid] = Math.max(0, c.ts - prev - pausedBetween(d, prev, c.ts));
      }
      prev = c.ts;
    });
    return map;
  }

  function workoutDuration(key, allDone) {
    var d = sess(key);
    if (!d || !d.start) return null;
    var arr, endpoint;
    if (d.end) {
      endpoint = d.end;
    } else if (allDone) {
      arr = checksSorted(key);
      endpoint = arr.length ? arr[arr.length - 1].ts : d.start;
    } else if (key !== todayRef.key) {
      /* Vergangener Tag ohne sauberes Ende: bis zum letzten Haken zählen. */
      arr = checksSorted(key);
      if (!arr.length) return null;
      endpoint = arr[arr.length - 1].ts;
    } else {
      endpoint = Date.now();
    }
    return Math.max(0, endpoint - d.start - pausedBetween(d, d.start, endpoint));
  }

  function fmtDur(ms) {
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    if (h) return h + ":" + pad2(m) + ":" + pad2(r);
    return m + ":" + pad2(r);
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
    updateSplits();
    updateTimer();
    updateJump();
    revealSafety();
  }

  /* ── Hero: Fortschrittsring, Orte, Workout-Uhr ── */

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

    info.appendChild(buildTimerLine(key, total, done));
    card.appendChild(info);
    return card;
  }

  function buildTimerLine(key, total, done) {
    var line = h("div", "hero-timer");
    line.id = "timer-line";

    var d = sess(key);
    var started = !!(d && d.start);
    var allDone = total > 0 && done === total;

    if (!started && isToday()) {
      var b = h("button", "tmr-start");
      b.type = "button";
      b.appendChild(h("span", "tri"));
      b.appendChild(document.createTextNode("Workout starten"));
      b.addEventListener("click", function () {
        sessWrite(key).start = Date.now();
        save();
        rebuildTimerLine();
        updateTimer();
      });
      line.appendChild(b);
    } else if (started) {
      var dur = workoutDuration(key, allDone);
      /* Vergangene Tage ohne verwertbare Dauer: keine Uhr anzeigen. */
      if (dur == null && !isToday()) return line;
      var paused = isPaused(d);
      var ended = !!d.end;
      var running = !allDone && !ended && !paused && isToday();
      var chip = h("div", "tmr-chip" +
        (running ? " run" : (paused && isToday() && !allDone ? " paused" : " fin")));
      chip.appendChild(h("i", "tmr-dot"));
      var val = h("b", "tmr-val", dur == null ? "–" : fmtDur(dur));
      val.id = "tmr-val";
      chip.appendChild(val);
      chip.appendChild(h("span", "tmr-lbl",
        allDone ? "Workout-Dauer"
                : (ended ? "beendet"
                : (paused ? "Pause" : (running ? "läuft" : "Workout")))));
      line.appendChild(chip);

      function tmrBtn(cls, label, fn) {
        var b = h("button", cls, label);
        b.type = "button";
        b.addEventListener("click", function () {
          fn(key);
          rebuildTimerLine();
          updateTimer();
        });
        line.appendChild(b);
      }

      if (isToday() && !allDone) {
        if (running) {
          tmrBtn("tmr-stop", "Pause", pauseWorkout);
          tmrBtn("tmr-finish", "Beenden", finishWorkout);
        } else if (paused) {
          tmrBtn("tmr-resume", "▶ Fortsetzen", resumeWorkout);
          tmrBtn("tmr-finish", "Beenden", finishWorkout);
        } else if (ended) {
          tmrBtn("tmr-resume", "▶ Fortsetzen", resumeWorkout);
        }
      }
    }
    return line;
  }

  function rebuildTimerLine() {
    var old = document.getElementById("timer-line");
    if (!old) return;
    var day = getDay(view.week, view.dayIndex);
    var key = viewKey();
    old.replaceWith(buildTimerLine(key, dayTotal(day), countDone(view.week, view.dayIndex)));
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
    side.appendChild(h("span", "split"));
    if (editing) {
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
    var dur = workoutDuration(viewKey(), true);
    card.appendChild(h("span", null,
      total + " Übungen" + (dur != null && dur > 0 ? " · " + fmtDur(dur) : "")));
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

    rebuildTimerLine();
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
    updateSplits();
    updateTimer();

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

  /* Zeit-pro-Übung-Chips an allen Zeilen nachführen. Ein Haken mittendrin
     verändert auch den Abstand der nachfolgenden Übung, deshalb immer alle. */
  function updateSplits() {
    var key = viewKey();
    var map = splitMap(key);
    var rows = el.main.querySelectorAll(".row");
    Array.prototype.forEach.call(rows, function (row) {
      var chip = row.querySelector(".split");
      if (!chip) return;
      var ms = map[row.dataset.uid];
      if (row.classList.contains("done") && ms != null && ms >= 1000) {
        chip.textContent = fmtDur(ms);
        chip.classList.add("on");
      } else {
        chip.textContent = "";
        chip.classList.remove("on");
      }
    });
  }

  /* ───────────────────────── Workout-Uhr ───────────────────────── */

  var tickTimer = null;

  /* Uhr „aktiv" = heute gestartet, nicht beendet, Tag nicht fertig.
     Aktiv + pausiert → Uhr sichtbar, aber sie steht. */
  function timerActive() {
    var d = sess(todayRef.key);
    if (!d || !d.start || d.end) return false;
    var day = getDay(todayRef.week, todayRef.dayIndex);
    var total = dayTotal(day);
    if (!total) return false;                   // Tag inzwischen leer editiert
    return countDone(todayRef.week, todayRef.dayIndex) !== total;
  }

  function updateTimer() {
    var d = sess(todayRef.key);
    var active = timerActive();
    var running = active && !isPaused(d);

    /* Kopfzeile: Mini-Uhr, sobald heute ein Workout läuft (steht bei Pause). */
    if (active && d) {
      el.hdrTimer.textContent = fmtDur(workoutDuration(todayRef.key, false) || 0);
      el.hdrTimer.classList.toggle("paused", !running);
      el.hdrTimer.hidden = false;
    } else {
      el.hdrTimer.hidden = true;
      el.hdrTimer.classList.remove("paused");
    }

    /* Hero-Uhr des angezeigten Tages. */
    var val = document.getElementById("tmr-val");
    if (val && isToday() && active) {
      var day = getDay(view.week, view.dayIndex);
      var total = dayTotal(day);
      var allDone = total > 0 && countDone(view.week, view.dayIndex) === total;
      if (!allDone) val.textContent = fmtDur(workoutDuration(todayRef.key, false) || 0);
    }

    if (running && !tickTimer) {
      tickTimer = setInterval(updateTimer, 1000);
    } else if (!running && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
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
    state.db.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, "de");
    }).forEach(function (entry) {
      if (q && entry.name.toLowerCase().indexOf(q) < 0) return;
      shown++;
      var row = h("div", "db-row");
      var mainBox = h("div", "db-main");
      mainBox.appendChild(h("b", null, entry.name));
      var sub = [entry.qty, entry.note].filter(Boolean).join(" · ");
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
          addItemToCtx({ name: entry.name, qty: entry.qty, note: entry.note });
          buildAddList(el.addSearch.value);
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
    upsertDb(item, false);
    save();
    render();                                    // Liste hinter dem Sheet aktualisieren
  }

  /* ── Sheet: Übungsdatenbank ── */

  function openDb() {
    el.dbSearch.value = "";
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

  function buildDbList(query) {
    el.dbList.textContent = "";
    var q = query.trim().toLowerCase();
    var usage = planUsage();
    var shown = 0;

    state.db.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, "de");
    }).forEach(function (entry) {
      if (q && entry.name.toLowerCase().indexOf(q) < 0) return;
      shown++;
      var row = h("div", "db-row");
      var mainBox = h("div", "db-main");
      mainBox.appendChild(h("b", null, entry.name));
      var bits = [entry.qty, entry.note].filter(Boolean).join(" · ");
      if (bits) mainBox.appendChild(h("span", null, bits));
      row.appendChild(mainBox);

      var n = usage[dbKey(entry.name)] || 0;
      row.appendChild(h("span", "db-tag" + (n ? " used" : ""),
        n ? n + "× im Plan" : "nicht im Plan"));

      var del = h("button", "db-del", "✕");
      del.type = "button";
      del.setAttribute("aria-label", entry.name + " endgültig löschen");
      armButton(del, "✕", "löschen?", function () {
        state.db = state.db.filter(function (e2) { return e2 !== entry; });
        save();
        buildDbList(el.dbSearch.value);
      });
      row.appendChild(del);
      el.dbList.appendChild(row);
    });

    el.dbCount.textContent = state.db.length + " Übung" + (state.db.length === 1 ? "" : "en") +
      " · alles, was je im Plan stand";
    if (!shown) el.dbList.appendChild(h("p", "db-empty", "Keine Übung gefunden."));
  }

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

  /* Tages-Zusammenfassung: Haken, Plansoll, Status, Dauer. null = kein Eintrag. */
  function daySummary(key) {
    var d = state.days[key];
    if (!d || (!d.start && !Object.keys(d.checks).length)) return null;
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
      complete: complete,
      dur: workoutDuration(key, complete)
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
    var trainings = 0, totalMs = 0;

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
          /* Heute zählt zur Monatssumme erst, wenn das Workout beendet oder
             der Tag komplett ist – sonst wüchse die Summe im Sekundentakt. */
          if (s.dur != null && s.dur > 0 &&
              (key !== todayRef.key || s.complete || s.d.end)) totalMs += s.dur;
          aria += ", " + s.checks + " Übungen" +
            (s.complete ? ", komplett" : "") +
            (s.dur != null && s.dur > 0 ? ", " + fmtDur(s.dur) : "");
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
      if (totalMs > 0) {
        var st2 = h("span", "cal-stat");
        st2.appendChild(h("b", null, fmtDur(totalMs)));
        st2.appendChild(document.createTextNode(" gesamt"));
        el.calStats.appendChild(st2);
      }
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

    var tag = h("span", "cal-status" +
      (s.complete ? " ok" : (s.d.end ? " fin" : "")),
      s.complete ? "Komplett" : (s.d.end ? "Beendet" : (calSel === todayRef.key ? "Läuft" : "Teilweise")));
    head.appendChild(tag);
    box.appendChild(head);

    var meta = h("p", "cal-d-meta",
      s.checks + " Übung" + (s.checks === 1 ? "" : "en") +
      (s.total ? " von " + s.total : "") +
      (s.dur != null && s.dur > 0 ? " · " + fmtDur(s.dur) : ""));
    box.appendChild(meta);

    var idx = uidIndex();
    var splits = splitMap(calSel);
    var list = h("div", "cal-d-list");

    /* Abgehakte Übungen in Abhak-Reihenfolge, danach die ohne Zeitstempel. */
    var timed = checksSorted(calSel);
    var seen = Object.create(null);
    timed.forEach(function (c) { seen[c.uid] = true; });
    var untimed = Object.keys(s.d.checks).filter(function (uid) { return !seen[uid]; });

    function addRow(uid, ms) {
      var info = idx[uid];
      var loc = info ? info.loc : uidLoc(uid);
      var row = h("div", "cal-d-row");
      var dot = h("i", "cdot");
      dot.style.background = loc ? locColor(loc) : "var(--fg3)";
      row.appendChild(dot);
      row.appendChild(h("span", "nm", info ? info.name : "Frühere Übung"));
      if (ms != null && ms >= 1000) row.appendChild(h("span", "tm", fmtDur(ms)));
      list.appendChild(row);
    }

    timed.forEach(function (c) { addRow(c.uid, splits[c.uid]); });
    untimed.forEach(function (uid) { addRow(uid, null); });

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

  var sheetOpener = null;   // Fokus nach dem Schließen dorthin zurückgeben

  function closeSheet(node) {
    node.hidden = true;
    unlockScroll();
    el.main.removeAttribute("aria-hidden");
    el.hdr.removeAttribute("aria-hidden");
    if ("inert" in el.main) { el.main.inert = false; el.hdr.inert = false; }
    if (sheetOpener && sheetOpener.focus) {
      try { sheetOpener.focus(); } catch (e) {}
    }
    sheetOpener = null;
  }

  function openSheet(node) {
    lockScroll();
    node.hidden = false;
    el.main.setAttribute("aria-hidden", "true");
    el.hdr.setAttribute("aria-hidden", "true");
    /* aria-hidden allein lässt den Hintergrund fokussierbar – inert nimmt
       ihn wirklich aus der Tab-Reihenfolge (iOS-Safari ≥ 15.5). */
    if ("inert" in el.main) { el.main.inert = true; el.hdr.inert = true; }
    hideJump();
    sheetOpener = document.activeElement;
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
      var open = anyOpenSheet();
      if (open) closeSheet(open);
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

    el.calPrev.addEventListener("click", function () { shiftCalMonth(-1); });
    el.calNext.addEventListener("click", function () { shiftCalMonth(1); });

    attachSwipe();
    watchHdr();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    render();
    onScroll();

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      rollover();
      updateTimer();
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

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () { /* offline ist optional */ });
      });
    }

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
