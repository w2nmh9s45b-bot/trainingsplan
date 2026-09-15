"""Geometrische Pruefung der Uebungsdaten gegen die Referenz-Kinematik.
Aufruf:  python3 pruefe-geometrie.py [uebungen.json] [id ...]"""
import json,sys,os,importlib.util
# Python kann "referenz-kinematik.py" wegen des Bindestrichs nicht direkt importieren.
# Deshalb wird sie hier ueber ihren Dateipfad geladen - kein Zweitexemplar noetig.
_p=os.path.join(os.path.dirname(os.path.abspath(__file__)),"referenz-kinematik.py")
_sp=importlib.util.spec_from_file_location("referenz_kinematik",_p)
_rk=importlib.util.module_from_spec(_sp); _sp.loader.exec_module(_rk)
posen,kinn,GELENKE=_rk.posen,_rk.kinn,_rk.GELENKE
SACK=dict(x=0.0,z=0.85,r=0.175,unten=0.75,oben=1.95)
# Uebungen ohne dauerhaften Fusskontakt zum Boden
HAENGEND={"klimmzug-obergriff-power-tower","dip-power-tower-zusatzlast","haengendes-beinheben-power-tower",
          "tau-kletterzug","dip-power-tower","klimmzug"}
LIEGEND={"langhantel-schraegbankdruecken","nackenbeugung-geschirr-sitz",
         "nackenstreckung-geschirr-vorgebeugter-sitz","nacken-isometrie-seitlich-handwiderstand",
         "russian-twist-slamball","bauchroller-rollout-kniestand","unterarmstuetz-armreichen-wechsel",
         "bws-rotation-vierfuesslerstand","graetschsitz-adduktoren-dehnung","neunzig-neunzig-hueftrotation",
         "burpee-grundform","burpee-mit-schlagfolge","bergsteiger-intervall","plyometrischer-liegestuetz",
         "hueftbeuger-dehnung-ausfallschritt","landmine-rotation-halbkreis"}
# Schlagtechniken, die den Sack treffen muessen
def ist_schlag(u): return u["kategorie"]=="technik" and "boxsack" in u["equipment"]

def pruefe(d, nur=None):
    out={}
    def add(uid,t): out.setdefault(uid,[]).append(t)
    for u in d:
        if nur and u["id"] not in nur: continue
        a=u["animation"]; ph=a["phasen"]
        Ps=[posen(p["gelenke"], p.get("wurzel_position_m",(0,0.98,0))) for p in ph]
        for i,P in enumerate(Ps):
            tief=min(v[1] for v in P.values())
            if tief<-0.02: add(u["id"],f"P{i} '{ph[i]['name'][:26]}': Gelenk {tief:+.3f} m unter Boden")
        # Fusskontakt: nur wo erwartbar, Flugphasen (Wurzel hoch) ausgenommen
        if u["id"] not in HAENGEND and u["id"] not in LIEGEND:
            for i,P in enumerate(Ps):
                w=ph[i].get("wurzel_position_m",(0,0.98,0))
                if w[1]>1.12: continue                      # Flugphase ueber die Wurzelhoehe
                if "flug" in ph[i]["name"].lower() or "sprung" in ph[i]["name"].lower(): continue
                fuss=min(P["fuss_l"][1],P["fuss_r"][1],P["fuss_l_zeh"][1],P["fuss_r_zeh"][1])
                if fuss>0.20: add(u["id"],f"P{i} '{ph[i]['name'][:26]}': beide Fuesse schweben ({fuss:.2f} m)")
        for i in range(len(ph)-1):
            if ph[i]["gelenke"]==ph[i+1]["gelenke"] and ph[i].get("wurzel_position_m")==ph[i+1].get("wurzel_position_m"):
                add(u["id"],f"Phasen {i}/{i+1} identisch")
        mx=max(abs(ph[i]["gelenke"][g][k]-ph[j]["gelenke"][g][k])
               for g in GELENKE for k in range(3) for i in range(len(ph)) for j in range(len(ph)))
        if mx<25: add(u["id"],f"maximale Winkelaenderung nur {mx}Grad")
        if ist_schlag(u):
            for i,P in enumerate(Ps):
                k=kinn(P); n=ph[i]["name"].lower()
                # Bei Knie- und Ellbogentechnik ziehen die Arme bewusst nach unten
                if u["id"] in ("gerades-knie-am-sack","clinchposition-mit-knien-am-sack"): continue
                if "knie" in n or "ellbogen" in n or "clinch" in n or "gesaess" in n or "gesäß" in n: continue
                if max(P["hand_l_faust"][1],P["hand_r_faust"][1])<k-0.14:
                    add(u["id"],f"P{i} '{ph[i]['name'][:26]}': beide Faeuste {(k-max(P['hand_l_faust'][1],P['hand_r_faust'][1]))*100:.0f} cm unter dem Kinn")
            best=9.9
            for P in Ps:
                for key in ("hand_l_faust","hand_r_faust","knie_l","knie_r","fuss_l","fuss_r","ellbogen_l","ellbogen_r"):
                    p=P[key]
                    if SACK["unten"]-0.15<=p[1]<=SACK["oben"]:
                        best=min(best,((p[0]-SACK["x"])**2+(p[2]-SACK["z"])**2)**0.5)
            if best>0.28: add(u["id"],f"keine Gliedmasse kommt dem Sack naeher als {best:.2f} m (Sackradius 0.175)")
        GERAET_IN_HAND = {"langhantelstange","sz-stange","kurzhantelstangen","latzug","wrist-roller","bauchroller"}
        if set(u["equipment"]) & GERAET_IN_HAND:
            for i,P in enumerate(Ps):
                b=P["becken"]
                for h in ("hand_l_faust","hand_r_faust"):
                    dz=P[h][2]-b[2]
                    if dz < -0.35:
                        add(u["id"],f"P{i} '{ph[i]['name'][:26]}': {h} {abs(dz):.2f} m HINTER dem Becken")
        if u["id"].startswith("klimmzug"):
            for i,P in enumerate(Ps):
                for h in ("hand_l","hand_r"):
                    if abs(P[h][1]-2.10)>0.05: add(u["id"],f"P{i}: {h} y={P[h][1]:.2f}, Stange 2.10")
        for o in a.get("equipment_objekte",[]):
            if o["typ"].startswith(("kettlebell","slamball")) and "position_pro_phase" in o:
                for i,(P,pos) in enumerate(zip(Ps,o["position_pro_phase"])):
                    dist=min(sum((pos[k]-P[h][k])**2 for k in range(3))**0.5 for h in ("hand_l_faust","hand_r_faust"))
                    frei = "flug" in ph[i]["name"].lower() or "wurf" in ph[i]["name"].lower() or \
                           "aufprall" in ph[i]["name"].lower() or "boden" in ph[i]["name"].lower() or \
                           "wand" in ph[i]["name"].lower() or "abwurf" in ph[i]["name"].lower()
                    if dist>0.30 and not frei:
                        add(u["id"],f"P{i} '{ph[i]['name'][:26]}': {o['typ']} {dist:.2f} m von der naechsten Faust")
    return out

if __name__=="__main__":
    p=sys.argv[1] if len(sys.argv)>1 else "uebungen.json"
    nur=set(sys.argv[2:]) or None
    r=pruefe(json.load(open(p)),nur)
    print(f"Uebungen mit Befund: {len(r)}")
    for uid in sorted(r):
        print(uid)
        for b in r[uid]: print("   -",b)
    print("\nERGEBNIS:", "SAUBER" if not r else f"{sum(len(v) for v in r.values())} Befunde in {len(r)} Uebungen")
