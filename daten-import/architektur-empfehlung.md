# Architektur-Empfehlung

> **Korrigiert am 13.09.2026.** Die erste Fassung ging von React + Vite aus — so war der
> Tech-Stack im Auftrag angegeben. Ein Blick in das Repo unter
> `Brain/Apps/Trainingsplan` zeigt etwas anderes: Die App heißt **Zyklus** und ist
> **reines Vanilla JavaScript ohne Build-Schritt**. Dieses Dokument ist auf den tatsächlichen
> Stand umgeschrieben. Die Kernempfehlung ändert sich dadurch nicht — sie wird sogar deutlicher.

---

## 1. Was tatsächlich im Repo steht

| | |
|---|---|
| Dateien | `index.html` (170 Zeilen) · `app.js` (2.760 Zeilen) · `styles.css` (946) · `data.js` · `sw.js` (156) · `manifest.webmanifest` · `icons/` |
| Einbindung | zwei klassische `<script src>`-Tags, **keine Module**, kein Bundler, keine `package.json` |
| Codestil | 430 × `var`, **0 Pfeilfunktionen, 0 `const`, 0 `let`, 0 `class`** — durchgehend ES5 in einer IIFE |
| Zustand | alles in `localStorage` unter `zyklus.v2`: `{ v, shift, days, plan:{weeks}, db:[…] }` |
| Laufzeit | „Keine Netzwerkzugriffe zur Laufzeit" (Kommentar in `app.js`, Zeile 4) |
| Service Worker | offline zuerst, precached die feste `ASSETS`-Liste; `VERSION` setzt `Werkzeuge/stempeln.sh` über den pre-commit-Hook |
| Oberfläche | Sheets: `<div class="sheet" role="dialog" aria-modal="true" hidden>`, geöffnet über `openSheet(node)` |

**Der wichtigste Befund: das Archiv existiert bereits.** `state.db` ist eine Übungsdatenbank aus
Einträgen `{ id, name, qty, note }`, mit eigenem Sheet `sheet-db`, Suche, alphabetischer Sortierung,
`+`-Knopf zum Übernehmen in den Plan und der Markierung „im Plan ✓" über `db-tag used`.
`addItemToCtx()` schiebt eine Übung in `L.items` und ruft `upsertDb()`.

Das Archiv aus dem Auftrag ist also **kein Neubau, sondern eine Erweiterung**. Das spart einen
großen Teil der Arbeit und vermeidet den schlimmsten Fehler, der hier möglich wäre: einen zweiten
Zustandsspeicher neben `zyklus.v2` zu stellen.

---

## 2. Die Kernentscheidung: kein 3D-Framework — hier noch klarer als zuvor

**Empfehlung: ein eigener Renderer auf Canvas 2D mit eigener 3D→2D-Projektion. Keine Bibliothek.**

Die Begründung aus der Sache selbst gilt unverändert. Zu zeichnen sind 16 Gelenkpunkte, rund
20 Linien, ein Kopfkreis, ein Bodenraster und Equipment als Drahtgitter mit 20 bis 60 Kanten,
bei **fester Kamera**, ohne Materialien, ohne Licht, ohne Schatten, mit
**bildschirmkonstanten Strichstärken in drei Farben**. Von dem, wofür eine 3D-Bibliothek existiert —
Szenengraph, Materialsystem, Beleuchtung, Shader, Kamerasteuerung, Modell-Ladeprogramme — wird
nichts gebraucht. Übrig bleibt eine 4×4-Matrix, eine perspektivische Division und
`moveTo`/`lineTo`.

Dazu der Punkt, den man leicht übersieht: **bildschirmkonstante Linienbreite ist in WebGL das
schwierigere Problem.** `gl.lineWidth` ist auf praktisch allen Plattformen auf 1 festgenagelt und
wird ignoriert. Wer in three.js Linien mit 3,5 px zeichnen will, braucht `Line2`/`LineMaterial` aus
den Examples, also Geometrie, die pro Frame als Quads in den Bildschirmraum gerechnet wird. Genau
das kann Canvas 2D von Haus aus.

### Was in diesem Repo dazukommt

Ohne Bundler gibt es **kein Tree-Shaking**. Eine Bibliothek landet als vollständige Datei im Repo,
im Git und in der `ASSETS`-Liste des Service Workers — und damit im Precache jedes Handys, bei
jedem Versionssprung neu heruntergeladen.

| Ansatz | Neue Dateien im Repo | Precache-Zuwachs | Passt zum Bestand |
|---|---|---|---|
| **Canvas 2D, eigener Renderer** | 1 × `animation.js`, ca. 25 KB unkomprimiert | ca. 25 KB | ja, gleicher Stil, gleiches Muster |
| three.js (UMD) | 1 × `three.min.js`, Größenordnung 600 KB | Größenordnung 600 KB | nein, ES5-Codebasis ohne Module |
| three.js + Line2/LineMaterial | zusätzlich Examples-Dateien | mehr | nein |

Die aktuelle App precached rund 180 KB. Eine 3D-Bibliothek würde diesen Wert **vervierfachen** —
für eine Fähigkeit, die nicht gebraucht wird, in einer App, deren erklärtes Prinzip
„vollständig auf dem Gerät" lautet. React oder Vite nachzurüsten hieße zusätzlich, 2.760 Zeilen
funktionierenden Code umzuschreiben und einen Build-Schritt einzuführen, den es bewusst nicht gibt.

### Performance auf dem Handy

Pro Frame: 16 Matrixmultiplikationen für die Gelenke, rund 80 projizierte Punkte, und —
entscheidend — nur **drei `stroke()`-Aufrufe**, weil es genau drei Farben gibt. Alle Figurenlinien
in einen `Path2D`, alle Equipmentkanten in einen zweiten, das Raster in einen dritten. Das ist auf
einem Mittelklasse-Telefon nicht messbar.

Drei Regeln, die das absichern:

1. Canvas-Auflösung = CSS-Größe × `devicePixelRatio`, gedeckelt bei **2**.
2. `requestAnimationFrame` **nur**, solange das Detail-Sheet offen und sichtbar ist. `openSheet`
   startet, `closeSheet` stoppt. Im Archiv-Sheet läuft keine Animation.
3. Fortschritt immer aus `performance.now()`, nie aus einem Frame-Zähler.

### Fallback

Es wird kein WebGL benutzt, also gibt es nichts, wovon zurückzufallen wäre. Canvas 2D ist überall
verfügbar, wo diese PWA läuft. Zwei Fälle bleiben:

- **`prefers-reduced-motion: reduce`** — nicht automatisch starten, Pose 0 als Standbild plus
  Abspielknopf. Das ist eine Bedienbarkeitsanforderung, kein Nice-to-have.
- **Canvas nicht verfügbar** — denselben Projektionscode auf ein `<svg>` mit `<polyline>` anwenden
  und Pose 0 statisch ausgeben. Rund 30 Zeilen, derselbe Code, anderer Ausgabe-Adapter.

---

## 3. Aufbau: ein generischer Renderer, Übungen sind nur Daten

Eine neue Datei **`animation.js`**, eingebunden vor `app.js`, im Stil des Bestands: IIFE, `var`,
keine Pfeilfunktionen, keine Module. Sie stellt genau ein globales Objekt bereit:

```js
window.ZyklusAnimation = {
  erzeugen: function (canvas, uebung, equipment) { … },   // liefert { start, stop, springeZu, zerstoere }
  posen:    function (gelenke, wurzel) { … },             // Winkel -> Weltpositionen, reine Funktion
  spiegeln: function (animation) { … }                    // Seitenwechsel, reine Funktion
};
```

Intern gegliedert, aber in einer Datei (der Bestand macht es genauso — `app.js` hat 2.760 Zeilen
mit klar getrennten Abschnitten):

```
SKELETT      Segmentlängen, Elternkette, Zeichenliste       (Konstanten, Spec 1+2)
POSE         Winkel -> Weltpositionen der 16 Gelenke        (reine Funktion)
INTERPOLATION Catmull-Rom + Zeitverzerrung                  (reine Funktion, Spec 5)
KAMERA       4 Kameras + automatische Rahmung               (reine Funktion, Spec 4)
SPIEGELUNG   Seitenwechsel als Datentransformation          (reine Funktion, Spec 6)
FORMEN       Formvokabular -> Kantenlisten                  (Konstanten, Spec 10)
ZEICHNEN     Canvas-2D-Ausgabe                              (kennt keine Übungs-ids)
```

Die Regel, an der du gemessen wirst: **`animation.js` enthält kein einziges
`if (uebung.id === …)` und importiert keine Übungsdaten.** Sie bekommt ein Objekt nach dem Schema
und zeichnet. Damit ist das Abnahmekriterium aus Abschnitt 12 der Spezifikation strukturell
erfüllt und nicht bloß Absichtserklärung.

`referenz-kinematik.py` liegt bei und setzt Abschnitt 3 der Spezifikation lauffähig um.
Portiere sie nach JavaScript und vergleiche Gelenk für Gelenk mit `python3 referenz-kinematik.py`.
Die Winkelkonvention ist die mit Abstand größte Fehlerquelle in diesem Projekt — ein vertauschtes
Vorzeichen sieht bei einer Kniebeuge noch plausibel aus und bricht dann beim Roundhouse Kick.

---

## 4. Daten laden — und der Fehler, der hier am teuersten wäre

`uebungen.json` ist **871 KB**. Der entscheidende Satz dazu:

> **Diese Daten dürfen nicht in `localStorage`.**

`app.js` schreibt bei jedem `save()` den **kompletten** Zustand mit `JSON.stringify(state)` zurück.
Läge der Übungskatalog in `state.db`, würde jedes Häkchen im Training 871 KB serialisieren und
schreiben — auf dem Handy, mitten im Satz. Dazu liegt das typische `localStorage`-Limit bei rund
5 MB pro Origin; der Katalog allein verbräuchte ein Fünftel davon, und die Export-/Import-Funktion
(`app: "zyklus", format: 1`) würde ihn bei jeder Sicherung mitschleppen.

**Die Aufteilung, die stattdessen gilt:**

| Datei | Größe | Wo | Wann geladen |
|---|---|---|---|
| `daten/uebungen-index.json` | ca. 40 KB | im `ASSETS`-Precache | beim Start, per `fetch` |
| `daten/uebungen/<id>.json` | je 6–18 KB, 72 Stück | im `ASSETS`-Precache | erst beim Öffnen des Detail-Sheets |
| `daten/equipment.json` | 25 KB | im `ASSETS`-Precache | beim Start |

Der Index trägt je Übung nur `id`, `name`, `kategorie`, `disziplin`, `equipment`, `level`, `ziel`
und `hat_risikohinweis`. Das reicht für Archiv, Suche und Filter.

In `state.db` wandert **nur die Referenz**: die bestehenden Felder `{ id, name, qty, note }` plus
ein neues Feld `katalog: "<uebungs-id>"`. Alles Übrige wird bei Bedarf aus der JSON-Datei geholt.
Damit bleibt der gespeicherte Zustand so klein wie heute, und die Sicherung bleibt handlich.

**Zum Prinzip „keine Netzwerkzugriffe zur Laufzeit":** Ein `fetch` auf eine Datei, die der Service
Worker precached hat, ist ein Lesezugriff auf den Gerätespeicher, kein Netzzugriff. Das Prinzip
bleibt gewahrt. Wichtig ist nur, dass **alle 74 neuen Dateien in der `ASSETS`-Liste in `sw.js`
stehen** — sonst fehlen sie offline, und genau das ist der Fehler, der erst im Gym auffällt.

`VERSION` in `sw.js` **nicht von Hand ändern**: das erledigt `Werkzeuge/stempeln.sh` über den
pre-commit-Hook. Prüfe nach dem ersten Commit, ob das Skript die neuen Dateien in die
Versionsableitung einbezieht — wenn es nur die bisherigen App-Dateien hasht, bekommt eine reine
Datenänderung keine neue Version und die Handys behalten den alten Katalog.

---

## 5. Was ich bewusst NICHT empfehle

**three.js und react-three-fiber.** Die Bibliothek löst Probleme, die diese Spezifikation
ausdrücklich ausschließt. Ohne Bundler landet sie vollständig im Precache und vervierfacht ihn.

**React, Vue, Svelte oder irgendein Framework nachrüsten.** 2.760 Zeilen funktionierender ES5-Code,
ein durchdachter Service Worker mit atomarem Update, ein Export-/Importformat — das alles
funktioniert. Ein Framework brächte hier keinen einzigen Vorteil, der die Umschreibung trägt.

**Einen Build-Schritt einführen.** Keine `package.json`, kein `node_modules`, kein Bundler: Die App
ist heute in jedem Editor sofort lauffähig und in jedem Browser direkt debuggbar. Das ist bei einer
App, die du allein pflegst, ein echter Wert. Ein Build-Schritt wäre der Moment, in dem die App
anfängt, Wartung zu kosten.

**Lottie, Rive, GSAP.** Lottie und Rive brauchen einen Export aus einem Autorenwerkzeug. Die
Animation wäre dann ein Asset statt Daten — Spiegelung beim Seitenwechsel, Dunkelmodus-Farbtausch
und jede Winkelkorrektur müssten durch ein Gestaltungsprogramm statt durch eine Zahl in einer JSON.
GSAP ist eine Tweening-Bibliothek; die Interpolation ist hier vollständig spezifiziert und in
40 Zeilen geschrieben.

**Fertige 3D-Figuren (GLTF, Mixamo, skinned Meshes).** Modell laden, Skelett auf 16 Gelenke
abbilden, Retargeting — und am Ende ein Charakter mit Muskeln, Kleidung und Beleuchtung, also genau
das, was die Spezifikation verbietet. Dazu mehrere MB pro Modell im Precache.

**Vorgerenderte Videos oder GIFs pro Übung.** 72 Clips sind mehrere hundert MB, lassen sich nicht
spiegeln, folgen keinem Dunkelmodus, und jede Winkelkorrektur bedeutet neu rendern und neu
ausliefern. Der Offline-Anspruch scheitert daran allein.

**Eine Physik-Engine.** Es gibt keine Simulation. Der Sack pendelt, weil es in den Keyframes steht.
Vorhersehbarkeit ist hier das ganze Qualitätsmerkmal.

**Den Übungskatalog in `localStorage` legen.** Siehe Abschnitt 4. Das ist die teuerste Abkürzung,
die in diesem Repo möglich ist.

**Ein zweiter Zustandsspeicher neben `zyklus.v2`.** Das Archiv existiert bereits als `state.db`.
Ein paralleler Speicher hieße: zwei Wahrheiten, zwei Migrationen, eine kaputte Sicherung.

---

## 6. Risiken, die ich vor dem Bauen benennen will

1. **Die Winkelkonvention ist die einzige echte Fehlerquelle.** Vorzeichen und Reihenfolge müssen
   exakt wie in Abschnitt 3 der Spezifikation stehen, inklusive der beiden Segmentgruppen.
   Deshalb der Vertikalschnitt mit 10 Übungen vor dem Rest.
2. **`becken` trägt bei Bodenübungen die Gesamtlage** (X bis 86°). Wer `becken` als reines
   Hüftgelenk behandelt, bekommt bei Liegestütz, Plank und Vierfüßlerstand eine stehende Figur.
3. **Die automatische Rahmung muss einmal vor dem ersten Frame über alle Phasen laufen**, nicht
   pro Frame. Sonst atmet das Bild.
4. **`localStorage`-Quote und `save()`-Kosten.** Siehe Abschnitt 4.
5. **Die `ASSETS`-Liste und `stempeln.sh`.** Neue Dateien, die dort fehlen, funktionieren im
   Browser am Schreibtisch einwandfrei und fehlen offline auf dem Handy.
6. **Bestehende Datenbestände.** In `state.db` stehen bereits Übungen aus dem Excel-Startplan.
   Der Import muss über `dbKey(name)` zusammenführen, nicht danebenschreiben — sonst steht
   „Flachbankdrücken" zweimal in der Liste.
