"""Importbruecke fuer referenz-kinematik.py.

Python kann Moduldateien mit Bindestrich nicht per 'import' laden. Diese Datei laedt
die Referenz ueber ihren Pfad und stellt sie unter dem importierbaren Namen bereit:

    from referenz_kinematik import posen, kinn, GELENKE

Massgeblich ist immer 'referenz-kinematik.py'. Hier steht keine eigene Logik.
"""
import os, importlib.util

_p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "referenz-kinematik.py")
_spec = importlib.util.spec_from_file_location("_referenz_kinematik_impl", _p)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

posen = _mod.posen
kinn = _mod.kinn
rot = _mod.rot
GELENKE = _mod.GELENKE
L = _mod.L
X_GEGENLAEUFIG = _mod.X_GEGENLAEUFIG
