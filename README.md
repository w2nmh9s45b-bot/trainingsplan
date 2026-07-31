# Zyklus – Trainingsplan

Web-App für meinen Trainingsplan im 2-Wochen-Zyklus. Zeigt pro Tag alle Übungen mit
Menge/Dauer und Anweisung, gruppiert nach Trainingsort, und lässt jede Übung einzeln abhaken.

**Live:** <https://w2nmh9s45b-bot.github.io/trainingsplan/>

## Benutzen

Seite auf dem iPhone in Safari öffnen → Teilen-Symbol → **„Zum Home-Bildschirm"**.
Danach startet sie wie eine App, im Vollbild und ohne Internet.

Beim Öffnen steht sofort der heutige Tag da:

- **Kopfzeile** – Datum, Zykluswoche (`W1 · KRAFT` / `W2 · POWER`), Zähler `7/21`, `?` für die Basics.
- **Wochenstreifen** – die 14 Tage des Zyklus. Farbige Punkte = Trainingsorte des Tages,
  Strich = Ruhetag, grüner Haken = alles erledigt. Tippen wechselt den Tag, seitliches
  Wischen über die Liste ebenso.
- **Liste** – je Trainingsort ein Abschnitt mit Fortschrittsring. Eine Zeile antippen hakt
  sie ab, nochmal antippen macht es rückgängig. Abgehakte Zeilen bleiben stehen.
- **Fuß** – Übungszahl, `Basics` und `Tag zurücksetzen` (zweistufig).

Der Fortschritt wird pro Kalendertag im Browser gespeichert (`localStorage`). Die Tagesgrenze
liegt bei **04:00**, damit Training über Mitternacht noch zum selben Tag zählt. Ältere Tage
bleiben 8 Wochen abrufbar und nachträglich korrigierbar.

## Zykluszuordnung

Woche 1 beginnt am **Montag, 01.06.2026**; ab da laufen die Wochen durch. Stimmt das nicht
mit dem echten Trainingsstand überein, das Wochen-Badge in der Kopfzeile antippen und
umschalten – die Einstellung bleibt gespeichert. Das ist die einzige Einstellung der App.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Gerüst, PWA-Metadaten |
| `styles.css` | gesamtes Layout, Dark-Mode fest |
| `app.js` | Darstellung, Abhaken, Speicherung, Zyklusrechnung |
| `data.js` | die Plandaten (`window.PLAN`) – **generiert, nicht von Hand ändern** |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `manifest.webmanifest`, `icons/` | Homescreen-Icon und App-Metadaten |

## Plan ändern

`data.js` wird aus der Excel `Privat/Trainingsplan <Datum>.xlsx` erzeugt. Nach einer
Planänderung die Datei neu generieren (Struktur der Excel: Wochenblöcke ab Zeile 1 bzw. 36,
je Tag drei Kategorieblöcke aus Name / Menge / Anweisung) und in `data.js` als
`window.PLAN = { … }` ablegen. Format:

```js
window.PLAN = {
  weeks: [{ week: 1, label: "Woche 1 (…)", days: [
    { day: "Montag",
      locations: [{ location: "Gym", items: [{ name: "…", qty: "3 x 8 reps", note: "schwer" }] }],
      off: [] }
  ]}],
  basics: { goals: [], rows: [{ label: "Pause", values: [] }], zones: [{ zone: "Zone 1", desc: "…" }] }
};
```

Ein Trainingsort ohne Einträge erscheint gar nicht – dadurch gibt es nie einen Knopf für
einen Ort, an dem an dem Tag nicht trainiert wird. `off` listet Orte, die in der Quelle
ausdrücklich als trainingsfrei markiert sind; ein Tag ganz ohne `locations` und ohne `off`
wird als Lücke im Plan gekennzeichnet.

**Wichtig nach jeder Änderung:** in `sw.js` die Zeile `var CACHE = "zyklus-v2"` hochzählen,
sonst liefert der Service Worker auf dem iPhone weiter die alte Version.

## Deploy

GitHub Pages, Repo `w2nmh9s45b-bot/trainingsplan`, Branch `main`, Ordner `/`.
Ablauf siehe Skill `deploy-pages`.
