"""Referenz-Dump fuer tests/animation.test.mjs.

Fuehrt referenz-kinematik.py (ueber die Importbruecke daten-import/referenz_kinematik.py)
fuer JEDE Phase JEDER Uebung aus und gibt die Weltpositionen aller 20 Punkte
(16 Gelenke + hand_l_faust, hand_r_faust, fuss_l_zeh, fuss_r_zeh) als JSON auf stdout aus.

Aufruf:  python3 tests/referenz-dump.py [pfad/zu/uebungen.json]
Ausgabe: {"meta": {...}, "uebungen": [{"id": ..., "phasen": [{punkt: [x,y,z], ...}, ...]}, ...]}

Hier steht keine eigene Kinematik - massgeblich ist allein referenz-kinematik.py.
"""
import json
import os
import sys

# Nichts ausserhalb von tests/ anfassen: keine __pycache__-Dateien in daten-import/ schreiben.
sys.dont_write_bytecode = True

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMPORT = os.path.join(WURZEL, "daten-import")
sys.path.insert(0, IMPORT)

from referenz_kinematik import posen, GELENKE  # noqa: E402

PUNKTE = list(GELENKE) + ["hand_l_faust", "hand_r_faust", "fuss_l_zeh", "fuss_r_zeh"]
VORGABE_WURZEL = (0.0, 0.98, 0.0)


def main():
    pfad = sys.argv[1] if len(sys.argv) > 1 else os.path.join(IMPORT, "uebungen.json")
    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)
    aus = []
    phasen_gesamt = 0
    for u in daten:
        phasen = []
        for p in u["animation"]["phasen"]:
            P = posen(p["gelenke"], p.get("wurzel_position_m", VORGABE_WURZEL))
            fehlend = [k for k in PUNKTE if k not in P]
            if fehlend:
                raise SystemExit("Referenz liefert Punkte nicht: %s" % fehlend)
            phasen.append({k: [float(v) for v in P[k]] for k in PUNKTE})
        phasen_gesamt += len(phasen)
        aus.append({"id": u["id"], "phasen": phasen})
    json.dump({"meta": {"uebungen": len(aus), "phasen": phasen_gesamt, "punkte": PUNKTE},
               "uebungen": aus}, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
