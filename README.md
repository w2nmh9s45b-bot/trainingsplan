# Zyklus – Trainingsplan

Web-App für meinen Trainingsplan im Wochen-Zyklus. Zeigt pro Tag alle Übungen mit
Menge/Dauer und Anweisung, gruppiert nach Trainingsort. Der Plan ist **direkt in der
App editierbar**, die Zykluslänge einstellbar, und zu den Übungen aus dem Katalog gibt es
eine Anleitung mit animierter Strichfigur. Zeiten werden nicht gemessen (die frühere
Workout-Uhr ist seit 14.09.2026 entfernt).

**Live:** <https://w2nmh9s45b-bot.github.io/trainingsplan/>

## Benutzen

Seite auf dem iPhone in Safari öffnen → Teilen-Symbol → **„Zum Home-Bildschirm"**.
Danach startet Zyklus wie eine App: im Vollbild und **komplett ohne Internet** – alle
Dateien liegen auf dem Handy (siehe „Offline & Updates"). Im Browser zeigt die App
dafür oben eine Installationskarte mit den zwei Handgriffen (✕ blendet sie dauerhaft aus).

Beim Öffnen steht sofort der heutige Tag da:

- **Kopfzeile** – Datum, Zyklus-Badge (`W1 · KRAFT`, antippen öffnet die
  Zyklus-Einstellungen), Zähler `7/21`, `?` für die Basics.
- **Wochenstreifen** – alle Tage des Zyklus (eine Seite je Woche). Farbige Punkte =
  Trainingsorte des Tages, Strich = Ruhetag, grüner Haken = alles erledigt. Tippen
  wechselt den Tag, seitliches Wischen über die Liste ebenso.
- **Hero-Karte** – Fortschrittsring des Tages und Orte mit Übungszahl (Antippen springt
  zur Sektion).
- **Liste** – je Trainingsort eine Karte mit Fortschrittsring. Eine Zeile antippen hakt
  sie ab (mit Partikel-Animation), nochmal antippen macht es rückgängig. Beim Scrollen
  fliegen die nächsten Zeilen von links ein. Trägt der **Kreis ganz links** ein kleines
  blaues „i", liegt eine Anleitung vor: Kreis antippen öffnet das Detailfenster mit
  Animation, der Rest der Zeile hakt weiter ab. Ohne „i" hakt auch der Kreis ab.
- **Fuß** – `Basics`, `Übungen` (Übungsdatenbank), `Kalender` (Trainingshistorie),
  `Bearbeiten` und `Tag zurücksetzen` (zweistufig).

## Übungskatalog (Archiv + Animationen)

`Übungen` im Fuß öffnet das **Archiv**: oben der Übungskatalog (Anleitung, 3D-Strichfigur),
darunter alles, was je im Plan stand. Suche über Name und Ziel, Filter nach Kategorie,
Disziplin, Level und Gerät. In der Liste laufen keine Animationen.

- **Archiv → Plan:** `+` an der Zeile (oder „+ In den Plan" im Detailfenster) → Woche, Tag und
  Ort wählen → übernehmen. Menge und Pause kommen aus der Empfehlung der Übung. Die Übung bleibt
  im Archiv und ist dort als „im Plan" markiert. Im Bearbeiten-Modus zeigt „Übung hinzufügen"
  die Katalogübungen ebenfalls.
- **Detailfenster:** Name im Archiv oder den Kreis mit „i" an einer Planzeile antippen – beides ist dasselbe
  Fenster. Ab 768 px links die Animation (Abspielen/Pause, ‹ › je Phase, Fortschrittsleiste,
  Phase + Hinweis, bei Seitenwechsel „Seite 1 / 2"), rechts Risikohinweis, Anleitung, Achte auf,
  Häufige Fehler, Empfehlung, Equipment, Quellen. Bei „Bewegung reduzieren" startet die
  Animation nicht von selbst.
- **Plan → Archiv:** im Detailfenster, das über den Kreis einer Planzeile geöffnet wurde, „Zurück ins Archiv" (ohne
  Nachfrage). Reihenfolge im Plan: im Bearbeiten-Modus die Pfeile an jeder Zeile.

Technik: `animation.js` zeichnet jede Übung allein aus ihren Keyframe-Daten nach
`daten-import/animations-spezifikation.md` (keine Sonderfälle je Übung). Im Speicher `zyklus.v2`
steht nur die Referenz `db[].katalog`; die Katalogdaten liegen in `daten/` und kommen offline aus
dem Service-Worker-Cache. `daten/uebungen/<id>.json` wird erst beim Öffnen des Detailfensters
gelesen.

**Daten aktualisieren:** Quelle ist `daten-import/` (`uebungen.json`, `equipment.json` wie
geliefert, dazu `korrekturen.json`). Danach `npm run daten` – erzeugt `daten/`, trägt die Dateien
in `ASSETS` von `sw.js` ein und prüft alles (`scripts/validate-daten.mjs`, Geometrie über
`pruefe-geometrie.py`). `npm test` führt die Unit-Tests aus (Node 24, Python 3). Beides läuft
auch im pre-commit-Hook. Solange `scripts/vertikalschnitt.json` existiert, werden nur die dort
genannten 10 Übungen erzeugt.

**Korrekturen:** Einige Geräte-Positionen in `uebungen.json` stehen als Weltkoordinate statt als
lokaler Versatz zum Gelenk (Spec §10). `daten-import/korrekturen.json` korrigiert sie mit
Begründung und Altwert-Wächter; `offen` listet, was vor der Freigabe aller 72 Übungen noch von
Hand gesetzt werden muss.

## Kalender

`Kalender` im Fuß öffnet die Trainingshistorie als Monatsansicht:

- **Monatsraster** – jeder Trainingstag trägt einen Fortschrittsring (blau = teilweise,
  grün = alle Übungen), heute ist umrandet; ‹ › blättert durch die Monate. Darunter
  die Monatsbilanz (Anzahl Trainings).
- **Tagesdetail** – Tag antippen: Status (Komplett / Teilweise) und Übungszahl, dann alle
  abgehakten Übungen in Abhak-Reihenfolge; nicht gemachte Übungen des Plan-Tags stehen
  ausgegraut als „offen" dabei.
- Die Zuordnung alter Tage zum Zyklus rechnet vom Anker-Montag aus zurück – wird der
  Zyklus später verschoben, ist die Soll-Liste alter Tage best effort.

## Plan bearbeiten (in der App)

`Bearbeiten` im Fuß antippen:

- **Übung entfernen:** rotes Minus rechts an der Zeile. Entfernte Übungen werden nie
  gelöscht, sondern wandern in die **Übungsdatenbank**.
- **Übung hinzufügen:** „+ Übung hinzufügen" unter einer Sektion → aus der Datenbank
  wählen (Suche) oder „Neue Übung anlegen" (Name, Menge/Dauer, Anweisung).
- **Trainingsort hinzufügen:** erscheint, wenn Gym/Homegym/Home an dem Tag noch fehlt –
  auch an bisherigen Ruhetagen.
- `Fertig` beendet den Modus.

Die **Übungsdatenbank** (`Übungen` im Fuß) sammelt alles, was je im Plan stand, mit
Suche und Verwendungszähler. Endgültig löschen: ✕ zweimal antippen.

## Zyklus einstellen

Zyklus-Badge in der Kopfzeile antippen:

- **Zykluslänge** 1–6 Wochen (neue Wochen starten leer und werden über „Bearbeiten"
  gefüllt; beim Verkürzen bleiben alle Übungen in der Datenbank erhalten).
- **„Diese Kalenderwoche ist …"** ordnet den Zyklus dem echten Trainingsstand zu.
- **„Plan auf Startplan zurücksetzen"** (zweistufig) stellt den Excel-Stand aus
  `data.js` wieder her (Haken-Historie bleibt).

Woche 1 beginnt am **Montag, 01.06.2026**; ab da laufen die Wochen durch.

Unten im Zyklus-Sheet steht der Block **„App auf diesem Gerät"** (Offline-Stand,
Installationsstatus, Sicherung – siehe unten).

## Offline & Updates

Die App arbeitet **offline zuerst** (`sw.js`): Jeder Start kommt sofort aus dem Speicher
des Geräts – egal ob Netz da ist, schwach ist oder fehlt. Das Internet wird nur noch
gebraucht, um eine neue Fassung abzuholen.

- **Einrichtung:** einmal mit Internet öffnen – auf dem iPhone die App **vom Home-Bildschirm**,
  denn sie hat einen eigenen Speicher, getrennt von Safari. Der Service Worker lädt alle
  Offline-Dateien (App, Katalogdaten, Icons – derzeit 24) in den Cache `zyklus-<VERSION>`;
  danach meldet die App einmalig **„Offline bereit"**. Der Stand steht dauerhaft im
  Zyklus-Sheet („Offline bereit · Stand TT.MM.JJJJ").
- **Geprüft:** Jede Datei muss Byte für Byte zu ihrer SHA-256-Summe im Block `PRUEFSUMMEN`
  von `sw.js` passen, sonst gilt das Laden als gescheitert und die bisherige Fassung bleibt.
  So landet nie eine alte Kopie aus einem Zwischenspeicher im Offline-Speicher (etwa vom CDN
  direkt nach dem Hochladen), auch keine abgeschnittene. Geladen wird mit `?v=VERSION` am
  Zwischenspeicher vorbei, gespeichert unter der Adresse ohne Anhängsel.
- **Offline-Check:** Beim Start zählt der Worker die Dateien im Speicher und liest sie
  danach gründlich gegen die Prüfsummen (von selbst höchstens alle 10 Minuten). „Prüfen“
  in der Offline-Zeile des Zyklus-Sheets tut das sofort und zeigt z. B. „24 von 24 Dateien
  geprüft und unversehrt“. Fehlt eine Datei oder ist eine beschädigt, steht das dort, am
  Wochen-Badge erscheint ein oranger Punkt, und mit Netz repariert sich der Speicher selbst.
- **Speicherschutz:** Beim Start (und bei „Prüfen“) bittet die App den Browser per
  `navigator.storage.persist()`, Plan, Haken und App-Dateien nicht bei Platzmangel zu räumen.
  Ob er zusagt, zeigt das Zyklus-Sheet („Speicher geschützt“ / „nicht dauerhaft geschützt“).
- **Updates:** Beim Öffnen und beim Zurückholen aus dem Hintergrund (höchstens einmal pro
  Minute) fragt die App beim Server nach. Eine neue Fassung wird im Hintergrund
  **vollständig** in einen eigenen Cache geladen; erst dann übernimmt der neue Worker.
  Bricht der Download ab (Funkloch, WLAN-Anmeldeseite), läuft die alte Fassung weiter.
- **Hinweis-Pille:** „Neue Version geladen → Aktualisieren" lädt neu (Plan und Haken
  liegen im Speicher, es geht nichts verloren). Wer sie ignoriert: Beim
  nächsten Start ist die neue Fassung aktiv; lag die App über **10 Minuten** im
  Hintergrund, wird sie beim Zurückkommen still übernommen (nicht bei offenem Sheet
  oder im Bearbeiten-Modus).
- **Selbstreparatur:** Fehlen Dateien im Cache (z. B. weil eine andere App unter
  `w2nmh9s45b-bot.github.io` im Browser alle Caches geräumt hat), lädt der Worker beim
  nächsten Start mit Netz alles neu nach. Zyklus selbst räumt nur Caches mit dem
  Präfix `zyklus-` weg.
- **Version:** `Werkzeuge/stempeln.sh` bildet eine Prüfsumme über alle App-Dateien und
  schreibt sie identisch in `sw.js` (`var VERSION`) und `app.js` (`var APP_VERSION`).
  Daran erkennt die laufende Seite, ob der Speicher schon eine neuere Fassung hält.
  Nie von Hand ändern – der pre-commit-Hook stempelt automatisch (siehe „Deploy").

## Sicherung

Plan, Übungsdatenbank und Haken lassen sich als Datei mitnehmen – wichtig, weil
**Safari und die installierte App getrennte Speicher haben** (ebenso ein neues Handy):

- **Sicherung speichern** (Zyklus-Sheet oder Installationskarte): öffnet das
  Teilen-Menü („In Dateien sichern", AirDrop, Mail …), sonst Download.
  Datei `Zyklus-Sicherung-JJJJ-MM-TT.json` = `{ app:"zyklus", format:1, exported, data }`,
  `data` ist der komplette Speicherstand.
- **Sicherung laden:** Datei wählen → Rückfrage mit Datum, Wochen und Trainingstagen →
  „Übernehmen" ersetzt Plan, Datenbank und Haken. Der Stand davor bleibt unter
  `zyklus.v2.vor-import` im Speicher. Ungültige Dateien werden abgewiesen, ohne etwas
  zu ändern; ein roher `zyklus.v2`-Inhalt wird ebenfalls angenommen.

Umzug Safari → installierte App: in Safari „Sicherung speichern" → „In Dateien sichern";
in der App vom Home-Bildschirm Wochen-Badge → „Sicherung laden" → Datei wählen.

- **Erinnerung:** Plan und Haken leben nur im Speicher des Geräts. Hat sich seit der letzten
  Sicherung etwas geändert und liegt diese (oder der erste Start mit Erinnerung) über eine
  Woche zurück, erscheint oben auf der Tagesseite die Karte **„Zeit für eine Sicherung“** und
  am Wochen-Badge ein oranger Punkt. „Jetzt sichern“ öffnet das Teilen-Menü, „Später“ lässt
  sie drei Tage ruhen. Das Zyklus-Sheet zeigt immer „Gesichert · Letzte Sicherung vor … Tagen“.
  Als Änderung zählt nur, was `save()` wirklich anders schreibt (Haken, Plan, Datenbank).
- **Speicherfehler:** Nimmt das Gerät keine Änderungen mehr an (Speicher voll, gesperrt),
  erscheint sofort die Pille **„Speichern fehlgeschlagen“** mit „Sichern“, dazu ein roter Punkt
  am Badge und eine rote Zeile im Zyklus-Sheet – bis wieder gespeichert werden kann. Die
  Sicherungsdatei enthält dabei trotzdem den aktuellen Stand aus dem Arbeitsspeicher.

## Speicherung

Alles liegt im `localStorage` des Browsers unter dem Schlüssel `zyklus.v2`:
der komplette Plan, die Übungsdatenbank und pro Kalendertag (`YYYY-MM-DD`,
Tagesgrenze **04:00**) die Haken (`checks`: Übungs-uid → Zeitpunkt des Abhakens, nur für
die Reihenfolge im Kalender; 0 = nachgetragen). Ältere Stände enthalten noch `start`, `end`
und `pauses` der früheren Workout-Uhr; die Felder bleiben liegen und werden nicht mehr gelesen.
Tage, an denen nur die Uhr gestartet, aber nichts abgehakt wurde, fallen beim Laden weg.
Ältere Tage bleiben **400 Tage** für den Kalender abrufbar. Ein Altbestand der
ersten App-Version (`zyklus.v1`) wird beim ersten Start automatisch übernommen.

Nebenschlüssel: `zyklus.v2.vor-import` (Stand vor dem letzten Sicherungs-Import),
`zyklus.v2.corrupt` (erster defekter Stand), `zyklus.v2.offline-bereit` (Meldung
„Offline bereit" schon gezeigt), `zyklus.v2.installhinweis` (Installationskarte
ausgeblendet), dazu je ein Zeitstempel in ms für die Sicherungs-Erinnerung:
`zyklus.v2.geaendert` (letzte echte Änderung), `zyklus.v2.sicherung` (letzte Sicherung
erstellt oder geladen), `zyklus.v2.sicherung-spaeter` (Erinnerung ruht bis) und
`zyklus.v2.seit` (erster Start mit Erinnerung). Keiner davon wandert in eine
Sicherungsdatei. Die App-Dateien selbst liegen im Cache `zyklus-<VERSION>`.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Gerüst, PWA-Metadaten, Sheets (Basics, Zyklus inkl. „App auf diesem Gerät", Übung hinzufügen, Archiv, Detailfenster, Kalender) |
| `styles.css` | gesamtes Layout, Dark-Mode fest, Animationen (Reveal, Burst, Konfetti, Hinweis-Pille) |
| `app.js` | Darstellung, Abhaken, Übungskatalog (Archiv, Detailfenster), Plan-Editor, Datenbank, Speicherung, Zyklusrechnung, Offline-Status, Updates, Installationskarte, Sicherung |
| `data.js` | der **Startplan** (`window.PLAN`) aus der Excel – nur noch Seed beim ersten Start |
| `animation.js` | Renderer der Übungsanimationen (Kinematik, Interpolation, Kamera, Formen, Canvas 2D) |
| `daten/` | erzeugter Übungskatalog: `uebungen-index.json`, `equipment.json`, `uebungen/<id>.json` |
| `daten-import/` | Quellen des Katalogs, Spezifikation, Architektur-Empfehlung, Referenzskripte, `korrekturen.json` |
| `scripts/` | `split-uebungen.mjs`, `validate-daten.mjs`, `korrekturen.mjs`, `geometrie.mjs`, `vertikalschnitt.json` |
| `tests/`, `package.json` | Unit-Tests (`npm test`); package.json nur mit Skripten, ohne Abhängigkeiten |
| `sw.js` | Service Worker: offline zuerst, atomare und geprüfte Updates (`PRUEFSUMMEN`), Offline-Check, Selbstreparatur |
| `manifest.webmanifest`, `icons/` | Homescreen-Icon und App-Metadaten |
| `Werkzeuge/stempeln.sh` | Version aus dem Dateiinhalt in `sw.js` + `app.js` und die SHA-256-Summen in `PRUEFSUMMEN` schreiben (`--pruefen`, `--liste`, `--hook-einrichten`) |
| `Werkzeuge/offlineprobe.mjs` | Test ohne Netz im echten Chrome: alle Funktionen offline, Prüfsummen, Reparatur, Speicherfehler, Erinnerung (siehe „Offline testen") |
| `.githooks/pre-commit` | stempelt vor jedem Commit automatisch (Starter via `--hook-einrichten`) |

## Plan per Excel ändern (optional)

`data.js` wird aus `Privat/Trainingsplan <Datum>.xlsx` erzeugt und wirkt nur als
Startplan: Bestandsinstallationen behalten ihren gespeicherten Plan, bis in der App
„Plan auf Startplan zurücksetzen" gewählt wird. Format wie gehabt
(`window.PLAN = { weeks: […], basics: {…} }`).

Nach jeder Änderung an einer App-Datei muss die Version neu gestempelt werden, sonst
bleibt das iPhone auf der alten Fassung – das erledigt der pre-commit-Hook beim Commit
(von Hand: `bash Werkzeuge/stempeln.sh`).

## Deploy

GitHub Pages, Repo `w2nmh9s45b-bot/trainingsplan`, Branch `main`, Ordner `/`.
Ablauf siehe Skill `deploy-pages`.

1. Einmalig je Klon: `bash Werkzeuge/stempeln.sh --hook-einrichten` – legt einen kleinen
   Starter in `.git/hooks/pre-commit` an, der `.githooks/pre-commit` per `bash` aufruft
   (unabhängig von Ausführungsrechten, die beim Browser-Upload auf GitHub verloren gehen).
2. Committen – der Hook stempelt `sw.js` und `app.js` und nimmt sie mit auf. Er bricht ab,
   wenn App-Dateien nicht vorgemerkte Änderungen haben oder eine Datei aus `ASSETS` nicht
   im Repo liegt.
3. **Browser-Upload statt Push** (kein Token): Der Hook läuft dabei nicht – vorher selbst
   `bash Werkzeuge/stempeln.sh` ausführen und `sw.js` + `app.js` immer mit hochladen.
4. Vor dem Veröffentlichen: `bash Werkzeuge/stempeln.sh --pruefen` muss „aktuell … Prüfsummen
   passen" melden, sonst nimmt der Service Worker die neue Fassung nicht an.
5. Danach: `var VERSION` in der Live-`sw.js` muss der lokalen entsprechen.

Auf dem iPhone: App einmal mit Internet öffnen – die neue Fassung lädt im Hintergrund,
danach „Aktualisieren" antippen (oder beim nächsten Start automatisch).

## Offline testen

**Automatisch (Mac):** `node Werkzeuge/offlineprobe.mjs` – startet einen eigenen kleinen
Webserver, richtet die App in Chrome ein, schaltet Server und Netz ab und prüft dann Start,
Abhaken, Neustart, Anleitung mit Animation, Kalender, Bearbeiten, Sicherung speichern und
laden, den Offline-Check (auch mit absichtlich beschädigter und fehlender Datei), die
Selbstreparatur mit Netz, das Abweisen einer veralteten Datei vom Server, die Warnung bei
vollem Speicher, die Sicherungs-Erinnerung und das **Update von der zuletzt veröffentlichten
Fassung** (`origin/main`, per `ZYKLUS_PROBE_VORFASSUNG=<git-Rev>` änderbar): alte Fassung
einrichten und abhaken, neue ausliefern, Haken erhalten, danach Start ohne Netz – also genau
den Weg, den das Handy beim nächsten Öffnen geht. Vor dem Veröffentlichen laufen lassen.
Braucht Google Chrome und `playwright-core`
(gesucht neben `~/Repos/orgahub-desktop`, sonst `ZYKLUS_PLAYWRIGHT=/pfad/zu/package.json`);
Fotos und Bericht landen in einem Temp-Ordner (`ZYKLUS_PROBE_AUS` setzt ihn fest).

**Auf dem iPhone (Flugmodus-Test)** – Chrome ist nicht Safari, das Gerät zählt:
1. Mit Internet die App **vom Home-Bildschirm** öffnen, bis „Offline bereit" kommt.
2. Wochen-Badge → „Prüfen" → „… Dateien geprüft und unversehrt".
3. Flugmodus an (WLAN aus), App ganz schließen (hochwischen) und neu öffnen.
4. Abhaken, eine Anleitung öffnen, Kalender öffnen, App schließen und wieder öffnen –
   alles muss da sein; im Zyklus-Sheet steht „gerade ohne Internet".
5. Flugmodus aus.
