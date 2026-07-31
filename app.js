/* Zyklus – Trainingsplan.
   Zeigt den 2-Wochen-Zyklus als Tagesliste. Abhaken wird pro Kalendertag in
   localStorage gespeichert. Keine Netzwerkzugriffe zur Laufzeit. */
(function () {
  "use strict";

  var PLAN = window.PLAN;
  var STORE_KEY = "zyklus.v1";

  /* Montag, mit dem Woche 1 des Zyklus beginnt (Datum der Quell-Excel).
     Absolutes Ankerdatum statt KW-Parität: Jahre mit 53 ISO-Wochen würden
     die Parität sonst am Jahreswechsel kippen. */
  var ANCHOR = Date.UTC(2026, 5, 1);          // 2026-06-01, ein Montag
  var DAY_MS = 86400000;
  var DAY_ROLLOVER_H = 4;                     // Training nach Mitternacht zählt zum Vortag
  var KEEP_DAYS = 56;                         // vier Zyklen Historie

  var LOC_LABEL = { Gym: "Gym", Homegym: "Homegym", Home: "Home" };
  var LOC_VAR = { Gym: "--gym", Homegym: "--homegym", Home: "--home" };
  var DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni",
                "Juli", "August", "September", "Oktober", "November", "Dezember"];

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
    cycW1: document.getElementById("cyc-w1"),
    cycW2: document.getElementById("cyc-w2"),
    cycHint: document.getElementById("cyc-hint")
  };

  var state = null;      // { v, offset, days:{ "YYYY-MM-DD":[id,…] } }
  var view = null;       // { week:1|2, dayIndex:0-6 }
  var todayRef = null;   // { key, week, dayIndex, date }

  /* ───────────────────────── Speicher ───────────────────────── */

  function loadState() {
    var s = { v: 1, offset: 0, days: {} };
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === "object") {
          s.offset = p.offset === 1 ? 1 : 0;
          if (p.days && typeof p.days === "object") s.days = p.days;
        }
      }
    } catch (e) { /* defekter oder gesperrter Speicher: mit leerem Stand starten */ }
    prune(s);
    return s;
  }

  function prune(s) {
    var limit = dayKeyFromDate(new Date(Date.now() - KEEP_DAYS * DAY_MS));
    Object.keys(s.days).forEach(function (k) {
      if (k < limit || !Array.isArray(s.days[k]) || !s.days[k].length) delete s.days[k];
    });
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { /* z.B. privater Modus – Abhaken hält dann nur bis zum Neuladen */ }
  }

  /* ───────────────────────── Datum & Zyklus ───────────────────────── */

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

  function weekOf(d) {
    var weeks = Math.round((mondayUTC(d) - ANCHOR) / (7 * DAY_MS));
    var idx = ((weeks + state.offset) % 2 + 2) % 2;     // 0 → Woche 1, 1 → Woche 2
    return idx === 0 ? 1 : 2;
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

  /* Datum eines Zyklus-Tages, gerechnet vom heutigen Tag aus.
     Der Abstand wird auf das Fenster -7…+6 um heute normalisiert, damit jeder
     Zyklustag auf seine nächstgelegene Kalenderentsprechung fällt. Eine starre
     ±7-Regel würde an der Naht Sonntag W2 → Montag W1 dreizehn Tage danebenliegen. */
  function dateOf(week, dayIndex) {
    var absView = (week - 1) * 7 + dayIndex;
    var absToday = (todayRef.week - 1) * 7 + todayRef.dayIndex;
    var delta = ((((absView - absToday + 7) % 14) + 14) % 14) - 7;
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

  function getDay(week, dayIndex) { return PLAN.weeks[week - 1].days[dayIndex]; }

  function dayTotal(day) {
    return day.locations.reduce(function (n, L) { return n + L.items.length; }, 0);
  }

  function hash4(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36).slice(-4);
  }

  function itemId(week, dayIndex, loc, idx, name) {
    return week + "|" + dayIndex + "|" + loc + "|" + idx + "|" + hash4(name);
  }

  function doneSet(key) {
    var arr = state.days[key];
    var set = Object.create(null);
    if (Array.isArray(arr)) arr.forEach(function (id) { set[id] = true; });
    return set;
  }

  function setDone(key, id, on) {
    var arr = state.days[key] ? state.days[key].slice() : [];
    var i = arr.indexOf(id);
    if (on && i < 0) arr.push(id);
    if (!on && i >= 0) arr.splice(i, 1);
    if (arr.length) state.days[key] = arr; else delete state.days[key];
    save();
  }

  function countDone(week, dayIndex) {
    var day = getDay(week, dayIndex);
    var set = doneSet(keyFor(week, dayIndex));
    var n = 0;
    day.locations.forEach(function (L) {
      L.items.forEach(function (it, i) {
        if (set[itemId(week, dayIndex, L.location, i, it.name)]) n++;
      });
    });
    return n;
  }

  /* ───────────────────────── DOM-Helfer ───────────────────────── */

  function h(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function locColor(loc) { return "var(" + (LOC_VAR[loc] || "--fg2") + ")"; }

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

  /* ───────────────────────── Kopf ───────────────────────── */

  function renderHeader() {
    var d = viewDate();
    el.date.textContent = "";
    if (!isToday()) el.date.appendChild(h("span", "away"));
    el.date.appendChild(document.createTextNode(
      DAY_SHORT[view.dayIndex].toUpperCase() + " · " + d.getDate() + ". " + MONTHS[d.getMonth()]
    ));

    el.badgeText.textContent = "W" + view.week + " · " + (view.week === 1 ? "Kraft" : "Power");

    var total = dayTotal(getDay(view.week, view.dayIndex));
    el.count.textContent = total ? countDone(view.week, view.dayIndex) + "/" + total : "–";

    renderStrip();
    renderDayProgress();
  }

  function renderStrip() {
    el.strip.textContent = "";
    [1, 2].forEach(function (w) {
      var page = h("div", "strip-page");
      for (var i = 0; i < 7; i++) page.appendChild(buildChip(w, i));
      el.strip.appendChild(page);
    });
    el.pager.children[0].classList.toggle("on", view.week === 1);
    el.pager.children[1].classList.toggle("on", view.week === 2);

    var page = el.strip.children[view.week - 1];
    if (page) el.stripWrap.scrollLeft = page.offsetLeft - el.strip.offsetLeft;
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
    var set = doneSet(viewKey());
    day.locations.forEach(function (L) {
      var done = 0;
      L.items.forEach(function (it, i) {
        if (set[itemId(view.week, view.dayIndex, L.location, i, it.name)]) done++;
      });
      var seg = h("span", "seg");
      seg.style.flexGrow = String(L.items.length);
      var fill = h("i");
      fill.style.background = locColor(L.location);
      fill.style.transform = "scaleX(" + (done / L.items.length) + ")";
      seg.appendChild(fill);
      el.dayprog.appendChild(seg);
    });
  }

  /* ───────────────────────── Tagesansicht ───────────────────────── */

  function render() {
    renderHeader();
    el.main.textContent = "";

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

    if (!total) { renderRest(day); updateJump(); return; }

    /* Bei einem einzigen Ort sagt der Sektionskopf direkt darunter dasselbe –
       die Bilanzzeile erscheint deshalb nur, wenn es mehrere Orte gibt. */
    if (day.locations.length > 1) el.main.appendChild(buildBalance(day));

    var key = viewKey();
    var set = doneSet(key);
    day.locations.forEach(function (L) { el.main.appendChild(buildSection(L, set, key)); });
    el.main.appendChild(buildFooter(total, key));
    updateJump();
  }

  /* Nur für Tage mit mehreren Trainingsorten: jeder Ort springt zu seiner Sektion. */
  function buildBalance(day) {
    var box = h("div", "balance");
    day.locations.forEach(function (L, i) {
      if (i) box.appendChild(h("span", "bal-sep", "·"));
      var tag = h("button", "bal");
      tag.type = "button";
      tag.style.color = locColor(L.location);
      tag.appendChild(document.createTextNode(LOC_LABEL[L.location]));
      tag.appendChild(h("span", "n", String(L.items.length)));
      tag.addEventListener("click", function () {
        var sec = document.getElementById("sec-" + L.location);
        if (sec) sec.scrollIntoView({ block: "start", behavior: "smooth" });
      });
      box.appendChild(tag);
    });
    return box;
  }

  function buildSection(L, set, key) {
    var sec = h("section", "section");
    sec.id = "sec-" + L.location;

    var head = h("div", "sec-head");
    var bar = h("span", "sec-bar");
    bar.style.background = locColor(L.location);
    head.appendChild(bar);
    var nm = h("span", "sec-name", LOC_LABEL[L.location]);
    nm.style.color = locColor(L.location);
    head.appendChild(nm);

    var done = 0;
    L.items.forEach(function (it, i) {
      if (set[itemId(view.week, view.dayIndex, L.location, i, it.name)]) done++;
    });

    var right = h("span", "sec-right");
    right.appendChild(svgRing(done / L.items.length, locColor(L.location)));
    right.appendChild(h("span", "sec-count", done + "/" + L.items.length));
    head.appendChild(right);
    sec.appendChild(head);

    var hasQty = L.items.some(function (it) { return !!it.qty; });
    var hasNote = L.items.some(function (it) { return !!it.note; });
    if (hasQty || hasNote) {
      var ch = h("div", "colhead");
      ch.appendChild(h("span", null, hasQty ? "Menge / Dauer" : ""));
      ch.appendChild(h("span", null, hasNote ? "Anweisung" : ""));
      sec.appendChild(ch);
    }

    var ul = h("ul", "list");
    L.items.forEach(function (it, i) { ul.appendChild(buildRow(it, i, L, set, key)); });
    sec.appendChild(ul);
    return sec;
  }

  function buildRow(it, i, L, set, key) {
    var id = itemId(view.week, view.dayIndex, L.location, i, it.name);
    var li = document.createElement("li");
    var row = h("div", "row");
    row.dataset.id = id;
    row.dataset.loc = L.location;
    row.setAttribute("role", "checkbox");
    row.tabIndex = 0;

    row.appendChild(h("span", "sweep"));

    var dot = h("span", "dot");
    dot.appendChild(h("span", "fill"));
    dot.appendChild(h("span", "num", String(i + 1)));
    dot.appendChild(svgCheck("check"));
    dot.appendChild(h("span", "ping"));
    row.appendChild(dot);

    row.appendChild(h("span", "name", it.name));

    if (it.qty) row.appendChild(h("span", "qty", it.qty));
    if (it.note) row.appendChild(h("span", "note", it.note));

    if (set[id]) row.classList.add("done");
    row.setAttribute("aria-checked", set[id] ? "true" : "false");
    row.setAttribute("aria-label", it.name +
      (it.qty ? ", " + it.qty : "") + (it.note ? ", " + it.note : ""));

    attachTap(row, function () { toggle(row, key); });
    li.appendChild(row);
    return li;
  }

  function buildFooter(total, key) {
    var f = h("div", "dayfoot");
    var done = countDone(view.week, view.dayIndex);
    var sum = h("p", "sum", summaryText(total, done));
    sum.id = "day-sum";
    f.appendChild(sum);

    var acts = h("div", "acts");
    var b1 = h("button", null, "Basics");
    b1.type = "button";
    b1.addEventListener("click", openBasics);
    acts.appendChild(b1);

    var b2 = h("button", null, "Tag zurücksetzen");
    b2.type = "button";
    var armed = false, timer = null;
    b2.addEventListener("click", function () {
      if (!armed) {
        armed = true;
        b2.classList.add("armed");
        b2.textContent = "Wirklich zurücksetzen?";
        timer = setTimeout(function () {
          armed = false;
          b2.classList.remove("armed");
          b2.textContent = "Tag zurücksetzen";
        }, 3000);
        return;
      }
      clearTimeout(timer);
      delete state.days[key];
      save();
      render();
    });
    acts.appendChild(b2);
    f.appendChild(acts);

    if (done === total && total > 0) {
      f.appendChild(h("div", "day-complete", "Tag komplett · " + total + " Übungen"));
    }
    return f;
  }

  function summaryText(total, done) {
    return total + " Übung" + (total === 1 ? "" : "en") + " · " + done + " erledigt";
  }

  function renderRest(day) {
    var box = h("div", "rest");
    box.appendChild(h("h3", null, "RUHETAG"));
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
    for (var step = 1; step <= 14; step++) {
      var abs = (view.dayIndex + (view.week - 1) * 7 + step) % 14;
      var w = Math.floor(abs / 7) + 1;
      var i = abs % 7;
      var day = getDay(w, i);
      var total = dayTotal(day);
      if (total) {
        return {
          week: w, dayIndex: i,
          label: day.day + " · " +
            day.locations.map(function (L) { return LOC_LABEL[L.location]; }).join(" + ") +
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
    });

    /* VoiceOver, Sprach- und Schaltersteuerung lösen einen echten click aus,
       aber keine Zeigerereignisse. Der Zeitstempel verhindert, dass ein
       normaler Fingertipp dadurch doppelt zählt. */
    node.addEventListener("click", function () {
      if (Date.now() - lastFire > 500) fire();
    });
    node.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); fire(); }
    });
  }

  function toggle(row, key) {
    var on = !row.classList.contains("done");

    setDone(key, row.dataset.id, on);
    row.classList.toggle("done", on);
    row.setAttribute("aria-checked", on ? "true" : "false");

    if (on) {
      row.classList.remove("sweeping");
      void row.offsetWidth;                       // Animation neu anstoßen
      row.classList.add("sweeping");
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
    }

    refreshProgress(row.dataset.loc);
  }

  /* Fortschritt nachziehen, ohne die Liste neu zu bauen – abgehakte Zeilen
     müssen exakt an ihrer Position bleiben. */
  function refreshProgress(loc) {
    var day = getDay(view.week, view.dayIndex);
    var set = doneSet(viewKey());
    var total = dayTotal(day);
    var doneAll = 0;

    day.locations.forEach(function (L) {
      var done = 0;
      L.items.forEach(function (it, i) {
        if (set[itemId(view.week, view.dayIndex, L.location, i, it.name)]) done++;
      });
      doneAll += done;

      var sec = document.getElementById("sec-" + L.location);
      if (!sec) return;
      var head = sec.querySelector(".sec-head");
      head.querySelector(".sec-count").textContent = done + "/" + L.items.length;
      var pct = done / L.items.length;
      var fg = head.querySelector(".ring .fg");
      fg.setAttribute("stroke-dashoffset", RING_C * (1 - pct));
      fg.setAttribute("stroke", pct >= 1 ? "var(--done)" : locColor(L.location));
      if (pct >= 1 && L.location === loc) {
        head.classList.remove("pulse");
        void head.offsetWidth;
        head.classList.add("pulse");
      }
    });

    el.count.textContent = doneAll + "/" + total;
    var sum = document.getElementById("day-sum");
    if (sum) sum.textContent = summaryText(total, doneAll);

    renderDayProgress();

    var foot = el.main.querySelector(".dayfoot");
    var card = foot ? foot.querySelector(".day-complete") : null;
    if (doneAll === total && total > 0) {
      if (!card && foot) foot.appendChild(h("div", "day-complete", "Tag komplett · " + total + " Übungen"));
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

  /* ───────────────────────── „Nächste offene" ───────────────────────── */

  function updateJump() {
    var rows = el.main.querySelectorAll(".row:not(.done)");
    if (!rows.length) { hideJump(); return; }

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
    el.jump.onclick = function () { target.scrollIntoView({ block: "center", behavior: "smooth" }); };
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
    var abs = ((view.dayIndex + (view.week - 1) * 7 + delta) % 14 + 14) % 14;
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

  function closeSheet(node) {
    node.hidden = true;
    unlockScroll();
    el.main.removeAttribute("aria-hidden");
    el.hdr.removeAttribute("aria-hidden");
  }

  function openSheet(node) {
    lockScroll();
    node.hidden = false;
    el.main.setAttribute("aria-hidden", "true");
    el.hdr.setAttribute("aria-hidden", "true");
    Array.prototype.forEach.call(node.querySelectorAll("[data-close]"), function (n) {
      n.onclick = function () { closeSheet(node); };
    });
  }

  function openBasics() {
    if (!el.basicsBody.childElementCount) buildBasics();
    openSheet(el.sheetBasics);
  }

  function buildBasics() {
    var b = PLAN.basics;
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

  function openCycle() {
    var cur = weekOf(refDate());
    el.cycW1.classList.toggle("on", cur === 1);
    el.cycW2.classList.toggle("on", cur === 2);
    el.cycHint.textContent =
      "Der Zyklus läuft ab Montag, 01.06.2026 (Woche 1) durch. Passt die Zuordnung nicht " +
      "zu deinem echten Trainingsstand, schalte hier um – die Einstellung bleibt gespeichert.";
    openSheet(el.sheetCycle);
  }

  function setCycle(target) {
    if (weekOf(refDate()) !== target) {
      state.offset = state.offset === 1 ? 0 : 1;
      save();
    }
    computeToday();
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
    if (prev !== todayRef.key) goTo(todayRef.week, todayRef.dayIndex);
    else render();
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
    computeToday();
    view = { week: todayRef.week, dayIndex: todayRef.dayIndex };

    el.btnBasics.addEventListener("click", openBasics);
    el.badge.addEventListener("click", openCycle);
    el.cycW1.addEventListener("click", function () { setCycle(1); });
    el.cycW2.addEventListener("click", function () { setCycle(2); });

    attachSwipe();
    watchHdr();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    render();
    onScroll();

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

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function () { /* offline ist optional */ });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
