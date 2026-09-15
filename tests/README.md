# Tests für animation.js

Ausführen im App-Ordner: `npm test` (führt alle `tests/*.test.mjs` aus; `node --test tests/` startet nur `animation.test.mjs`) (Node 24, Python 3 für den Referenzabgleich; keine Abhängigkeiten). Gegen eine andere Datei: `ZYKLUS_ANIMATION_JS=/pfad/animation.js npm test`.
`animation.test.mjs` prüft die reinen Funktionen von `window.ZyklusAnimation` ohne Browser: Vorwärtskinematik (Nullstellung, Proben, Gruppe A/B), Rotationen, Bodenkontakt, Spiegelung, Zeitverzerrung, Abtasten (Pose-Startzeiten, loop true/false, kein Überschwingen, kein NaN), Seitenwechsel über `zustandBei`, Rahmung und Kamera-Fallback.
`referenz-dump.py` rechnet alle 343 Phasen der 72 Übungen mit `daten-import/referenz-kinematik.py` und gibt die 20 Punkte als JSON aus; Test 08b vergleicht damit Gelenk für Gelenk auf 1e-9.
Datenquelle ist `daten-import/uebungen.json`; die Tests sind nur aus Spezifikation, Referenzskript und API-Vertrag geschrieben, nicht aus der Implementierung.
`package.json` hier enthält nur `main`, damit Node 24 das Verzeichnis-Argument `tests/` auflösen kann.
