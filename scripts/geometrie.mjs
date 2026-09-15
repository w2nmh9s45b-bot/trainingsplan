// Zyklus – Geometrieprüfung als harter Schritt.
//
// daten-import/pruefe-geometrie.py (unverändert übernommen) rechnet jede Pose mit der
// Referenz-Kinematik nach und prüft Boden, Fußkontakt, Sack- und Stangenhöhe. Das Skript
// endet aber IMMER mit Exitcode 0 – gemeldet wird nur über die Zeile "ERGEBNIS: …".
// Dieser Wrapper macht daraus einen Prüfschritt: Exitcode 1, sobald nicht SAUBER.
//
//   node scripts/geometrie.mjs [pfad/uebungen.json]     (Vorgabe: daten-import/uebungen.json)
import { spawnSync } from "node:child_process";
import path from "node:path";

const WURZEL = path.resolve(import.meta.dirname, "..");
const SKRIPT = path.join(WURZEL, "daten-import", "pruefe-geometrie.py");
const DATEI = path.resolve(process.argv[2] || path.join(WURZEL, "daten-import", "uebungen.json"));

const lauf = spawnSync("python3", [SKRIPT, DATEI], {
  cwd: WURZEL,
  encoding: "utf8",
  // kein __pycache__ in daten-import/ anlegen
  env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: "1" })
});

if (lauf.error) {
  console.error("geometrie: python3 nicht startbar (" + lauf.error.message + ") – Geometrieprüfung NICHT gelaufen.");
  process.exit(1);
}
if (lauf.stdout) process.stdout.write(lauf.stdout);
if (lauf.stderr) process.stderr.write(lauf.stderr);
if (lauf.status !== 0) {
  console.error("geometrie: pruefe-geometrie.py mit Exitcode " + lauf.status + " beendet – FEHLGESCHLAGEN.");
  process.exit(1);
}
if (!/^ERGEBNIS: SAUBER\s*$/m.test(lauf.stdout || "")) {
  console.error("geometrie: Ergebnis ist NICHT \"SAUBER\" – Befunde siehe oben. FEHLGESCHLAGEN.");
  process.exit(1);
}
console.log("geometrie: SAUBER (" + path.relative(WURZEL, DATEI) + ")");
