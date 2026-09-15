# Animations-Spezifikation

**Status: verbindlich.** Dieses Dokument ist die einzige Quelle für das Aussehen der Animationen.
Wo Code und dieses Dokument sich widersprechen, gilt dieses Dokument. Jede Abweichung ist ein Bug.
Alles, was hier nicht erlaubt wird, ist verboten — insbesondere zusätzliche Farben, zusätzliche
Kamerawinkel, pro Übung abweichende Strichstärken und Ad-hoc-Sonderfälle im Renderer.

Ziel: 72 Animationen, die aus reinen Keyframe-Daten entstehen und zwangsläufig gleich aussehen.

---

## 1. Skelett

Genau diese 16 Schlüssel, in dieser Reihenfolge:

```
kopf, hals, brust, becken,
schulter_l, schulter_r, ellbogen_l, ellbogen_r, hand_l, hand_r,
huefte_l, huefte_r, knie_l, knie_r, fuss_l, fuss_r
```

> Hinweis zur Abweichung vom ursprünglichen Auftrag: Dort ist von „15 Gelenken" die Rede, die
> aufgezählte Liste enthält aber 16 Namen (`fuss_l` und `fuss_r` sind beide genannt). Maßgeblich
> sind die 16 Namen. `uebungen.json` verwendet durchgängig alle 16 in jeder Phase.

**Kette (Elternbeziehung).** Jedes Gelenk rotiert relativ zu seinem Elternsegment:

| Gelenk | Eltern | Segment, das es bewegt |
|---|---|---|
| becken | Wurzel | Rumpf unten, trägt die Gesamtlage des Körpers |
| brust | becken | Brustkorb |
| hals | brust | Hals |
| kopf | hals | Kopf |
| schulter_l / schulter_r | brust | Oberarm |
| ellbogen_l / ellbogen_r | schulter | Unterarm |
| hand_l / hand_r | ellbogen | Hand |
| huefte_l / huefte_r | becken | Oberschenkel |
| knie_l / knie_r | huefte | Unterschenkel |
| fuss_l / fuss_r | knie | Fuß |

`becken` trägt zusätzlich die **Gesamtlage des Körpers**. Bei Bauch-, Vierfüßler- und Stützlagen
steht dort ein großer X-Wert (z. B. 78 bis 86 für Liegestützposition, 85 für Vierfüßlerstand),
weil `brust` laut Abschnitt 3 auf 70° begrenzt ist. Der Renderer behandelt das ohne Sonderfall:
`becken` wird wie jedes andere Gelenk rotiert, die Kinder erben die Lage.

**Zeichnung.** Verbunden werden genau diese Linien:
becken–brust · brust–hals · hals–kopf · brust–schulter_l · brust–schulter_r ·
schulter–ellbogen (je Seite) · ellbogen–hand (je Seite) · becken–huefte_l · becken–huefte_r ·
huefte–knie (je Seite) · knie–fuss (je Seite) · fuss–zehenspitze (je Seite) ·
hand–faust (je Seite, 0.09 m in Verlängerung des Unterarms, rotiert mit `hand_l`/`hand_r`).
Keine weiteren Linien. Kein Becken- oder Schulterdreieck, keine Wirbelsäulenkurve, keine Finger.

Das Handsegment ist nicht schmückend: 50 Phasen in 16 Übungen tragen Handwinkel (etwa die
Pronation `hand_r [0,80,0]` im Treffermoment der rechten Geraden). Ohne dieses Segment wären
diese Daten unsichtbar.

---

## 2. Koordinatensystem und Körpermodell

X nach rechts, **Y nach oben**, Z nach vorn. Rechtshändig. Einheit: Meter.
Ursprung `[0,0,0]` liegt am Boden zwischen den Füßen.

Segmentlängen (Figur 1,78 m). Diese Werte sind fest verdrahtet, nicht konfigurierbar:

```
Boden → becken            0.98
becken → brust            0.30
brust → hals              0.22
hals  → kopf (Mittelpunkt) 0.16      Kopfradius 0.11
brust → schulter_l        −0.20 in X   (schulter_r: +0.20, denn +X ist die rechte Körperseite)
schulter → ellbogen       0.32
ellbogen → hand           0.28
becken → huefte_l         −0.10 in X   (huefte_r: +0.10)
huefte → knie             0.45
knie → fuss (Knöchel)     0.45
Knöchelhöhe über Boden    0.08       Fußlänge 0.18 in +Z
```

### Wurzelposition

Optionales Feld `wurzel_position_m` je Phase: Position des `becken` in Weltkoordinaten.
Fehlt es, gilt `[0, 0.98, 0]`. 284 der 343 Phasen führen es. Es wird genauso interpoliert
wie die Winkel (Abschnitt 5).

---

## 3. Winkelkonvention

Jedes Gelenk trägt `[x, y, z]` in **Grad**. Es sind Rotationen des Kindsegments gegenüber dem
Elternsegment, angewendet **intrinsisch in der Reihenfolge X, dann Y, dann Z**:
`R = Rx(x) · Ry(y) · Rz(z)`.

**Nullstellung**: aufrechter Stand, Blick nach +Z, Arme hängen seitlich, Handflächen zum Körper,
Füße parallel, Zehen nach +Z. Dort sind alle 16 Gelenke `[0,0,0]`.

**Die Grundregel: X positiv beugt immer in die anatomische Beugerichtung.**

| Achse | Positiv heißt |
|---|---|
| X | anatomische Beugung. Arme, Oberschenkel, Hände und Füße nach **vorn** (+Z). Rumpf und Kopf nach **vorn geneigt**. Unterschenkel nach **hinten** — das Knie beugt nur so. |
| Y | Drehung nach **links** aus Sicht des Trainierenden (von oben gegen den Uhrzeigersinn). `becken [0,-40,0]` = Hüfte nach rechts eingedreht. |
| Z | Segment nach **rechts** (+X) im Weltbild. `schulter_r [0,0,90]` = rechter Arm waagerecht zur Seite, `schulter_l [0,0,-90]` = linker Arm zur Seite. |

Beispiele: `schulter_l [90,0,0]` Arm waagerecht nach vorn · `ellbogen_l [90,0,0]` Unterarm 90°
gebeugt, Hand vor der Schulter · `huefte_r [90,0,0]` Oberschenkel waagerecht nach vorn ·
`knie_l [90,0,0]` Ferse Richtung Gesäß · `brust [60,0,0]` tiefe Vorbeuge ·
`becken [85,0,0]` Bauch- oder Stützlage.

### Die Matrizen — ausgeschrieben, damit nichts zu raten bleibt

Weil manche Segmente in der Nullstellung nach unten zeigen (Arme, Beine) und andere nach oben
(Rumpf, Kopf), ergibt „X beugt nach vorn" für die beiden Gruppen **entgegengesetzte
Drehrichtungen**. Das ist kein Sonderfall, sondern die direkte Folge der Regel. Ausgeschrieben:

```
Gruppe A — schulter_l/r, ellbogen_l/r, hand_l/r, huefte_l/r, fuss_l/r
  Rx(a) = [ 1   0     0   ]      Ry(b) = [ cos b  0  -sin b ]      Rz(c) = [ cos c  -sin c  0 ]
          [ 0  cos a  sin a]             [   0    1     0   ]              [ sin c   cos c  0 ]
          [ 0 -sin a  cos a]             [ sin b  0   cos b ]              [   0       0    1 ]

Gruppe B — becken, brust, hals, kopf, knie_l, knie_r
  wie Gruppe A, aber Rx wird mit dem NEGIERTEN Winkel gebildet:  Rx(-a)
  Ry und Rz sind identisch zu Gruppe A.
```

Ruhelagen der Segmente vor jeder Rotation: Oberarm, Unterarm, Hand, Oberschenkel und
Unterschenkel zeigen nach `(0,-1,0)`. Brust, Hals und Kopf zeigen nach `(0,+1,0)`.
Der Fuß zeigt nach `(0,0,+1)`.

Die Rotationen akkumulieren entlang der Kette aus Abschnitt 1: die Weltrotation eines Gelenks ist
das Produkt aus der Weltrotation seines Elternteils und seiner eigenen lokalen Rotation.

> **Referenzimplementierung.** `referenz-kinematik.py` liegt diesem Paket bei und setzt genau
> diesen Abschnitt um, mit Selbsttest. Sie ist verbindlich: Wo Code und Text sich unterscheiden,
> ist der Text gemeint und die Referenz zeigt, wie er umzusetzen ist. `pruefe-geometrie.py` prüft
> `uebungen.json` damit gegen Boden, Gerätepositionen und Deckungshöhe und meldet aktuell SAUBER.

Eingehaltene Grenzen im Datenbestand: ellbogen X 0…150 · knie X 0…140 · hals und kopf je ±60 ·
brust X −30…70, Y ±45 · becken Y ±60 · schulter X −60…180 · Z bei Ellbogen und Knien ≤ ±20.
`becken` X ist bewusst unbegrenzt (siehe Abschnitt 1).

Der Renderer validiert diese Grenzen **nicht** zur Laufzeit. Er zeichnet, was in den Daten steht.

## 4. Kameras

Genau vier erlaubte Werte. Ein fünfter Wert ist ein Datenfehler und führt zu `frontal` als Fallback
plus Konsolenwarnung.

| `kamera` | Azimut | Elevation | Verwendung im Bestand |
|---|---|---|---|
| `frontal` | 0° (von +Z) | 8° | 14 Übungen |
| `seitlich` | 90° (von +X) | 8° | 22 Übungen |
| `seitlich_45` | 45° | 8° | 16 Übungen |
| `halbhoch_45` | 45° | 25° | 20 Übungen |

**Automatische Rahmung — verbindlich, keine Kamerawerte pro Übung.**

1. Der Renderer berechnet die Weltpositionen aller 16 Gelenke und aller Equipment-Objekte über
   alle Phasen und bildet daraus eine achsparallele Bounding Box `B`.
2. Blickziel `T` = Mittelpunkt von `B` in X und Z; in Y der Mittelwert der `becken`-Höhe über alle
   Phasen, begrenzt auf `[0.55, 1.15]`.
3. Öffnungswinkel ist fest **32°** vertikal.
4. Abstand `D` = kleinster Wert, bei dem `B` mit 12 % Rand in das Bild passt, mindestens **4.2 m**.
5. Kameraposition = `T` + `D · (sin(Azimut)·cos(Elevation), sin(Elevation), cos(Azimut)·cos(Elevation))`.
6. `up` ist immer `[0,1,0]`. Keine Rollbewegung, kein Kameraschwenk, kein Zoom während der Animation.

Damit sitzt jede Figur gleich groß im Bild, Bodenübungen und Sprünge eingeschlossen.

---

## 5. Interpolation und Timing

`animation.phasen` ist eine Liste von Posen. `zeitanteil` summiert sich exakt auf 1.0.

**Lesart:** Phase *i* ist eine Pose. `zeitanteil[i] · dauer_sek` ist die Zeit, die der Körper
braucht, um von Pose *i* zu Pose *i+1* zu kommen. Die letzte Phase führt bei `loop: true`
zurück zu Phase 0, bei `loop: false` hält sie ihre Pose.

Beispiel: 4 Phasen, `dauer_sek: 2.0`, Zeitanteile 0.3 / 0.2 / 0.15 / 0.35 →
Pose 0 bei t=0, Pose 1 bei t=0.6, Pose 2 bei t=1.0, Pose 3 bei t=1.3, zurück zu Pose 0 bei t=2.0.

**Kurve.** Jeder Winkelkanal und jede Komponente von `wurzel_position_m` wird unabhängig mit einer
**zentripetalen Catmull-Rom-Spline** durch die Posen interpoliert. Bei `loop: true` ist die
Stützstellenkette zyklisch geschlossen. Bei `loop: false` werden erste und letzte Pose jeweils
verdoppelt, damit die Kurve dort flach ausläuft.

**Zeitverzerrung (gibt Schlägen ihren Schnapp).** Der normierte Fortschritt `s ∈ [0,1]` innerhalb
eines Segments wird vor der Auswertung umgerechnet, abhängig vom Zeitanteil dieses Segments:

```
zeitanteil ≤ 0.15   →  s' = 1 - (1 - s)²          (ease-out, schnell los, weich an)
zeitanteil >  0.15   →  s' = s² · (3 - 2s)         (smoothstep)
```

Keine weiteren Easings, keine pro Übung konfigurierbare Kurve.

**Bildrate.** Ziel 60 fps über `requestAnimationFrame`, Fortschritt wird immer aus der echten
verstrichenen Zeit berechnet, nie aus der Framezahl. Ein Frame-Sprung darf die Animation nicht
verschieben. Bei verdecktem Tab pausiert die Animation und setzt an derselben Stelle fort.

**`loop: false`** (3 Übungen: `hueftbeuger-dehnung-ausfallschritt`, `graetschsitz-adduktoren-dehnung`, `wadendehnung-schraegbrett`): Ablauf einmal abspielen, Endpose halten,
Schaltfläche „Wiederholen" einblenden. Kein automatischer Neustart.

---

## 6. Seitenwechsel

`seitenwechsel: true` bei 28 der 72 Übungen. Alle Daten beschreiben die Ausführung eines
**Rechtsauslegers** (linke Seite vorn).

Ablauf: ein vollständiger Zyklus in den Originaldaten, dann ein vollständiger Zyklus gespiegelt,
dann wieder von vorn. Zwischen den Zyklen keine Pause und kein Einblendeffekt.

Die Spiegelung ist eine reine Datentransformation, kein zweiter Datensatz:

```
Winkel:    x bleibt,  y → −y,  z → −z
Namen:     jedes _l ↔ _r tauschen (Gelenke und Bindungen)
Positionen: X → −X   (wurzel_position_m, Equipment-Positionen)
Kamera:    unverändert
```

Ein kleiner Hinweis „Seite 1 / Seite 2" steht im Detailfenster, nicht im Bild.

---

## 7. Farben

Vier Farbwerte, sonst keine. Keine Verläufe, keine Schatten, keine Umgebungsverdeckung,
keine Glanzlichter, kein Nebel, keine farbige Hervorhebung einzelner Gelenke.

| Element | Farbe | Anmerkung |
|---|---|---|
| Figur (alle Linien, Kopf, Gelenkpunkte) | `#1E5AA8` | durchgehend, ein einziger Blauton |
| Equipment (alle Objekte) | `#C62828` | durchgehend, ein einziger Rotton |
| Boden (Raster und Ebene) | `#9E9E9E` | Rasterlinien 35 % Deckkraft, Ebene 8 % |
| Umgebung (`wand`, `decke`) | `#9E9E9E` | Umgebung ist **nicht** rot; sie gehört farblich zum Boden |
| Hintergrund | transparent | die Hintergrundfarbe des Detailfensters scheint durch |

**Zeichenreihenfolge, fest:** zuerst Boden und Umgebung, dann Equipment, zuletzt die Figur.
Die Figur liegt damit immer vorn. Eine Tiefensortierung zwischen Figur und Gerät findet
ausdrücklich **nicht** statt — sie wäre bei Drahtgittern ohne Flächen weder herstellbar noch
nötig, und eine feste Reihenfolge ist der einzige Weg, dass alle 72 Animationen gleich wirken.

Im dunklen Erscheinungsbild werden **nur** diese drei Werte getauscht, sonst nichts:
Figur `#6FA8E8`, Equipment `#F26A6A`, Boden `#6B6B6B`. Die Deckkraftwerte bleiben.

---

## 8. Strichstärken und Formen der Figur

Alle Stärken sind **Bildschirmpixel und konstant**, unabhängig von der Entfernung, multipliziert
mit `devicePixelRatio`. Linien haben runde Enden und runde Verbindungen.

| Element | Stärke / Größe |
|---|---|
| Rumpf: becken–brust–hals | 5.0 px |
| Gliedmaßen: Arme, Beine, Hals–Kopf | 3.5 px |
| Fuß: Knöchel–Zehenspitze | 3.0 px |
| Hand: Handgelenk–Faust | 3.0 px |
| Gelenkpunkte (alle 16) | gefüllter Kreis, Radius 3.5 px |
| Kopf | ungefüllter Kreis, Radius aus 0.11 m projiziert, Strichstärke 3.5 px |
| Equipment-Kanten | 2.5 px |
| Bodenraster | 1.0 px |

Der Kopf ist ein Kreis in der Bildebene, kein Ball. Er wird nicht gedreht; die Kopfrotation ist
über die Lage der Linie hals–kopf sichtbar.

Kein Antialiasing-Verzicht: Linien werden geglättet gezeichnet.

---

## 9. Boden

Eine Ebene bei `y = 0` und ein quadratisches Raster mit **0.25 m** Teilung, Ausdehnung 6 × 6 m,
zentriert unter dem Blickziel. Keine Achsenkreuze, keine Beschriftung, keine Horizontlinie.
Das Raster ist die einzige Tiefeninformation im Bild, deshalb ist es immer sichtbar — auch bei
Übungen, die am Boden stattfinden.

---

## 10. Equipment-Objekte

170 Objekte über alle 72 Übungen.

```json
{"typ": "boxsack", "form": "zylinder", "masse_m": [0.35, 1.2, 0.35],
 "position": [0.0, 1.35, 0.85], "bindung": "decke"}
```

- `typ` ist eine id aus `equipment.json` oder `boden` / `wand` / `decke` (Umgebung).
- `masse_m` ist die Ausdehnung in `[X, Y, Z]` in Metern.
- `position` ist der Mittelpunkt. Bei `bindung: frei`, `boden`, `wand` oder `decke` sind das
  Weltkoordinaten; bei einer Gelenkbindung ist es ein Versatz im lokalen System dieses Gelenks.
- `bindung` ist eines der 16 Gelenke, oder `boden` / `wand` / `decke` / `frei`.
  Bei einer Gelenkbindung folgt das Objekt Position **und** Rotation dieses Gelenks.
- Optionales `position_pro_phase`: eine Position je Phase, gleiche Länge wie `phasen`.
  **Diese Werte sind immer Weltkoordinaten** und überschreiben `position` und die Bindung
  vollständig. Vorhanden bei 6 Objekten (Slam Ball, Kettlebell, Tennisball). Wird wie
  `wurzel_position_m` interpoliert.

**`typ: "boden"` wird nicht gezeichnet.** Der Boden aus Abschnitt 9 ist bereits da; die 39
Bodenobjekte in den Daten sind eine reine Lagemarkierung und werden übersprungen. `wand` und
`decke` werden gezeichnet, aber in der Bodenfarbe (Abschnitt 7), nicht in Rot.

**Formvokabular — abschließend.** Genau diese 16 Werte kommen in den Daten vor, jeder wird aus
Kanten dieser Primitive gezeichnet. **Ein Gerät hat über alle Übungen hinweg immer dieselbe Form** —
das ist Teil des Abnahmekriteriums 12.3 und in `uebungen.json` durchgesetzt.

| `form` | Zeichnung |
|---|---|
| `quader` | 12 Kanten der Box aus `masse_m` |
| `platte` | wie `quader`, dünnste Achse als Dicke; bei `bindung: boden` zusätzlich eine Diagonale je Fläche |
| `zylinder` | 2 Ellipsen (oben/unten) mit je 16 Segmenten plus 4 Mantellinien |
| `kugel` | 3 Kreise mit je 24 Segmenten in den Ebenen XY, XZ, YZ |
| `stange` | eine Linie entlang der längsten Achse plus zwei Endkappen-Striche quer, je 0.05 m |
| `seil` | Polygonzug aus 16 Punkten entlang einer Kettenlinie zwischen Anfangs- und Endpunkt; fallen Anfang und Ende zusammen, wird ein geschlossener Ring gezeichnet |
| `kegel` | Grundkreis mit 16 Segmenten plus 4 Mantellinien zur Spitze |
| `scheibe` | 2 konzentrische Kreise mit je 24 Segmenten, Innenkreis fest 0.03 m (Bohrung) |
| `kugel_mit_buegel` | `kugel` plus ein Halbkreis mit 12 Segmenten darüber |
| `stange_mit_gurt` | `stange` plus senkrechte Linie vom Mittelpunkt nach unten zu einer `scheibe` |
| `guertel_mit_kette` | Kreis mit 24 Segmenten am gebundenen Gelenk plus senkrechte Linie nach unten zu einer `scheibe` |
| `weste` | `quader` mit zusätzlicher senkrechter Mittellinie auf der Vorderseite |
| `gelenkhuelse` | `stange` von 0.30 m plus `scheibe` am Fußpunkt |
| `buegel` | zwei senkrechte Pfosten plus ein waagerechter Griff dazwischen, U-Form |
| `doppelrad` | 2 Kreise mit je 24 Segmenten im Abstand der X-Ausdehnung plus eine Achslinie dazwischen |
| `verbund` | nur für `hantelbank`, `power-tower` und `latzug`, siehe unten |

**`verbund`** kommt 9-mal vor und nur bei diesen drei ids: `hantelbank` (4), `power-tower` (4),
`latzug` (1). Für genau diese drei liegt die Zerlegung in Primitive **fest im Renderer**,
abgeleitet aus dem Feld `geometrie.beschreibung` in `equipment.json`. Sie wird einmal als
Konstante hinterlegt und nicht pro Übung variiert. Ein `verbund` mit einer anderen id ist ein
Datenfehler und wird als `quader` aus `masse_m` gezeichnet plus Konsolenwarnung.

> Achtung: `equipment.json` benutzt im Feld `geometrie.grundform` ein **eigenes, beschreibendes**
> Vokabular mit 31 Werten (etwa `wickel`, `schale`, `keil`, `zange`). Das ist Dokumentation für
> Menschen, **nicht** die Zeichenvorschrift. Verbindlich für den Renderer ist ausschließlich das
> Feld `form` am Equipment-Objekt in `uebungen.json` und die Tabelle oben.

Reine Schutz- und Hilfsmittel (Bandagen, Handgelenkbandagen, Gürtel, Zughilfen, Haken)
werden **nicht** gezeichnet, auch wenn sie im Feld `equipment` stehen. Sie erscheinen nur im
Textteil des Detailfensters.

## 11. Was ausdrücklich verboten ist

- Zusätzliche Farben, auch nicht zur Hervorhebung der aktiven Gliedmaße.
- Zusätzliche Kamerawinkel, freie Kamerabewegung durch den Nutzer, Zoom, Kameraschwenks.
- Schatten, Bodenspiegelung, Tiefenunschärfe, Nebel, Glanz, Texturen, Materialien.
- Bewegungsspuren, Nachzieheffekte, Geschwindigkeitslinien, Aufprallsymbole.
- Muskeln, Kleidung, Gesicht, Finger, Haare, Schuhe.
- Beschriftungen im Bild. Phasennamen und Hinweise stehen im Textteil, nicht in der Szene.
- Pro Übung abweichende Strichstärken, Farben, Kameraabstände oder Easings.
- Interpolation im Bildraum. Interpoliert werden immer Winkel, nie projizierte Punkte.

---

## 12. Abnahmekriterium

Eine Animation ist richtig gebaut, wenn drei Bedingungen gleichzeitig gelten:

1. Sie enthält **keine** Zeile Code, die nur für diese eine Übung existiert.
2. Tauscht man ihre Keyframe-Daten gegen die einer beliebigen anderen Übung aus, läuft sie ohne
   Änderung am Renderer.
3. Zwei Standbilder aus zwei verschiedenen Übungen bei gleicher Kamera unterscheiden sich
   ausschließlich in der Körperhaltung und im gezeichneten Gerät — nicht in Größe, Strichstärke,
   Farbe, Rahmung oder Bodenraster.
