# PaintByNumbersGenerator → LaserGRBL Export: **Ist-Zustand** vs. Original-Repo

**Zweck dieses Dokuments:**
- Beschreibt **den aktuellen Ist-Zustand** deines Setups **im Vergleich** zum Original-Repo.
- Fokus auf **Was ist anders?** und **Warum wurde es geändert?**
- Ohne „Patch-Schritt-für-Schritt“ (damit es nicht verwirrt).

---

## 1) Referenz: Wie das Original-Repo funktioniert (Web)

Im Original-Web-UI ist der SVG-Download über den Button **`#btnDownloadSVG`** verdrahtet. Dieser Button ruft die Download-Funktion aus dem GUI-Code auf. citeturn7search54  
Der ursprüngliche Download speichert das aktuell gerenderte SVG aus `#svgContainer` und nutzt als Dateiname standardmäßig **`paintbynumbers.svg`**. citeturn2search51  

Zusätzlich existiert im Repo neben TypeScript-Quellen (`src/*`) auch ein vorkompilierter Web-Build (`dist/*`), der je nach Start-/Deploy-Setup genutzt werden kann. citeturn8search56turn9search73

---

## 2) Zielbild (Warum überhaupt ändern?)

Du willst das Tool nicht nur als „Paint by Numbers“-Generator nutzen, sondern als **LaserGRBL-Inputquelle**.

### Anforderungen
1. **Zwei Dateien statt einer:**
   - **`preview.svg`**: Vorschau/Print – Farben optional, so wie im Browser sichtbar
   - **`laser.svg`**: Laser-Datei – **nur Umrandung + Zahlen**, keine Flächenfüllung
2. **Zahlen 0–50 als Single-Line (Centerline) Vektoren** (Laser soll eine Linie fahren, nicht eine Kontur „umranden“)
3. **LaserGRBL-Kompatibilität:** Import darf keine Elemente enthalten, die LaserGRBL typischerweise ignoriert oder falsch interpretiert.

---

## 3) Ist-Zustand: Was ist heute anders als im Original?

### 3.1 Zwei Export-Modi (Preview vs. Laser)
**Original:** Ein SVG-Export (Dateiname typischerweise `paintbynumbers.svg`). citeturn2search51  
**Ist:** Zwei getrennte Exporte:
- **`preview.svg`** wird aus dem aktuellen DOM-SVG (`#svgContainer svg`) erzeugt – also genau das, was du siehst.
- **`laser.svg`** wird aus dem gleichen Ausgangs-SVG abgeleitet, aber anschließend „laser-tauglich“ transformiert.

### 3.2 Runtime-Integration statt Build-Abhängigkeit
**Original:** Änderungen an `src/*` müssten zuverlässig in den ausgerollten Web-Build gelangen.

**Ist:** Eine zusätzliche JavaScript-Datei (**`laser-export.js`**) wird in die Seite eingebunden und erweitert die UI zur Laufzeit:
- Sie hängt sich an den existierenden Download-Button `#btnDownloadSVG` (der im Original verdrahtet ist). citeturn7search54  
- Sie fügt einen zweiten Button („Download Laser SVG“) hinzu.

**Warum das so gelöst ist:** Weil das Repo sowohl `src/*` als auch `dist/*` enthält und `npm start`/Deploy je nach Setup aus `dist/` serven kann. Die Runtime-Lösung ist **unabhängig von der Toolchain** und greift sicher. citeturn8search56turn9search73

### 3.3 Laser-spezifische SVG-Bereinigung (entscheidend)
**Ist:** Beim Export von `laser.svg` werden diese Transformationen angewendet:

1) **Single-Line Zahlen statt Text/Outlines**
- Ziffern 0–50 werden als **Single-Line Pfade** generiert (Stroke-Font) statt `<text>`.
- Hintergrund: `<text>` wird von Laser-Tools oft als Font/Outline interpretiert oder anders gerendert als im Browser.

2) **Fills entfernen („nur Strokes“)**
- Alles, was nur Fläche ist (Fill ohne Stroke), wird entfernt.
- Bei Elementen mit Stroke+Fill wird `fill="none"` gesetzt.
- Ergebnis: Laser fährt **nur Linien** (Umrandung + Zahlen).

3) **Nested `<svg>` flachmachen (Flatten)**
- Viele Laser/CAM-Importer ignorieren verschachtelte `<svg>`-Elemente.
- Deshalb werden nested `<svg>` in `<g transform="...">` umgewandelt.

4) **Vollständiges Transform-Baking (Skalierung & Zentrierung korrekt)**
- LaserGRBL interpretiert Transform-Ketten (`translate/scale`) teilweise anders als der Browser.
- Daher wird die **komplette Transform-Kette** (inkl. aller Vorfahren-Transforms, auch aus dem Flattening) in die Pfad-Koordinaten „eingebacken“.
- Danach sind Label-Pfade **ohne `transform=`** – nur noch „absolute“ Koordinaten.

5) **Stroke-Normalisierung**
- Strokes werden für `laser.svg` auf `#000` vereinheitlicht (LaserGRBL-freundlich, konsistent).

### 3.4 „Mehr Liebe“ für die Ziffern
**Ist:** Die Ziffern-Glyphen wurden optisch verbessert (runder, besser proportioniert), damit sie in Gravur/Plot sauberer aussehen.

---

## 4) Warum genau diese Änderungen (Begründung nach Problemklassen)

### Problemklasse A: LaserGRBL zeigt Labels nicht
**Ursache:** Nested `<svg>` bei Labels → wird von Importern oft ignoriert.
**Lösung:** Flatten nested `<svg>`.

### Problemklasse B: Spiegelverkehrt / driftende Position
**Ursache:** Unterschiedliche `transform`-Interpretation im Importer.
**Lösung:** Vollständiges Transform-Baking und Entfernen von `transform=` bei Label-Pfaden.

### Problemklasse C: Laser fährt „Konturen“ statt Single-Line
**Ursache:** `<text>` und Outline-Fonts sind keine Centerline-Geometrie.
**Lösung:** Single-Line Stroke-Font (Ziffern 0–50 als Pfade).

### Problemklasse D: Laser füllt Flächen / unnötige Fahrwege
**Ursache:** Facets haben `fill` (Farben) – sinnvoll für Vorschau, schlecht für Laser.
**Lösung:** Fills entfernen und nur Strokes exportieren.

---

## 5) Bedienung im Ist-Zustand

### Preview
- Output-Tab: Farben nach Bedarf (Fill facets optional)
- Export: **`preview.svg`**

### Laser
- Export: **`laser.svg`**
- Inhalt: **nur** Umrandung + Single-Line Zahlen

### Tuning
- Ein kleines Feld „Laser stroke“ erlaubt Anpassung der Label-Linienstärke (typisch: 0.25–0.6 je nach Material).

---

## 6) Was bei Fehlern zuerst prüfen (Kurz-Checkliste)

1. **Sind in `laser.svg` noch nested `<svg>` enthalten?**
   - Wenn ja: Flatten greift nicht → LaserGRBL kann Labels „verschlucken“.
2. **Haben Label-Pfade noch `transform=`?**
   - Wenn ja: Transform-Baking greift nicht → Risiko für Spiegelung/Versatz.
3. **Gibt es noch `fill` oder `style="...fill:`?**
   - Wenn ja: Fills wurden nicht entfernt → Laser kann Flächen „falsch“ behandeln.
4. **Enthält `laser.svg` überhaupt `<path>` für Zahlen?**
   - Wenn nicht: Single-Line Conversion greift nicht.

---

## 7) Kontext-Summary für neue Chats (Copy/Paste)

- Projekt: **paintbynumbersgenerator (Web)**, Start via **`npm start`**.
- Ziel: **`preview.svg`** (Vorschau, Farben optional) + **`laser.svg`** (nur Umrandung + Single-Line-Zahlen).
- Laser-Import: **LaserGRBL**.
- Zahlenbereich: **0–50**.
- Ist-Zustand unterscheidet sich vom Original:
  - UI bietet zwei Exporte (preview/laser) statt `paintbynumbers.svg`. citeturn2search51
  - Runtime-Datei `laser-export.js` erweitert den bestehenden Download-Button `#btnDownloadSVG`. citeturn7search54
  - Laser-Export macht: Single-Line-Zahlen, Fills raus, nested `<svg>` flatten, komplette Transforms baken (keine `transform=` in Label-Pfaden), Stroke `#000`.

