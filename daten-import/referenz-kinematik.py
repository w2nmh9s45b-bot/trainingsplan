"""Referenz-Vorwaertskinematik zur animations-spezifikation.md.
Eindeutige Umsetzung der Winkelkonvention aus Abschnitt 3. Keine Bibliothek noetig."""
import math

GELENKE = ["kopf","hals","brust","becken","schulter_l","schulter_r","ellbogen_l","ellbogen_r",
           "hand_l","hand_r","huefte_l","huefte_r","knie_l","knie_r","fuss_l","fuss_r"]

# --- Rotationsmatrizen: so und nicht anders ---------------------------------
# X positiv = Segment nach VORN (+Z)   -> Rx ist gegenueber der Standardform transponiert
# Y positiv = Drehung nach LINKS       -> Ry ist gegenueber der Standardform transponiert
# Z positiv = Segment nach RECHTS (+X) -> Rz ist die Standardform
def _rx(a):
    c,s=math.cos(a),math.sin(a); return ((1,0,0),(0,c,s),(0,-s,c))
def _ry(a):
    c,s=math.cos(a),math.sin(a); return ((c,0,-s),(0,1,0),(s,0,c))
def _rz(a):
    c,s=math.cos(a),math.sin(a); return ((c,-s,0),(s,c,0),(0,0,1))
def _mm(A,B):
    return tuple(tuple(sum(A[i][k]*B[k][j] for k in range(3)) for j in range(3)) for i in range(3))
def _mv(A,v):
    return tuple(sum(A[i][k]*v[k] for k in range(3)) for i in range(3))
def _add(a,b): return (a[0]+b[0],a[1]+b[1],a[2]+b[2])

# X positiv beugt IMMER in die anatomische Beugerichtung. Fuer Segmente, deren Ruhelage nach
# oben zeigt (becken, brust, hals, kopf), und fuer das Knie (das nur nach hinten beugt) bedeutet
# das die entgegengesetzte Drehrichtung wie bei Armen, Oberschenkeln und Fuessen.
X_GEGENLAEUFIG = {"becken","brust","hals","kopf","knie_l","knie_r"}

def rot(name, w):
    x,y,z = [math.radians(v) for v in w]
    if name in X_GEGENLAEUFIG: x = -x
    return _mm(_mm(_rx(x), _ry(y)), _rz(z))

# --- Koerpermodell ----------------------------------------------------------
L = dict(becken_brust=0.30, brust_hals=0.22, hals_kopf=0.16, kopfradius=0.11,
         oberarm=0.32, unterarm=0.28, hand=0.09,
         oberschenkel=0.45, unterschenkel=0.45, fusslaenge=0.18)
SCHULTER_OFF = {"schulter_l": (-0.20,0,0), "schulter_r": (0.20,0,0)}
HUEFT_OFF    = {"huefte_l":   (-0.10,0,0), "huefte_r":   (0.10,0,0)}
HOCH = (0,1,0); RUNTER = (0,-1,0); VOR = (0,0,1)
def _skal(v,f): return (v[0]*f, v[1]*f, v[2]*f)

def posen(gelenke, wurzel=(0.0,0.98,0.0)):
    """gelenke: dict name -> [x,y,z] in Grad. Rueckgabe: dict name -> Weltposition (x,y,z)."""
    P={}; R={}
    R["becken"]=rot("becken",gelenke["becken"]); P["becken"]=tuple(wurzel)
    R["brust"]=_mm(R["becken"],rot("brust",gelenke["brust"]))
    P["brust"]=_add(P["becken"],_mv(R["brust"],_skal(HOCH,L["becken_brust"])))
    R["hals"]=_mm(R["brust"],rot("hals",gelenke["hals"]))
    P["hals"]=_add(P["brust"],_mv(R["hals"],_skal(HOCH,L["brust_hals"])))
    R["kopf"]=_mm(R["hals"],rot("kopf",gelenke["kopf"]))
    P["kopf"]=_add(P["hals"],_mv(R["kopf"],_skal(HOCH,L["hals_kopf"])))
    for s,e,h in (("schulter_l","ellbogen_l","hand_l"),("schulter_r","ellbogen_r","hand_r")):
        basis=_add(P["brust"],_mv(R["brust"],SCHULTER_OFF[s]))
        R[s]=_mm(R["brust"],rot(s,gelenke[s])); P[s]=basis
        R[e]=_mm(R[s],rot(e,gelenke[e]))
        P[e]=_add(P[s],_mv(R[s],_skal(RUNTER,L["oberarm"])))
        R[h]=_mm(R[e],rot(h,gelenke[h]))
        P[h]=_add(P[e],_mv(R[e],_skal(RUNTER,L["unterarm"])))
        P[h+"_faust"]=_add(P[h],_mv(R[h],_skal(RUNTER,L["hand"])))
    for hu,kn,fu in (("huefte_l","knie_l","fuss_l"),("huefte_r","knie_r","fuss_r")):
        basis=_add(P["becken"],_mv(R["becken"],HUEFT_OFF[hu]))
        R[hu]=_mm(R["becken"],rot(hu,gelenke[hu])); P[hu]=basis
        R[kn]=_mm(R[hu],rot(kn,gelenke[kn]))
        P[kn]=_add(P[hu],_mv(R[hu],_skal(RUNTER,L["oberschenkel"])))
        R[fu]=_mm(R[kn],rot(fu,gelenke[fu]))
        P[fu]=_add(P[kn],_mv(R[kn],_skal(RUNTER,L["unterschenkel"])))
        P[fu+"_zeh"]=_add(P[fu],_mv(R[fu],_skal(VOR,L["fusslaenge"])))
    return P

def kinn(P): return P["kopf"][1]-L["kopfradius"]

if __name__=="__main__":
    null={g:[0,0,0] for g in GELENKE}
    P=posen(null)
    def f(p): return f"({p[0]:+.3f}, {p[1]:+.3f}, {p[2]:+.3f})"
    print("NULLSTELLUNG")
    for k in ("kopf","hals","brust","becken","schulter_l","ellbogen_l","hand_l","hand_l_faust",
              "huefte_r","knie_r","fuss_r","fuss_r_zeh"): print(f"  {k:14s} {f(P[k])}")
    print(f"  Kinnhoehe      {kinn(P):+.3f}")
    print("\nPROBEN")
    t=dict(null); t["schulter_l"]=[90,0,0]
    print("  schulter_l[90,0,0] -> hand_l",f(posen(t)["hand_l"]),"(erwartet z ~ +0.60)")
    t=dict(null); t["knie_l"]=[90,0,0]
    print("  knie_l[90,0,0]     -> fuss_l",f(posen(t)["fuss_l"]),"(erwartet z negativ = nach hinten)")
    t=dict(null); t["ellbogen_l"]=[90,0,0]
    print("  ellbogen_l[90,0,0] -> hand_l",f(posen(t)["hand_l"]),"(erwartet z positiv = nach vorn)")
    t=dict(null); t["schulter_r"]=[0,0,90]
    print("  schulter_r[0,0,90] -> ellbogen_r",f(posen(t)["ellbogen_r"]),"(erwartet x ~ +0.52)")
    t=dict(null); t["becken"]=[0,90,0]
    print("  becken[0,90,0]     -> huefte_r",f(posen(t)["huefte_r"]),"(erwartet z ~ +0.10 = nach links gedreht)")
