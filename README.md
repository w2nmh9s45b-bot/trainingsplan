# Zyklus – Trainingsplan

Web-App für meinen Trainingsplan im Wochen-Zyklus. Zeigt pro Tag alle Übungen mit
Menge/Dauer und Anweisung, gruppiert nach Trainingsort. Der Plan ist **direkt in der
App editierbar**, die Zykluslänge einstellbar, und ein Workout-Timer misst die
Gesamtdauer und die Zeit pro Übung.

**Live:** <https://w2nmh9s45b-bot.github.io/trainingsplan/>

## Benutzen

Seite auf dem iPhone in Safari öffnen → Teilen-Symbol → **„Zum Home-Bildschirm"**.
Danach startet sie wie eine App, im Vollbild und ohne Internet.

Beim Öffnen steht sofort der heutige Tag da:

- **Kopfzeile** – Datum, Zyklus-Badge (`W1 · KRAFT`, antippen öffnet die
  Zyklus-Einstellungen), Mini-Uhr bei laufendem Workout, Zähler `7/21`, `?` für die Basics.
- **Wochenstreifen** – alle Tage des Zyklus (eine Seite je Woche). Farbige Punkte =
  Trainingsorte des Tages, Strich = Ruhetag, grüner Haken = alles erledigt. Tippen
  wechselt den Tag, seitliches Wischen über die Liste ebenso.
- **Hero-Karte** – Fortschrittsring des Tages, Orte mit Übungszahl (Antippen springt
  zur Sektion) und die **Workout-Uhr**: „Workout starten" antippen oder einfach die
  erste Übung abhaken – ab da läuft die Zeit. Jede abgehakte Übung bekommt einen
  Zeit-Chip (Abstand zum vorherigen Haken). „Tag komplett" zeigt die Gesamtdauer.
- **Liste** – je Trainingsort eine Karte mit Fortschrittsring. Eine Zeile antippen hakt
  sie ab (mit Partikel-Animation), nochmal antippen macht es rückgängig. Beim Scrollen
  fliegen die nächsten Zeilen von links ein.
- **Fuß** – `Basics`, `Übungen` (Übungsdatenbank), `Bearbeiten` und
  `Tag zurücksetzen` (zweistufig).

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

## Speicherung

Alles liegt im `localStorage` des Browsers unter dem Schlüssel `zyklus.v2`:
der komplette Plan, die Übungsdatenbank und pro Kalendertag (`YYYY-MM-DD`,
Tagesgrenze **04:00**) Haken samt Zeitstempeln, Workout-Start und -Stopp.
Ältere Tage bleiben 8 Wochen abrufbar. Ein Altbestand der ersten App-Version
(`zyklus.v1`) wird beim ersten Start automatisch übernommen.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Gerüst, PWA-Metadaten, Sheets (Basics, Zyklus, Übung hinzufügen, Datenbank) |
| `styles.css` | gesamtes Layout, Dark-Mode fest, Animationen (Reveal, Burst, Konfetti) |
| `app.js` | Darstellung, Abhaken, Timer, Plan-Editor, Datenbank, Speicherung, Zyklusrechnung |
| `data.js` | der **Startplan** (`window.PLAN`) aus der Excel – nur noch Seed beim ersten Start |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `manifest.webmanifest`, `icons/` | Homescreen-Icon und App-Metadaten |

## Plan per Excel ändern (optional)

`data.js` wird aus `Privat/Trainingsplan <Datum>.xlsx` erzeugt und wirkt nur als
Startplan: Bestandsinstallationen behalten ihren gespeicherten Plan, bis in der App
„Plan auf Startplan zurücksetzen" gewählt wird. Format wie gehabt
(`window.PLAN = { weeks: […], basics: {…} }`).

**Wichtig nach jeder Änderung:** in `sw.js` die Zeile `var CACHE = "zyklus-v3"`
hochzählen, sonst liefert der Service Worker auf dem iPhone weiter die alte Version.

## Deploy

GitHub Pages, Repo `w2nmh9s45b-bot/trainingsplan`, Branch `main`, Ordner `/`.
Ablauf siehe Skill `deploy-pages`.
